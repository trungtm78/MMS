// Unit Tests: session integrity — the shared token refresher and the session-ended signal
//   POST /auth/refresh refusals (Web/backend/src/auth/auth.service.ts:469-484): 401
//   refresh_token_reused, 401 refresh_token_revoked, 401 mfa_reauthentication_required, 403
//   account_disabled, 403 no_role_assigned, 401 invalid_refresh_token. Each ends the session: the
//   tokens are cleared, exactly one session end carries the reason for the login-screen notice,
//   nothing is retried.
//   Refresh tokens rotate and a reused one ends every session of the account (auth.service.ts:426-429),
//   so a caller holding a token older than the stored one gets the stored one instead of a refresh.
//   Only a definitive refusal (any 4xx but 408/429) ends it. A refresh without one (network failure, timeout,
//   5xx, 408, 429) keeps the tokens; the original request fails with that cause so the caller can retry.
// Overlap is made with Completer gates on the fake adapter, never with fixed delays.
// Run: flutter test test/unit_session_events_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/network/auth_interceptor.dart';
import 'package:militian_app/core/network/session_events.dart';
import 'package:militian_app/core/network/token_refresher.dart';

import 'helpers/fakes.dart';

class _Rig {
  _Rig({
    required ResponseBody Function(RequestOptions) refresh,
    Future<void>? Function(RequestOptions)? refreshGate,
    MemoryStorage? storage,
  })  : storage = storage ?? MemoryStorage(),
        refreshAdapter = FakeAdapter(refresh, gate: refreshGate),
        apiAdapter = FakeAdapter((o) => okWhenBearer(o, 'new_access')) {
    events.stream.listen(ends.add);
    refresher = TokenRefresher(
      storage: this.storage,
      events: events,
      refreshDio: Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = refreshAdapter,
    );
    dio
      ..httpClientAdapter = apiAdapter
      ..interceptors.add(AuthInterceptor(dio: dio, storage: this.storage, refresher: refresher));
  }

  final MemoryStorage storage;
  final events = SessionEvents();
  final ends = <SessionEnd>[];
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  final FakeAdapter refreshAdapter;
  final FakeAdapter apiAdapter;
  late final TokenRefresher refresher;

  /// Lets the broadcast stream deliver.
  Future<void> settle() => pumpEventQueue();

  /// Status of a GET, 200 or the error's status.
  Future<int?> statusOf(String path) =>
      dio.get(path).then((r) => r.statusCode, onError: (Object e) => (e as DioException).response?.statusCode);
}

/// Storage that cannot keep new tokens.
class _ReadOnlyStorage extends MemoryStorage {
  @override
  Future<void> saveAccessToken(String token) async => throw StateError('keychain locked');
}

void main() {
  group('refresh refusals end the session', () {
    const cases = [
      (401, 'refresh_token_reused', SessionEndReason.ended),
      (401, 'refresh_token_revoked', SessionEndReason.ended),
      (401, 'invalid_refresh_token', SessionEndReason.ended),
      (401, 'mfa_reauthentication_required', SessionEndReason.mfaReauthenticationRequired),
      (403, 'account_disabled', SessionEndReason.accountDisabled),
      (403, 'no_role_assigned', SessionEndReason.noRoleAssigned),
    ];
    for (final (status, code, reason) in cases) {
      test('UT-SES-01 $status $code: tokens cleared, one session end, no retry', () async {
        final refreshHeld = Completer<void>();
        final r = _Rig(
          refresh: (_) => jsonBody(status, backendError(status, code)),
          refreshGate: (_) => refreshHeld.future,
        );

        final pending = Future.wait([r.statusOf('/tasks'), r.statusOf('/kpi/current')]);
        // Both requests had their 401 while the one refresh is still out
        await pumpEventQueue();
        expect(r.apiAdapter.requests, hasLength(2));
        expect(r.refreshAdapter.requests, hasLength(1));
        refreshHeld.complete();
        final results = await pending;
        await r.settle();

        expect(results, [401, 401]);
        expect(r.refreshAdapter.requests, hasLength(1));
        expect(r.apiAdapter.requests, hasLength(2));
        expect(r.storage.access, isNull);
        expect(r.storage.refresh, isNull);
        expect(r.ends, hasLength(1));
        expect(r.ends.single.reason, reason);
        expect(r.ends.single.code, code);
      });
    }

    test('UT-SES-02: a body without both tokens ends the session', () async {
      final r = _Rig(refresh: (_) => jsonBody(200, {'accessToken': 'new_access'}));

      expect(await r.statusOf('/tasks'), 401);
      await r.settle();

      expect(r.storage.access, isNull);
      expect(r.storage.refresh, isNull);
      expect(r.ends.map((e) => e.reason), [SessionEndReason.ended]);
    });

    test('UT-SES-13: any other 4xx (but 408 and 429) refuses the refresh token, whatever its code', () async {
      for (final status in [400, 401, 403, 404, 409, 422]) {
        final r = _Rig(refresh: (_) => jsonBody(status, backendError(status, 'something_new')));

        expect(await r.statusOf('/tasks'), 401, reason: '$status');
        await r.settle();

        expect(r.storage.refresh, isNull, reason: '$status');
        expect(r.ends.map((e) => e.reason), [SessionEndReason.ended], reason: '$status');
      }
    });

    test('UT-SES-03: a blank stored refresh token ends the session without calling the server', () async {
      final r = _Rig(refresh: newTokenPair);
      r.storage.refresh = '  ';

      expect(await r.statusOf('/tasks'), 401);
      await r.settle();

      expect(r.refreshAdapter.requests, isEmpty);
      expect(r.storage.access, isNull);
      expect(r.ends, hasLength(1));
    });

    test('UT-SES-11: tokens that cannot be stored end the session', () async {
      final r = _Rig(refresh: newTokenPair, storage: _ReadOnlyStorage());

      expect(await r.statusOf('/tasks'), 401);
      await r.settle();

      expect(r.refreshAdapter.requests, hasLength(1));
      expect(r.storage.refresh, isNull);
      expect(r.ends.map((e) => e.reason), [SessionEndReason.ended]);
    });
  });

  group('a refresh without a definitive answer keeps the session', () {
    // The original request fails with what stopped the refresh, never a 401 that reads as a lost session
    Future<DioException> failureOf(_Rig r) =>
        r.dio.get('/tasks').then<DioException>((_) => fail('the request should fail'),
            onError: (Object e) => e as DioException);

    test('UT-SES-04: network failures and timeouts keep the tokens and end nothing', () async {
      for (final type in [
        DioExceptionType.connectionError,
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.unknown,
      ]) {
        final r = _Rig(refresh: (o) => throw DioException(requestOptions: o, type: type));

        final failure = await failureOf(r);
        await r.settle();

        expect(failure.type, type, reason: '$type');
        expect(failure.requestOptions.path, '/tasks', reason: '$type');
        expect(failure.response?.statusCode, isNot(401), reason: '$type');
        expect(r.storage.access, 'old_access', reason: '$type');
        expect(r.storage.refresh, 'old_refresh', reason: '$type');
        expect(r.ends, isEmpty, reason: '$type');
        expect(r.apiAdapter.requests, hasLength(1), reason: '$type');
      }
    });

    test('UT-SES-14: a 5xx (a gateway during a rolling restart) keeps the tokens; the request fails retryably',
        () async {
      for (final status in [500, 502, 503, 504]) {
        final r = _Rig(refresh: (_) => jsonBody(status, backendError(status, 'Service unavailable')));

        final failure = await failureOf(r);
        await r.settle();

        expect(failure.response?.statusCode, status, reason: '$status');
        expect(failure.requestOptions.path, '/tasks', reason: '$status');
        expect(r.storage.access, 'old_access', reason: '$status');
        expect(r.storage.refresh, 'old_refresh', reason: '$status');
        expect(r.ends, isEmpty, reason: '$status');
      }
    });

    test('UT-SES-15: a 408 or 429 keeps the tokens; the request fails with that status', () async {
      for (final status in [408, 429]) {
        final r = _Rig(refresh: (_) => jsonBody(status, backendError(status, 'ThrottlerException: Too Many Requests')));

        final failure = await failureOf(r);
        await r.settle();

        expect(failure.response?.statusCode, status, reason: '$status');
        expect(r.storage.access, 'old_access', reason: '$status');
        expect(r.storage.refresh, 'old_refresh', reason: '$status');
        expect(r.ends, isEmpty, reason: '$status');
      }
    });

    test('UT-SES-16: the next 401 after a kept session refreshes again and succeeds', () async {
      var attempts = 0;
      final r = _Rig(refresh: (o) {
        attempts++;
        return attempts == 1 ? jsonBody(503, backendError(503, 'Service unavailable')) : newTokenPair(o);
      });

      await failureOf(r);
      expect(await r.statusOf('/tasks'), 200);
      await r.settle();

      expect(r.refreshAdapter.requests.map((o) => o.data), [
        {'refreshToken': 'old_refresh'},
        {'refreshToken': 'old_refresh'},
      ]);
      expect(r.storage.refresh, 'new_refresh');
      expect(r.ends, isEmpty);
    });

    test('UT-SES-17: a renewal without an answer throws for the socket and keeps the tokens', () async {
      final r = _Rig(refresh: (_) => jsonBody(502, backendError(502, 'Bad gateway')));

      await expectLater(r.refresher.renew(staleToken: 'old_access'), throwsA(isA<RefreshUnavailable>()));
      expect(r.storage.refresh, 'old_refresh');
    });
  });

  group('TokenRefresher.renew', () {
    test('UT-SES-05: a stale token gets the stored newer token without a refresh', () async {
      final r = _Rig(refresh: newTokenPair);
      r.storage.access = 'newer_access';

      expect(await r.refresher.renew(staleToken: 'old_access'), 'newer_access');
      expect(r.refreshAdapter.requests, isEmpty);
    });

    test('UT-SES-06: concurrent renewals share one refresh; a late one reuses its token', () async {
      final refreshHeld = Completer<void>();
      final r = _Rig(refresh: newTokenPair, refreshGate: (_) => refreshHeld.future);

      final pending = Future.wait([
        r.refresher.renew(staleToken: 'old_access'),
        r.refresher.renew(staleToken: 'old_access'),
        r.refresher.renew(),
      ]);
      await pumpEventQueue();
      expect(r.refreshAdapter.requests, hasLength(1));
      refreshHeld.complete();
      final tokens = await pending;

      expect(tokens, everyElement('new_access'));
      expect(r.refreshAdapter.requests, hasLength(1));
      expect(r.refreshAdapter.requests.single.data, {'refreshToken': 'old_refresh'});

      // A socket still holding the old token after the refresh reuses the new one
      expect(await r.refresher.renew(staleToken: 'old_access'), 'new_access');
      expect(r.refreshAdapter.requests, hasLength(1));
    });

    test('UT-SES-07: a refusal for a session replaced meanwhile clears nothing', () async {
      late _Rig r;
      r = _Rig(refresh: (_) {
        // A new session (e.g. acknowledged recovery codes) was stored while the refresh was out
        r.storage
          ..access = 'held_access'
          ..refresh = 'held_refresh';
        return jsonBody(401, backendError(401, 'refresh_token_revoked'));
      });

      expect(await r.refresher.renew(staleToken: 'old_access'), 'held_access');
      await r.settle();

      expect(r.storage.refresh, 'held_refresh');
      expect(r.ends, isEmpty);
    });

    test('UT-SES-08: already signed out: nothing to refresh and nothing to end', () async {
      final r = _Rig(refresh: newTokenPair);
      r.storage
        ..access = null
        ..refresh = null;

      expect(await r.refresher.renew(staleToken: 'old_access'), isNull);
      await r.settle();

      expect(r.refreshAdapter.requests, isEmpty);
      expect(r.ends, isEmpty);
    });

    test('UT-SES-12: without a refresh client of its own it builds one for the API', () async {
      final storage = MemoryStorage()..access = 'newer_access';
      final refresher = TokenRefresher(storage: storage, events: SessionEvents());

      // A stale token is answered from storage; nothing is sent
      expect(await refresher.renew(staleToken: 'old_access'), 'newer_access');
    });
  });

  test('UT-SES-09: session end reasons', () {
    expect(SessionEnd.forCode(null).reason, SessionEndReason.ended);
    expect(SessionEnd.forCode(null).code, isNull);
    expect(SessionEnd.forCode('session_revoked').reason, SessionEndReason.ended);
    expect(SessionEnd.forCode('something_new').reason, SessionEndReason.ended);
    expect(SessionEnd.forCode('mfa_reauthentication_required').reason,
        SessionEndReason.mfaReauthenticationRequired);
    expect(SessionEnd.forCode('account_disabled').reason, SessionEndReason.accountDisabled);
    expect(SessionEnd.forCode('no_role_assigned').reason, SessionEndReason.noRoleAssigned);
  });

  test('UT-SES-10: a closed signal delivers nothing more', () async {
    final events = SessionEvents();
    final ends = <SessionEnd>[];
    var done = false;
    events.stream.listen(ends.add, onDone: () => done = true);

    await events.close();
    events.end(SessionEnd.forCode('refresh_token_revoked'));
    await pumpEventQueue();

    expect(done, isTrue);
    expect(ends, isEmpty);
  });
}

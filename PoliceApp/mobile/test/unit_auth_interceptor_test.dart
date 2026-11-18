// Unit Tests: AuthInterceptor refresh/retry policy
// Run: flutter test test/unit_auth_interceptor_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/constants/api_constants.dart';
import 'package:police_app/core/network/auth_interceptor.dart';
import 'package:police_app/core/network/session_events.dart';
import 'package:police_app/core/network/token_refresher.dart';

import 'helpers/fakes.dart';

class _Harness {
  _Harness({
    required ResponseBody Function(RequestOptions) api,
    required ResponseBody Function(RequestOptions) refresh,
    Future<void> Function(RequestOptions)? apiGate,
    Future<void> Function(RequestOptions)? refreshGate,
  })  : apiAdapter = FakeAdapter(api, gate: apiGate),
        refreshAdapter = FakeAdapter(refresh, gate: refreshGate) {
    dio.httpClientAdapter = apiAdapter;
    final refreshDio = Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = refreshAdapter;
    interceptor = AuthInterceptor(
      dio: dio,
      storage: storage,
      refreshDio: refreshDio,
      sessionEvents: events,
    );
    dio.interceptors.add(interceptor);
    events.stream.listen(ended.add);
  }

  final storage = MemoryStorage();
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  final events = SessionEvents();
  final ended = <SessionEnd>[];
  late final AuthInterceptor interceptor;
  final FakeAdapter apiAdapter;
  final FakeAdapter refreshAdapter;
}

Map<String, Object> _backendError(int status, String message) =>
    {'code': status == 403 ? 'E005' : 'E004', 'message': message, 'statusCode': status};

/// Status of each GET, 200 or the error status, without failing on the first error
Future<List<int?>> _statuses(Dio dio, List<String> paths) => Future.wait([
      for (final path in paths)
        dio.get(path).then<int?>((r) => r.statusCode, onError: (Object e) => (e as DioException).response?.statusCode),
    ]);

Matcher _dioStatus(int status) =>
    throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', status));

void main() {
  group('AuthInterceptor', () {
    test('UT-INT-01: retries a 401 once with the refreshed token', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);

      final res = await h.dio.get('/tasks');

      expect(res.statusCode, 200);
      expect(h.storage.access, 'new_access');
      expect(h.storage.refresh, 'new_refresh');
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.apiAdapter.requests, hasLength(2));
    });

    test('UT-INT-02: gives up when the retried request is still 401', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, {'message': 'forbidden_scope'}),
        refresh: newTokenPair,
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.apiAdapter.requests, hasLength(2));
    });

    test('UT-INT-03: a 401 from login does not trigger a refresh', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, {'message': 'invalid_credentials'}),
        refresh: newTokenPair,
      );

      await expectLater(
        h.dio.post(ApiConstants.login, data: {'username': 'u', 'password': 'p'}),
        _dioStatus(401),
      );
      expect(h.refreshAdapter.requests, isEmpty);
      expect(h.apiAdapter.requests, hasLength(1));
    });

    test('UT-INT-04: refresh without a new refreshToken ends the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: (_) => jsonBody(200, {'accessToken': 'new_access'}),
      );

      await expectLater(h.dio.get('/tasks'), throwsA(isA<DioException>()));
      expect(h.storage.access, isNull);
      expect(h.storage.refresh, isNull);
      expect(h.apiAdapter.requests, hasLength(1));
    });

    test('UT-INT-05: a multipart upload survives the refresh retry', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);

      final res = await h.dio.post(
        '/reports',
        data: FormData.fromMap({'note': 'Patrol, block 3'}),
      );

      expect(res.statusCode, 200);
      expect(h.apiAdapter.requests, hasLength(2));
    });

    test('UT-INT-06: concurrent 401s share a single refresh', () async {
      final release = Completer<void>();
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: newTokenPair,
        // The refresh is held until both requests have been refused
        refreshGate: (_) => release.future,
      );

      final pending = Future.wait([h.dio.get('/tasks'), h.dio.get('/alerts')]);
      await pumpEventQueue();
      expect(h.refreshAdapter.requests, hasLength(1));
      release.complete();
      final results = await pending;

      expect(results.map((r) => r.statusCode), everyElement(200));
      expect(h.refreshAdapter.requests, hasLength(1));
    });

    test('UT-INT-07: a refresh answered 5xx (a gateway during a rolling restart) keeps the session; the request '
        'fails with that status', () async {
      for (final status in [500, 502, 503, 504]) {
        final h = _Harness(
          api: (o) => okWhenBearer(o, 'new_access'),
          refresh: (_) => jsonBody(status, {'message': 'down'}),
        );

        await expectLater(h.dio.get('/tasks'), _dioStatus(status), reason: '$status');
        expect(h.storage.access, 'old_access', reason: '$status');
        expect(h.storage.refresh, 'old_refresh', reason: '$status');
        expect(h.ended, isEmpty, reason: '$status');
        expect(h.apiAdapter.requests, hasLength(1), reason: '$status');
      }
    });

    test('UT-INT-20: a refresh answered 408 or 429 keeps the session; the request fails with that status', () async {
      for (final status in [408, 429]) {
        final h = _Harness(
          api: (o) => okWhenBearer(o, 'new_access'),
          refresh: (_) => jsonBody(status, _backendError(status, 'ThrottlerException: Too Many Requests')),
        );

        await expectLater(h.dio.get('/tasks'), _dioStatus(status), reason: '$status');
        expect(h.storage.access, 'old_access', reason: '$status');
        expect(h.storage.refresh, 'old_refresh', reason: '$status');
        expect(h.ended, isEmpty, reason: '$status');
      }
    });

    test('UT-INT-21: a kept session refreshes again on the next 401', () async {
      var attempts = 0;
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: (o) => ++attempts == 1 ? jsonBody(503, {'message': 'down'}) : newTokenPair(o),
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(503));
      expect((await h.dio.get('/tasks')).statusCode, 200);

      expect(h.refreshAdapter.requests.map((o) => o.data), [
        {'refreshToken': 'old_refresh'},
        {'refreshToken': 'old_refresh'},
      ]);
      expect(h.storage.refresh, 'new_refresh');
      expect(h.ended, isEmpty);
    });

    test('UT-INT-22: any other 4xx (but 408 and 429) refuses the refresh token, whatever its code', () async {
      for (final status in [400, 401, 403, 404, 409, 422]) {
        final h = _Harness(
          api: (o) => okWhenBearer(o, 'new_access'),
          refresh: (_) => jsonBody(status, {'statusCode': status}),
        );

        await expectLater(h.dio.get('/tasks'), _dioStatus(401), reason: '$status');
        expect(h.storage.refresh, isNull, reason: '$status');
        expect(h.ended.map((e) => e.code), ['refresh_failed'], reason: '$status');
      }
    });

    test('UT-INT-08: 401 from OTP verification does not trigger a refresh', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, {'message': 'invalid_otp'}),
        refresh: newTokenPair,
      );

      await expectLater(
        h.dio.post(ApiConstants.verifyMfa, data: {'mfaToken': 't', 'method': 'totp', 'code': '000000'}),
        _dioStatus(401),
      );
      expect(h.refreshAdapter.requests, isEmpty);
    });

    // T15: the public sign-in routes take no Bearer and never refresh
    test('UT-INT-10: public MFA routes carry no Authorization header and never refresh', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, {'code': 'E004', 'message': 'mfa_token_invalid', 'statusCode': 401}),
        refresh: newTokenPair,
      );

      for (final path in [ApiConstants.login, ApiConstants.verifyMfa, ApiConstants.mfaEnroll, ApiConstants.mfaEnrollConfirm]) {
        await expectLater(h.dio.post(path, data: {'mfaToken': 'm'}), _dioStatus(401), reason: path);
      }

      expect(h.refreshAdapter.requests, isEmpty);
      for (final r in h.apiAdapter.requests) {
        expect(r.headers['Authorization'], isNull, reason: r.path);
      }
    });

    // A wrong code on a Bearer MFA route is also a 401 (mfa.service.ts:650-662); refreshing and
    // resending it would count a second failure towards the 15-minute lock
    test('UT-INT-12: a 401 for a wrong or expired MFA code is not refreshed and retried', () async {
      for (final message in ['invalid_code', 'mfa_token_invalid']) {
        final h = _Harness(
          api: (_) => jsonBody(401, {'code': 'E004', 'message': message, 'statusCode': 401}),
          refresh: newTokenPair,
        );

        await expectLater(
          h.dio.post(ApiConstants.mfaDisable, data: {'method': 'totp', 'code': '000000'}),
          _dioStatus(401),
          reason: message,
        );

        expect(h.refreshAdapter.requests, isEmpty, reason: message);
        expect(h.apiAdapter.requests, hasLength(1), reason: message);
      }
    });

    test('UT-INT-11: MFA management routes keep the Bearer header', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'old_access'), refresh: newTokenPair);

      final res = await h.dio.get(ApiConstants.mfaStatus);

      expect(res.statusCode, 200);
      expect(h.apiAdapter.requests.single.headers['Authorization'], 'Bearer old_access');
    });

    test('UT-INT-09: blank tokens from refresh end the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, ''),
        refresh: (_) => jsonBody(200, {'accessToken': '', 'refreshToken': ' '}),
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.storage.access, isNull);
      expect(h.storage.refresh, isNull);
      expect(h.apiAdapter.requests, hasLength(1));
    });

    test('UT-INT-10: a blank stored refresh token is never sent', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);
      h.storage.refresh = '   ';

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.refreshAdapter.requests, isEmpty);
      expect(h.storage.access, isNull);
    });

    // Session integrity (Codex round 3). A rotated refresh token presented again is taken as
    // theft and ends every session of the account (Web/backend/src/auth/auth.service.ts:430-432).
    test('UT-INT-13: a 401 that arrives after the refresh finished retries without a second refresh',
        () async {
      final slowAnswer = Completer<void>();
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: newTokenPair,
        // Sent with the old token, but answered only after /tasks has refreshed and retried
        apiGate: (o) => o.path == '/slow' && o.headers['Authorization'] == 'Bearer old_access'
            ? slowAnswer.future
            : Future<void>.value(),
      );

      final slow = h.dio.get('/slow');
      expect((await h.dio.get('/tasks')).statusCode, 200);
      slowAnswer.complete();

      expect((await slow).statusCode, 200);
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.storage.refresh, 'new_refresh');
    });

    test('UT-INT-14: session_revoked is refreshed once and retried (jwt-auth.guard.ts:44-47)', () async {
      final h = _Harness(
        api: (o) => o.headers['Authorization'] == 'Bearer new_access'
            ? jsonBody(200, {'ok': true})
            : jsonBody(401, _backendError(401, 'session_revoked')),
        refresh: newTokenPair,
      );

      final res = await h.dio.get('/tasks');

      expect(res.statusCode, 200);
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.apiAdapter.requests, hasLength(2));
      expect(h.ended, isEmpty);
    });

    test('UT-INT-15: every refusal of the refresh ends the session once and is never retried', () async {
      // Web/backend/src/auth/auth.service.ts:472-487
      const refusals = [
        (401, 'refresh_token_reused'),
        (401, 'refresh_token_revoked'),
        (401, 'mfa_reauthentication_required'),
        (403, 'account_disabled'),
        (403, 'no_role_assigned'),
      ];
      for (final (status, code) in refusals) {
        final release = Completer<void>();
        final h = _Harness(
          api: (o) => okWhenBearer(o, 'new_access'),
          refresh: (_) => jsonBody(status, _backendError(status, code)),
          // The refusal is held until all four requests wait on the one refresh
          refreshGate: (_) => release.future,
        );

        final pending = _statuses(h.dio, ['/tasks', '/alerts', '/chat/conversations', '/notifications']);
        await pumpEventQueue();
        release.complete();
        final statuses = await pending;

        expect(statuses, everyElement(401), reason: code);
        expect(h.refreshAdapter.requests, hasLength(1), reason: code);
        expect(h.apiAdapter.requests, hasLength(4), reason: '$code: nothing is retried');
        expect(h.storage.access, isNull, reason: code);
        expect(h.storage.refresh, isNull, reason: code);

        // A request after the end neither refreshes again nor reports a second end
        await expectLater(h.dio.get('/tasks'), _dioStatus(401), reason: code);
        expect(h.refreshAdapter.requests, hasLength(1), reason: code);
        expect(h.ended.map((e) => e.code), [code], reason: code);
      }
    });

    test('UT-INT-16: a refresh that fails on the network or times out keeps the session; the request fails with '
        'that cause', () async {
      for (final type in [
        DioExceptionType.connectionError,
        DioExceptionType.connectionTimeout,
        DioExceptionType.sendTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.unknown,
      ]) {
        final h = _Harness(
          api: (o) => okWhenBearer(o, 'new_access'),
          refresh: (o) => throw DioException(requestOptions: o, type: type),
        );

        await expectLater(
          h.dio.get('/tasks'),
          throwsA(isA<DioException>()
              .having((e) => e.type, 'type', type)
              .having((e) => e.requestOptions.path, 'path', '/tasks')
              .having((e) => e.response?.statusCode, 'status', isNot(401))),
          reason: '$type',
        );
        expect(h.storage.access, 'old_access', reason: '$type');
        expect(h.storage.refresh, 'old_refresh', reason: '$type');
        expect(h.ended, isEmpty, reason: '$type');
      }
    });

    test('UT-INT-17: a renewal without an answer throws for the socket and keeps the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: (_) => jsonBody(502, {'message': 'Bad gateway'}),
      );

      await expectLater(
        h.interceptor.refresher.renew(staleAccessToken: 'old_access'),
        throwsA(isA<RefreshUnavailable>().having((e) => e.cause.response?.statusCode, 'status', 502)),
      );
      expect(h.storage.refresh, 'old_refresh');
      expect(h.ended, isEmpty);
    });

    // Enabling MFA ends the old session; a background request may still be refreshing it when the
    // recovery codes are acknowledged and the replacement session is stored
    test('UT-INT-19: a refresh refused after a new session was stored does not clear that session',
        () async {
      late final _Harness h;
      h = _Harness(
        api: (o) => okWhenBearer(o, 'mfa_access'),
        refresh: (_) {
          // The codes are acknowledged while this refresh of the old session is out
          h.storage
            ..access = 'mfa_access'
            ..refresh = 'mfa_refresh';
          return jsonBody(401, _backendError(401, 'refresh_token_revoked'));
        },
      );

      final res = await h.dio.get('/tasks');

      expect(h.refreshAdapter.requests, hasLength(1), reason: 'the request left with the old token');
      expect(res.statusCode, 200, reason: 'retried with the replacement session');
      expect(h.storage.access, 'mfa_access');
      expect(h.storage.refresh, 'mfa_refresh');
      expect(h.ended, isEmpty);
    });

    test('UT-INT-18: renew hands back an already renewed token instead of refreshing', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);
      h.storage.access = 'newer_access';

      expect(await h.interceptor.refresher.renew(staleAccessToken: 'socket_token'), 'newer_access');
      expect(h.refreshAdapter.requests, isEmpty);

      expect(await h.interceptor.refresher.renew(staleAccessToken: 'newer_access'), 'new_access');
      expect(h.refreshAdapter.requests, hasLength(1));
    });
  });
}

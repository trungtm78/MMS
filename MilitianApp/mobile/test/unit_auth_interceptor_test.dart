// Unit Tests: AuthInterceptor refresh/retry policy
// Overlapping calls are held with Completer gates on the fake adapter, never with fixed delays.
// Run: flutter test test/unit_auth_interceptor_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';
import 'package:militian_app/core/network/auth_interceptor.dart';

import 'helpers/fakes.dart';

class _Harness {
  _Harness({
    required ResponseBody Function(RequestOptions) api,
    required ResponseBody Function(RequestOptions) refresh,
    Future<void>? Function(RequestOptions)? refreshGate,
    Future<void>? Function(RequestOptions)? apiGate,
  })  : apiAdapter = FakeAdapter(api, gate: apiGate),
        refreshAdapter = FakeAdapter(refresh, gate: refreshGate) {
    dio.httpClientAdapter = apiAdapter;
    final refreshDio = Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = refreshAdapter;
    dio.interceptors.add(
      AuthInterceptor(dio: dio, storage: storage, refreshDio: refreshDio),
    );
  }

  final storage = MemoryStorage();
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  final FakeAdapter apiAdapter;
  final FakeAdapter refreshAdapter;
}

Matcher _dioStatus(int status) =>
    throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', status));

void main() {
  group('AuthInterceptor', () {
    test('retries a 401 once with the refreshed token', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);

      final res = await h.dio.get('/tasks');

      expect(res.statusCode, 200);
      expect(h.storage.access, 'new_access');
      expect(h.storage.refresh, 'new_refresh');
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.apiAdapter.requests, hasLength(2));
    });

    test('gives up when the retried request is still 401', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, {'message': 'forbidden_scope'}),
        refresh: newTokenPair,
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.apiAdapter.requests, hasLength(2));
    });

    test('a 401 from login does not trigger a refresh', () async {
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

    test('refresh without a new refreshToken ends the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: (_) => jsonBody(200, {'accessToken': 'new_access'}),
      );

      await expectLater(h.dio.get('/tasks'), throwsA(isA<DioException>()));
      expect(h.storage.access, isNull);
      expect(h.storage.refresh, isNull);
      expect(h.apiAdapter.requests, hasLength(1));
    });

    test('a multipart upload survives the refresh retry', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);

      final res = await h.dio.post(
        '/reports',
        data: FormData.fromMap({'note': 'Patrol ward 3'}),
      );

      expect(res.statusCode, 200);
      expect(h.apiAdapter.requests, hasLength(2));
    });

    test('concurrent 401s share a single refresh', () async {
      final refreshHeld = Completer<void>();
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: newTokenPair,
        refreshGate: (_) => refreshHeld.future,
      );

      final pending = Future.wait([
        h.dio.get('/tasks'),
        h.dio.get('/kpi/current'),
        h.dio.get('/notifications'),
      ]);
      // All three had their 401 while the one refresh is held open
      await pumpEventQueue();
      expect(h.apiAdapter.sent.where((s) => s.$2 == 'Bearer old_access'), hasLength(3));
      expect(h.refreshAdapter.requests, hasLength(1));
      refreshHeld.complete();
      final results = await pending;

      expect(results.map((r) => r.statusCode), everyElement(200));
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.apiAdapter.sent.where((s) => s.$2 == 'Bearer old_access'), hasLength(3));
      expect(h.apiAdapter.sent.where((s) => s.$2 == 'Bearer new_access'), hasLength(3));
    });

    // Web/backend/src/common/guards/jwt-auth.guard.ts:44-47
    test('a 401 session_revoked refreshes once and retries', () async {
      final h = _Harness(
        api: (o) => o.headers['Authorization'] == 'Bearer new_access'
            ? jsonBody(200, {'ok': true})
            : jsonBody(401, backendError(401, 'session_revoked')),
        refresh: newTokenPair,
      );

      final res = await h.dio.get('/tasks');

      expect(res.statusCode, 200);
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(h.apiAdapter.sent.map((s) => s.$2), ['Bearer old_access', 'Bearer new_access']);
    });

    // Refresh tokens rotate and a second use of one counts as theft (Web/backend/src/auth/
    // auth.service.ts:426-429), so a late 401 must not refresh again
    test('a 401 that arrives after a refresh finished retries with the stored token, without a second refresh',
        () async {
      final slowHeld = Completer<void>();
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: newTokenPair,
        // Sent with the old token, answered only once the other request's refresh is done
        apiGate: (o) => o.path == '/slow' && o.headers['Authorization'] == 'Bearer old_access'
            ? slowHeld.future
            : null,
      );

      final slow = h.dio.get('/slow');
      final fast = await h.dio.get('/tasks');
      expect(fast.statusCode, 200);
      expect(h.refreshAdapter.requests, hasLength(1));

      slowHeld.complete();
      final late = await slow;

      expect(late.statusCode, 200);
      expect(h.refreshAdapter.requests, hasLength(1));
      expect(
        h.apiAdapter.sent.where((s) => s.$1 == '/slow').map((s) => s.$2),
        ['Bearer old_access', 'Bearer new_access'],
      );
    });

    test('a refresh that never reached the server keeps the session', () async {
      for (final type in [DioExceptionType.connectionError, DioExceptionType.connectionTimeout]) {
        final h = _Harness(
          api: (o) => okWhenBearer(o, 'new_access'),
          refresh: (o) => throw DioException(requestOptions: o, type: type),
        );

        await expectLater(h.dio.get('/tasks'), _dioStatus(401), reason: '$type');
        expect(h.storage.access, 'old_access', reason: '$type');
        expect(h.storage.refresh, 'old_refresh', reason: '$type');
        expect(h.apiAdapter.requests, hasLength(1), reason: '$type');
      }
    });

    test('a receive timeout on refresh ends the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: (o) => throw DioException(requestOptions: o, type: DioExceptionType.receiveTimeout),
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.storage.access, isNull);
      expect(h.storage.refresh, isNull);
    });

    test('a failed refresh call ends the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: (_) => jsonBody(500, {'message': 'down'}),
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.storage.access, isNull);
      expect(h.storage.refresh, isNull);
    });

    test('401 from OTP verification does not trigger a refresh', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, backendError(401, 'invalid_code', details: {'attemptsRemaining': 4})),
        refresh: newTokenPair,
      );

      await expectLater(
        h.dio.post(ApiConstants.verifyMfa,
            data: {'mfaToken': testMfaToken, 'method': 'totp', 'code': '000000'}),
        _dioStatus(401),
      );
      expect(h.refreshAdapter.requests, isEmpty);
      expect(h.apiAdapter.requests, hasLength(1));
    });

    // Web/backend/src/auth/mfa/mfa.controller.ts: verify, enroll, enroll/confirm and the
    // deprecated login take no JwtAuthGuard
    test('public sign-in routes never carry the stored Bearer token', () async {
      final h = _Harness(api: (_) => jsonBody(200, {'ok': true}), refresh: newTokenPair);

      for (final path in [
        ApiConstants.login,
        ApiConstants.verifyMfa,
        ApiConstants.mfaEnroll,
        ApiConstants.mfaEnrollConfirm,
      ]) {
        await h.dio.post(path, data: {'mfaToken': testMfaToken});
      }

      expect(h.apiAdapter.requests, hasLength(4));
      expect(h.apiAdapter.requests.map((o) => o.headers['Authorization']), everyElement(isNull));
    });

    test('a 401 from enrolment confirmation does not trigger a refresh', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, backendError(401, 'mfa_token_invalid')),
        refresh: newTokenPair,
      );

      await expectLater(
        h.dio.post(ApiConstants.mfaEnrollConfirm, data: {'mfaToken': testMfaToken, 'code': '000000'}),
        _dioStatus(401),
      );
      expect(h.refreshAdapter.requests, isEmpty);
      expect(h.apiAdapter.requests, hasLength(1));
      expect(h.storage.access, 'old_access');
    });

    test('a 401 from the deprecated /auth/mfa/login does not trigger a refresh', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, backendError(401, 'invalid_code')),
        refresh: newTokenPair,
      );

      await expectLater(
        h.dio.post('/auth/mfa/login', data: {'tempToken': testMfaToken, 'otp': '000000'}),
        _dioStatus(401),
      );
      expect(h.refreshAdapter.requests, isEmpty);
      expect(h.apiAdapter.requests.single.headers['Authorization'], isNull);
    });

    test('signed-in MFA routes still carry the Bearer token', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'old_access'), refresh: newTokenPair);

      final res = await h.dio.get(ApiConstants.mfaStatus);

      expect(res.statusCode, 200);
      expect(h.apiAdapter.requests.single.headers['Authorization'], 'Bearer old_access');
      expect(h.refreshAdapter.requests, isEmpty);
    });

    test('an expired token on a signed-in MFA route is refreshed', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);

      final res = await h.dio.get(ApiConstants.mfaStatus);

      expect(res.statusCode, 200);
      expect(h.refreshAdapter.requests, hasLength(1));
    });

    test('a wrong code on a signed-in MFA route is not retried after a refresh', () async {
      // A retry would send the same code again and count a second failure toward mfa_locked
      final h = _Harness(
        api: (_) => jsonBody(401, backendError(401, 'invalid_code')),
        refresh: newTokenPair,
      );

      await expectLater(
        h.dio.post(ApiConstants.mfaRegenerateRecoveryCodes, data: {'code': '000000'}),
        _dioStatus(401),
      );
      expect(h.refreshAdapter.requests, isEmpty);
      expect(h.apiAdapter.requests, hasLength(1));
      expect(h.storage.access, 'old_access');
    });

    test('blank tokens from refresh end the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, ''),
        refresh: (_) => jsonBody(200, {'accessToken': '', 'refreshToken': ' '}),
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.storage.access, isNull);
      expect(h.storage.refresh, isNull);
      expect(h.apiAdapter.requests, hasLength(1));
    });

    test('a blank stored refresh token is never sent', () async {
      final h = _Harness(api: (o) => okWhenBearer(o, 'new_access'), refresh: newTokenPair);
      h.storage.refresh = '   ';

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.refreshAdapter.requests, isEmpty);
      expect(h.storage.access, isNull);
    });
  });
}

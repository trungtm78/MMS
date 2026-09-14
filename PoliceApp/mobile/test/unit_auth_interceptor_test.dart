// Unit Tests: AuthInterceptor refresh/retry policy
// Run: flutter test test/unit_auth_interceptor_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/constants/api_constants.dart';
import 'package:police_app/core/network/auth_interceptor.dart';

import 'helpers/fakes.dart';

class _Harness {
  _Harness({
    required ResponseBody Function(RequestOptions) api,
    required ResponseBody Function(RequestOptions) refresh,
    Duration refreshDelay = Duration.zero,
  })  : apiAdapter = FakeAdapter(api),
        refreshAdapter = FakeAdapter(refresh, delay: refreshDelay) {
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
        data: FormData.fromMap({'note': 'Tuần tra khu phố 3'}),
      );

      expect(res.statusCode, 200);
      expect(h.apiAdapter.requests, hasLength(2));
    });

    test('UT-INT-06: concurrent 401s share a single refresh', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: newTokenPair,
        refreshDelay: const Duration(milliseconds: 20),
      );

      final results = await Future.wait([h.dio.get('/tasks'), h.dio.get('/alerts')]);

      expect(results.map((r) => r.statusCode), everyElement(200));
      expect(h.refreshAdapter.requests, hasLength(1));
    });

    test('UT-INT-07: a failed refresh call ends the session', () async {
      final h = _Harness(
        api: (o) => okWhenBearer(o, 'new_access'),
        refresh: (_) => jsonBody(500, {'message': 'down'}),
      );

      await expectLater(h.dio.get('/tasks'), _dioStatus(401));
      expect(h.storage.access, isNull);
      expect(h.storage.refresh, isNull);
    });

    test('UT-INT-08: 401 from OTP verification does not trigger a refresh', () async {
      final h = _Harness(
        api: (_) => jsonBody(401, {'message': 'invalid_otp'}),
        refresh: newTokenPair,
      );

      await expectLater(
        h.dio.post(ApiConstants.verifyMfa, data: {'tempToken': 't', 'code': '000000'}),
        _dioStatus(401),
      );
      expect(h.refreshAdapter.requests, isEmpty);
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
  });
}

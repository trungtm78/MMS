// Unit Tests: DioClient — one authenticated Dio and one token refresher for the whole app, so HTTP
// requests and the chat socket share a refresh and a rotated refresh token is never sent twice
// (Web/backend/src/auth/auth.service.ts:426-429).
// Run: flutter test test/unit_dio_client_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';
import 'package:militian_app/core/network/auth_interceptor.dart';
import 'package:militian_app/core/network/dio_client.dart';

import 'helpers/fakes.dart';

void main() {
  test('UT-DIO-01: the app Dio renews tokens through the shared refresher', () {
    final storage = MemoryStorage();

    final refresher = DioClient.refresherFor(storage);
    final dio = DioClient.getInstance(storage);

    expect(DioClient.refresherFor(MemoryStorage()), same(refresher));
    expect(DioClient.getInstance(MemoryStorage()), same(dio));
    expect(dio.interceptors.whereType<AuthInterceptor>().single.refresher, same(refresher));
    expect(dio.options.baseUrl, ApiConstants.baseUrl);
    expect(dio.options.connectTimeout, ApiConstants.connectTimeout);
    // Bodies are logged in debug builds only
    expect(dio.interceptors.whereType<LogInterceptor>(), hasLength(kDebugMode ? 1 : 0));
  });
}

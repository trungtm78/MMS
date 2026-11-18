import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import 'auth_interceptor.dart';
import 'session_events.dart';
import 'token_refresher.dart';

class DioClient {
  static Dio? _instance;
  static TokenRefresher? _refresher;

  static Dio getInstance(SecureStorageService storage) {
    _instance ??= _createDio(storage);
    return _instance!;
  }

  /// The one refresher behind every HTTP request and the chat socket, so one refresh serves them
  /// all and a rotated refresh token is never presented twice.
  static TokenRefresher refresherFor(SecureStorageService storage) =>
      _refresher ??= TokenRefresher(storage: storage, events: sharedSessionEvents);

  static Dio _createDio(SecureStorageService storage) {
    final dio = Dio(
      BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: ApiConstants.connectTimeout,
        receiveTimeout: ApiConstants.receiveTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      AuthInterceptor(dio: dio, storage: storage, refresher: refresherFor(storage)),
    );

    // SECURITY: only log request/response bodies in debug builds.
    // Release logs would leak passwords + access/refresh tokens to device logs.
    if (kDebugMode) {
      dio.interceptors.add(
        LogInterceptor(
          requestBody: true,
          responseBody: true,
          logPrint: (obj) => debugPrint('[HTTP] $obj'),
        ),
      );
    }

    return dio;
  }
}

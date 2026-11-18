import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import 'auth_interceptor.dart';
import 'session_events.dart';

class DioClient {
  static Dio? _instance;

  static Dio getInstance(SecureStorageService storage, {SessionEvents? sessionEvents}) {
    _instance ??= _createDio(storage, sessionEvents);
    return _instance!;
  }

  static void reset() {
    _instance = null;
  }

  static Dio _createDio(SecureStorageService storage, SessionEvents? sessionEvents) {
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

    dio.interceptors.add(AuthInterceptor(dio: dio, storage: storage, sessionEvents: sessionEvents));

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

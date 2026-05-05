import 'dart:async';
import 'package:dio/dio.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';

/// Auth interceptor with queued refresh:
/// - Concurrent 401s wait for the in-flight refresh and then retry with the new token
/// - Refresh uses a SEPARATE Dio with no interceptors so it cannot pick up the stale Authorization
/// - On refresh failure, all queued retries fail and storage is cleared
class AuthInterceptor extends Interceptor {
  final Dio dio;
  final SecureStorageService storage;

  /// Single in-flight refresh future. Concurrent 401s await this.
  Completer<String?>? _refreshCompleter;

  /// Plain Dio without interceptors, used only for /auth/refresh.
  late final Dio _refreshDio = Dio(BaseOptions(
    baseUrl: ApiConstants.baseUrl,
    connectTimeout: ApiConstants.connectTimeout,
    receiveTimeout: ApiConstants.receiveTimeout,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  AuthInterceptor({required this.dio, required this.storage});

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await storage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401) {
      handler.next(err);
      return;
    }

    // Don't loop on the refresh endpoint itself
    if (err.requestOptions.path.contains(ApiConstants.refreshToken)) {
      handler.next(err);
      return;
    }

    try {
      final newToken = await _ensureRefresh();
      if (newToken == null) {
        handler.next(err);
        return;
      }

      final retryOptions = err.requestOptions;
      retryOptions.headers['Authorization'] = 'Bearer $newToken';
      final retryResponse = await dio.fetch(retryOptions);
      handler.resolve(retryResponse);
    } catch (_) {
      handler.next(err);
    }
  }

  /// Returns a new access token, or null if refresh failed.
  /// Concurrent callers share the same in-flight refresh.
  Future<String?> _ensureRefresh() async {
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    final completer = Completer<String?>();
    _refreshCompleter = completer;

    try {
      final refreshToken = await storage.getRefreshToken();
      if (refreshToken == null) {
        completer.complete(null);
        return null;
      }

      final response = await _refreshDio.post(
        ApiConstants.refreshToken,
        data: {'refreshToken': refreshToken},
      );

      final newAccessToken = response.data['accessToken'] as String?;
      final newRefreshToken = response.data['refreshToken'] as String?;
      if (newAccessToken == null) {
        await storage.clearTokens();
        completer.complete(null);
        return null;
      }

      await storage.saveAccessToken(newAccessToken);
      if (newRefreshToken != null) {
        await storage.saveRefreshToken(newRefreshToken);
      }

      completer.complete(newAccessToken);
      return newAccessToken;
    } catch (_) {
      await storage.clearTokens();
      completer.complete(null);
      return null;
    } finally {
      _refreshCompleter = null;
    }
  }
}

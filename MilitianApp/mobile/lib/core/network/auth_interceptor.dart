import 'dart:async';
import 'package:dio/dio.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';

/// Auth interceptor with queued refresh:
/// - Concurrent 401s wait for the in-flight refresh and then retry with the new token
/// - Each request is retried at most once; a second 401 goes back to the caller
/// - 401s from auth endpoints (bad credentials/OTP) never trigger a refresh
/// - Refresh uses a SEPARATE Dio with no interceptors so it cannot pick up the stale Authorization
/// - Refresh must return a full token pair; otherwise storage is cleared and queued retries fail
class AuthInterceptor extends Interceptor {
  final Dio dio;
  final SecureStorageService storage;

  /// Single in-flight refresh future. Concurrent 401s await this.
  Completer<String?>? _refreshCompleter;

  /// Plain Dio without interceptors, used only for /auth/refresh.
  final Dio _refreshDio;

  AuthInterceptor({required this.dio, required this.storage, Dio? refreshDio})
      : _refreshDio = refreshDio ?? _plainDio();

  static Dio _plainDio() => Dio(BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: ApiConstants.connectTimeout,
        receiveTimeout: ApiConstants.receiveTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ));

  /// Marks a request that was already retried after a refresh.
  static const _retriedKey = 'auth_retried';

  /// Endpoints whose 401 means bad credentials, not an expired session.
  static const _noRefreshPaths = [
    ApiConstants.login,
    ApiConstants.refreshToken,
    ApiConstants.verifyMfa,
    ApiConstants.verifyRecovery,
  ];

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await storage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    if (err.response?.statusCode != 401 ||
        options.extra[_retriedKey] == true ||
        _noRefreshPaths.any(options.path.contains)) {
      handler.next(err);
      return;
    }

    try {
      final newToken = await _ensureRefresh();
      if (newToken == null) {
        handler.next(err);
        return;
      }

      // Retry original request once with the new token
      options.extra[_retriedKey] = true;
      options.headers['Authorization'] = 'Bearer $newToken';
      // A FormData body can only be sent once; retry with a fresh copy
      final body = options.data;
      if (body is FormData) options.data = body.clone();
      handler.resolve(await dio.fetch(options));
    } on DioException catch (retryErr) {
      handler.next(retryErr);
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
      if (refreshToken == null || refreshToken.trim().isEmpty) {
        // Nothing usable to refresh with: end the session rather than send a blank token
        await storage.clearTokens();
        completer.complete(null);
        return null;
      }

      final response = await _refreshDio.post(
        ApiConstants.refreshToken,
        data: {'refreshToken': refreshToken},
      );

      String? nonBlank(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
      final body = response.data;
      final newAccessToken = body is Map ? nonBlank(body['accessToken']) : null;
      final newRefreshToken = body is Map ? nonBlank(body['refreshToken']) : null;
      // Backend rotates the refresh token; keeping the old one would strand the session
      if (newAccessToken == null || newRefreshToken == null) {
        await storage.clearAll();
        completer.complete(null);
        return null;
      }

      await storage.saveAccessToken(newAccessToken);
      await storage.saveRefreshToken(newRefreshToken);

      completer.complete(newAccessToken);
      return newAccessToken;
    } catch (e) {
      await storage.clearAll();
      completer.complete(null);
      return null;
    } finally {
      _refreshCompleter = null;
    }
  }
}

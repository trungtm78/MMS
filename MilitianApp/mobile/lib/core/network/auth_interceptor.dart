import 'package:dio/dio.dart';

import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import 'session_events.dart';
import 'token_refresher.dart';

/// Attaches the Bearer token and renews it once on a 401:
/// - every 401 of a signed-in route, 401 session_revoked included (Web/backend/src/common/guards/
///   jwt-auth.guard.ts:44-47), is renewed through the shared [TokenRefresher]: concurrent and late
///   401s share one refresh, and a request sent with an older token is retried with the stored one
/// - each request is retried at most once; a second 401 goes back to the caller
/// - 401s from auth endpoints (bad credentials, wrong or expired MFA codes) never trigger a refresh
/// - public sign-in routes never carry the Bearer token
/// - a refused refresh ends the session (TokenRefresher); the original request then fails
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.dio,
    required this.storage,
    Dio? refreshDio,
    SessionEvents? events,
    TokenRefresher? refresher,
  }) : refresher = refresher ??
            TokenRefresher(
              storage: storage,
              events: events ?? sharedSessionEvents,
              refreshDio: refreshDio,
            );

  final Dio dio;
  final SecureStorageService storage;
  final TokenRefresher refresher;

  /// Marks a request that was already retried after a refresh.
  static const _retriedKey = 'auth_retried';

  /// Public sign-in routes (Web/backend/src/auth/auth.controller.ts login and the
  /// JwtAuthGuard-free routes of src/auth/mfa/mfa.controller.ts). They take the mfaToken from
  /// POST /auth/login, so they never carry a Bearer token and their 401 is never refreshed.
  /// The deprecated mfa login route is listed so no request to it can do either.
  static const _publicAuthPaths = [
    ApiConstants.login,
    ApiConstants.verifyMfa,
    ApiConstants.mfaEnroll,
    ApiConstants.mfaEnrollConfirm,
    '/auth/mfa/login',
  ];

  /// 401 codes that reject a second-factor code (mfa.service.ts rejectCode) rather than the
  /// access token. Retrying would send the same code again and count another failure.
  static const _codeRejections = {'invalid_code', 'mfa_token_invalid'};

  static String _pathOf(RequestOptions options) => options.path.split('?').first;

  static bool _isPublicAuthPath(RequestOptions options) =>
      _publicAuthPaths.any(_pathOf(options).endsWith);

  static bool _isCodeRejection(DioException err) {
    final data = err.response?.data;
    return data is Map && _codeRejections.contains(data['message']);
  }

  /// The access token the request was sent with.
  static String? _bearerOf(RequestOptions options) {
    final header = options.headers['Authorization'];
    return header is String && header.startsWith('Bearer ') ? header.substring(7) : null;
  }

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (_isPublicAuthPath(options)) {
      options.headers.remove('Authorization');
      handler.next(options);
      return;
    }
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
        _isPublicAuthPath(options) ||
        _pathOf(options).endsWith(ApiConstants.refreshToken) ||
        _isCodeRejection(err)) {
      handler.next(err);
      return;
    }

    try {
      final newToken = await refresher.renew(staleToken: _bearerOf(options));
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
}

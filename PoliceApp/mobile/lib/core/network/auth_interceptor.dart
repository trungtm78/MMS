import 'package:dio/dio.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import 'session_events.dart';
import 'token_refresher.dart';

/// Auth interceptor with queued refresh:
/// - 401s (expired or revoked access tokens, e.g. session_revoked) renew the token through one
///   shared [TokenRefresher] and retry with it
/// - Each request is retried at most once; a second 401 goes back to the caller
/// - 401s from auth endpoints (bad credentials/OTP) never trigger a refresh
/// - A refused refresh clears the session and reports it through [SessionEvents]; a refresh without
///   a definitive answer (offline, timeout, 5xx, 408, 429) keeps the session and the original request
///   fails with that cause, so the caller can retry
class AuthInterceptor extends Interceptor {
  final Dio dio;
  final SecureStorageService storage;

  /// Also used by the chat socket, so HTTP and socket renewals share one refresh
  final TokenRefresher refresher;

  AuthInterceptor({
    required this.dio,
    required this.storage,
    Dio? refreshDio,
    SessionEvents? sessionEvents,
  }) : refresher = TokenRefresher(
          storage: storage,
          refreshDio: refreshDio ?? _plainDio(),
          sessionEvents: sessionEvents,
        );

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

  /// Sign-in routes: they take no Bearer, and their 401 means a wrong password, code or
  /// challenge — never an expired session (contract T15).
  static const _publicAuthPaths = [
    ApiConstants.login,
    ApiConstants.refreshToken,
    ApiConstants.verifyMfa,
    ApiConstants.mfaEnroll,
    ApiConstants.mfaEnrollConfirm,
    ApiConstants.mfaLegacyLogin,
  ];

  static bool isPublicAuthPath(String path) => _publicAuthPaths.any(path.endsWith);

  /// 401s that reject an MFA code or challenge rather than the access token. Bearer MFA
  /// routes answer a wrong code with 401 invalid_code (Web/backend/src/auth/mfa/mfa.service.ts:650-662);
  /// refreshing and resending would count the same code twice towards the lock.
  static const _mfaCodeRejections = {'invalid_code', 'mfa_token_invalid'};

  static bool _rejectsMfaCode(DioException err) {
    final body = err.response?.data;
    return body is Map && _mfaCodeRejections.contains(body['message']);
  }

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await storage.getAccessToken();
    if (token != null && !isPublicAuthPath(options.path)) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    if (err.response?.statusCode != 401 ||
        options.extra[_retriedKey] == true ||
        isPublicAuthPath(options.path) ||
        _rejectsMfaCode(err)) {
      handler.next(err);
      return;
    }

    final String? newToken;
    try {
      newToken = await refresher.renew(staleAccessToken: _bearerOf(options));
    } on RefreshUnavailable catch (unavailable) {
      // The session is kept: fail with what stopped the refresh (offline, 5xx, 429), which the caller
      // words as a retryable failure, not with the 401 that would read as a lost session
      handler.next(_retryable(options, unavailable.cause));
      return;
    } catch (_) {
      handler.next(err);
      return;
    }
    if (newToken == null) {
      handler.next(err);
      return;
    }

    try {
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

  /// The failure of [options] when its refresh got no definitive answer: the refresh's error type and,
  /// for an HTTP failure (5xx, 429), its status and body, on the caller's own request.
  static DioException _retryable(RequestOptions options, DioException cause) {
    final response = cause.response;
    return DioException(
      requestOptions: options,
      type: cause.type,
      error: cause.error,
      message: cause.message,
      response: response == null
          ? null
          : Response<dynamic>(
              requestOptions: options,
              statusCode: response.statusCode,
              statusMessage: response.statusMessage,
              data: response.data,
              headers: response.headers,
            ),
    );
  }

  /// The access token a request was sent with
  static String? _bearerOf(RequestOptions options) {
    final header = options.headers['Authorization'];
    return header is String && header.startsWith('Bearer ') ? header.substring(7) : null;
  }
}

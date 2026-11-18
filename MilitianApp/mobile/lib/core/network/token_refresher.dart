import 'package:dio/dio.dart';

import '../../shared/utils/api_failure.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import 'session_events.dart';

/// A refresh that got no definitive answer: the server could not be reached, timed out, failed (5xx)
/// or throttled the call (429). The tokens are kept; [cause] is what stopped the refresh, so the
/// caller can fail its own request with it and retry later.
class RefreshUnavailable implements Exception {
  const RefreshUnavailable(this.cause);

  final DioException cause;

  @override
  String toString() => 'RefreshUnavailable(${cause.type}, ${cause.response?.statusCode})';
}

/// Renews the access token for every caller of the app (HTTP requests and the chat socket).
///
/// - Single flight: callers that arrive while a refresh is out share it.
/// - Stale-token dedupe: a caller whose token is older than the stored one (its request left before
///   the last refresh finished) gets the stored token. POST /auth/refresh rotates the refresh token and
///   a reused one ends every session of the account (Web/backend/src/auth/auth.service.ts:426-429), so
///   it is never presented twice.
/// - Only a definitive refusal ends the session (tokens cleared, one [SessionEnd] reported): any 4xx
///   from POST /auth/refresh but 408 and 429 ([isRefreshRefusal]: 401/403 with auth.service.ts
///   refreshTokens' codes invalid_refresh_token, refresh_token_reused, refresh_token_revoked,
///   mfa_reauthentication_required, account_disabled, no_role_assigned, whatever the code; a 400 or 404
///   cannot succeed by retrying either), a 2xx body without both tokens, tokens that cannot be stored,
///   or a blank stored refresh token.
/// - Anything else (connection failure, timeout, 5xx such as a gateway's 502/503/504 during a rolling
///   restart, 408, 429) keeps the tokens and throws [RefreshUnavailable], as the web client does.
class TokenRefresher {
  TokenRefresher({required this.storage, required this.events, Dio? refreshDio})
      : _refreshDio = refreshDio ?? _plainDio();

  final SecureStorageService storage;
  final SessionEvents events;

  /// Plain Dio without interceptors, used only for /auth/refresh.
  final Dio _refreshDio;

  Future<String?>? _inFlight;

  static Dio _plainDio() => Dio(BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        connectTimeout: ApiConstants.connectTimeout,
        receiveTimeout: ApiConstants.receiveTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ));

  /// Whether POST /auth/refresh answered [status] for good: any 4xx but 408 (request timeout) and 429
  /// (throttled), which a later attempt may get past.
  static bool isRefreshRefusal(int? status) =>
      status != null && status >= 400 && status < 500 && status != 408 && status != 429;

  static String? _nonBlank(Object? value) =>
      value is String && value.trim().isNotEmpty ? value : null;

  /// A usable access token for a caller whose [staleToken] was refused, or null when the session
  /// is over. Throws [RefreshUnavailable] when the refresh got no definitive answer (the session is
  /// kept).
  Future<String?> renew({String? staleToken}) {
    final inFlight = _inFlight;
    if (inFlight != null) return inFlight;
    final future = _renew(staleToken);
    _inFlight = future;
    future.whenComplete(() {
      if (identical(_inFlight, future)) _inFlight = null;
    }).ignore();
    return future;
  }

  Future<String?> _renew(String? staleToken) async {
    final stored = _nonBlank(await storage.getAccessToken());
    // Refreshed since the caller's request left: use that token instead of refreshing again
    if (stored != null && staleToken != null && stored != staleToken) return stored;

    final refreshToken = _nonBlank(await storage.getRefreshToken());
    if (refreshToken == null) {
      // Already signed out: nothing left to end
      if (stored == null) return null;
      return _end(refreshToken: null, code: null);
    }

    try {
      final response = await _refreshDio.post(
        ApiConstants.refreshToken,
        data: {'refreshToken': refreshToken},
      );
      final body = response.data;
      final accessToken = body is Map ? _nonBlank(body['accessToken']) : null;
      final newRefreshToken = body is Map ? _nonBlank(body['refreshToken']) : null;
      // The backend rotates the refresh token; keeping the old one would strand the session
      if (accessToken == null || newRefreshToken == null) {
        return _end(refreshToken: refreshToken, code: null);
      }
      await storage.saveAccessToken(accessToken);
      await storage.saveRefreshToken(newRefreshToken);
      return accessToken;
    } on DioException catch (e) {
      if (isRefreshRefusal(e.response?.statusCode)) {
        return _end(refreshToken: refreshToken, code: apiErrorCode(e));
      }
      // No verdict on the refresh token: the session may still be fine, only this request fails
      throw RefreshUnavailable(e);
    } catch (_) {
      return _end(refreshToken: refreshToken, code: null);
    }
  }

  /// Ends the session that [refreshToken] belonged to. A session stored while the refresh was out
  /// (a new sign-in, acknowledged recovery codes) is not that session and is kept.
  Future<String?> _end({required String? refreshToken, required String? code}) async {
    final current = _nonBlank(await storage.getRefreshToken());
    if (current != null && current != refreshToken) {
      return _nonBlank(await storage.getAccessToken());
    }
    await storage.clearTokens();
    events.end(SessionEnd.forCode(code));
    return null;
  }
}

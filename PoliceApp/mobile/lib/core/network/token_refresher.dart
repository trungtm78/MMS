import 'dart:async';

import 'package:dio/dio.dart';

import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';
import 'session_events.dart';

/// Returns a usable access token newer than [staleAccessToken], or null when there is none. Throws
/// [RefreshUnavailable] when the refresh got no definitive answer (the session is kept).
typedef RenewSession = Future<String?> Function({String? staleAccessToken});

/// A refresh that got no definitive answer: the server could not be reached, timed out, failed (5xx)
/// or throttled the call (429). The tokens are kept; [cause] is what stopped the refresh, so the
/// caller can fail its own request with it and retry later.
class RefreshUnavailable implements Exception {
  const RefreshUnavailable(this.cause);

  final DioException cause;

  @override
  String toString() => 'RefreshUnavailable(${cause.type}, ${cause.response?.statusCode})';
}

/// Renews the access token with POST /auth/refresh, once for every concurrent caller (HTTP 401s
/// and the chat socket). The backend rotates the refresh token on each use and takes a rotated
/// one presented again as theft, ending every session of the account
/// (Web/backend/src/auth/auth.service.ts:430-432, 472-487).
///
/// Only a definitive refusal ends the session: any 4xx from POST /auth/refresh but 408 and 429
/// ([isRefreshRefusal]: 401/403 with invalid_refresh_token, refresh_token_reused, refresh_token_revoked,
/// mfa_reauthentication_required, account_disabled, no_role_assigned, whatever the code; a 400 or 404
/// cannot succeed by retrying either), a 2xx body without both tokens, tokens that cannot be stored,
/// or no usable stored refresh token. Anything else (connection failure, timeout, 5xx such as a
/// gateway's 502/503/504 during a rolling restart, 408, 429) keeps the tokens and throws
/// [RefreshUnavailable], as the web client does.
class TokenRefresher {
  TokenRefresher({required this.storage, required Dio refreshDio, this.sessionEvents})
      : _refreshDio = refreshDio;

  final SecureStorageService storage;
  final SessionEvents? sessionEvents;

  /// Plain Dio without interceptors, so the refresh cannot pick up the stale Authorization
  final Dio _refreshDio;

  Future<String?>? _inFlight;

  /// Whether POST /auth/refresh answered [status] for good: any 4xx but 408 (request timeout) and 429
  /// (throttled), which a later attempt may get past.
  static bool isRefreshRefusal(int? status) =>
      status != null && status >= 400 && status < 500 && status != 408 && status != 429;

  Future<String?> renew({String? staleAccessToken}) =>
      _inFlight ??= _renew(staleAccessToken).whenComplete(() => _inFlight = null);

  Future<String?> _renew(String? staleAccessToken) async {
    final access = await storage.getAccessToken();
    // Renewed meanwhile (a 401 answered after an earlier refresh, or the socket): use that token.
    // Refreshing again would present a rotated refresh token.
    if (access != null && access.trim().isNotEmpty && access != staleAccessToken) return access;

    final refreshToken = await storage.getRefreshToken();
    if (refreshToken == null || refreshToken.trim().isEmpty) {
      // Nothing usable to refresh with: end the session rather than send a blank token
      await _end(SessionEvents.refreshFailed, hadSession: access != null || refreshToken != null);
      return null;
    }

    try {
      final response = await _refreshDio.post(
        ApiConstants.refreshToken,
        data: {'refreshToken': refreshToken},
      );

      String? nonBlank(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
      final body = response.data;
      final newAccessToken = body is Map ? nonBlank(body['accessToken']) : null;
      final newRefreshToken = body is Map ? nonBlank(body['refreshToken']) : null;
      // The old refresh token is spent; without a full new pair the session cannot continue
      if (newAccessToken == null || newRefreshToken == null) {
        return _end(SessionEvents.refreshFailed, spentRefreshToken: refreshToken);
      }

      await storage.saveAccessToken(newAccessToken);
      await storage.saveRefreshToken(newRefreshToken);
      return newAccessToken;
    } on DioException catch (e) {
      // Refused: the refresh token will not be accepted again, never retry
      if (isRefreshRefusal(e.response?.statusCode)) {
        return _end(_refusalCode(e), spentRefreshToken: refreshToken);
      }
      // No verdict on the refresh token: the session may still be fine, only this request fails
      throw RefreshUnavailable(e);
    } catch (_) {
      return _end(SessionEvents.refreshFailed, spentRefreshToken: refreshToken);
    }
  }

  /// Ends the session that [spentRefreshToken] belonged to and returns null. A different session
  /// stored while the refresh was out (acknowledged recovery codes, a new sign-in) is kept, and
  /// its access token returned so the caller can retry with it.
  Future<String?> _end(String code, {String? spentRefreshToken, bool hadSession = true}) async {
    if (spentRefreshToken != null) {
      final current = await storage.getRefreshToken();
      if (current != null && current.trim().isNotEmpty && current != spentRefreshToken) {
        final access = await storage.getAccessToken();
        return access != null && access.trim().isNotEmpty ? access : null;
      }
    }
    await storage.clearTokens();
    if (hadSession) sessionEvents?.end(code);
    return null;
  }

  static String _refusalCode(DioException e) {
    final status = e.response?.statusCode;
    final body = e.response?.data;
    if (status != null && status >= 400 && status < 500 && body is Map) {
      final message = body['message'];
      if (message is String && message.trim().isNotEmpty) return message.trim();
    }
    return SessionEvents.refreshFailed;
  }
}

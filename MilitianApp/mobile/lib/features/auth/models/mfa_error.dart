import 'package:dio/dio.dart';

import '../../../shared/utils/api_failure.dart';
import 'auth_response_exception.dart';

/// A failed second-factor step as data: the code, the attempts left and whether only a new sign-in
/// helps. Screens word it with mfaErrorText (lib/features/auth/auth_texts.dart). Codes come from
/// Web/backend/src/auth/mfa/mfa.service.ts and mfa-challenge.service.ts; the body shape
/// (message, details) from common/filters/http-exception.filter.ts.
class MfaError {
  static const String invalidCode = 'invalid_code';
  static const String tokenInvalid = 'mfa_token_invalid';
  static const String attemptsExceeded = 'mfa_attempts_exceeded';
  static const String locked = 'mfa_locked';
  static const String alreadyEnabled = 'mfa_already_enabled';
  static const String notEnabled = 'mfa_not_enabled';
  static const String requiredByRole = 'mfa_required_by_role';
  static const String setupNotStarted = 'mfa_setup_not_started';

  /// Any 429 other than the MFA codes: the ThrottlerGuard (code E006).
  static const String throttled = 'throttled';

  /// The server accepted the step but the session may not start in this app: see [issue].
  static const String sessionRejected = 'session_rejected';

  /// MFA was enabled and the new session stored, but no recovery codes came back.
  static const String recoveryCodesMissing = 'recovery_codes_missing';

  /// The backend code, or one of [throttled], [sessionRejected], [recoveryCodesMissing], 'unknown'.
  final String code;

  /// Codes that may still be tried on this challenge (sign-in routes only).
  final int? attemptsRemaining;

  /// The challenge is gone (expired, used up or locked): only a new sign-in helps.
  final bool restartLogin;

  /// The failed call, so text the MFA rules do not cover (validation, network, throttling) comes from
  /// the backend error table.
  final ApiFailure? failure;

  /// For [sessionRejected]: why the answer could not start a session.
  final AuthResponseIssue? issue;

  const MfaError({
    required this.code,
    this.attemptsRemaining,
    this.restartLogin = false,
    this.failure,
    this.issue,
  });

  static const _mfaCodes = {
    invalidCode,
    tokenInvalid,
    attemptsExceeded,
    locked,
    alreadyEnabled,
    notEnabled,
    requiredByRole,
    setupNotStarted,
  };

  static const _restartCodes = {tokenInvalid, attemptsExceeded, locked};

  /// For a screen opened without a challenge token.
  static MfaError missingChallenge() => const MfaError(code: tokenInvalid, restartLogin: true);

  factory MfaError.from(Object error) {
    if (error is AuthResponseException) {
      return MfaError(code: sessionRejected, issue: error.issue);
    }

    final failure = ApiFailure.from(error);
    final code = failure.code;
    if (code != null && _mfaCodes.contains(code)) {
      return MfaError(
        code: code,
        attemptsRemaining: code == invalidCode ? _attemptsRemaining(error) : null,
        restartLogin: _restartCodes.contains(code),
        failure: failure,
      );
    }
    if (failure.status == 429) return MfaError(code: throttled, failure: failure);
    return MfaError(code: code ?? 'unknown', failure: failure);
  }

  static int? _attemptsRemaining(Object error) {
    if (error is! DioException) return null;
    final data = error.response?.data;
    final details = data is Map ? data['details'] : null;
    final attempts = details is Map ? details['attemptsRemaining'] : null;
    return attempts is num ? attempts.toInt() : null;
  }
}

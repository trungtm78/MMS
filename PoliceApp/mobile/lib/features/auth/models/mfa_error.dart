import '../../../shared/errors/app_failure.dart';

/// A failed second-factor step. The UI shows [failure] through lib/l10n/failure_texts.dart.
///
/// Backend errors (Web/backend/src/auth/mfa/mfa.service.ts:609-663, mfa-challenge.service.ts):
/// 401 invalid_code {details: {attemptsRemaining}}, 401 mfa_token_invalid,
/// 429 mfa_attempts_exceeded, 429 mfa_locked, 429 E006 throttling.
class MfaError {
  const MfaError(this.failure, {this.restartLogin = false});

  final AppFailure failure;

  /// The challenge is over: the user has to sign in again
  final bool restartLogin;

  String get code => failure.code;

  int? get attemptsRemaining => switch (failure.args['attemptsRemaining']) {
        final int attempts => attempts,
        _ => null,
      };

  static const _endsChallenge = {'mfa_token_invalid', 'mfa_attempts_exceeded', 'mfa_locked'};

  factory MfaError.from(Object error) {
    final failure = AppFailure.from(error);
    return MfaError(failure, restartLogin: _endsChallenge.contains(failure.code));
  }
}

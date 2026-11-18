// Text for the auth layer's codes: session-end notices, refused auth answers, sign-in errors and
// second-factor errors. UI only; the notifier, repository and models keep codes/enums.

import '../../core/network/session_events.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/error_texts.dart';
import 'models/auth_error.dart';
import 'models/auth_response_exception.dart';
import 'models/mfa_error.dart';

/// The login-screen notice for a session that ended without the user signing out.
String sessionEndText(AppLocalizations l10n, SessionEndReason reason) => switch (reason) {
      SessionEndReason.ended => l10n.authLoginNoticeSessionEnded,
      SessionEndReason.passwordChanged => l10n.authLoginNoticePasswordChanged,
      SessionEndReason.mfaReauthenticationRequired => l10n.errorMfaReauthenticationRequired,
      SessionEndReason.accountDisabled => l10n.errorAuthAccountDisabled,
      SessionEndReason.noRoleAssigned => l10n.errorAuthNoRoleAssigned,
    };

/// Why an auth answer could not be used.
String authIssueText(AppLocalizations l10n, AuthResponseIssue issue) => switch (issue) {
      AuthResponseIssue.missingTokens => l10n.errorAuthMissingTokens,
      AuthResponseIssue.roleNotAllowed => l10n.errorAuthRoleNotAllowed,
      AuthResponseIssue.recoveryCodesMissing => l10n.errorAuthRecoveryCodesMissing,
    };

/// A failed sign-in step kept in AuthState.error.
String authErrorText(AppLocalizations l10n, AuthError authError) => switch (authError) {
      AuthRequestError(:final failure) => failure.text(l10n, flow: ErrorFlow.login),
      AuthResponseError(:final issue) => authIssueText(l10n, issue),
      AuthMfaError(:final error) => mfaErrorText(l10n, error),
    };

/// A failed second-factor step: the attempts left for a wrong code, a refused answer's reason, an app
/// code, otherwise the failed call through the backend error table.
String mfaErrorText(AppLocalizations l10n, MfaError mfaError) => switch (mfaError) {
      MfaError(issue: final AuthResponseIssue issue) => authIssueText(l10n, issue),
      MfaError(code: MfaError.recoveryCodesMissing) => l10n.errorAuthRecoveryCodesMissing,
      MfaError(code: MfaError.invalidCode, attemptsRemaining: final int count) =>
        l10n.errorMfaInvalidCodeAttempts(count),
      MfaError(failure: final failure?) => failure.text(l10n),
      _ => errorText(l10n, mfaError.code),
    };

import '../../../shared/utils/api_failure.dart';
import 'auth_response_exception.dart';
import 'mfa_error.dart';

/// Why a sign-in step failed, as data. The login screen words it with authErrorText
/// (lib/features/auth/auth_texts.dart).
sealed class AuthError {
  const AuthError();
}

/// A sign-in call failed or was refused; worded with the sign-in rules of the backend error table.
final class AuthRequestError extends AuthError {
  const AuthRequestError(this.failure);

  final ApiFailure failure;
}

/// The server answered, but the answer may not start a session in this app.
final class AuthResponseError extends AuthError {
  const AuthResponseError(this.issue);

  final AuthResponseIssue issue;
}

/// A second-factor step failed.
final class AuthMfaError extends AuthError {
  const AuthMfaError(this.error);

  final MfaError error;
}

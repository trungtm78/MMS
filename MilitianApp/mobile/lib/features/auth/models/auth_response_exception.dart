/// Why an auth answer cannot be used by this app. Worded by authIssueText
/// (lib/features/auth/auth_texts.dart).
enum AuthResponseIssue {
  /// A successful sign-in without both the access and the refresh token.
  missingTokens,

  /// The account holds no DQTV role (militia, dqtv, dqtv_member).
  roleNotAllowed,

  /// MFA is on, but the answer carried no recovery codes.
  recoveryCodesMissing,
}

/// Thrown when an auth response is partial/malformed or may not start a session in this app.
class AuthResponseException implements Exception {
  const AuthResponseException(this.issue);

  final AuthResponseIssue issue;

  @override
  String toString() => 'AuthResponseException: ${issue.name}';
}

import 'json_fields.dart';

/// A TOTP enrolment waiting for its first code: POST /auth/mfa/enroll during sign-in or
/// POST /auth/mfa/setup from a session (Web/backend/src/auth/mfa/mfa.service.ts EnrollmentStart).
class MfaEnrollment {
  /// Setup challenge to send back with the first code.
  final String mfaToken;

  /// Base32 secret for entering the account by hand.
  final String secret;

  /// otpauth:// URI for the QR code and for opening an authenticator app.
  final String otpauthUri;

  final DateTime? expiresAt;

  const MfaEnrollment({
    required this.mfaToken,
    required this.secret,
    required this.otpauthUri,
    this.expiresAt,
  });

  factory MfaEnrollment.fromJson(Map<String, dynamic> json) {
    final mfaToken = nonBlankString(json['mfaToken']);
    final secret = nonBlankString(json['secret']);
    final otpauthUri = nonBlankString(json['otpauthUri']) ?? nonBlankString(json['qrUri']);
    if (mfaToken == null || secret == null || otpauthUri == null) {
      throw const FormatException('MFA enrolment response lacks mfaToken, secret or otpauthUri');
    }
    return MfaEnrollment(
      mfaToken: mfaToken,
      secret: secret,
      otpauthUri: otpauthUri,
      expiresAt: parseDateTime(json['expiresAt']),
    );
  }
}

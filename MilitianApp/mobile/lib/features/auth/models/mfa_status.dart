import 'json_fields.dart';

/// GET /auth/mfa/status (Web/backend/src/auth/mfa/mfa.service.ts status()).
class MfaStatus {
  final bool enabled;
  final DateTime? enrolledAt;

  /// A role of the user requires MFA, so it cannot be disabled.
  final bool required;

  final int recoveryCodesRemaining;

  const MfaStatus({
    required this.enabled,
    this.enrolledAt,
    required this.required,
    required this.recoveryCodesRemaining,
  });

  factory MfaStatus.fromJson(Map<String, dynamic> json) => MfaStatus(
        enabled: json['enabled'] == true,
        enrolledAt: parseDateTime(json['enrolledAt']),
        required: json['required'] == true,
        recoveryCodesRemaining: intOrNull(json['recoveryCodesRemaining']) ?? 0,
      );
}

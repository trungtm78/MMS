class MfaSetupResponse {
  final String secret;
  final String qrCodeUri; // otpauth:// URI for QR display
  final List<String> recoveryCodes;

  const MfaSetupResponse({
    required this.secret,
    required this.qrCodeUri,
    required this.recoveryCodes,
  });

  factory MfaSetupResponse.fromJson(Map<String, dynamic> json) =>
      MfaSetupResponse(
        secret: json['secret'] as String,
        qrCodeUri: json['otpauthUrl'] as String,
        recoveryCodes: List<String>.from(json['recoveryCodes'] as List),
      );
}

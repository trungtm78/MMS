import '../../../shared/errors/app_failure.dart';

class LoginRequest {
  final String username;
  final String password;

  const LoginRequest({required this.username, required this.password});

  Map<String, dynamic> toJson() => {
        'username': username,
        'password': password,
      };
}

class UserInfo {
  final String id;
  final String username;
  final String fullName;
  final String? email;
  final String? phone;
  final String? avatarUrl;
  final String status;
  final List<String> roles;

  const UserInfo({
    required this.id,
    required this.username,
    required this.fullName,
    this.email,
    this.phone,
    this.avatarUrl,
    required this.status,
    required this.roles,
  });

  factory UserInfo.fromJson(Map<String, dynamic> json) => UserInfo(
        id: json['id'] as String,
        username: json['username'] as String,
        fullName: json['fullName'] as String,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        avatarUrl: json['avatarUrl'] as String?,
        status: json['status'] as String,
        roles: _parseRoles(json),
      );

  static List<String> _parseRoles(Map<String, dynamic> json) {
    final roles = json['roles'];
    final role = json['role']; // Web backend sends a single role code
    return {
      if (roles is List) ...roles.whereType<String>(),
      if (role is String) role,
    }.toList();
  }

  static const _caRoles = {'police_area', 'police_ward', 'ca_officer', 'ca_ward', 'ca_area'};
  static const _dqtvRoles = {'militia', 'dqtv', 'dqtv_member'};

  /// Detect app role: 'ca' or 'dqtv' (CA takes precedence)
  String get appRole {
    if (roles.any(_caRoles.contains)) return 'ca';
    if (roles.any(_dqtvRoles.contains)) return 'dqtv';
    return 'unknown';
  }
}

/// Outcome of POST /auth/login and of the second-factor steps
/// (Web/backend/src/auth/mfa/mfa.service.ts:56-74)
enum LoginStatus { success, mfaRequired, mfaSetupRequired }

/// Second-factor methods accepted by POST /auth/mfa/verify and /auth/mfa/disable
const mfaMethodTotp = 'totp';
const mfaMethodRecoveryCode = 'recovery_code';

class LoginResponse {
  final LoginStatus status;
  final String? accessToken;
  final String? refreshToken;
  final UserInfo? user;

  /// Challenge token for MFA_REQUIRED / MFA_SETUP_REQUIRED
  final String? mfaToken;
  final DateTime? expiresAt;

  /// Methods the challenge accepts ('totp', 'recovery_code')
  final List<String> methods;

  /// After signing in with a recovery code: how many are left
  final int? recoveryCodesRemaining;

  /// After enrolment during sign-in: the one-time codes, shown once
  final List<String> recoveryCodes;

  const LoginResponse({
    this.status = LoginStatus.success,
    this.accessToken,
    this.refreshToken,
    this.user,
    this.mfaToken,
    this.expiresAt,
    this.methods = const [],
    this.recoveryCodesRemaining,
    this.recoveryCodes = const [],
  });

  bool get requiresMfa => status == LoginStatus.mfaRequired;
  bool get requiresMfaSetup => status == LoginStatus.mfaSetupRequired;

  /// Name of the challenge token before T15
  String? get tempToken => mfaToken;

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    final rawData = json['data'];
    final data = (rawData is Map ? Map<String, dynamic>.from(rawData) : null) ??
        Map<String, dynamic>.from(json);
    // Web backend nests the pair under `tokens`; older shape is flat
    final rawTokens = data['tokens'];
    final tokens = rawTokens is Map
        ? Map<String, dynamic>.from(rawTokens)
        : const <String, dynamic>{};
    String? nonBlank(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
    String? token(String key) => nonBlank(tokens[key]) ?? nonBlank(data[key]);
    List<String> strings(Object? v) => v is List ? v.whereType<String>().toList() : const [];

    final status = switch (data['status']) {
      'SUCCESS' => LoginStatus.success,
      'MFA_REQUIRED' => LoginStatus.mfaRequired,
      'MFA_SETUP_REQUIRED' => LoginStatus.mfaSetupRequired,
      // Responses without a status field carry the older flags
      _ => data['requiresMfa'] == true || data['mfa_required'] == true
          ? LoginStatus.mfaRequired
          : data['requiresMfaSetup'] == true
              ? LoginStatus.mfaSetupRequired
              : LoginStatus.success,
    };
    final expiresAt = data['expiresAt'];
    final remaining = data['recoveryCodesRemaining'];
    return LoginResponse(
      status: status,
      accessToken: token('accessToken'),
      refreshToken: token('refreshToken'),
      user: data['user'] != null
          ? UserInfo.fromJson(data['user'] as Map<String, dynamic>)
          : null,
      mfaToken: nonBlank(data['mfaToken']) ?? nonBlank(data['tempToken']),
      expiresAt: expiresAt is String ? DateTime.tryParse(expiresAt) : null,
      methods: strings(data['methods']),
      recoveryCodesRemaining: remaining is num ? remaining.toInt() : null,
      recoveryCodes: strings(data['recoveryCodes']),
    );
  }

  /// Why this response must not start a session, or null when it may.
  AppFailure? get sessionRejection {
    if (accessToken == null || refreshToken == null) {
      return const AppFailure(AppFailure.missingTokens);
    }
    final u = user;
    if (u == null || u.appRole == 'unknown') {
      return const AppFailure(AppFailure.roleNotAllowed);
    }
    return null;
  }
}

/// POST /auth/mfa/enroll (during sign-in) or /auth/mfa/setup (signed in):
/// {mfaToken, secret, otpauthUri, qrUri, expiresAt} (Web/backend/src/auth/mfa/mfa.service.ts:76-82)
class MfaEnrollment {
  final String mfaToken;
  final String secret;
  final String otpauthUri;
  final DateTime? expiresAt;

  const MfaEnrollment({
    required this.mfaToken,
    required this.secret,
    required this.otpauthUri,
    this.expiresAt,
  });

  factory MfaEnrollment.fromJson(Map<String, dynamic> json) {
    String text(Object? v) => v is String ? v : '';
    final uri = text(json['otpauthUri']);
    final expiresAt = json['expiresAt'];
    return MfaEnrollment(
      mfaToken: text(json['mfaToken']),
      secret: text(json['secret']),
      otpauthUri: uri.isNotEmpty ? uri : text(json['qrUri']),
      expiresAt: expiresAt is String ? DateTime.tryParse(expiresAt) : null,
    );
  }
}

/// GET /auth/mfa/status → {enabled, enrolledAt, required, recoveryCodesRemaining}
class MfaStatus {
  final bool enabled;
  final DateTime? enrolledAt;

  /// A role of the user makes MFA mandatory; it cannot be disabled
  final bool required;
  final int recoveryCodesRemaining;

  const MfaStatus({
    required this.enabled,
    this.enrolledAt,
    required this.required,
    required this.recoveryCodesRemaining,
  });

  factory MfaStatus.fromJson(Map<String, dynamic> json) {
    final enrolledAt = json['enrolledAt'];
    final remaining = json['recoveryCodesRemaining'];
    return MfaStatus(
      enabled: json['enabled'] == true,
      enrolledAt: enrolledAt is String ? DateTime.tryParse(enrolledAt) : null,
      required: json['required'] == true,
      recoveryCodesRemaining: remaining is num ? remaining.toInt() : 0,
    );
  }
}

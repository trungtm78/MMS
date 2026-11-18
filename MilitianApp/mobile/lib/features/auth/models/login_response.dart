import 'auth_response_exception.dart';
import 'json_fields.dart';

/// Outcome of POST /auth/login (Web/backend/src/auth/mfa/mfa.service.ts LoginResult).
enum LoginStatus { success, mfaRequired, mfaSetupRequired }

/// Second-factor methods of POST /auth/mfa/verify and /auth/mfa/disable.
class MfaMethod {
  MfaMethod._();

  static const String totp = 'totp';
  static const String recoveryCode = 'recovery_code';
  static const List<String> all = [totp, recoveryCode];
}

/// POST /auth/login, and the SUCCESS bodies of POST /auth/mfa/verify and
/// POST /auth/mfa/enroll/confirm.
class LoginResponse {
  final LoginStatus status;
  final String? accessToken;
  final String? refreshToken;

  /// Challenge for the second factor (MFA_REQUIRED / MFA_SETUP_REQUIRED).
  final String? mfaToken;
  final DateTime? expiresAt;

  /// Methods accepted for an MFA_REQUIRED challenge.
  final List<String> methods;

  /// Unused recovery codes left after signing in with one.
  final int? recoveryCodesRemaining;

  /// New recovery codes after enrolling during sign-in; shown once.
  final List<String> recoveryCodes;
  final UserInfo? user;

  const LoginResponse({
    this.status = LoginStatus.success,
    this.accessToken,
    this.refreshToken,
    this.mfaToken,
    this.expiresAt,
    this.methods = const [],
    this.recoveryCodesRemaining,
    this.recoveryCodes = const [],
    this.user,
  });

  bool get requiresMfa => status == LoginStatus.mfaRequired;
  bool get requiresMfaSetup => status == LoginStatus.mfaSetupRequired;

  /// Name of [mfaToken] in bodies from servers built before `status`.
  String? get tempToken => mfaToken;

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    // Web backend nests the pair under `tokens`; older shape is flat
    final rawTokens = json['tokens'];
    final tokens = rawTokens is Map
        ? Map<String, dynamic>.from(rawTokens)
        : const <String, dynamic>{};
    String? token(String key) => nonBlankString(tokens[key]) ?? nonBlankString(json[key]);
    final rawUser = json['user'];
    return LoginResponse(
      status: _parseStatus(json),
      accessToken: token('accessToken'),
      refreshToken: token('refreshToken'),
      mfaToken: nonBlankString(json['mfaToken']) ?? nonBlankString(json['tempToken']),
      expiresAt: parseDateTime(json['expiresAt']),
      methods: stringList(json['methods']),
      recoveryCodesRemaining: intOrNull(json['recoveryCodesRemaining']),
      recoveryCodes: stringList(json['recoveryCodes']),
      user: rawUser is Map ? UserInfo.fromJson(Map<String, dynamic>.from(rawUser)) : null,
    );
  }

  static LoginStatus _parseStatus(Map<String, dynamic> json) => switch (json['status']) {
        'SUCCESS' => LoginStatus.success,
        'MFA_REQUIRED' => LoginStatus.mfaRequired,
        'MFA_SETUP_REQUIRED' => LoginStatus.mfaSetupRequired,
        // Flags still sent for clients built before `status`
        _ when json['requiresMfaSetup'] == true => LoginStatus.mfaSetupRequired,
        _ when json['mfa_required'] == true || json['requiresMfa'] == true => LoginStatus.mfaRequired,
        _ => LoginStatus.success,
      };

  /// Why this response must not start a session, or null when it may.
  AuthResponseIssue? get sessionRejection {
    if (accessToken == null || refreshToken == null) return AuthResponseIssue.missingTokens;
    final u = user;
    if (u == null || !u.isMilitia) return AuthResponseIssue.roleNotAllowed;
    return null;
  }
}

class UserInfo {
  final String id;
  final String username;
  final String fullName;
  final String? rank;
  final String? unit;
  final String? position;
  final String? phone;
  final String? email;
  final String? avatarUrl;
  final List<String> roles;

  const UserInfo({
    required this.id,
    required this.username,
    required this.fullName,
    this.rank,
    this.unit,
    this.position,
    this.phone,
    this.email,
    this.avatarUrl,
    this.roles = const [],
  });

  factory UserInfo.fromJson(Map<String, dynamic> json) => UserInfo(
        id: json['id'] as String,
        username: json['username'] as String,
        fullName: (json['fullName'] ?? json['full_name']) as String,
        rank: json['rank'] as String?,
        unit: json['unit'] as String?,
        position: json['position'] as String?,
        phone: json['phone'] as String?,
        email: json['email'] as String?,
        avatarUrl: (json['avatarUrl'] ?? json['avatar_url']) as String?,
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

  static const _militiaRoles = {'militia', 'dqtv', 'dqtv_member'};

  /// Only DQTV members may use this app.
  static bool hasMilitiaRole(Iterable<String> roles) =>
      roles.any(_militiaRoles.contains);

  bool get isMilitia => hasMilitiaRole(roles);

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'full_name': fullName,
        'rank': rank,
        'unit': unit,
        'position': position,
        'phone': phone,
        'email': email,
        'avatar_url': avatarUrl,
        'roles': roles,
      };
}

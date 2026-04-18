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
        roles: List<String>.from(json['roles'] as List? ?? []),
      );

  /// Detect app role: 'ca' or 'dqtv'
  String get appRole {
    if (roles.contains('police_area') || roles.contains('police_ward')) return 'ca';
    if (roles.contains('militia')) return 'dqtv';
    return 'unknown';
  }
}

class LoginResponse {
  final String? accessToken;
  final String? refreshToken;
  final UserInfo? user;
  final bool requiresMfa;
  final bool requiresMfaSetup;
  final String? tempToken;

  const LoginResponse({
    this.accessToken,
    this.refreshToken,
    this.user,
    this.requiresMfa = false,
    this.requiresMfaSetup = false,
    this.tempToken,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    final rawData = json['data'];
    final data = (rawData is Map ? Map<String, dynamic>.from(rawData) : null) ??
        Map<String, dynamic>.from(json);
    return LoginResponse(
      accessToken: data['accessToken'] as String?,
      refreshToken: data['refreshToken'] as String?,
      user: data['user'] != null
          ? UserInfo.fromJson(data['user'] as Map<String, dynamic>)
          : null,
      requiresMfa: data['requiresMfa'] as bool? ?? false,
      requiresMfaSetup: data['requiresMfaSetup'] as bool? ?? false,
      tempToken: data['tempToken'] as String?,
    );
  }
}

class MfaSetupResponse {
  final String secret;
  final String otpauthUrl;
  final List<String> recoveryCodes;

  const MfaSetupResponse({
    required this.secret,
    required this.otpauthUrl,
    required this.recoveryCodes,
  });

  factory MfaSetupResponse.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>? ?? json;
    return MfaSetupResponse(
      secret: data['secret'] as String,
      otpauthUrl: data['otpauthUrl'] as String,
      recoveryCodes: List<String>.from(data['recoveryCodes'] as List? ?? []),
    );
  }
}

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
    // Web backend nests the pair under `tokens`; older shape is flat
    final rawTokens = data['tokens'];
    final tokens = rawTokens is Map
        ? Map<String, dynamic>.from(rawTokens)
        : const <String, dynamic>{};
    String? nonBlank(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
    String? token(String key) => nonBlank(tokens[key]) ?? nonBlank(data[key]);
    return LoginResponse(
      accessToken: token('accessToken'),
      refreshToken: token('refreshToken'),
      user: data['user'] != null
          ? UserInfo.fromJson(data['user'] as Map<String, dynamic>)
          : null,
      requiresMfa: data['requiresMfa'] == true || data['mfa_required'] == true,
      requiresMfaSetup: data['requiresMfaSetup'] == true,
      tempToken: nonBlank(data['tempToken']),
    );
  }

  /// Why this response must not start a session, or null when it may.
  String? get sessionRejection {
    if (accessToken == null || refreshToken == null) {
      return 'Máy chủ trả về thiếu token đăng nhập';
    }
    final u = user;
    if (u == null || u.appRole == 'unknown') {
      return 'Tài khoản không có quyền dùng ứng dụng này';
    }
    return null;
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

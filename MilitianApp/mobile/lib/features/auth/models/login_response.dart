class LoginResponse {
  final String? accessToken;
  final String? refreshToken;
  final bool requiresMfa;
  final bool requiresMfaSetup;
  final String? tempToken; // used when requiresMfa == true
  final UserInfo? user;

  const LoginResponse({
    this.accessToken,
    this.refreshToken,
    required this.requiresMfa,
    required this.requiresMfaSetup,
    this.tempToken,
    this.user,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    // Web backend nests the pair under `tokens`; older shape is flat
    final rawTokens = json['tokens'];
    final tokens = rawTokens is Map
        ? Map<String, dynamic>.from(rawTokens)
        : const <String, dynamic>{};
    String? nonBlank(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
    String? token(String key) => nonBlank(tokens[key]) ?? nonBlank(json[key]);
    return LoginResponse(
      accessToken: token('accessToken'),
      refreshToken: token('refreshToken'),
      requiresMfa: json['requiresMfa'] == true || json['mfa_required'] == true,
      requiresMfaSetup: json['requiresMfaSetup'] == true,
      tempToken: nonBlank(json['tempToken']),
      user: json['user'] != null
          ? UserInfo.fromJson(json['user'] as Map<String, dynamic>)
          : null,
    );
  }

  /// Why this response must not start a session, or null when it may.
  String? get sessionRejection {
    if (accessToken == null || refreshToken == null) {
      return 'Máy chủ trả về thiếu token đăng nhập';
    }
    final u = user;
    if (u == null || !u.isMilitia) {
      return 'Tài khoản không có quyền dùng ứng dụng này';
    }
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

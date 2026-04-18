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

  factory LoginResponse.fromJson(Map<String, dynamic> json) => LoginResponse(
        accessToken: json['accessToken'] as String?,
        refreshToken: json['refreshToken'] as String?,
        requiresMfa: json['requiresMfa'] as bool? ?? false,
        requiresMfaSetup: json['requiresMfaSetup'] as bool? ?? false,
        tempToken: json['tempToken'] as String?,
        user: json['user'] != null
            ? UserInfo.fromJson(json['user'] as Map<String, dynamic>)
            : null,
      );
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
        avatarUrl: json['avatar_url'] as String?,
      );

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
      };
}

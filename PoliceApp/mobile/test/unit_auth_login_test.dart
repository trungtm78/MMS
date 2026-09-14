// Unit Tests: AuthNotifier.login → session gate wiring
// Run: flutter test test/unit_auth_login_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/constants/api_constants.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';

import 'helpers/fakes.dart';

Map<String, dynamic> _backendLogin(String role) => {
      'user': {
        'id': 'u1',
        'username': 'user01',
        'fullName': 'User',
        'status': 'active',
        'role': role,
      },
      'tokens': {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900},
    };

Future<AuthNotifier> _notifier(MemoryStorage storage, Map<String, dynamic> body) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))
    ..httpClientAdapter = FakeAdapter(
      (o) => o.path == ApiConstants.login ? jsonBody(200, body) : jsonBody(404, {}),
    );
  final notifier = AuthNotifier(storage, dio);
  await Future<void>.delayed(const Duration(milliseconds: 10));
  return notifier;
}

void main() {
  group('AuthNotifier.login', () {
    test('UT-LOGIN-GATE-01: CA login stores tokens and role', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, _backendLogin('ca_officer'));

      final mfa = await n.login('ca01', 'x');

      expect(mfa, isNull);
      expect(n.debugState.isAuthenticated, isTrue);
      expect(n.debugState.role, 'ca');
      expect(storage.access, 'tok_access');
      expect(storage.refresh, 'tok_refresh');
      expect(storage.role, 'ca');
      n.dispose();
    });

    test('UT-LOGIN-GATE-02: system_admin login is refused and stores nothing', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, _backendLogin('system_admin'));

      await n.login('admin', 'x');

      expect(n.debugState.isAuthenticated, isFalse);
      expect(n.debugState.error, 'Tài khoản không có quyền dùng ứng dụng này');
      expect(storage.access, isNull);
      expect(storage.refresh, isNull);
      n.dispose();
    });
  });
}

// Unit Tests: AuthRepositoryImpl login → session persistence
// Run: flutter test test/unit_auth_repository_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';
import 'package:militian_app/features/auth/models/login_request.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';

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

AuthRepositoryImpl _repo(MemoryStorage storage, Map<String, dynamic> body) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))
    ..httpClientAdapter = FakeAdapter(
      (o) => o.path == ApiConstants.login ? jsonBody(200, body) : jsonBody(404, {}),
    );
  return AuthRepositoryImpl(storage, dio: dio);
}

void main() {
  group('AuthRepositoryImpl.login', () {
    test('DQTV login persists tokens, user id and roles', () async {
      final storage = MemoryStorage(access: null, refresh: null);

      await _repo(storage, _backendLogin('dqtv'))
          .login(const LoginRequest(username: 'dqtv01', password: 'x'));

      expect(storage.access, 'tok_access');
      expect(storage.refresh, 'tok_refresh');
      expect(storage.userId, 'u1');
      expect(storage.roles, ['dqtv']);
      expect(storage.username, 'dqtv01');
    });

    test('non-DQTV login is refused and stores nothing', () async {
      final storage = MemoryStorage(access: null, refresh: null);

      await expectLater(
        _repo(storage, _backendLogin('ca_officer'))
            .login(const LoginRequest(username: 'ca01', password: 'x')),
        throwsA(isA<AuthResponseException>().having(
          (e) => e.message,
          'message',
          'Tài khoản không có quyền dùng ứng dụng này',
        )),
      );
      expect(storage.access, isNull);
      expect(storage.refresh, isNull);
      expect(storage.roles, isEmpty);
    });
  });
}

// Unit Tests: LoginResponse parsing against Web/backend AuthController shapes
// Run: flutter test test/unit_login_response_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/auth/models/login_response.dart';

void main() {
  group('LoginResponse.fromJson — Web backend contract', () {
    test('reads tokens nested under "tokens"', () {
      final resp = LoginResponse.fromJson({
        'user': {
          'id': 'u1',
          'username': 'dqtv01',
          'fullName': 'Nguyễn Văn A',
          'status': 'active',
          'role': 'dqtv',
        },
        'tokens': {
          'accessToken': 'tok_access',
          'refreshToken': 'tok_refresh',
          'expiresIn': 900,
        },
      });
      expect(resp.accessToken, equals('tok_access'));
      expect(resp.refreshToken, equals('tok_refresh'));
      expect(resp.user?.fullName, equals('Nguyễn Văn A'));
    });

    test('mfa_required flag maps to requiresMfa', () {
      final resp = LoginResponse.fromJson({
        'mfa_required': true,
        'tempToken': 'tmp_tok',
      });
      expect(resp.requiresMfa, isTrue);
      expect(resp.tempToken, equals('tmp_tok'));
      expect(resp.accessToken, isNull);
    });

    test('still reads flat accessToken/refreshToken', () {
      final resp = LoginResponse.fromJson({
        'accessToken': 'flat_access',
        'refreshToken': 'flat_refresh',
      });
      expect(resp.accessToken, equals('flat_access'));
      expect(resp.refreshToken, equals('flat_refresh'));
    });

    test('mfa_required true wins over requiresMfa false', () {
      final resp = LoginResponse.fromJson({
        'requiresMfa': false,
        'mfa_required': true,
        'tempToken': 'tmp_tok',
      });
      expect(resp.requiresMfa, isTrue);
    });

    test('non-bool MFA flag does not throw', () {
      expect(
        () => LoginResponse.fromJson({'mfa_required': 'true', 'tempToken': 't'}),
        returnsNormally,
      );
    });

    test('refreshToken outside "tokens" is still read', () {
      final resp = LoginResponse.fromJson({
        'tokens': {'accessToken': 'tok_access'},
        'refreshToken': 'tok_refresh',
      });
      expect(resp.accessToken, equals('tok_access'));
      expect(resp.refreshToken, equals('tok_refresh'));
    });
  });

  group('UserInfo.fromJson — Web backend contract', () {
    test('reads camelCase avatarUrl sent by backend', () {
      final user = UserInfo.fromJson({
        'id': 'u1',
        'username': 'dqtv01',
        'fullName': 'Nguyễn Văn A',
        'avatarUrl': 'https://example.com/a.png',
      });
      expect(user.avatarUrl, equals('https://example.com/a.png'));
    });

    test('single "role" string becomes the roles list', () {
      final user = UserInfo.fromJson({
        'id': 'u1',
        'username': 'dqtv01',
        'fullName': 'Nguyễn Văn A',
        'role': 'dqtv',
      });
      expect(user.roles, equals(['dqtv']));
    });
  });

  group('LoginResponse.sessionRejection', () {
    Map<String, dynamic> backendLogin({
      String? role = 'dqtv',
      bool withUser = true,
      bool withRefresh = true,
    }) =>
        {
          if (withUser)
            'user': {
              'id': 'u1',
              'username': 'user01',
              'fullName': 'User',
              'role': role,
            },
          'tokens': {
            'accessToken': 'tok_access',
            if (withRefresh) 'refreshToken': 'tok_refresh',
          },
        };

    test('DQTV account with both tokens may start a session', () {
      for (final role in ['dqtv', 'dqtv_member', 'militia']) {
        expect(
          LoginResponse.fromJson(backendLogin(role: role)).sessionRejection,
          isNull,
          reason: role,
        );
      }
    });

    test('missing refresh token is rejected', () {
      expect(
        LoginResponse.fromJson(backendLogin(withRefresh: false)).sessionRejection,
        isNotNull,
      );
    });

    test('response without user is rejected', () {
      expect(
        LoginResponse.fromJson(backendLogin(withUser: false)).sessionRejection,
        isNotNull,
      );
    });

    test('non-DQTV roles are rejected', () {
      for (final role in ['ca_officer', 'police_area', 'system_admin', null]) {
        expect(
          LoginResponse.fromJson(backendLogin(role: role)).sessionRejection,
          equals('Tài khoản không có quyền dùng ứng dụng này'),
          reason: '$role',
        );
      }
    });
  });

  group('UserInfo.fromJson — defensive parsing', () {
    Map<String, dynamic> base() => {
          'id': 'u1',
          'username': 'dqtv01',
          'fullName': 'Nguyễn Văn A',
        };

    test('empty roles list does not hide "role"', () {
      final user = UserInfo.fromJson({...base(), 'roles': <String>[], 'role': 'dqtv'});
      expect(user.roles, equals(['dqtv']));
    });

    test('non-string role entries are ignored, not thrown', () {
      final user = UserInfo.fromJson({
        ...base(),
        'roles': ['dqtv', null, {'code': 'x'}],
      });
      expect(user.roles, equals(['dqtv']));
    });

    test('snake_case avatar_url is still read', () {
      final user = UserInfo.fromJson({...base(), 'avatar_url': 'https://example.com/a.png'});
      expect(user.avatarUrl, equals('https://example.com/a.png'));
    });
  });

  group('LoginResponse token hygiene', () {
    const user = {'id': 'u1', 'username': 'dqtv01', 'fullName': 'A', 'role': 'dqtv'};

    test('blank token strings are treated as missing', () {
      final resp = LoginResponse.fromJson({
        'user': user,
        'tokens': {'accessToken': '', 'refreshToken': '  '},
      });
      expect(resp.accessToken, isNull);
      expect(resp.refreshToken, isNull);
      expect(resp.sessionRejection, isNotNull);
    });

    test('non-string tokens do not throw and are rejected', () {
      final json = <String, dynamic>{
        'user': user,
        'tokens': {'accessToken': 123, 'refreshToken': true},
        'tempToken': 42,
      };
      expect(() => LoginResponse.fromJson(json), returnsNormally);
      final resp = LoginResponse.fromJson(json);
      expect(resp.sessionRejection, isNotNull);
      expect(resp.tempToken, isNull);
    });
  });
}

// Unit Tests: LoginResponse parsing against Web/backend AuthController shapes
// Run: flutter test test/unit_login_response_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/auth/models/auth_response_exception.dart';
import 'package:militian_app/features/auth/models/login_response.dart';

void main() {
  group('LoginResponse.fromJson — Web backend contract', () {
    test('reads tokens nested under "tokens"', () {
      final resp = LoginResponse.fromJson({
        'user': {
          'id': 'u1',
          'username': 'dqtv01',
          'fullName': 'Nguyen Van A',
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
      expect(resp.user?.fullName, equals('Nguyen Van A'));
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
        'fullName': 'Nguyen Van A',
        'avatarUrl': 'https://example.com/a.png',
      });
      expect(user.avatarUrl, equals('https://example.com/a.png'));
    });

    test('single "role" string becomes the roles list', () {
      final user = UserInfo.fromJson({
        'id': 'u1',
        'username': 'dqtv01',
        'fullName': 'Nguyen Van A',
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
        AuthResponseIssue.missingTokens,
      );
    });

    test('response without user is rejected', () {
      expect(
        LoginResponse.fromJson(backendLogin(withUser: false)).sessionRejection,
        AuthResponseIssue.roleNotAllowed,
      );
    });

    test('non-DQTV roles are rejected', () {
      for (final role in ['ca_officer', 'police_area', 'system_admin', null]) {
        expect(
          LoginResponse.fromJson(backendLogin(role: role)).sessionRejection,
          AuthResponseIssue.roleNotAllowed,
          reason: '$role',
        );
      }
    });
  });

  group('UserInfo.fromJson — defensive parsing', () {
    Map<String, dynamic> base() => {
          'id': 'u1',
          'username': 'dqtv01',
          'fullName': 'Nguyen Van A',
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
      expect(resp.sessionRejection, AuthResponseIssue.missingTokens);
    });

    test('non-string tokens do not throw and are rejected', () {
      final json = <String, dynamic>{
        'user': user,
        'tokens': {'accessToken': 123, 'refreshToken': true},
        'tempToken': 42,
      };
      expect(() => LoginResponse.fromJson(json), returnsNormally);
      final resp = LoginResponse.fromJson(json);
      expect(resp.sessionRejection, AuthResponseIssue.missingTokens);
      expect(resp.tempToken, isNull);
    });
  });

  // Web/backend/src/auth/mfa/mfa.service.ts LoginResult (POST /auth/login) and the SUCCESS
  // bodies of POST /auth/mfa/verify and /auth/mfa/enroll/confirm
  group('LoginResponse.status — second-factor contract', () {
    const user = {'id': 'u1', 'username': 'dqtv01', 'fullName': 'A', 'role': 'dqtv'};
    const tokens = {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900};
    const token = '3f0c6a52-1d2b-4c8e-9a51-6a1f2b3c4d5e.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

    test('SUCCESS', () {
      final resp = LoginResponse.fromJson({'status': 'SUCCESS', 'user': user, 'tokens': tokens});
      expect(resp.status, LoginStatus.success);
      expect(resp.requiresMfa, isFalse);
      expect(resp.requiresMfaSetup, isFalse);
      expect(resp.mfaToken, isNull);
      expect(resp.methods, isEmpty);
      expect(resp.recoveryCodes, isEmpty);
      expect(resp.recoveryCodesRemaining, isNull);
      expect(resp.sessionRejection, isNull);
    });

    test('MFA_REQUIRED', () {
      final resp = LoginResponse.fromJson({
        'status': 'MFA_REQUIRED',
        'mfaToken': token,
        'expiresAt': '2026-09-14T01:05:00.000Z',
        'methods': ['totp', 'recovery_code'],
        'mfa_required': true,
        'requiresMfa': true,
        'tempToken': token,
      });
      expect(resp.status, LoginStatus.mfaRequired);
      expect(resp.requiresMfa, isTrue);
      expect(resp.requiresMfaSetup, isFalse);
      expect(resp.mfaToken, token);
      expect(resp.tempToken, token);
      expect(resp.expiresAt, DateTime.utc(2026, 9, 14, 1, 5));
      expect(resp.methods, [MfaMethod.totp, MfaMethod.recoveryCode]);
      expect(resp.accessToken, isNull);
    });

    test('MFA_SETUP_REQUIRED', () {
      final resp = LoginResponse.fromJson({
        'status': 'MFA_SETUP_REQUIRED',
        'mfaToken': token,
        'expiresAt': '2026-09-14T01:10:00.000Z',
        'requiresMfaSetup': true,
        'tempToken': token,
      });
      expect(resp.status, LoginStatus.mfaSetupRequired);
      expect(resp.requiresMfaSetup, isTrue);
      expect(resp.requiresMfa, isFalse);
      expect(resp.mfaToken, token);
      expect(resp.expiresAt, DateTime.utc(2026, 9, 14, 1, 10));
      expect(resp.methods, isEmpty);
    });

    test('the status field decides over legacy flags', () {
      final resp = LoginResponse.fromJson({
        'status': 'MFA_SETUP_REQUIRED',
        'mfa_required': true,
        'mfaToken': token,
      });
      expect(resp.status, LoginStatus.mfaSetupRequired);
    });

    test('without a status the legacy flags are read', () {
      expect(LoginResponse.fromJson({'requiresMfa': true, 'tempToken': 't'}).status,
          LoginStatus.mfaRequired);
      expect(LoginResponse.fromJson({'requiresMfaSetup': true, 'tempToken': 't'}).status,
          LoginStatus.mfaSetupRequired);
      expect(LoginResponse.fromJson({'status': 'SOMETHING_NEW', 'user': user, 'tokens': tokens}).status,
          LoginStatus.success);
      expect(LoginResponse.fromJson({'user': user, 'tokens': tokens}).status, LoginStatus.success);
    });

    test('mfaToken is preferred to tempToken, which is the fallback', () {
      expect(LoginResponse.fromJson({'status': 'MFA_REQUIRED', 'mfaToken': 'a', 'tempToken': 'b'}).mfaToken,
          'a');
      expect(LoginResponse.fromJson({'status': 'MFA_REQUIRED', 'mfaToken': ' ', 'tempToken': 'b'}).mfaToken,
          'b');
    });

    test('verify success carries the recovery codes left', () {
      final resp = LoginResponse.fromJson({
        'status': 'SUCCESS',
        'user': user,
        'tokens': tokens,
        'recoveryCodesRemaining': 7,
      });
      expect(resp.recoveryCodesRemaining, 7);
    });

    test('enrolment success carries the new recovery codes', () {
      final codes = List.generate(10, (i) => 'ABCD$i-EFGH$i');
      final resp = LoginResponse.fromJson({
        'status': 'SUCCESS',
        'user': user,
        'tokens': tokens,
        'recoveryCodes': codes,
      });
      expect(resp.recoveryCodes, codes);
      expect(resp.sessionRejection, isNull);
    });

    test('malformed optional fields do not throw', () {
      final json = <String, dynamic>{
        'status': 'MFA_REQUIRED',
        'mfaToken': token,
        'expiresAt': 'soon',
        'methods': ['totp', 3, null],
        'recoveryCodesRemaining': '7',
        'recoveryCodes': 'ABCDE-FGHJK',
      };
      expect(() => LoginResponse.fromJson(json), returnsNormally);
      final resp = LoginResponse.fromJson(json);
      expect(resp.expiresAt, isNull);
      expect(resp.methods, ['totp']);
      expect(resp.recoveryCodesRemaining, isNull);
      expect(resp.recoveryCodes, isEmpty);
    });
  });
}

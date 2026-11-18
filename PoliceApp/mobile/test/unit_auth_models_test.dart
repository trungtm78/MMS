// Unit Tests: Auth Models
// Task ID: TASK-2026-002 | Created BEFORE implementation (Phase 0.5 skeleton)
// Coverage target: auth_models.dart, auth_provider.dart business logic
// Run: flutter test test/

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/models/auth_models.dart';
import 'package:police_app/shared/errors/app_failure.dart';

void main() {
  group('UserInfo.appRole detection', () {
    test('UT-AUTH-01: police_area role → appRole = ca', () {
      // TODO: implement
      final user = UserInfo(
        id: '1',
        username: 'ca001',
        fullName: 'Test CA',
        status: 'active',
        roles: ['police_area'],
      );
      expect(user.appRole, equals('ca'));
    });

    test('UT-AUTH-02: police_ward role → appRole = ca', () {
      final user = UserInfo(
        id: '2',
        username: 'ca002',
        fullName: 'Test CA Ward',
        status: 'active',
        roles: ['police_ward'],
      );
      expect(user.appRole, equals('ca'));
    });

    test('UT-AUTH-03: militia role → appRole = dqtv', () {
      final user = UserInfo(
        id: '3',
        username: 'dqtv001',
        fullName: 'Test DQTV',
        status: 'active',
        roles: ['militia'],
      );
      expect(user.appRole, equals('dqtv'));
    });

    test('UT-AUTH-04: unknown role → appRole = unknown', () {
      final user = UserInfo(
        id: '4',
        username: 'other',
        fullName: 'Test Other',
        status: 'active',
        roles: ['admin'],
      );
      expect(user.appRole, equals('unknown'));
    });

    test('UT-AUTH-05: empty roles → appRole = unknown', () {
      final user = UserInfo(
        id: '5',
        username: 'empty',
        fullName: 'Test Empty',
        status: 'active',
        roles: [],
      );
      expect(user.appRole, equals('unknown'));
    });

    test('UT-AUTH-06: multiple roles including police_area → appRole = ca', () {
      final user = UserInfo(
        id: '6',
        username: 'multi',
        fullName: 'Test Multi',
        status: 'active',
        roles: ['militia', 'police_area'],
      );
      // police_area takes precedence (checked first)
      expect(user.appRole, equals('ca'));
    });
  });

  group('LoginResponse.fromJson parsing', () {
    test('UT-LOGIN-01: parses accessToken and refreshToken', () {
      final json = {
        'data': {
          'accessToken': 'tok_access',
          'refreshToken': 'tok_refresh',
          'user': {
            'id': 'u1',
            'username': 'ca001',
            'fullName': 'Vo Van Tan',
            'status': 'active',
            'roles': ['police_area'],
          },
        }
      };
      final resp = LoginResponse.fromJson(json);
      expect(resp.accessToken, equals('tok_access'));
      expect(resp.refreshToken, equals('tok_refresh'));
      expect(resp.requiresMfa, isFalse);
      expect(resp.requiresMfaSetup, isFalse);
    });

    test('UT-LOGIN-02: requiresMfa = true when MFA needed', () {
      final json = {
        'data': {
          'requiresMfa': true,
          'tempToken': 'tmp_tok_123',
        }
      };
      final resp = LoginResponse.fromJson(json);
      expect(resp.requiresMfa, isTrue);
      expect(resp.tempToken, equals('tmp_tok_123'));
      expect(resp.accessToken, isNull);
    });

    test('UT-LOGIN-03: requiresMfaSetup = true when setup needed', () {
      final json = {
        'data': {
          'requiresMfaSetup': true,
          'tempToken': 'tmp_setup_456',
        }
      };
      final resp = LoginResponse.fromJson(json);
      expect(resp.requiresMfaSetup, isTrue);
      expect(resp.tempToken, equals('tmp_setup_456'));
    });

    test('UT-LOGIN-04: handles flat json (no data wrapper)', () {
      final json = {
        'accessToken': 'flat_access',
        'refreshToken': 'flat_refresh',
      };
      final resp = LoginResponse.fromJson(json);
      expect(resp.accessToken, equals('flat_access'));
    });

    test('UT-LOGIN-05: missing optional fields do not throw', () {
      final json = {'data': {}};
      expect(() => LoginResponse.fromJson(json), returnsNormally);
      final resp = LoginResponse.fromJson(json);
      expect(resp.accessToken, isNull);
      expect(resp.user, isNull);
    });
  });

  group('UserInfo.fromJson parsing', () {
    test('UT-USER-01: parses all required fields', () {
      final json = {
        'id': 'u1',
        'username': 'ca001',
        'fullName': 'Vo Van Tan',
        'status': 'active',
        'roles': ['police_area'],
      };
      final user = UserInfo.fromJson(json);
      expect(user.id, equals('u1'));
      expect(user.username, equals('ca001'));
      expect(user.fullName, equals('Vo Van Tan'));
      expect(user.status, equals('active'));
      expect(user.roles, equals(['police_area']));
    });

    test('UT-USER-02: optional fields default to null', () {
      final json = {
        'id': 'u2',
        'username': 'dqtv001',
        'fullName': 'Nguyen Van A',
        'status': 'active',
        'roles': ['militia'],
      };
      final user = UserInfo.fromJson(json);
      expect(user.email, isNull);
      expect(user.phone, isNull);
      expect(user.avatarUrl, isNull);
    });

    test('UT-USER-03: parses optional fields when present', () {
      final json = {
        'id': 'u3',
        'username': 'dqtv002',
        'fullName': 'Le Van B',
        'email': 'dqtv002@mms.vn',
        'phone': '0909123456',
        'avatarUrl': 'https://example.com/avatar.png',
        'status': 'active',
        'roles': ['militia'],
      };
      final user = UserInfo.fromJson(json);
      expect(user.email, equals('dqtv002@mms.vn'));
      expect(user.phone, equals('0909123456'));
      expect(user.avatarUrl, equals('https://example.com/avatar.png'));
    });

    test('UT-USER-04: empty roles list parses without error', () {
      final json = {
        'id': 'u4',
        'username': 'noRole',
        'fullName': 'No Role',
        'status': 'inactive',
        'roles': [],
      };
      final user = UserInfo.fromJson(json);
      expect(user.roles, isEmpty);
      expect(user.appRole, equals('unknown'));
    });

    test('UT-USER-05: null roles field defaults to empty list', () {
      final json = {
        'id': 'u5',
        'username': 'nullRole',
        'fullName': 'Null Role',
        'status': 'active',
        'roles': null,
      };
      final user = UserInfo.fromJson(json);
      expect(user.roles, isEmpty);
    });
  });

  // Shapes returned by Web/backend AuthController (POST /auth/login)
  group('Web backend login contract', () {
    test('UT-LOGIN-06: reads tokens nested under "tokens"', () {
      final json = {
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
      };
      final resp = LoginResponse.fromJson(json);
      expect(resp.accessToken, equals('tok_access'));
      expect(resp.refreshToken, equals('tok_refresh'));
      expect(resp.user?.fullName, equals('Nguyen Van A'));
    });

    test('UT-LOGIN-07: mfa_required flag maps to requiresMfa', () {
      final resp = LoginResponse.fromJson({
        'mfa_required': true,
        'tempToken': 'tmp_tok',
      });
      expect(resp.requiresMfa, isTrue);
      expect(resp.tempToken, equals('tmp_tok'));
      expect(resp.accessToken, isNull);
    });

    test('UT-USER-06: single "role" string becomes the roles list', () {
      final user = UserInfo.fromJson({
        'id': 'u1',
        'username': 'dqtv01',
        'fullName': 'Nguyen Van A',
        'status': 'active',
        'role': 'dqtv',
      });
      expect(user.roles, equals(['dqtv']));
    });

    test('UT-AUTH-07: backend DQTV role codes → appRole = dqtv', () {
      for (final code in ['dqtv', 'dqtv_member']) {
        final user = UserInfo(
          id: '1',
          username: 'u',
          fullName: 'U',
          status: 'active',
          roles: [code],
        );
        expect(user.appRole, equals('dqtv'), reason: code);
      }
    });

    test('UT-AUTH-08: backend CA role codes → appRole = ca', () {
      for (final code in ['ca_officer', 'ca_ward', 'ca_area']) {
        final user = UserInfo(
          id: '1',
          username: 'u',
          fullName: 'U',
          status: 'active',
          roles: [code],
        );
        expect(user.appRole, equals('ca'), reason: code);
      }
    });

    test('UT-LOGIN-08: mfa_required true wins over requiresMfa false', () {
      final resp = LoginResponse.fromJson({
        'requiresMfa': false,
        'mfa_required': true,
        'tempToken': 'tmp_tok',
      });
      expect(resp.requiresMfa, isTrue);
    });

    test('UT-LOGIN-09: non-bool MFA flag does not throw', () {
      expect(
        () => LoginResponse.fromJson({'mfa_required': 'true', 'tempToken': 't'}),
        returnsNormally,
      );
    });

    test('UT-LOGIN-10: refreshToken outside "tokens" is still read', () {
      final resp = LoginResponse.fromJson({
        'tokens': {'accessToken': 'tok_access'},
        'refreshToken': 'tok_refresh',
      });
      expect(resp.accessToken, equals('tok_access'));
      expect(resp.refreshToken, equals('tok_refresh'));
    });

    test('UT-USER-07: empty roles list does not hide "role"', () {
      final user = UserInfo.fromJson({
        'id': 'u1',
        'username': 'ca01',
        'fullName': 'CA',
        'status': 'active',
        'roles': <String>[],
        'role': 'ca_officer',
      });
      expect(user.roles, equals(['ca_officer']));
    });

    test('UT-USER-08: non-string role entries are ignored, not thrown', () {
      final user = UserInfo.fromJson({
        'id': 'u1',
        'username': 'dqtv01',
        'fullName': 'A',
        'status': 'active',
        'roles': ['dqtv', null, {'code': 'x'}],
      });
      expect(user.roles, equals(['dqtv']));
    });
  });

  // POST /auth/mfa/setup and /auth/mfa/enroll → {mfaToken, secret, otpauthUri, qrUri, expiresAt}
  // (Web/backend/src/auth/mfa/mfa.service.ts:76-82)
  group('MfaEnrollment.fromJson', () {
    test('UT-MFA-SETUP-01: falls back to qrUri when otpauthUri is missing', () {
      final resp = MfaEnrollment.fromJson({
        'mfaToken': 'm',
        'secret': 'ABC',
        'qrUri': 'otpauth://totp/MMS:ca01?secret=ABC&issuer=MMS',
      });
      expect(resp.secret, 'ABC');
      expect(resp.otpauthUri, 'otpauth://totp/MMS:ca01?secret=ABC&issuer=MMS');
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
              'status': 'active',
              'role': role,
            },
          'tokens': {
            'accessToken': 'tok_access',
            if (withRefresh) 'refreshToken': 'tok_refresh',
          },
        };

    test('UT-GATE-01: DQTV and CA accounts with both tokens may start a session', () {
      expect(LoginResponse.fromJson(backendLogin(role: 'dqtv')).sessionRejection, isNull);
      expect(LoginResponse.fromJson(backendLogin(role: 'ca_officer')).sessionRejection, isNull);
    });

    test('UT-GATE-02: missing refresh token is rejected', () {
      expect(
        LoginResponse.fromJson(backendLogin(withRefresh: false)).sessionRejection?.code,
        AppFailure.missingTokens,
      );
    });

    test('UT-GATE-03: response without user is rejected', () {
      expect(
        LoginResponse.fromJson(backendLogin(withUser: false)).sessionRejection?.code,
        AppFailure.roleNotAllowed,
      );
    });

    test('UT-GATE-04: roles outside CA/DQTV are rejected', () {
      for (final role in ['system_admin', 'office_staff', 'ubnd_leader', null]) {
        expect(
          LoginResponse.fromJson(backendLogin(role: role)).sessionRejection?.code,
          AppFailure.roleNotAllowed,
          reason: '$role',
        );
      }
    });

    test('UT-GATE-05: blank token strings are treated as missing', () {
      final resp = LoginResponse.fromJson({
        ...backendLogin(),
        'tokens': {'accessToken': '', 'refreshToken': '  '},
      });
      expect(resp.accessToken, isNull);
      expect(resp.refreshToken, isNull);
      expect(resp.sessionRejection?.code, AppFailure.missingTokens);
    });

    test('UT-GATE-06: non-string tokens do not throw and are rejected', () {
      final json = {
        ...backendLogin(),
        'tokens': {'accessToken': 123, 'refreshToken': true},
        'tempToken': 42,
      };
      expect(() => LoginResponse.fromJson(json), returnsNormally);
      final resp = LoginResponse.fromJson(json);
      expect(resp.sessionRejection?.code, AppFailure.missingTokens);
      expect(resp.tempToken, isNull);
    });
  });
}

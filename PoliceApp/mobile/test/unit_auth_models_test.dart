// Unit Tests: Auth Models
// Task ID: TASK-2026-002 | Created BEFORE implementation (Phase 0.5 skeleton)
// Coverage target: auth_models.dart, auth_provider.dart business logic
// Run: flutter test test/

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/models/auth_models.dart';

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
        'fullName': 'Võ Văn Tân',
        'status': 'active',
        'roles': ['police_area'],
      };
      final user = UserInfo.fromJson(json);
      expect(user.id, equals('u1'));
      expect(user.username, equals('ca001'));
      expect(user.fullName, equals('Võ Văn Tân'));
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
}

// Unit Tests: AuthRepositoryImpl — sign-in, second factor and MFA management calls
// Contract: Web/backend/src/auth/auth.controller.ts:48-63 (login), src/auth/mfa/mfa.controller.ts
// (routes and bodies), src/auth/mfa/mfa.service.ts (LoginResult, EnrollmentStart, status)
// Run: flutter test test/unit_auth_repository_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';
import 'package:militian_app/features/auth/models/login_request.dart';
import 'package:militian_app/features/auth/models/login_response.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';

import 'helpers/fakes.dart';

class _Setup {
  _Setup(Map<String, ResponseBody Function(RequestOptions)> routes)
      : adapter = FakeAdapter(routeTable(routes));

  final storage = MemoryStorage(access: null, refresh: null);
  final FakeAdapter adapter;
  late final repo = AuthRepositoryImpl(
    storage,
    dio: Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter,
  );

  RequestOptions get last => adapter.requests.last;
}

void _expectNothingStored(MemoryStorage storage) {
  expect(storage.access, isNull);
  expect(storage.refresh, isNull);
  expect(storage.userId, isNull);
  expect(storage.roles, isEmpty);
}

void _expectSessionStored(MemoryStorage storage, String role) {
  expect(storage.access, 'tok_access');
  expect(storage.refresh, 'tok_refresh');
  expect(storage.userId, 'u1');
  expect(storage.roles, [role]);
}

final _refused = throwsA(isA<AuthResponseException>().having(
  (e) => e.issue,
  'issue',
  AuthResponseIssue.roleNotAllowed,
));

void main() {
  group('login', () {
    test('DQTV login persists tokens, user id and roles', () async {
      final s = _Setup({'POST ${ApiConstants.login}': (_) => jsonBody(200, backendSession('dqtv'))});

      final r = await s.repo.login(const LoginRequest(username: 'dqtv01', password: 'x'));

      expect(r.status, LoginStatus.success);
      _expectSessionStored(s.storage, 'dqtv');
      expect(s.storage.username, 'dqtv01');
    });

    test('non-DQTV login is refused and stores nothing', () async {
      final s = _Setup({'POST ${ApiConstants.login}': (_) => jsonBody(200, backendSession('ca_officer'))});

      await expectLater(
        s.repo.login(const LoginRequest(username: 'ca01', password: 'x')),
        _refused,
      );
      _expectNothingStored(s.storage);
    });

    test('MFA_REQUIRED returns the challenge and stores nothing', () async {
      final s = _Setup({'POST ${ApiConstants.login}': (_) => jsonBody(200, mfaRequiredLogin())});

      final r = await s.repo.login(const LoginRequest(username: 'dqtv01', password: 'x'));

      expect(r.status, LoginStatus.mfaRequired);
      expect(r.mfaToken, testMfaToken);
      expect(r.methods, ['totp', 'recovery_code']);
      _expectNothingStored(s.storage);
    });

    test('MFA_SETUP_REQUIRED returns the challenge and stores nothing', () async {
      final s = _Setup({'POST ${ApiConstants.login}': (_) => jsonBody(200, mfaSetupRequiredLogin())});

      final r = await s.repo.login(const LoginRequest(username: 'dqtv01', password: 'x'));

      expect(r.status, LoginStatus.mfaSetupRequired);
      expect(r.mfaToken, testMfaToken);
      _expectNothingStored(s.storage);
    });
  });

  group('verifyMfa', () {
    test('posts mfaToken, method and code to /auth/mfa/verify and starts the session', () async {
      final s = _Setup({'POST /auth/mfa/verify': (_) => jsonBody(200, backendSession('dqtv_member'))});

      final r = await s.repo.verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '123456');

      expect(s.last.method, 'POST');
      expect(s.last.path, '/auth/mfa/verify');
      expect(s.last.data, {'mfaToken': testMfaToken, 'method': 'totp', 'code': '123456'});
      expect(r.status, LoginStatus.success);
      expect(r.recoveryCodesRemaining, isNull);
      _expectSessionStored(s.storage, 'dqtv_member');
    });

    test('a recovery code is sent exactly as typed', () async {
      final s = _Setup({
        'POST /auth/mfa/verify': (_) =>
            jsonBody(200, backendSession('dqtv', {'recoveryCodesRemaining': 9})),
      });

      final r = await s.repo.verifyMfa(
        mfaToken: testMfaToken,
        method: 'recovery_code',
        code: ' abcde fghjk ',
      );

      expect(s.last.data, {'mfaToken': testMfaToken, 'method': 'recovery_code', 'code': ' abcde fghjk '});
      expect(r.recoveryCodesRemaining, 9);
    });

    test('a non-DQTV account is refused after verification and nothing is stored', () async {
      final s = _Setup({'POST /auth/mfa/verify': (_) => jsonBody(200, backendSession('ca_officer'))});

      await expectLater(
        s.repo.verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '123456'),
        _refused,
      );
      _expectNothingStored(s.storage);
    });

    test('a wrong code propagates the DioException and stores nothing', () async {
      final s = _Setup({
        'POST /auth/mfa/verify': (_) =>
            jsonBody(401, backendError(401, 'invalid_code', details: {'attemptsRemaining': 4})),
      });

      await expectLater(
        s.repo.verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '000000'),
        throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', 401)),
      );
      _expectNothingStored(s.storage);
    });
  });

  group('enrolment during sign-in', () {
    test('enrollMfa posts the mfaToken to /auth/mfa/enroll', () async {
      final s = _Setup({'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment())});

      final e = await s.repo.enrollMfa(testMfaToken);

      expect(s.last.path, '/auth/mfa/enroll');
      expect(s.last.data, {'mfaToken': testMfaToken});
      expect(e.mfaToken, testMfaToken);
      expect(e.secret, testTotpSecret);
      expect(e.otpauthUri, testOtpauthUri);
      _expectNothingStored(s.storage);
    });

    test('confirmEnrollment returns the session and recovery codes without storing them', () async {
      final s = _Setup({
        'POST /auth/mfa/enroll/confirm': (_) =>
            jsonBody(200, backendSession('dqtv', {'recoveryCodes': testRecoveryCodes})),
      });

      final r = await s.repo.confirmEnrollment(mfaToken: testMfaToken, code: '654321');

      expect(s.last.path, '/auth/mfa/enroll/confirm');
      expect(s.last.data, {'mfaToken': testMfaToken, 'code': '654321'});
      expect(r.status, LoginStatus.success);
      expect(r.recoveryCodes, testRecoveryCodes);
      expect(r.accessToken, 'tok_access');
      _expectNothingStored(s.storage);
    });

    test('confirmEnrollment refuses a non-DQTV account', () async {
      final s = _Setup({
        'POST /auth/mfa/enroll/confirm': (_) =>
            jsonBody(200, backendSession('ca_officer', {'recoveryCodes': testRecoveryCodes})),
      });

      await expectLater(
        s.repo.confirmEnrollment(mfaToken: testMfaToken, code: '654321'),
        _refused,
      );
      _expectNothingStored(s.storage);
    });

    test('persistSession stores a confirmed session', () async {
      final s = _Setup({
        'POST /auth/mfa/enroll/confirm': (_) =>
            jsonBody(200, backendSession('dqtv', {'recoveryCodes': testRecoveryCodes})),
      });
      final r = await s.repo.confirmEnrollment(mfaToken: testMfaToken, code: '654321');

      await s.repo.persistSession(r);

      _expectSessionStored(s.storage, 'dqtv');
      expect(s.storage.username, 'user01');
    });

    test('persistSession refuses a non-DQTV session', () async {
      final s = _Setup({});

      await expectLater(
        s.repo.persistSession(LoginResponse.fromJson(backendSession('ca_officer'))),
        _refused,
      );
      _expectNothingStored(s.storage);
    });
  });

  group('MFA management (signed in)', () {
    test('mfaStatus reads GET /auth/mfa/status', () async {
      final s = _Setup({
        'GET /auth/mfa/status': (_) => jsonBody(200, {
              'enabled': true,
              'enrolledAt': '2026-09-01T05:00:00.000Z',
              'required': false,
              'recoveryCodesRemaining': 7,
            }),
      });

      final status = await s.repo.mfaStatus();

      expect(s.last.method, 'GET');
      expect(status.enabled, isTrue);
      expect(status.recoveryCodesRemaining, 7);
    });

    test('setupMfa posts to /auth/mfa/setup', () async {
      final s = _Setup({'POST /auth/mfa/setup': (_) => jsonBody(200, backendEnrollment())});

      final e = await s.repo.setupMfa();

      expect(s.last.path, '/auth/mfa/setup');
      expect(e.mfaToken, testMfaToken);
      expect(e.otpauthUri, testOtpauthUri);
    });

    // Enabling MFA ends every earlier session and answers with the replacement
    // (mfa.controller.ts:142-153, mfa.service.ts:349-356)
    test('confirmMfaSetup returns the codes and the new session without storing it', () async {
      final s = _Setup({'POST /auth/mfa/confirm': (_) => jsonBody(200, mfaConfirmSession())});
      s.storage
        ..access = 'old_access'
        ..refresh = 'old_refresh';

      final r = await s.repo.confirmMfaSetup(mfaToken: testMfaToken, code: '112233');

      expect(s.last.data, {'mfaToken': testMfaToken, 'code': '112233'});
      expect(r.recoveryCodes, testRecoveryCodes);
      expect(r.accessToken, 'tok_access');
      expect(r.refreshToken, 'tok_refresh');
      expect(r.user?.roles, ['dqtv']);
      expect(r.sessionRejection, isNull);
      expect(s.storage.access, 'old_access');
      expect(s.storage.refresh, 'old_refresh');
    });

    // users.controller.ts:15-23, 42-47
    test('changePassword posts currentPassword and newPassword and accepts 204', () async {
      final s = _Setup({'POST /users/me/change-password': noContent});

      await s.repo.changePassword(currentPassword: 'Cu@123456', newPassword: 'Moi@123456');

      expect(s.last.method, 'POST');
      expect(s.last.path, '/users/me/change-password');
      expect(s.last.data, {'currentPassword': 'Cu@123456', 'newPassword': 'Moi@123456'});
    });

    test('regenerateRecoveryCodes posts the TOTP code', () async {
      final s = _Setup({
        'POST /auth/mfa/recovery-codes/regenerate': (_) =>
            jsonBody(200, {'recoveryCodes': testRecoveryCodes}),
      });

      final codes = await s.repo.regenerateRecoveryCodes('445566');

      expect(s.last.data, {'code': '445566'});
      expect(codes, testRecoveryCodes);
    });

    test('regenerateRecoveryCodes refuses an answer without codes', () async {
      final s = _Setup({'POST /auth/mfa/recovery-codes/regenerate': (_) => jsonBody(200, {})});

      await expectLater(
        s.repo.regenerateRecoveryCodes('445566'),
        throwsA(isA<AuthResponseException>()
            .having((e) => e.issue, 'issue', AuthResponseIssue.recoveryCodesMissing)
            .having((e) => e.toString(), 'toString', 'AuthResponseException: recoveryCodesMissing')),
      );
    });

    test('disableMfa posts method and code and accepts 204', () async {
      final s = _Setup({'POST /auth/mfa/disable': noContent});

      await s.repo.disableMfa(method: 'recovery_code', code: 'ABCDE-FGHJK');

      expect(s.last.data, {'method': 'recovery_code', 'code': 'ABCDE-FGHJK'});
    });

    test('disableMfa propagates mfa_required_by_role', () async {
      final s = _Setup({
        'POST /auth/mfa/disable': (_) => jsonBody(403, backendError(403, 'mfa_required_by_role')),
      });

      await expectLater(
        s.repo.disableMfa(method: 'totp', code: '123456'),
        throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', 403)),
      );
    });
  });

  group('logout', () {
    test('POST /auth/logout, then the stored session is cleared', () async {
      final s = _Setup({'POST /auth/logout': noContent});
      s.storage
        ..access = 'old_access'
        ..refresh = 'old_refresh';

      await s.repo.logout();

      expect(s.last.path, '/auth/logout');
      expect(s.storage.access, isNull);
      expect(s.storage.refresh, isNull);
    });

    test('a failed logout call still clears the stored session', () async {
      final s = _Setup({'POST /auth/logout': (_) => jsonBody(500, backendError(500, 'Internal server error'))});
      s.storage
        ..access = 'old_access'
        ..refresh = 'old_refresh';

      await s.repo.logout();

      expect(s.storage.access, isNull);
      expect(s.storage.refresh, isNull);
    });
  });
}

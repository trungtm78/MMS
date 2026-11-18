// Unit Tests: AuthNotifier.login → session gate wiring
// Run: flutter test test/unit_auth_login_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/constants/api_constants.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/l10n/failure_texts.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

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

Future<AuthNotifier> _notifier(
  MemoryStorage storage,
  Map<String, dynamic> body, {
  int status = 200,
  FakeAdapter? adapter,
}) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))
    ..httpClientAdapter = adapter ??
        FakeAdapter(
          (o) => o.path == ApiConstants.login ? jsonBody(status, body) : jsonBody(404, {}),
        );
  final notifier = AuthNotifier(storage, dio);
  await notifier.ready;
  return notifier;
}

/// Current state without the deprecated debugState: addListener fires immediately.
AuthState _state(AuthNotifier n) {
  late AuthState current;
  n.addListener((s) => current = s)();
  return current;
}

/// Body produced by Web/backend HttpExceptionFilter
Map<String, dynamic> _backendError(int status, String message) =>
    {'code': 'E004', 'message': message, 'statusCode': status, 'path': '/auth/login'};

void main() {
  group('AuthNotifier.login', () {
    test('UT-LOGIN-GATE-01: CA login stores tokens and role', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, _backendLogin('ca_officer'));

      final mfa = await n.login('ca01', 'x');

      expect(mfa, isNull);
      expect(_state(n).isAuthenticated, isTrue);
      expect(_state(n).role, 'ca');
      expect(storage.access, 'tok_access');
      expect(storage.refresh, 'tok_refresh');
      expect(storage.role, 'ca');
      n.dispose();
    });

    test('UT-LOGIN-GATE-02: system_admin login is refused and stores nothing', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, _backendLogin('system_admin'));

      await n.login('admin', 'x');

      expect(_state(n).isAuthenticated, isFalse);
      expect(_state(n).error?.code, AppFailure.roleNotAllowed);
      expect(storage.access, isNull);
      expect(storage.refresh, isNull);
      n.dispose();
    });

    test('UT-LOGIN-GATE-03: a stored CA session is restored once ready', () async {
      final storage = MemoryStorage(role: 'ca');
      final n = await _notifier(storage, const {});

      expect(_state(n).isAuthenticated, isTrue);
      expect(_state(n).role, 'ca');
      n.dispose();
    });
  });

  // Codes and statuses from Web/backend/src/auth/auth.service.ts (validateUser, requireUserRoles)
  group('AuthNotifier.login backend errors', () {
    Future<void> expectLoginError(int status, String code, String text) async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, _backendError(status, code), status: status);

      final mfa = await n.login('user01', 'x');

      expect(mfa, isNull);
      expect(_state(n).isAuthenticated, isFalse, reason: code);
      expect(_state(n).isLoading, isFalse, reason: code);
      expect(failureText(viL10n, _state(n).error!), text, reason: code);
      expect(storage.access, isNull, reason: code);
      n.dispose();
    }

    test('UT-LOGIN-ERR-01: 403 no_role_assigned', () async {
      await expectLoginError(403, 'no_role_assigned', viL10n.errorNoRoleAssigned);
    });

    test('UT-LOGIN-ERR-02: 403 account_disabled', () async {
      await expectLoginError(403, 'account_disabled', viL10n.errorAccountDisabled);
    });

    test('UT-LOGIN-ERR-03: 401 invalid_credentials', () async {
      await expectLoginError(401, 'invalid_credentials', viL10n.errorInvalidCredentials);
    });

    test('UT-LOGIN-ERR-04: 429 throttled', () async {
      await expectLoginError(429, 'ThrottlerException: Too Many Requests', viL10n.errorTooManyRequests);
    });

    test('UT-LOGIN-ERR-05: 403 account_locked', () async {
      await expectLoginError(403, 'account_locked', viL10n.errorAccountLocked);
    });

    test('UT-LOGIN-ERR-06: an unknown 403 means the account may not sign in', () async {
      await expectLoginError(403, 'something_new', viL10n.errorLoginForbidden);
    });

    test('UT-LOGIN-ERR-07: a body that is not a login response is a data failure', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final adapter = FakeAdapter((_) => jsonBody(200, ['not', 'an', 'object']));
      final n = await _notifier(storage, const {}, adapter: adapter);

      await n.login('user01', 'x');

      expect(_state(n).error?.code, AppFailure.unknown);
      expect(_state(n).isLoading, isFalse);
      n.dispose();
    });
  });

  // T15: POST /auth/login status, POST /auth/mfa/verify, POST /auth/mfa/enroll/confirm
  // (Web/backend/src/auth/mfa/mfa.service.ts:56-74, 121-354)
  group('AuthNotifier MFA (T15)', () {
    Map<String, dynamic> success(String role, {Map<String, dynamic> extra = const {}}) =>
        {'status': 'SUCCESS', ..._backendLogin(role), ...extra};

    test('UT-MFA-01: MFA_REQUIRED and MFA_SETUP_REQUIRED return the challenge and store nothing', () async {
      for (final status in ['MFA_REQUIRED', 'MFA_SETUP_REQUIRED']) {
        final storage = MemoryStorage(access: null, refresh: null);
        final n = await _notifier(storage, {
          'status': status,
          'mfaToken': 'mfa-token',
          'expiresAt': '2026-09-14T01:05:00.000Z',
          if (status == 'MFA_REQUIRED') 'methods': ['totp', 'recovery_code'],
        });

        final challenge = await n.login('ca01', 'x');

        expect(challenge, isNotNull, reason: status);
        expect(challenge!.mfaToken, 'mfa-token');
        expect(_state(n).isAuthenticated, isFalse);
        expect(_state(n).isLoading, isFalse);
        expect(storage.access, isNull);
        n.dispose();
      }
    });

    test('UT-MFA-02: verify with a TOTP code signs in through /auth/mfa/verify', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final adapter = FakeAdapter((o) => o.path == '/auth/mfa/verify'
          ? jsonBody(200, success('ca_officer'))
          : jsonBody(404, _backendError(404, 'Cannot POST ${o.path}')));
      final n = await _notifier(storage, const {}, adapter: adapter);

      final attempt = await n.verifyMfa(mfaToken: 'mfa-token', method: 'totp', code: '123456');

      expect(attempt.success, isTrue);
      final req = adapter.requests.single;
      expect(req.path, '/auth/mfa/verify');
      expect(req.data, {'mfaToken': 'mfa-token', 'method': 'totp', 'code': '123456'});
      expect(_state(n).isAuthenticated, isTrue);
      expect(storage.access, 'tok_access');
      expect(storage.role, 'ca');
      n.dispose();
    });

    test('UT-MFA-03: a role outside CA/DQTV is refused after MFA too', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final adapter = FakeAdapter((_) => jsonBody(200, success('system_admin')));
      final n = await _notifier(storage, const {}, adapter: adapter);

      final attempt = await n.verifyMfa(mfaToken: 'mfa-token', method: 'totp', code: '123456');

      expect(attempt.success, isFalse);
      expect(attempt.error?.restartLogin, isTrue);
      expect(attempt.error?.code, AppFailure.roleNotAllowed);
      expect(_state(n).isAuthenticated, isFalse);
      expect(_state(n).error?.code, AppFailure.roleNotAllowed);
      expect(storage.access, isNull);
      n.dispose();
    });

    test('UT-MFA-04: invalid_code reports the attempts left', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final adapter = FakeAdapter((_) => jsonBody(401, {
            'code': 'E004',
            'message': 'invalid_code',
            'details': {'attemptsRemaining': 2},
            'statusCode': 401,
          }));
      final n = await _notifier(storage, const {}, adapter: adapter);

      final attempt = await n.verifyMfa(mfaToken: 'mfa-token', method: 'totp', code: '000000');

      expect(attempt.success, isFalse);
      expect(attempt.error!.attemptsRemaining, 2);
      expect(attempt.error!.restartLogin, isFalse);
      expect(failureText(viL10n, _state(n).error!), viL10n.errorInvalidCodeAttemptsRemaining(2));
      n.dispose();
    });

    test('UT-MFA-05: enrolment keeps the session pending until the recovery codes are acknowledged', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final adapter = FakeAdapter((o) => o.path == '/auth/mfa/enroll/confirm'
          ? jsonBody(200, success('dqtv', extra: {
              'recoveryCodes': List.generate(10, (i) => 'ABCDE-1234$i'),
            }))
          : jsonBody(404, _backendError(404, 'Cannot POST ${o.path}')));
      final n = await _notifier(storage, const {}, adapter: adapter);

      final attempt = await n.confirmEnrollment(mfaToken: 'mfa-token', code: '123456');

      expect(attempt.success, isTrue);
      expect(attempt.recoveryCodes, hasLength(10));
      expect(adapter.requests.single.data, {'mfaToken': 'mfa-token', 'code': '123456'});
      expect(_state(n).isAuthenticated, isFalse);
      expect(storage.access, isNull);

      await n.acknowledgeRecoveryCodes();

      expect(_state(n).isAuthenticated, isTrue);
      expect(_state(n).role, 'dqtv');
      expect(storage.access, 'tok_access');
      n.dispose();
    });

    test('UT-MFA-06: enrolment for a role outside CA/DQTV shows no codes and stores nothing', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final adapter = FakeAdapter((_) => jsonBody(200, success('office_staff', extra: {'recoveryCodes': ['ABCDE-12345']})));
      final n = await _notifier(storage, const {}, adapter: adapter);

      final attempt = await n.confirmEnrollment(mfaToken: 'mfa-token', code: '123456');
      await n.acknowledgeRecoveryCodes();

      expect(attempt.success, isFalse);
      expect(attempt.error?.code, AppFailure.roleNotAllowed);
      expect(attempt.recoveryCodes, isEmpty);
      expect(_state(n).isAuthenticated, isFalse);
      expect(storage.access, isNull);
      n.dispose();
    });

    test('UT-MFA-07: unreadable second-factor answers are data failures', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final adapter = FakeAdapter((_) => jsonBody(200, ['x']));
      final n = await _notifier(storage, const {}, adapter: adapter);

      final verify = await n.verifyMfa(mfaToken: 'mfa-token', method: 'totp', code: '123456');
      final enroll = await n.confirmEnrollment(mfaToken: 'mfa-token', code: '123456');
      final setup = await n.confirmSetup(mfaToken: 'mfa-token', code: '123456');

      expect(verify.error?.code, AppFailure.badResponse);
      expect(enroll.error?.code, AppFailure.badResponse);
      expect(setup.error?.code, AppFailure.badResponse);
      n.dispose();
    });
  });

  group('AuthNotifier.logout', () {
    test('UT-LOGOUT-01: signs out and clears the session even when the server call fails', () async {
      final storage = MemoryStorage(role: 'ca');
      final adapter = FakeAdapter((_) => jsonBody(500, _backendError(500, 'Internal server error')));
      final n = await _notifier(storage, const {}, adapter: adapter);
      expect(_state(n).isAuthenticated, isTrue);

      await n.logout();

      expect(adapter.requests.single.path, ApiConstants.logout);
      expect(_state(n).isAuthenticated, isFalse);
      expect(storage.access, isNull);
      n.dispose();
    });
  });
}

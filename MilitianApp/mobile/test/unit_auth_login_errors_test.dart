// Unit Tests: AuthNotifier.login keeps backend login errors as data, worded with the sign-in rules
// Codes/statuses: Web/backend/src/auth/auth.service.ts (validateUser, requireUserRoles),
// throttling: Web/backend/src/app.module.ts:101,133 (ThrottlerGuard → 429)
// Run: flutter test test/unit_auth_login_errors_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';
import 'package:militian_app/features/auth/auth_texts.dart';
import 'package:militian_app/features/auth/models/auth_error.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Future<AuthNotifier> _notifier(MemoryStorage storage, int status, Object body) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))
    ..httpClientAdapter = FakeAdapter(
      (o) => o.path == ApiConstants.login ? jsonBody(status, body) : jsonBody(404, {}),
    );
  final notifier = AuthNotifier(AuthRepositoryImpl(storage, dio: dio), storage);
  await notifier.ready;
  return notifier;
}

/// Current state without the deprecated debugState: addListener fires immediately.
AuthState _state(AuthNotifier n) {
  late AuthState current;
  n.addListener((s) => current = s)();
  return current;
}

Map<String, dynamic> _backendError(int status, String message) =>
    {'code': 'E004', 'message': message, 'statusCode': status, 'path': '/auth/login'};

void main() {
  group('AuthNotifier.login backend errors', () {
    Future<void> expectLoginError(int status, String code, String text) async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, status, _backendError(status, code));

      final mfa = await n.login('dqtv01', 'x');

      final state = _state(n);
      expect(mfa, isNull);
      expect(state.isAuthenticated, isFalse, reason: code);
      expect(state.isLoading, isFalse, reason: code);
      expect(
        state.error,
        isA<AuthRequestError>()
            .having((e) => e.failure.code, 'code', code)
            .having((e) => e.failure.status, 'status', status),
        reason: code,
      );
      expect(authErrorText(viL10n, state.error!), text, reason: code);
      expect(storage.access, isNull, reason: code);
      n.dispose();
    }

    test('403 no_role_assigned', () async {
      await expectLoginError(403, 'no_role_assigned', viL10n.errorAuthNoRoleAssigned);
    });

    test('403 account_disabled', () async {
      await expectLoginError(403, 'account_disabled', viL10n.errorAuthAccountDisabled);
    });

    test('401 invalid_credentials', () async {
      await expectLoginError(401, 'invalid_credentials', viL10n.errorAuthInvalidCredentials);
    });

    test('401 invalid_credentials for a disabled account with a wrong password', () async {
      // account_disabled (403) is only sent after a correct password (auth.service.ts:163-173),
      // so a wrong password on a disabled account must read like any wrong password
      await expectLoginError(401, 'invalid_credentials', viL10n.errorAuthInvalidCredentials);
    });

    test('429 throttled', () async {
      await expectLoginError(429, 'ThrottlerException: Too Many Requests', viL10n.errorStatusTooManyRequests);
    });

    test('403 account_locked', () async {
      await expectLoginError(403, 'account_locked', viL10n.errorAuthAccountLocked);
    });

    test('429 mfa_locked', () async {
      // POST /auth/login refuses an account whose second factor is locked
      // (Web/backend/src/auth/mfa/mfa.service.ts beginLogin → assertNotLocked)
      await expectLoginError(429, 'mfa_locked', viL10n.errorMfaLocked);
    });

    test('an unreadable answer is an unexpected error, not raw exception text', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      // `user.id` is not a string: UserInfo.fromJson throws a TypeError
      final n = await _notifier(storage, 200, {
        'status': 'SUCCESS',
        'user': {'id': 1, 'username': 'dq01', 'fullName': 'DQ', 'role': 'dqtv'},
        'tokens': {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh'},
      });

      await n.login('dq01', 'x');

      expect(_state(n).error, isA<AuthRequestError>());
      expect(authErrorText(viL10n, _state(n).error!), viL10n.errorUnexpected);
      n.dispose();
    });
  });

  group('second factor', () {
    test('MFA_REQUIRED returns the challenge without starting a session', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, 200, mfaRequiredLogin());

      final challenge = await n.login('dqtv01', 'x');

      expect(challenge?.requiresMfa, isTrue);
      expect(challenge?.mfaToken, testMfaToken);
      expect(_state(n).isAuthenticated, isFalse);
      expect(_state(n).error, isNull);
      expect(storage.access, isNull);
      n.dispose();
    });
  });

  group('DQTV-only gate is kept', () {
    test('a CA account that logs in successfully is still refused', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, 200, {
        'status': 'SUCCESS',
        'user': {'id': 'u1', 'username': 'ca01', 'fullName': 'CA', 'status': 'active', 'role': 'ca_officer'},
        'tokens': {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900},
      });

      await n.login('ca01', 'x');

      expect(_state(n).isAuthenticated, isFalse);
      expect(
        _state(n).error,
        isA<AuthResponseError>().having((e) => e.issue, 'issue', AuthResponseIssue.roleNotAllowed),
      );
      expect(storage.access, isNull);
      n.dispose();
    });

    test('a dqtv_member account starts a session', () async {
      final storage = MemoryStorage(access: null, refresh: null);
      final n = await _notifier(storage, 200, {
        'status': 'SUCCESS',
        'user': {'id': 'u1', 'username': 'dq01', 'fullName': 'DQ', 'status': 'active', 'role': 'dqtv_member'},
        'tokens': {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900},
      });

      await n.login('dq01', 'x');

      expect(_state(n).isAuthenticated, isTrue);
      expect(_state(n).error, isNull);
      expect(storage.roles, ['dqtv_member']);
      n.dispose();
    });
  });
}

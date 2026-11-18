// Unit Tests: AuthNotifier and the end of a session
//   - a session end while signed in signs out with the login-screen notice reason; it is ignored while
//     a replacement session from Bearer POST /auth/mfa/confirm is held
//   - Bearer POST /auth/mfa/confirm → {recoveryCodes, user, tokens}: enabling MFA ended every earlier
//     session, this one too (Web/backend/src/auth/mfa/mfa.controller.ts:142-153,
//     mfa.service.ts:338-361); the new session is stored only once the codes are acknowledged
//   - POST /users/me/change-password {currentPassword, newPassword} → 204 ends every session;
//     400 invalid_credentials | password_complexity | password_reuse
//     (users.controller.ts:15-23, 42-47; users.service.ts:180-229)
// Run: flutter test test/unit_session_end_notifier_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/network/session_events.dart';
import 'package:militian_app/core/utils/validators.dart';
import 'package:militian_app/features/auth/models/auth_error.dart';
import 'package:militian_app/features/auth/models/mfa_error.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';

import 'helpers/fakes.dart';

class _App {
  _App([Map<String, ResponseBody Function(RequestOptions)> routes = const {}])
      : adapter = FakeAdapter(routeTable(routes));

  /// A stored DQTV session, restored on start
  final storage = MemoryStorage(roles: ['dqtv']);
  final events = SessionEvents();
  final FakeAdapter adapter;
  late final notifier = AuthNotifier(
    AuthRepositoryImpl(
      storage,
      dio: Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter,
    ),
    storage,
    events: events,
  );

  /// Restores the stored session.
  Future<_App> boot() async {
    await notifier.ready;
    return this;
  }

  /// Lets the broadcast stream deliver a session end.
  Future<void> settle() => pumpEventQueue();

  AuthState get state {
    late AuthState current;
    notifier.addListener((s) => current = s)();
    return current;
  }
}

void main() {
  group('session end', () {
    test('UT-SEN-01: while signed in, signs out with the notice reason for the refusal', () async {
      const cases = {
        'refresh_token_reused': SessionEndReason.ended,
        'mfa_reauthentication_required': SessionEndReason.mfaReauthenticationRequired,
        'account_disabled': SessionEndReason.accountDisabled,
        'no_role_assigned': SessionEndReason.noRoleAssigned,
      };
      for (final entry in cases.entries) {
        final app = await _App().boot();
        expect(app.state.isAuthenticated, isTrue);

        app.events.end(SessionEnd.forCode(entry.key));
        await app.settle();

        expect(app.state.isAuthenticated, isFalse, reason: entry.key);
        expect(app.state.notice, entry.value, reason: entry.key);
        expect(app.state.error, isNull, reason: entry.key);
        app.notifier.dispose();
      }
    });

    test('UT-SEN-02: while signed out nothing changes', () async {
      final app = _App()..storage.roles = [];
      await app.boot();
      expect(app.state.isAuthenticated, isFalse);

      app.events.end(SessionEnd.forCode('refresh_token_revoked'));
      await app.settle();

      expect(app.state.isAuthenticated, isFalse);
      expect(app.state.notice, isNull);
      app.notifier.dispose();
    });

    test('UT-SEN-03: signing in again clears the notice', () async {
      final app = await _App({'POST /auth/login': (_) => jsonBody(200, mfaRequiredLogin())}).boot();
      app.events.end(SessionEnd.forCode('refresh_token_revoked'));
      await app.settle();
      expect(app.state.notice, SessionEndReason.ended);

      await app.notifier.login('dqtv01', 'x');

      expect(app.state.notice, isNull);
      app.notifier.dispose();
    });

    test('UT-SEN-08: a disposed notifier ignores a late session end', () async {
      final app = await _App().boot();
      app.notifier.dispose();

      app.events.end(SessionEnd.forCode('refresh_token_revoked'));
      await app.settle();

      expect(app.storage.access, 'old_access');
    });
  });

  group('Bearer POST /auth/mfa/confirm', () {
    test('UT-SEN-04: the replacement session is held until the codes are acknowledged; '
        'a session end meanwhile is ignored', () async {
      final app =
          await _App({'POST /auth/mfa/confirm': (_) => jsonBody(200, mfaConfirmSession())}).boot();

      final attempt = await app.notifier.confirmMfaSetup(mfaToken: testMfaToken, code: '112233');

      expect(attempt.success, isTrue);
      expect(attempt.recoveryCodes, testRecoveryCodes);
      expect(app.adapter.requests.single.data, {'mfaToken': testMfaToken, 'code': '112233'});
      // Nothing stored yet
      expect(app.storage.access, 'old_access');
      expect(app.storage.refresh, 'old_refresh');

      // The old session's refresh is refused while the codes are on screen
      app.events.end(SessionEnd.forCode('refresh_token_revoked'));
      await app.settle();
      expect(app.state.isAuthenticated, isTrue);
      expect(app.state.notice, isNull);

      await app.notifier.acknowledgeRecoveryCodes();

      expect(app.state.isAuthenticated, isTrue);
      expect(app.state.user?.username, 'user01');
      expect(app.storage.access, 'tok_access');
      expect(app.storage.refresh, 'tok_refresh');
      expect(app.storage.roles, ['dqtv']);

      // Nothing is held any more: a later end signs out
      app.events.end(SessionEnd.forCode('refresh_token_revoked'));
      await app.settle();
      expect(app.state.isAuthenticated, isFalse);
      app.notifier.dispose();
    });

    test('UT-SEN-05: a wrong code keeps the current session', () async {
      final app = await _App({
        'POST /auth/mfa/confirm': (_) =>
            jsonBody(401, backendError(401, 'invalid_code', details: {'attemptsRemaining': 3})),
      }).boot();

      final attempt = await app.notifier.confirmMfaSetup(mfaToken: testMfaToken, code: '000000');

      expect(attempt.success, isFalse);
      expect(attempt.error?.code, MfaError.invalidCode);
      expect(attempt.error?.attemptsRemaining, 3);
      expect(attempt.error?.restartLogin, isFalse);
      expect(app.state.isAuthenticated, isTrue);
      await app.notifier.acknowledgeRecoveryCodes();
      expect(app.storage.access, 'old_access');
      app.notifier.dispose();
    });

    test('UT-SEN-06: a session this app may not use signs out; the earlier one already ended', () async {
      final app = await _App({
        'POST /auth/mfa/confirm': (_) => jsonBody(200, mfaConfirmSession('ca_officer')),
      }).boot();

      final attempt = await app.notifier.confirmMfaSetup(mfaToken: testMfaToken, code: '112233');

      expect(attempt.success, isFalse);
      expect(attempt.error?.code, MfaError.sessionRejected);
      expect(attempt.error?.issue, AuthResponseIssue.roleNotAllowed);
      expect(attempt.error?.restartLogin, isTrue);
      expect(app.state.isAuthenticated, isFalse);
      expect(
        app.state.error,
        isA<AuthResponseError>().having((e) => e.issue, 'issue', AuthResponseIssue.roleNotAllowed),
      );
      expect(app.storage.access, isNull);
      expect(app.storage.refresh, isNull);
      app.notifier.dispose();
    });

    test('UT-SEN-07: without recovery codes the new session is stored and new codes are suggested',
        () async {
      final app = await _App({
        'POST /auth/mfa/confirm': (_) => jsonBody(200, mfaConfirmSession()..remove('recoveryCodes')),
      }).boot();

      final attempt = await app.notifier.confirmMfaSetup(mfaToken: testMfaToken, code: '112233');

      expect(attempt.success, isFalse);
      expect(attempt.error?.code, MfaError.recoveryCodesMissing);
      expect(attempt.error?.restartLogin, isFalse);
      expect(app.state.isAuthenticated, isTrue);
      expect(app.storage.access, 'tok_access');
      expect(app.storage.refresh, 'tok_refresh');
      app.notifier.dispose();
    });

    test('UT-SEN-09: without recovery codes, a session that cannot be stored signs out', () async {
      final app = await _App({
        'POST /auth/mfa/confirm': (_) => jsonBody(200, mfaConfirmSession()..remove('recoveryCodes')),
      }).boot();
      app.storage.failWrites = true;

      final attempt = await app.notifier.confirmMfaSetup(mfaToken: testMfaToken, code: '112233');

      expect(attempt.error?.code, MfaError.sessionRejected);
      expect(attempt.error?.restartLogin, isTrue);
      expect(app.state.isAuthenticated, isFalse);
      expect(app.state.error, isA<AuthRequestError>());
      expect(app.storage.access, isNull);
      app.notifier.dispose();
    });
  });

  group('change password', () {
    test('UT-PWD-01: success ends the session with the notice', () async {
      final app = await _App({'POST /users/me/change-password': noContent}).boot();

      final failure =
          await app.notifier.changePassword(currentPassword: 'Cu@123456', newPassword: 'Moi@123456');

      expect(failure, isNull);
      expect(app.adapter.requests.single.method, 'POST');
      expect(app.adapter.requests.single.data,
          {'currentPassword': 'Cu@123456', 'newPassword': 'Moi@123456'});
      expect(app.state.isAuthenticated, isFalse);
      expect(app.state.notice, SessionEndReason.passwordChanged);
      expect(app.storage.access, isNull);
      expect(app.storage.refresh, isNull);
      app.notifier.dispose();
    });

    test('UT-PWD-02: refusals come back as the failed call and keep the session', () async {
      for (final code in ['invalid_credentials', 'password_complexity', 'password_reuse']) {
        final app = await _App({
          'POST /users/me/change-password': (_) => jsonBody(400, backendError(400, code)),
        }).boot();

        final failure =
            await app.notifier.changePassword(currentPassword: 'Cu@123456', newPassword: 'Moi@123456');

        expect(failure?.code, code, reason: code);
        expect(failure?.status, 400, reason: code);
        expect(app.state.isAuthenticated, isTrue, reason: code);
        expect(app.state.notice, isNull, reason: code);
        expect(app.storage.access, 'old_access', reason: code);
        app.notifier.dispose();
      }
    });

    test('UT-PWD-03: the local rule is the backend regex (8+, upper, lower, digit, special)', () {
      for (final ok in ['Abcdef1!', 'Mat@khau9A', 'Xy9 zzzz']) {
        expect(Validators.newPassword(ok), isNull, reason: ok);
      }
      for (final bad in ['abcdef1!', 'ABCDEF1!', 'Abcdefg!', 'Abcdefg1', 'Ab1!xyz']) {
        expect(Validators.newPassword(bad), ValidationError.newPasswordComplexity, reason: bad);
      }
      expect(Validators.newPassword(''), ValidationError.required);
    });
  });

  test('UT-SEN-10: logout clears the session and any held one', () async {
    final app = await _App({
      'POST /auth/mfa/confirm': (_) => jsonBody(200, mfaConfirmSession()),
      'POST /auth/logout': noContent,
    }).boot();
    await app.notifier.confirmMfaSetup(mfaToken: testMfaToken, code: '112233');

    await app.notifier.logout();
    await app.notifier.acknowledgeRecoveryCodes();

    expect(app.state.isAuthenticated, isFalse);
    expect(app.storage.access, isNull);
    app.notifier.dispose();
  });
}

// Unit Tests: session integrity in AuthNotifier (Codex round 3)
//   - a session ended by the interceptor signs the app out with a notice
//   - Bearer POST /auth/mfa/confirm returns {recoveryCodes, user, tokens}; the old tokens are dead
//     (Web/backend/src/auth/mfa/mfa.service.ts:338-361)
//   - Bearer POST /auth/mfa/disable returns {user, tokens}: every session ended, the caller's replacement
//     is stored at once (mfa.service.ts disable)
//   - POST /users/me/change-password → 204 ends every session (Web/backend/src/users/users.service.ts:180-219)
// Run: flutter test test/unit_auth_session_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/network/session_events.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/l10n/failure_texts.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _codes = List.generate(10, (i) => 'ABCDE-1234$i');

Map<String, Object> _user(String role) =>
    {'id': 'u1', 'username': 'ca01', 'fullName': 'CA', 'status': 'active', 'role': role};

Map<String, Object> _confirmed({String role = 'ca_officer'}) => {
      'recoveryCodes': _codes,
      'user': _user(role),
      'tokens': {'accessToken': 'mfa_access', 'refreshToken': 'mfa_refresh', 'expiresIn': 900},
    };

Map<String, Object> _error(int status, String message, [Map<String, Object>? details]) =>
    {'code': 'E004', 'message': message, 'statusCode': status, if (details != null) 'details': details};

/// Storage that cannot keep new tokens (a locked keychain); clearing still works
class _LockedStorage extends MemoryStorage {
  _LockedStorage() : super(role: 'ca');

  @override
  Future<void> saveAccessToken(String token) async => throw StateError('keychain locked');
}

class _Session {
  _Session(this.handler, {String role = 'ca', MemoryStorage? storage, Future<void> Function(RequestOptions)? gate})
      : storage = storage ?? MemoryStorage(role: role),
        adapter = FakeAdapter(handler, gate: gate);

  final ResponseBody Function(RequestOptions) handler;
  final MemoryStorage storage;
  final FakeAdapter adapter;
  final events = SessionEvents();
  late final AuthNotifier notifier;

  Future<void> start() async {
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    notifier = AuthNotifier(storage, dio, sessionEvents: events);
    await notifier.ready;
  }

  AuthState get state {
    late AuthState current;
    notifier.addListener((s) => current = s)();
    return current;
  }
}

void main() {
  group('Session ended by the interceptor', () {
    test('UT-SESS-01: signs out, clears the stored session and shows the neutral notice', () async {
      final s = _Session((_) => jsonBody(404, {}));
      await s.start();
      expect(s.state.isAuthenticated, isTrue);

      s.events.end('refresh_token_reused');
      await pumpEventQueue();

      expect(s.state.isAuthenticated, isFalse);
      expect(s.state.role, '');
      expect(s.state.notice?.code, AppFailure.sessionEnded);
      expect(failureText(viL10n, s.state.notice!), viL10n.authLoginNoticeSessionEnded);
      expect(s.storage.access, isNull);
      expect(s.storage.role, isNull);
    });

    test('UT-SESS-02: the notice keeps the reasons worth telling, the rest is neutral', () {
      expect(const SessionEnd('refresh_token_reused').failure.code, AppFailure.sessionEnded);
      expect(const SessionEnd('refresh_token_revoked').failure.code, AppFailure.sessionEnded);
      expect(const SessionEnd(SessionEvents.refreshFailed).failure.code, AppFailure.sessionEnded);
      expect(const SessionEnd('mfa_reauthentication_required').failure.code, 'mfa_reauthentication_required');
      expect(const SessionEnd('account_disabled').failure.code, 'account_disabled');
      expect(const SessionEnd('no_role_assigned').failure.code, 'no_role_assigned');
      expect(const SessionEnd(SessionEvents.passwordChanged).failure.code, AppFailure.passwordChanged);
    });

    test('UT-SESS-03: a new sign-in attempt clears the notice', () async {
      final s = _Session((_) => jsonBody(401, _error(401, 'invalid_credentials')));
      await s.start();
      s.events.end('refresh_token_revoked');
      await pumpEventQueue();
      expect(s.state.notice, isNotNull);

      await s.notifier.login('ca01', 'sai');

      expect(s.state.notice, isNull);
      expect(s.state.error?.code, 'invalid_credentials');
    });

    test('UT-SESS-09: an end while signed out changes nothing', () async {
      final s = _Session((_) => jsonBody(404, {}));
      s.storage.access = null;
      await s.start();

      s.events.end('refresh_token_revoked');
      await pumpEventQueue();

      expect(s.state.notice, isNull);
    });
  });

  group('Bearer MFA confirm', () {
    test('UT-SESS-04: the replacement session is stored only once the codes are acknowledged', () async {
      final s = _Session((o) => o.path == '/auth/mfa/confirm' ? jsonBody(200, _confirmed()) : jsonBody(404, {}));
      await s.start();

      final attempt = await s.notifier.confirmSetup(mfaToken: 'setup-token', code: '123456');

      expect(s.adapter.requests.single.data, {'mfaToken': 'setup-token', 'code': '123456'});
      expect(attempt.success, isTrue);
      expect(attempt.recoveryCodes, _codes);
      expect(s.storage.access, 'old_access');

      // A background request with the dead token ends the old session meanwhile
      s.events.end('refresh_token_revoked');
      await pumpEventQueue();
      expect(s.state.isAuthenticated, isTrue, reason: 'the held session replaces the ended one');

      await s.notifier.acknowledgeRecoveryCodes();

      expect(s.storage.access, 'mfa_access');
      expect(s.storage.refresh, 'mfa_refresh');
      expect(s.storage.userId, 'u1');
      expect(s.storage.role, 'ca');
      expect(s.state.isAuthenticated, isTrue);
      expect(s.state.user?.id, 'u1');
      expect(s.state.notice, isNull);
    });

    test('UT-SESS-05: a wrong code keeps the current session and holds nothing', () async {
      final s = _Session((_) => jsonBody(401, _error(401, 'invalid_code', {'attemptsRemaining': 4})));
      await s.start();

      final attempt = await s.notifier.confirmSetup(mfaToken: 'setup-token', code: '000000');
      await s.notifier.acknowledgeRecoveryCodes();

      expect(attempt.success, isFalse);
      expect(attempt.error?.code, 'invalid_code');
      expect(attempt.error?.attemptsRemaining, 4);
      expect(s.storage.access, 'old_access');
      expect(s.state.isAuthenticated, isTrue);
    });

    test('UT-SESS-06: a replacement session the app may not use ends the session after the codes', () async {
      final s = _Session((o) => jsonBody(200, _confirmed(role: 'system_admin')));
      await s.start();

      final attempt = await s.notifier.confirmSetup(mfaToken: 'setup-token', code: '123456');
      expect(attempt.recoveryCodes, _codes, reason: 'MFA is on: the codes must still be shown');

      await s.notifier.acknowledgeRecoveryCodes();

      expect(s.state.isAuthenticated, isFalse);
      expect(s.state.notice?.code, AppFailure.roleNotAllowed);
      expect(s.storage.access, isNull);
    });
  });

  group('Bearer MFA disable', () {
    Map<String, Object> disabled({String role = 'ca_officer'}) => {
          'user': _user(role),
          'tokens': {'accessToken': 'nomfa_access', 'refreshToken': 'nomfa_refresh', 'expiresIn': 900},
        };

    test('UT-SESS-11: the replacement session is stored at once and the user stays signed in; the end of the '
        'earlier session meanwhile is ignored', () async {
      final held = Completer<void>();
      final s = _Session(
        (o) => o.path == '/auth/mfa/disable' ? jsonBody(200, disabled()) : jsonBody(404, {}),
        gate: (_) => held.future,
      );
      await s.start();

      final pending = s.notifier.disableMfa(method: 'recovery_code', code: 'ABCDE-12345');
      await pumpEventQueue();
      // The server already ended every session: the old one's refresh is refused while the answer is out
      s.events.end('refresh_token_revoked');
      await pumpEventQueue();
      expect(s.state.isAuthenticated, isTrue);
      held.complete();
      final error = await pending;

      expect(error, isNull);
      expect(s.adapter.requests.single.data, {'method': 'recovery_code', 'code': 'ABCDE-12345'});
      expect(s.storage.access, 'nomfa_access');
      expect(s.storage.refresh, 'nomfa_refresh');
      expect(s.storage.userId, 'u1');
      expect(s.storage.role, 'ca');
      expect(s.state.isAuthenticated, isTrue);
      expect(s.state.notice, isNull);

      // Nothing is replaced any more: a later end signs out
      s.events.end('refresh_token_revoked');
      await pumpEventQueue();
      expect(s.state.isAuthenticated, isFalse);
    });

    test('UT-SESS-12: a wrong code or a role that requires MFA keeps the current session', () async {
      for (final (status, code) in [(401, 'invalid_code'), (403, 'mfa_required_by_role')]) {
        final s = _Session((_) => jsonBody(status, _error(status, code)));
        await s.start();

        final error = await s.notifier.disableMfa(method: 'totp', code: '000000');

        expect(error?.code, code);
        expect(error?.restartLogin, isFalse, reason: code);
        expect(s.storage.access, 'old_access', reason: code);
        expect(s.state.isAuthenticated, isTrue, reason: code);
      }
    });

    test('UT-SESS-13: a replacement the app may not use signs out; the earlier session already ended', () async {
      final s = _Session((_) => jsonBody(200, disabled(role: 'system_admin')));
      await s.start();

      final error = await s.notifier.disableMfa(method: 'totp', code: '123456');

      expect(error?.code, AppFailure.roleNotAllowed);
      expect(error?.restartLogin, isTrue);
      expect(s.state.isAuthenticated, isFalse);
      expect(s.state.notice?.code, AppFailure.roleNotAllowed);
      expect(s.storage.access, isNull);
    });

    test('UT-SESS-14: a replacement that cannot be stored signs out', () async {
      final s = _Session((_) => jsonBody(200, disabled()), storage: _LockedStorage());
      await s.start();

      final error = await s.notifier.disableMfa(method: 'totp', code: '123456');

      expect(error?.code, AppFailure.sessionStartFailed);
      expect(error?.restartLogin, isTrue);
      expect(s.state.isAuthenticated, isFalse);
      expect(s.state.notice?.code, AppFailure.sessionStartFailed);
      expect(s.storage.access, isNull);
    });
  });

  group('Password change', () {
    test('UT-SESS-07: success ends the session with the password-changed notice', () async {
      final s = _Session((o) => o.path == '/users/me/change-password'
          ? ResponseBody.fromString('', 204)
          : jsonBody(404, {}));
      await s.start();

      final failure = await s.notifier.changePassword(currentPassword: 'Old@12345', newPassword: 'New@12345');

      expect(failure, isNull);
      final request = s.adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.data, {'currentPassword': 'Old@12345', 'newPassword': 'New@12345'});
      expect(s.storage.access, isNull);
      expect(s.storage.refresh, isNull);
      expect(s.state.isAuthenticated, isFalse);
      expect(s.state.notice?.code, AppFailure.passwordChanged);
    });

    test('UT-SESS-08: refusals are reported and the session stays', () async {
      const expected = {
        'invalid_credentials': AppFailure.currentPasswordInvalid,
        'password_complexity': 'password_complexity',
        'password_reuse': 'password_reuse',
      };
      for (final entry in expected.entries) {
        final s = _Session((_) => jsonBody(400, _error(400, entry.key)));
        await s.start();

        final failure = await s.notifier.changePassword(currentPassword: 'Old@12345', newPassword: 'New@12345');

        expect(failure?.code, entry.value, reason: entry.key);
        expect(s.storage.access, 'old_access', reason: entry.key);
        expect(s.state.isAuthenticated, isTrue, reason: entry.key);
      }
    });

    test('UT-SESS-10: a network failure is reported without signing out', () async {
      final s = _Session((o) => throw DioException.connectionError(requestOptions: o, reason: 'offline'));
      await s.start();

      final failure = await s.notifier.changePassword(currentPassword: 'Old@12345', newPassword: 'New@12345');

      expect(failure?.code, AppFailure.network);
      expect(s.state.isAuthenticated, isTrue);
    });
  });
}

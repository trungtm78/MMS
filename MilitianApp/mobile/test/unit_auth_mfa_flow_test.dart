// Unit Tests: AuthNotifier second-factor sign-in (verify, enrolment, recovery codes acknowledgement)
// Contract: Web/backend/src/auth/mfa/mfa.controller.ts (verify, enroll/confirm),
// mfa.service.ts (verify, confirmEnrollment, rejectCode)
// Run: flutter test test/unit_auth_mfa_flow_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';
import 'package:militian_app/features/auth/models/auth_error.dart';
import 'package:militian_app/features/auth/models/login_response.dart';
import 'package:militian_app/features/auth/models/mfa_error.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';

import 'helpers/fakes.dart';

class _Flow {
  _Flow(Map<String, ResponseBody Function(RequestOptions)> routes)
      : adapter = FakeAdapter(routeTable(routes));

  final storage = MemoryStorage(access: null, refresh: null);
  final FakeAdapter adapter;
  late final notifier = AuthNotifier(
    AuthRepositoryImpl(
      storage,
      dio: Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter,
    ),
    storage,
  );

  /// Lets the constructor's session restore finish.
  Future<_Flow> boot() async {
    await notifier.ready;
    return this;
  }

  AuthState get state {
    late AuthState current;
    notifier.addListener((s) => current = s)();
    return current;
  }

  /// The second-factor error kept in the state, if that is what failed.
  MfaError? get stateMfaError => switch (state.error) {
        AuthMfaError(:final error) => error,
        _ => null,
      };
}

void _expectNothingStored(MemoryStorage storage) {
  expect(storage.access, isNull);
  expect(storage.refresh, isNull);
  expect(storage.userId, isNull);
  expect(storage.roles, isEmpty);
}

void main() {
  group('AuthNotifier.login', () {
    test('MFA_SETUP_REQUIRED hands the challenge to the caller', () async {
      final f = await _Flow({
        'POST ${ApiConstants.login}': (_) => jsonBody(200, mfaSetupRequiredLogin()),
      }).boot();

      final r = await f.notifier.login('dqtv01', 'x');

      expect(r?.status, LoginStatus.mfaSetupRequired);
      expect(r?.mfaToken, testMfaToken);
      expect(f.state.isAuthenticated, isFalse);
      expect(f.state.isLoading, isFalse);
      _expectNothingStored(f.storage);
      f.notifier.dispose();
    });
  });

  group('AuthNotifier.verifyMfa', () {
    test('success stores the DQTV session and authenticates', () async {
      final f = await _Flow({
        'POST /auth/mfa/verify': (_) =>
            jsonBody(200, backendSession('dqtv', {'recoveryCodesRemaining': 9})),
      }).boot();

      final attempt = await f.notifier.verifyMfa(
        mfaToken: testMfaToken,
        method: 'recovery_code',
        code: 'ABCDE-FGHJK',
      );

      expect(attempt.success, isTrue);
      expect(attempt.error, isNull);
      expect(attempt.recoveryCodesRemaining, 9);
      expect(f.state.isAuthenticated, isTrue);
      expect(f.state.user?.username, 'user01');
      expect(f.state.isLoading, isFalse);
      expect(f.state.error, isNull);
      expect(f.storage.access, 'tok_access');
      expect(f.storage.roles, ['dqtv']);
      f.notifier.dispose();
    });

    test('a non-DQTV account is refused after verification and nothing is stored', () async {
      final f = await _Flow({
        'POST /auth/mfa/verify': (_) => jsonBody(200, backendSession('ca_officer')),
      }).boot();

      final attempt = await f.notifier.verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '123456');

      expect(attempt.success, isFalse);
      expect(attempt.error?.code, MfaError.sessionRejected);
      expect(attempt.error?.issue, AuthResponseIssue.roleNotAllowed);
      expect(attempt.error?.restartLogin, isTrue);
      expect(f.stateMfaError?.issue, AuthResponseIssue.roleNotAllowed);
      expect(f.state.isAuthenticated, isFalse);
      _expectNothingStored(f.storage);
      f.notifier.dispose();
    });

    test('a wrong code keeps the attempts left', () async {
      final f = await _Flow({
        'POST /auth/mfa/verify': (_) =>
            jsonBody(401, backendError(401, 'invalid_code', details: {'attemptsRemaining': 4})),
      }).boot();

      final attempt = await f.notifier.verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '000000');

      expect(attempt.success, isFalse);
      expect(attempt.error?.code, MfaError.invalidCode);
      expect(attempt.error?.attemptsRemaining, 4);
      expect(attempt.error?.restartLogin, isFalse);
      expect(f.stateMfaError?.attemptsRemaining, 4);
      expect(f.state.isLoading, isFalse);
      expect(f.state.isAuthenticated, isFalse);
      _expectNothingStored(f.storage);
      f.notifier.dispose();
    });

    test('an expired challenge asks to sign in again', () async {
      final f = await _Flow({
        'POST /auth/mfa/verify': (_) => jsonBody(401, backendError(401, 'mfa_token_invalid')),
      }).boot();

      final attempt = await f.notifier.verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '123456');

      expect(attempt.error?.restartLogin, isTrue);
      expect(f.stateMfaError?.code, MfaError.tokenInvalid);
      f.notifier.dispose();
    });
  });

  group('AuthNotifier.confirmEnrollment', () {
    test('keeps the session pending until the recovery codes are acknowledged', () async {
      final f = await _Flow({
        'POST /auth/mfa/enroll/confirm': (_) =>
            jsonBody(200, backendSession('dqtv', {'recoveryCodes': testRecoveryCodes})),
      }).boot();

      final attempt = await f.notifier.confirmEnrollment(mfaToken: testMfaToken, code: '654321');

      expect(attempt.success, isTrue);
      expect(attempt.recoveryCodes, testRecoveryCodes);
      expect(f.state.isAuthenticated, isFalse);
      expect(f.state.isLoading, isFalse);
      _expectNothingStored(f.storage);

      await f.notifier.acknowledgeRecoveryCodes();

      expect(f.state.isAuthenticated, isTrue);
      expect(f.state.user?.username, 'user01');
      expect(f.storage.access, 'tok_access');
      expect(f.storage.refresh, 'tok_refresh');
      expect(f.storage.roles, ['dqtv']);
      f.notifier.dispose();
    });

    test('a non-DQTV account is refused after enrolment and nothing is stored', () async {
      final f = await _Flow({
        'POST /auth/mfa/enroll/confirm': (_) =>
            jsonBody(200, backendSession('ca_officer', {'recoveryCodes': testRecoveryCodes})),
      }).boot();

      final attempt = await f.notifier.confirmEnrollment(mfaToken: testMfaToken, code: '654321');
      await f.notifier.acknowledgeRecoveryCodes();

      expect(attempt.success, isFalse);
      expect(attempt.recoveryCodes, isEmpty);
      expect(attempt.error?.restartLogin, isTrue);
      expect(f.stateMfaError?.issue, AuthResponseIssue.roleNotAllowed);
      expect(f.state.isAuthenticated, isFalse);
      _expectNothingStored(f.storage);
      f.notifier.dispose();
    });

    test('a wrong enrolment code keeps the attempts left', () async {
      final f = await _Flow({
        'POST /auth/mfa/enroll/confirm': (_) =>
            jsonBody(401, backendError(401, 'invalid_code', details: {'attemptsRemaining': 2})),
      }).boot();

      final attempt = await f.notifier.confirmEnrollment(mfaToken: testMfaToken, code: '000000');

      expect(attempt.success, isFalse);
      expect(f.stateMfaError?.attemptsRemaining, 2);
      _expectNothingStored(f.storage);
      f.notifier.dispose();
    });

    test('a held session that cannot be stored signs in again with the reason', () async {
      final f = await _Flow({
        'POST /auth/mfa/enroll/confirm': (_) =>
            jsonBody(200, backendSession('dqtv', {'recoveryCodes': testRecoveryCodes})),
      }).boot();
      f.storage.failWrites = true;

      await f.notifier.confirmEnrollment(mfaToken: testMfaToken, code: '654321');
      await f.notifier.acknowledgeRecoveryCodes();

      expect(f.state.isAuthenticated, isFalse);
      expect(f.state.error, isA<AuthRequestError>());
      f.notifier.dispose();
    });
  });

  test('acknowledging with nothing held does nothing', () async {
    final f = await _Flow({}).boot();

    await f.notifier.acknowledgeRecoveryCodes();

    expect(f.state.isAuthenticated, isFalse);
    expect(f.state.isLoading, isFalse);
    expect(f.adapter.requests, isEmpty);
    f.notifier.dispose();
  });
}

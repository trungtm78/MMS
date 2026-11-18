// Unit Tests: MFA contract (T15) — login statuses, enrolment/status payloads, MfaError, MfaApi
// Backend: Web/backend/src/auth/auth.controller.ts:48-63, src/auth/mfa/mfa.controller.ts,
// src/auth/mfa/mfa.service.ts (LoginResult, rejectCode), src/common/filters/http-exception.filter.ts
// Run: flutter test test/unit_mfa_contract_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/models/auth_models.dart';
import 'package:police_app/features/auth/models/mfa_error.dart';
import 'package:police_app/features/auth/providers/mfa_provider.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';

const _user = {'id': 'u1', 'username': 'ca01', 'fullName': 'CA', 'status': 'active', 'role': 'ca_officer'};
const _tokens = {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900};
const _mfaToken = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';

DioException _error(int status, Map<String, dynamic> body) {
  final o = RequestOptions(path: '/auth/mfa/verify');
  return DioException(
    requestOptions: o,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: o, statusCode: status, data: body),
  );
}

(MfaApi, FakeAdapter) _api(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (MfaApi(dio), adapter);
}

void main() {
  group('LoginResponse statuses', () {
    test('UT-T15-01: SUCCESS carries user and tokens', () {
      final r = LoginResponse.fromJson({'status': 'SUCCESS', 'user': _user, 'tokens': _tokens});
      expect(r.status, LoginStatus.success);
      expect(r.accessToken, 'tok_access');
      expect(r.refreshToken, 'tok_refresh');
      expect(r.requiresMfa, isFalse);
      expect(r.requiresMfaSetup, isFalse);
      expect(r.sessionRejection, isNull);
    });

    test('UT-T15-02: MFA_REQUIRED carries mfaToken, expiry and methods', () {
      final r = LoginResponse.fromJson({
        'status': 'MFA_REQUIRED',
        'mfaToken': _mfaToken,
        'expiresAt': '2026-09-14T01:05:00.000Z',
        'methods': ['totp', 'recovery_code'],
        'mfa_required': true,
        'requiresMfa': true,
        'tempToken': _mfaToken,
      });
      expect(r.status, LoginStatus.mfaRequired);
      expect(r.requiresMfa, isTrue);
      expect(r.mfaToken, _mfaToken);
      expect(r.expiresAt, DateTime.utc(2026, 9, 14, 1, 5));
      expect(r.methods, ['totp', 'recovery_code']);
      expect(r.accessToken, isNull);
    });

    test('UT-T15-03: MFA_SETUP_REQUIRED carries mfaToken', () {
      final r = LoginResponse.fromJson({
        'status': 'MFA_SETUP_REQUIRED',
        'mfaToken': _mfaToken,
        'expiresAt': '2026-09-14T01:10:00.000Z',
        'requiresMfaSetup': true,
        'tempToken': _mfaToken,
      });
      expect(r.status, LoginStatus.mfaSetupRequired);
      expect(r.requiresMfaSetup, isTrue);
      expect(r.requiresMfa, isFalse);
      expect(r.mfaToken, _mfaToken);
    });

    test('UT-T15-04: verify and enrolment responses expose recovery code data', () {
      final verified = LoginResponse.fromJson(
          {'status': 'SUCCESS', 'user': _user, 'tokens': _tokens, 'recoveryCodesRemaining': 7});
      expect(verified.recoveryCodesRemaining, 7);
      final enrolled = LoginResponse.fromJson({
        'status': 'SUCCESS',
        'user': _user,
        'tokens': _tokens,
        'recoveryCodes': ['ABCDE-12345', 'FGHJK-67890'],
      });
      expect(enrolled.recoveryCodes, ['ABCDE-12345', 'FGHJK-67890']);
      expect(enrolled.recoveryCodesRemaining, isNull);
    });

    test('UT-T15-05: the legacy flags still map when status is absent', () {
      final r = LoginResponse.fromJson({'mfa_required': true, 'tempToken': 'legacy'});
      expect(r.status, LoginStatus.mfaRequired);
      expect(r.mfaToken, 'legacy');
    });
  });

  group('enrolment and status payloads', () {
    test('UT-T15-06: MfaEnrollment reads otpauthUri', () {
      final e = MfaEnrollment.fromJson({
        'mfaToken': _mfaToken,
        'secret': 'JBSWY3DPEHPK3PXP',
        'otpauthUri': 'otpauth://totp/MMS:ca01?secret=JBSWY3DPEHPK3PXP&issuer=MMS',
        'qrUri': 'otpauth://totp/MMS:ca01?secret=JBSWY3DPEHPK3PXP&issuer=MMS',
        'expiresAt': '2026-09-14T01:10:00.000Z',
      });
      expect(e.mfaToken, _mfaToken);
      expect(e.secret, 'JBSWY3DPEHPK3PXP');
      expect(e.otpauthUri, startsWith('otpauth://totp/'));
      expect(e.expiresAt, DateTime.utc(2026, 9, 14, 1, 10));
    });

    test('UT-T15-07: MfaStatus', () {
      final s = MfaStatus.fromJson(
          {'enabled': true, 'enrolledAt': '2026-09-01T02:00:00.000Z', 'required': false, 'recoveryCodesRemaining': 8});
      expect(s.enabled, isTrue);
      expect(s.enrolledAt, DateTime.utc(2026, 9, 1, 2));
      expect(s.required, isFalse);
      expect(s.recoveryCodesRemaining, 8);
      final off = MfaStatus.fromJson({'enabled': false, 'enrolledAt': null, 'required': true, 'recoveryCodesRemaining': 0});
      expect(off.enabled, isFalse);
      expect(off.enrolledAt, isNull);
      expect(off.required, isTrue);
    });
  });

  group('MfaError', () {
    test('UT-T15-08: invalid_code carries the attempts left', () {
      final e = MfaError.from(_error(401, {
        'code': 'E004',
        'message': 'invalid_code',
        'details': {'attemptsRemaining': 3},
        'statusCode': 401,
      }));
      expect(e.code, 'invalid_code');
      expect(e.attemptsRemaining, 3);
      expect(e.restartLogin, isFalse);
      expect(e.failure.status, 401);
      final bare = MfaError.from(_error(401, {'code': 'E004', 'message': 'invalid_code', 'statusCode': 401}));
      expect(bare.attemptsRemaining, isNull);
    });

    test('UT-T15-09: challenge-ending errors send the user back to login', () {
      for (final (status, code) in [(401, 'mfa_token_invalid'), (429, 'mfa_attempts_exceeded'), (429, 'mfa_locked')]) {
        final e = MfaError.from(_error(status, {'code': 'E004', 'message': code, 'statusCode': status}));
        expect(e.code, code);
        expect(e.restartLogin, isTrue, reason: code);
      }
    });

    test('UT-T15-10: throttling and management errors keep the challenge', () {
      final throttled = MfaError.from(_error(429, {
        'code': 'E006',
        'message': 'ThrottlerException: Too Many Requests',
        'statusCode': 429,
      }));
      expect(throttled.restartLogin, isFalse);
      expect(throttled.failure.status, 429);
      for (final code in ['mfa_already_enabled', 'mfa_not_enabled', 'mfa_required_by_role', 'mfa_setup_not_started']) {
        final e = MfaError.from(_error(409, {'code': 'E002', 'message': code, 'statusCode': 409}));
        expect(e.code, code);
        expect(e.restartLogin, isFalse, reason: code);
      }
      expect(MfaError.from(const FormatException('bad body')).code, AppFailure.badResponse);
    });
  });

  group('MfaApi', () {
    test('UT-T15-11: verify posts mfaToken, method and code to /auth/mfa/verify', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'status': 'SUCCESS', 'user': _user, 'tokens': _tokens}));

      final r = await api.verify(mfaToken: _mfaToken, method: 'recovery_code', code: ' abcde fghij ');

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/auth/mfa/verify');
      expect(req.data, {'mfaToken': _mfaToken, 'method': 'recovery_code', 'code': ' abcde fghij '});
      expect(r.status, LoginStatus.success);
    });

    test('UT-T15-12: enrolment during sign-in', () async {
      final (api, adapter) = _api((o) => o.path == '/auth/mfa/enroll'
          ? jsonBody(200, {
              'mfaToken': _mfaToken,
              'secret': 'S',
              'otpauthUri': 'otpauth://totp/MMS:ca01?secret=S',
              'qrUri': 'otpauth://totp/MMS:ca01?secret=S',
              'expiresAt': '2026-09-14T01:10:00.000Z',
            })
          : jsonBody(200, {'status': 'SUCCESS', 'user': _user, 'tokens': _tokens, 'recoveryCodes': ['ABCDE-12345']}));

      final e = await api.enroll(_mfaToken);
      final done = await api.confirmEnrollment(mfaToken: _mfaToken, code: '123456');

      expect(adapter.requests.first.path, '/auth/mfa/enroll');
      expect(adapter.requests.first.data, {'mfaToken': _mfaToken});
      expect(adapter.requests.last.path, '/auth/mfa/enroll/confirm');
      expect(adapter.requests.last.data, {'mfaToken': _mfaToken, 'code': '123456'});
      expect(e.secret, 'S');
      expect(done.recoveryCodes, ['ABCDE-12345']);
    });

    test('UT-T15-13: management routes', () async {
      final (api, adapter) = _api((o) {
        switch (o.path) {
          case '/auth/mfa/status':
            return jsonBody(200, {'enabled': false, 'enrolledAt': null, 'required': true, 'recoveryCodesRemaining': 0});
          case '/auth/mfa/setup':
            return jsonBody(200, {'mfaToken': _mfaToken, 'secret': 'S', 'otpauthUri': 'otpauth://x', 'expiresAt': null});
          // Session integrity: enabling MFA replaces the session (mfa.service.ts:349-356)
          case '/auth/mfa/confirm':
            return jsonBody(200, {'recoveryCodes': ['ABCDE-12345', 'FGHJK-67890'], 'user': _user, 'tokens': _tokens});
          case '/auth/mfa/recovery-codes/regenerate':
            return jsonBody(200, {'recoveryCodes': ['ABCDE-12345', 'FGHJK-67890']});
          // Disabling MFA ends every session and answers the caller's replacement (mfa.service.ts disable)
          case '/auth/mfa/disable':
            return jsonBody(200, {'user': _user, 'tokens': _tokens});
          default:
            return ResponseBody.fromString('', 204);
        }
      });

      expect((await api.status()).required, isTrue);
      expect((await api.setup()).mfaToken, _mfaToken);
      final confirmed = await api.confirmSetup(mfaToken: _mfaToken, code: '123456');
      expect(confirmed.recoveryCodes, hasLength(2));
      expect(confirmed.accessToken, 'tok_access');
      expect(confirmed.refreshToken, 'tok_refresh');
      expect(confirmed.sessionRejection, isNull);
      expect(await api.regenerateRecoveryCodes('654321'), hasLength(2));
      final disabled = await api.disable(method: 'totp', code: '111111');
      expect(disabled.accessToken, 'tok_access');
      expect(disabled.refreshToken, 'tok_refresh');
      expect(disabled.sessionRejection, isNull);

      final calls = adapter.requests.map((r) => '${r.method} ${r.path} ${r.data}').toList();
      expect(calls, [
        'GET /auth/mfa/status null',
        'POST /auth/mfa/setup null',
        'POST /auth/mfa/confirm {mfaToken: $_mfaToken, code: 123456}',
        'POST /auth/mfa/recovery-codes/regenerate {code: 654321}',
        'POST /auth/mfa/disable {method: totp, code: 111111}',
      ]);
    });
  });
}

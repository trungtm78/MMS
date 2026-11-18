// Unit Tests: MfaError — second-factor failures as data (code, attempts left, whether the user has to
// sign in again), worded by mfaErrorText
// Codes: Web/backend/src/auth/mfa/mfa.service.ts (rejectCode, assertNotLocked, setup, disable,
// confirmEnrollment), mfa-challenge.service.ts (load), common/filters/http-exception.filter.ts
// (details, E006 for every 429)
// Run: flutter test test/unit_mfa_error_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/auth/auth_texts.dart';
import 'package:militian_app/features/auth/models/auth_response_exception.dart';
import 'package:militian_app/features/auth/models/mfa_error.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

DioException _dioError(int status, Object body) {
  final options = RequestOptions(path: '/auth/mfa/verify');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: status, data: body),
  );
}

MfaError _from(int status, String message, {Map<String, dynamic>? details}) =>
    MfaError.from(_dioError(status, backendError(status, message, details: details)));

void main() {
  group('MfaError.from backend codes', () {
    test('invalid_code with attempts remaining', () {
      final e = _from(401, 'invalid_code', details: {'attemptsRemaining': 3});
      expect(e.code, MfaError.invalidCode);
      expect(e.attemptsRemaining, 3);
      expect(e.restartLogin, isFalse);
      expect(mfaErrorText(viL10n, e), viL10n.errorMfaInvalidCodeAttempts(3));
    });

    test('invalid_code without details (management routes)', () {
      final e = _from(401, 'invalid_code');
      expect(e.attemptsRemaining, isNull);
      expect(e.restartLogin, isFalse);
      expect(mfaErrorText(viL10n, e), viL10n.errorMfaInvalidCode);
    });

    test('invalid_code with a non-numeric attemptsRemaining has no count', () {
      final e = _from(401, 'invalid_code', details: {'attemptsRemaining': 'three'});
      expect(e.attemptsRemaining, isNull);
      expect(mfaErrorText(viL10n, e), viL10n.errorMfaInvalidCode);
    });

    test('mfa_token_invalid restarts the sign-in', () {
      final e = _from(401, 'mfa_token_invalid');
      expect(e.code, MfaError.tokenInvalid);
      expect(e.restartLogin, isTrue);
      expect(mfaErrorText(viL10n, e), viL10n.errorMfaTokenInvalid);
    });

    test('mfa_attempts_exceeded restarts the sign-in', () {
      final e = _from(429, 'mfa_attempts_exceeded');
      expect(e.code, MfaError.attemptsExceeded);
      expect(e.restartLogin, isTrue);
      expect(mfaErrorText(viL10n, e), viL10n.errorMfaAttemptsExceeded);
    });

    test('mfa_locked restarts the sign-in', () {
      final e = _from(429, 'mfa_locked');
      expect(e.code, MfaError.locked);
      expect(e.restartLogin, isTrue);
      expect(mfaErrorText(viL10n, e), viL10n.errorMfaLocked);
    });

    test('429 from the throttler (E006) is throttling, not a lock', () {
      final e = _from(429, 'ThrottlerException: Too Many Requests');
      expect(e.code, MfaError.throttled);
      expect(e.restartLogin, isFalse);
      expect(mfaErrorText(viL10n, e), viL10n.errorStatusTooManyRequests);
    });

    test('management conflicts and refusals', () {
      final cases = {
        (409, 'mfa_already_enabled'): viL10n.errorMfaAlreadyEnabled,
        (409, 'mfa_not_enabled'): viL10n.errorMfaNotEnabled,
        (403, 'mfa_required_by_role'): viL10n.errorMfaRequiredByRole,
        (409, 'mfa_setup_not_started'): viL10n.errorMfaSetupNotStarted,
      };
      cases.forEach((key, text) {
        final e = _from(key.$1, key.$2);
        expect(e.code, key.$2);
        expect(e.restartLogin, isFalse, reason: key.$2);
        expect(mfaErrorText(viL10n, e), text, reason: key.$2);
      });
    });
  });

  group('MfaError.from anything else', () {
    test('validation errors keep the failed call for the error table', () {
      final e = MfaError.from(_dioError(400, {
        'code': 'E001',
        'message': 'validation_failed',
        'errors': ['code must be shorter than or equal to 64 characters'],
        'statusCode': 400,
      }));
      expect(e.code, 'validation_failed');
      expect(e.failure?.firstValidationError, 'code must be shorter than or equal to 64 characters');
      expect(e.restartLogin, isFalse);
      expect(mfaErrorText(viL10n, e),
          viL10n.errorValidationFailed('code must be shorter than or equal to 64 characters'));
    });

    test('network errors keep the failed call for the error table', () {
      final e = MfaError.from(DioException(
        requestOptions: RequestOptions(path: '/auth/mfa/verify'),
        type: DioExceptionType.connectionError,
      ));
      expect(e.code, 'unknown');
      expect(e.failure?.kind, FailureKind.connection);
      expect(e.restartLogin, isFalse);
      expect(mfaErrorText(viL10n, e), viL10n.errorNetworkConnection);
    });

    test('a refused session keeps its reason', () {
      final e = MfaError.from(const AuthResponseException(AuthResponseIssue.roleNotAllowed));
      expect(e.code, MfaError.sessionRejected);
      expect(e.issue, AuthResponseIssue.roleNotAllowed);
      expect(mfaErrorText(viL10n, e), viL10n.errorAuthRoleNotAllowed);
    });

    test('a screen opened without a challenge can only restart the sign-in', () {
      final e = MfaError.missingChallenge();
      expect(e.code, MfaError.tokenInvalid);
      expect(e.restartLogin, isTrue);
    });
  });
}

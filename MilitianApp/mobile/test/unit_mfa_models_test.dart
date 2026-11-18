// Unit Tests: MfaEnrollment and MfaStatus parsing
// Shapes: Web/backend/src/auth/mfa/mfa.service.ts (EnrollmentStart, status())
// Run: flutter test test/unit_mfa_models_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/auth/models/mfa_enrollment.dart';
import 'package:militian_app/features/auth/models/mfa_status.dart';

import 'helpers/fakes.dart';

void main() {
  group('MfaEnrollment.fromJson', () {
    test('reads the enrolment start body', () {
      final e = MfaEnrollment.fromJson(backendEnrollment());
      expect(e.mfaToken, testMfaToken);
      expect(e.secret, testTotpSecret);
      expect(e.otpauthUri, testOtpauthUri);
      expect(e.expiresAt, DateTime.utc(2026, 9, 14, 1, 10));
    });

    test('falls back to qrUri when otpauthUri is absent', () {
      final json = backendEnrollment()..remove('otpauthUri');
      expect(MfaEnrollment.fromJson(json).otpauthUri, testOtpauthUri);
    });

    test('a missing or malformed expiresAt is null', () {
      expect(MfaEnrollment.fromJson(backendEnrollment()..remove('expiresAt')).expiresAt, isNull);
      expect(MfaEnrollment.fromJson({...backendEnrollment(), 'expiresAt': 'soon'}).expiresAt, isNull);
    });

    test('a body without token, secret or URI is refused', () {
      for (final key in ['mfaToken', 'secret']) {
        expect(() => MfaEnrollment.fromJson(backendEnrollment()..remove(key)),
            throwsFormatException, reason: key);
      }
      expect(
        () => MfaEnrollment.fromJson(backendEnrollment()
          ..remove('otpauthUri')
          ..remove('qrUri')),
        throwsFormatException,
      );
    });
  });

  group('MfaStatus.fromJson', () {
    test('reads an enabled factor', () {
      final s = MfaStatus.fromJson({
        'enabled': true,
        'enrolledAt': '2026-09-01T05:00:00.000Z',
        'required': true,
        'recoveryCodesRemaining': 8,
      });
      expect(s.enabled, isTrue);
      expect(s.enrolledAt, DateTime.utc(2026, 9, 1, 5));
      expect(s.required, isTrue);
      expect(s.recoveryCodesRemaining, 8);
    });

    test('reads a disabled factor', () {
      final s = MfaStatus.fromJson({
        'enabled': false,
        'enrolledAt': null,
        'required': false,
        'recoveryCodesRemaining': 0,
      });
      expect(s.enabled, isFalse);
      expect(s.enrolledAt, isNull);
      expect(s.required, isFalse);
      expect(s.recoveryCodesRemaining, 0);
    });

    test('missing or mistyped fields fall back safely', () {
      final s = MfaStatus.fromJson({'enabled': 'yes', 'recoveryCodesRemaining': '8'});
      expect(s.enabled, isFalse);
      expect(s.required, isFalse);
      expect(s.recoveryCodesRemaining, 0);
      expect(s.enrolledAt, isNull);
    });
  });
}

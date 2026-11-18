// Unit Tests: form validators return a ValidationError (no text), and validationText words them.
// The new-password rule is the backend one (Web/backend/src/users/users.service.ts:201-206); see also
// UT-PWD-03 in unit_session_end_notifier_test.dart.
// Run: flutter test test/unit_validators_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/utils/validators.dart';
import 'package:militian_app/l10n/validation_texts.dart';

import 'helpers/l10n.dart';

void main() {
  test('UT-VAL-01: required fields', () {
    for (final blank in [null, '', '   ']) {
      expect(Validators.required(blank), ValidationError.required, reason: '"$blank"');
      expect(Validators.username(blank), ValidationError.required, reason: '"$blank"');
      expect(Validators.recoveryCode(blank), ValidationError.recoveryCodeRequired, reason: '"$blank"');
    }
    expect(Validators.required('x'), isNull);
    expect(Validators.password(null), ValidationError.required);
    expect(Validators.password(''), ValidationError.required);
    expect(Validators.newPassword(null), ValidationError.required);
    expect(Validators.otp(''), ValidationError.required);
    expect(Validators.recoveryCode('ABCDE-FGHJK'), isNull);
  });

  test('UT-VAL-02: length and format rules', () {
    expect(Validators.username(' ab '), ValidationError.usernameTooShort);
    expect(Validators.username('dqtv01'), isNull);
    expect(Validators.password('12345'), ValidationError.passwordTooShort);
    expect(Validators.password('123456'), isNull);
    for (final bad in ['12345', '1234567', '12a456']) {
      expect(Validators.otp(bad), ValidationError.otpFormat, reason: bad);
    }
    expect(Validators.otp('123456'), isNull);
  });

  test('UT-VAL-03: phone is optional but must be a Vietnamese number', () {
    expect(Validators.phone(null), isNull);
    expect(Validators.phone('  '), isNull);
    expect(Validators.phone('0901234567'), isNull);
    expect(Validators.phone('+84901234567'), isNull);
    expect(Validators.phone('12345'), ValidationError.phoneInvalid);
  });

  test('UT-VAL-04: every error has its text; no error, no text', () {
    final expected = {
      ValidationError.required: viL10n.validationRequired,
      ValidationError.usernameTooShort: viL10n.validationUsernameTooShort,
      ValidationError.passwordTooShort: viL10n.validationPasswordTooShort,
      ValidationError.newPasswordComplexity: viL10n.validationNewPasswordComplexity,
      ValidationError.otpFormat: viL10n.validationOtpFormat,
      ValidationError.recoveryCodeRequired: viL10n.validationRecoveryCodeRequired,
      ValidationError.phoneInvalid: viL10n.validationPhoneInvalid,
    };
    expect(expected.keys, containsAll(ValidationError.values));
    expected.forEach((error, text) => expect(validationText(viL10n, error), text, reason: '$error'));
    expect(validationText(viL10n, null), isNull);
  });
}

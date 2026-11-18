/// What is wrong with a form value. Worded by validationText (lib/l10n/validation_texts.dart).
enum ValidationError {
  required,
  usernameTooShort,
  passwordTooShort,
  newPasswordComplexity,
  otpFormat,
  recoveryCodeRequired,
  phoneInvalid,
}

class Validators {
  Validators._();

  static ValidationError? required(String? value) {
    if (value == null || value.trim().isEmpty) return ValidationError.required;
    return null;
  }

  static ValidationError? username(String? value) {
    if (value == null || value.trim().isEmpty) return ValidationError.required;
    if (value.trim().length < 3) return ValidationError.usernameTooShort;
    return null;
  }

  static ValidationError? password(String? value) {
    if (value == null || value.isEmpty) return ValidationError.required;
    if (value.length < 6) return ValidationError.passwordTooShort;
    return null;
  }

  /// The rule of POST /users/me/change-password (Web/backend/src/users/users.service.ts:201-206):
  /// 8+ characters with a lowercase and an uppercase letter, a digit and a special character.
  static final RegExp _passwordComplexity =
      RegExp(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$');

  static ValidationError? newPassword(String? value) {
    if (value == null || value.isEmpty) return ValidationError.required;
    if (!_passwordComplexity.hasMatch(value)) return ValidationError.newPasswordComplexity;
    return null;
  }

  static ValidationError? otp(String? value) {
    if (value == null || value.isEmpty) return ValidationError.required;
    if (!RegExp(r'^\d{6}$').hasMatch(value)) return ValidationError.otpFormat;
    return null;
  }

  /// Recovery codes go out as typed (the server ignores case, spaces and hyphens): only a blank one is
  /// refused here.
  static ValidationError? recoveryCode(String? value) {
    if (value == null || value.trim().isEmpty) return ValidationError.recoveryCodeRequired;
    return null;
  }

  static ValidationError? phone(String? value) {
    if (value == null || value.trim().isEmpty) return null; // optional
    if (!RegExp(r'^(0|\+84)\d{9,10}$').hasMatch(value.trim())) return ValidationError.phoneInvalid;
    return null;
  }
}

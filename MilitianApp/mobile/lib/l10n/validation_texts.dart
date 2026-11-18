import '../core/utils/validators.dart';
import 'app_localizations.dart';

/// Text for a validator result, or null when the value is valid. Adapts a validator to a form field:
/// `validator: (value) => validationText(l10n, Validators.username(value))`.
String? validationText(AppLocalizations l10n, ValidationError? error) => switch (error) {
      null => null,
      ValidationError.required => l10n.validationRequired,
      ValidationError.usernameTooShort => l10n.validationUsernameTooShort,
      ValidationError.passwordTooShort => l10n.validationPasswordTooShort,
      ValidationError.newPasswordComplexity => l10n.validationNewPasswordComplexity,
      ValidationError.otpFormat => l10n.validationOtpFormat,
      ValidationError.recoveryCodeRequired => l10n.validationRecoveryCodeRequired,
      ValidationError.phoneInvalid => l10n.validationPhoneInvalid,
    };

import '../models/login_request.dart';
import '../models/login_response.dart';
import '../models/mfa_enrollment.dart';
import '../models/mfa_status.dart';

/// Sign-in and second-factor calls (Web/backend/src/auth/auth.controller.ts,
/// src/auth/mfa/mfa.controller.ts). Failed calls surface as DioException (keep them as MfaError.from
/// or ApiFailure.from; the UI words them with lib/l10n/error_texts.dart); a response that may not
/// start a session in this app throws AuthResponseException with its AuthResponseIssue.
abstract class AuthRepository {
  /// POST /auth/login. Stores the session only for a SUCCESS response from a DQTV account.
  Future<LoginResponse> login(LoginRequest request);

  /// POST /auth/mfa/verify. Stores the session once the DQTV check passes.
  Future<LoginResponse> verifyMfa({
    required String mfaToken,
    required String method,
    required String code,
  });

  /// POST /auth/mfa/enroll: secret and otpauth URI for an MFA_SETUP_REQUIRED sign-in.
  Future<MfaEnrollment> enrollMfa(String mfaToken);

  /// POST /auth/mfa/enroll/confirm. Applies the DQTV check but stores nothing: the caller
  /// stores the session with [persistSession] once the recovery codes were acknowledged.
  Future<LoginResponse> confirmEnrollment({
    required String mfaToken,
    required String code,
  });

  /// Stores a SUCCESS response from a DQTV account; throws AuthResponseException otherwise.
  Future<void> persistSession(LoginResponse response);

  /// GET /auth/mfa/status
  Future<MfaStatus> mfaStatus();

  /// POST /auth/mfa/setup (409 mfa_already_enabled)
  Future<MfaEnrollment> setupMfa();

  /// POST /auth/mfa/confirm (Bearer) → {recoveryCodes, user, tokens}. Enabling MFA ends every
  /// earlier session, the caller's too (mfa.controller.ts:142-153, mfa.service.ts:338-361); the
  /// answer is the replacement session. Nothing is checked or stored here.
  Future<LoginResponse> confirmMfaSetup({
    required String mfaToken,
    required String code,
  });

  /// POST /auth/mfa/recovery-codes/regenerate with a TOTP code (409 mfa_not_enabled)
  Future<List<String>> regenerateRecoveryCodes(String code);

  /// POST /auth/mfa/disable → 204 (403 mfa_required_by_role, 409 mfa_not_enabled)
  Future<void> disableMfa({required String method, required String code});

  /// POST /users/me/change-password {currentPassword, newPassword} → 204; ends every session of
  /// the account (users.controller.ts:15-23, 42-47; users.service.ts:180-229).
  Future<void> changePassword({required String currentPassword, required String newPassword});

  Future<void> logout();
}

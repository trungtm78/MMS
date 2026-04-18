import '../models/login_request.dart';
import '../models/login_response.dart';
import '../models/mfa_setup_response.dart';

abstract class AuthRepository {
  Future<LoginResponse> login(LoginRequest request);
  Future<LoginResponse> verifyMfa({
    required String tempToken,
    required String otpCode,
  });
  Future<LoginResponse> verifyRecoveryCode({
    required String tempToken,
    required String recoveryCode,
  });
  Future<MfaSetupResponse> setupMfa({String? tempToken});
  Future<LoginResponse> confirmMfaSetup({
    required String tempToken,
    required String otpCode,
  });
  Future<void> logout();
}

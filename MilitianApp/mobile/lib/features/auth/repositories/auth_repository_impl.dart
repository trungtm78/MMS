import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage_service.dart';
import '../models/auth_response_exception.dart';
import '../models/json_fields.dart';
import '../models/login_request.dart';
import '../models/login_response.dart';
import '../models/mfa_enrollment.dart';
import '../models/mfa_status.dart';
import 'auth_repository.dart';

export '../models/auth_response_exception.dart';

class AuthRepositoryImpl implements AuthRepository {
  final Dio _dio;
  final SecureStorageService _storage;

  AuthRepositoryImpl(SecureStorageService storage, {Dio? dio})
      : _dio = dio ?? DioClient.getInstance(storage),
        _storage = storage;

  /// Validates that a fully-authenticated response has tokens + a DQTV user, then persists.
  /// Throws [AuthResponseException] instead of starting a session the app can't serve.
  Future<void> _persistTokens(LoginResponse r, {String? username}) async {
    final rejection = r.sessionRejection;
    if (rejection != null) throw AuthResponseException(rejection);
    // sessionRejection == null guarantees both tokens and user are present
    final user = r.user!;
    await _storage.saveAccessToken(r.accessToken!);
    await _storage.saveRefreshToken(r.refreshToken!);
    await _storage.saveUserId(user.id);
    await _storage.saveUserRoles(user.roles);
    await _storage.saveUsername(username ?? user.username);
  }

  static Map<String, dynamic> _body(Response<dynamic> response) {
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
  }

  static List<String> _recoveryCodes(Response<dynamic> response) {
    final codes = stringList(_body(response)['recoveryCodes']);
    if (codes.isEmpty) {
      // MFA is on at this point; the user can still create new codes from the security screen
      throw const AuthResponseException(AuthResponseIssue.recoveryCodesMissing);
    }
    return codes;
  }

  @override
  Future<LoginResponse> login(LoginRequest request) async {
    final response = await _dio.post(
      ApiConstants.login,
      data: request.toJson(),
    );
    final loginResponse = LoginResponse.fromJson(_body(response));
    // MFA_REQUIRED / MFA_SETUP_REQUIRED carry no tokens yet
    if (loginResponse.status == LoginStatus.success) {
      await _persistTokens(loginResponse, username: request.username);
    }
    return loginResponse;
  }

  @override
  Future<LoginResponse> verifyMfa({
    required String mfaToken,
    required String method,
    required String code,
  }) async {
    final response = await _dio.post(
      ApiConstants.verifyMfa,
      // The server normalizes recovery codes; send what the user typed
      data: {'mfaToken': mfaToken, 'method': method, 'code': code},
    );
    final loginResponse = LoginResponse.fromJson(_body(response));
    await _persistTokens(loginResponse);
    return loginResponse;
  }

  @override
  Future<MfaEnrollment> enrollMfa(String mfaToken) async {
    final response = await _dio.post(
      ApiConstants.mfaEnroll,
      data: {'mfaToken': mfaToken},
    );
    return MfaEnrollment.fromJson(_body(response));
  }

  @override
  Future<LoginResponse> confirmEnrollment({
    required String mfaToken,
    required String code,
  }) async {
    final response = await _dio.post(
      ApiConstants.mfaEnrollConfirm,
      data: {'mfaToken': mfaToken, 'code': code},
    );
    final loginResponse = LoginResponse.fromJson(_body(response));
    final rejection = loginResponse.sessionRejection;
    if (rejection != null) throw AuthResponseException(rejection);
    return loginResponse;
  }

  @override
  Future<void> persistSession(LoginResponse response) => _persistTokens(response);

  @override
  Future<MfaStatus> mfaStatus() async {
    final response = await _dio.get(ApiConstants.mfaStatus);
    return MfaStatus.fromJson(_body(response));
  }

  @override
  Future<MfaEnrollment> setupMfa() async {
    final response = await _dio.post(ApiConstants.setupMfa);
    return MfaEnrollment.fromJson(_body(response));
  }

  @override
  Future<LoginResponse> confirmMfaSetup({
    required String mfaToken,
    required String code,
  }) async {
    final response = await _dio.post(
      ApiConstants.confirmMfa,
      data: {'mfaToken': mfaToken, 'code': code},
    );
    // {recoveryCodes, user, tokens}: AuthNotifier checks and holds the replacement session
    return LoginResponse.fromJson(_body(response));
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _dio.post(
      ApiConstants.changePassword,
      data: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
  }

  @override
  Future<List<String>> regenerateRecoveryCodes(String code) async {
    final response = await _dio.post(
      ApiConstants.mfaRegenerateRecoveryCodes,
      data: {'code': code},
    );
    return _recoveryCodes(response);
  }

  @override
  Future<void> disableMfa({required String method, required String code}) async {
    await _dio.post(
      ApiConstants.mfaDisable,
      data: {'method': method, 'code': code},
    );
  }

  @override
  Future<void> logout() async {
    try {
      await _dio.post(ApiConstants.logout);
    } catch (e) {
      // The local session is cleared regardless; the server session expires on its own
      debugPrint('[Auth] POST ${ApiConstants.logout} failed, local session cleared anyway: $e');
    } finally {
      await _storage.clearTokens();
    }
  }
}

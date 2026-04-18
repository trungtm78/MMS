import 'package:dio/dio.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage_service.dart';
import '../models/login_request.dart';
import '../models/login_response.dart';
import '../models/mfa_setup_response.dart';
import 'auth_repository.dart';

class AuthRepositoryImpl implements AuthRepository {
  final Dio _dio;
  final SecureStorageService _storage;

  AuthRepositoryImpl(SecureStorageService storage)
      : _dio = DioClient.getInstance(storage),
        _storage = storage;

  @override
  Future<LoginResponse> login(LoginRequest request) async {
    final response = await _dio.post(
      ApiConstants.login,
      data: request.toJson(),
    );
    final loginResponse = LoginResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
    // If fully authenticated, persist tokens
    if (!loginResponse.requiresMfa && !loginResponse.requiresMfaSetup) {
      await _storage.saveAccessToken(loginResponse.accessToken!);
      await _storage.saveRefreshToken(loginResponse.refreshToken!);
      await _storage.saveUserId(loginResponse.user!.id);
      await _storage.saveUsername(request.username);
    }
    return loginResponse;
  }

  @override
  Future<LoginResponse> verifyMfa({
    required String tempToken,
    required String otpCode,
  }) async {
    final response = await _dio.post(
      ApiConstants.verifyMfa,
      data: {'tempToken': tempToken, 'code': otpCode},
    );
    final loginResponse = LoginResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
    await _storage.saveAccessToken(loginResponse.accessToken!);
    await _storage.saveRefreshToken(loginResponse.refreshToken!);
    if (loginResponse.user != null) {
      await _storage.saveUserId(loginResponse.user!.id);
    }
    return loginResponse;
  }

  @override
  Future<LoginResponse> verifyRecoveryCode({
    required String tempToken,
    required String recoveryCode,
  }) async {
    final response = await _dio.post(
      ApiConstants.verifyRecovery,
      data: {'tempToken': tempToken, 'recoveryCode': recoveryCode},
    );
    final loginResponse = LoginResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
    await _storage.saveAccessToken(loginResponse.accessToken!);
    await _storage.saveRefreshToken(loginResponse.refreshToken!);
    if (loginResponse.user != null) {
      await _storage.saveUserId(loginResponse.user!.id);
    }
    return loginResponse;
  }

  @override
  Future<MfaSetupResponse> setupMfa({String? tempToken}) async {
    // When initial setup (no access token yet), pass tempToken as bearer override
    final options = tempToken != null
        ? Options(headers: {'Authorization': 'Bearer $tempToken'})
        : null;
    final response = await _dio.post(ApiConstants.setupMfa, options: options);
    return MfaSetupResponse.fromJson(response.data as Map<String, dynamic>);
  }

  @override
  Future<LoginResponse> confirmMfaSetup({
    required String tempToken,
    required String otpCode,
  }) async {
    final response = await _dio.post(
      '${ApiConstants.setupMfa}/confirm',
      data: {'tempToken': tempToken, 'code': otpCode},
    );
    final loginResponse = LoginResponse.fromJson(
      response.data as Map<String, dynamic>,
    );
    await _storage.saveAccessToken(loginResponse.accessToken!);
    await _storage.saveRefreshToken(loginResponse.refreshToken!);
    if (loginResponse.user != null) {
      await _storage.saveUserId(loginResponse.user!.id);
    }
    return loginResponse;
  }

  @override
  Future<void> logout() async {
    try {
      await _dio.post(ApiConstants.logout);
    } catch (_) {
      // ignore — clear local tokens regardless
    } finally {
      await _storage.clearTokens();
    }
  }
}

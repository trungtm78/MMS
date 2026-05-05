import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

import '../../../core/storage/secure_storage_service.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/utils/jwt_utils.dart';
import '../models/auth_models.dart';

// ─── Providers ───────────────────────────────────────────────────────────────

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

final dioProvider = Provider<Dio>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return DioClient.getInstance(storage);
});

// ─── Auth State ──────────────────────────────────────────────────────────────

class AuthState {
  final bool isAuthenticated;
  final UserInfo? user;
  final String role; // 'ca' | 'dqtv' | ''
  final bool isLoading;
  final String? error;

  const AuthState({
    this.isAuthenticated = false,
    this.user,
    this.role = '',
    this.isLoading = false,
    this.error,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    UserInfo? user,
    String? role,
    bool? isLoading,
    String? error,
  }) =>
      AuthState(
        isAuthenticated: isAuthenticated ?? this.isAuthenticated,
        user: user ?? this.user,
        role: role ?? this.role,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class AuthNotifier extends StateNotifier<AuthState> {
  final SecureStorageService _storage;
  final Dio _dio;

  AuthNotifier(this._storage, this._dio) : super(const AuthState()) {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final token = await _storage.getAccessToken();
    if (token == null) return;

    // Reject expired tokens client-side; server is still source of truth.
    if (isJwtExpired(token)) {
      final refresh = await _storage.getRefreshToken();
      if (refresh == null) {
        await _storage.clearTokens();
        return;
      }
    }

    final role = await _storage.getUserRole();
    state = state.copyWith(isAuthenticated: true, role: role ?? '');
  }

  /// Returns null on success; returns LoginResponse when MFA needed
  Future<LoginResponse?> login(String username, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _dio.post(
        ApiConstants.login,
        data: {'username': username, 'password': password},
      );
      final loginResponse = LoginResponse.fromJson(response.data as Map<String, dynamic>);

      if (loginResponse.requiresMfa || loginResponse.requiresMfaSetup) {
        state = state.copyWith(isLoading: false);
        return loginResponse;
      }

      await _persistAuth(loginResponse);
      return null;
    } on DioException catch (e) {
      final msg = _extractDioError(e);
      state = state.copyWith(isLoading: false, error: msg);
      return null;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return null;
    }
  }

  Future<bool> verifyMfa({required String tempToken, required String otpCode}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _dio.post(
        ApiConstants.verifyMfa,
        data: {'tempToken': tempToken, 'code': otpCode},
      );
      final loginResponse = LoginResponse.fromJson(response.data as Map<String, dynamic>);
      await _persistAuth(loginResponse);
      return true;
    } on DioException catch (e) {
      state = state.copyWith(isLoading: false, error: _extractDioError(e));
      return false;
    }
  }

  Future<bool> verifyRecoveryCode({required String tempToken, required String recoveryCode}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _dio.post(
        ApiConstants.verifyRecovery,
        data: {'tempToken': tempToken, 'recoveryCode': recoveryCode},
      );
      final loginResponse = LoginResponse.fromJson(response.data as Map<String, dynamic>);
      await _persistAuth(loginResponse);
      return true;
    } on DioException catch (e) {
      state = state.copyWith(isLoading: false, error: _extractDioError(e));
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post(ApiConstants.logout);
    } catch (_) {}
    await _storage.clearTokens();
    DioClient.reset();
    state = const AuthState();
  }

  Future<void> _persistAuth(LoginResponse loginResponse) async {
    if (loginResponse.accessToken != null) {
      await _storage.saveAccessToken(loginResponse.accessToken!);
    }
    if (loginResponse.refreshToken != null) {
      await _storage.saveRefreshToken(loginResponse.refreshToken!);
    }
    if (loginResponse.user != null) {
      await _storage.saveUserId(loginResponse.user!.id);
      await _storage.saveUserRole(loginResponse.user!.appRole);
      await _storage.saveUsername(loginResponse.user!.username);
    }
    state = state.copyWith(
      isAuthenticated: true,
      user: loginResponse.user,
      role: loginResponse.user?.appRole ?? '',
      isLoading: false,
    );
  }

  String _extractDioError(DioException e) {
    final data = e.response?.data;
    if (data is Map) {
      final msg = data['message'] ?? data['error']?['message'];
      if (msg != null) return msg.toString();
    }
    return e.message ?? 'Đã có lỗi xảy ra';
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final storage = ref.watch(secureStorageProvider);
  final dio = ref.watch(dioProvider);
  return AuthNotifier(storage, dio);
});

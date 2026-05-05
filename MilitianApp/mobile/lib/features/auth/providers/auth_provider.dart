import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/secure_storage_service.dart';
import '../../../shared/utils/jwt_utils.dart';
import '../models/login_request.dart';
import '../models/login_response.dart';
import '../repositories/auth_repository.dart';
import '../repositories/auth_repository_impl.dart';

// --- Providers ---

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return AuthRepositoryImpl(storage);
});

// Auth state
class AuthState {
  final bool isAuthenticated;
  final UserInfo? user;
  final bool isLoading;
  final String? error;

  const AuthState({
    this.isAuthenticated = false,
    this.user,
    this.isLoading = false,
    this.error,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    UserInfo? user,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repo;
  final SecureStorageService _storage;

  AuthNotifier(this._repo, this._storage) : super(const AuthState()) {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final token = await _storage.getAccessToken();
    if (token == null) return;

    // Reject expired tokens client-side; server is still source of truth
    // but this prevents users from landing on protected screens with a dead token.
    if (isJwtExpired(token)) {
      // If we have a refresh token, the AuthInterceptor will refresh on first 401.
      // If not, force re-login by clearing.
      final refresh = await _storage.getRefreshToken();
      if (refresh == null) {
        await _storage.clearAll();
        return;
      }
    }

    state = state.copyWith(isAuthenticated: true);
  }

  Future<void> refreshAuthState() => _checkAuth();

  // Returns null on success; returns a LoginResponse when MFA needed
  Future<LoginResponse?> login(String username, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repo.login(
        LoginRequest(username: username, password: password),
      );
      if (response.requiresMfa || response.requiresMfaSetup) {
        state = state.copyWith(isLoading: false);
        return response; // caller navigates to OTP or MFA setup
      }
      state = state.copyWith(
        isAuthenticated: true,
        user: response.user,
        isLoading: false,
      );
      return null;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: _extractError(e));
      return null;
    }
  }

  Future<bool> verifyMfa({
    required String tempToken,
    required String otpCode,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repo.verifyMfa(
        tempToken: tempToken,
        otpCode: otpCode,
      );
      state = state.copyWith(
        isAuthenticated: true,
        user: response.user,
        isLoading: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: _extractError(e));
      return false;
    }
  }

  Future<bool> verifyRecoveryCode({
    required String tempToken,
    required String recoveryCode,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repo.verifyRecoveryCode(
        tempToken: tempToken,
        recoveryCode: recoveryCode,
      );
      state = state.copyWith(
        isAuthenticated: true,
        user: response.user,
        isLoading: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: _extractError(e));
      return false;
    }
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState();
  }

  String _extractError(Object e) {
    if (e is Exception) return e.toString().replaceAll('Exception: ', '');
    return e.toString();
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final repo = ref.watch(authRepositoryProvider);
  final storage = ref.watch(secureStorageProvider);
  return AuthNotifier(repo, storage);
});

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

import '../../../core/storage/secure_storage_service.dart';
import '../../../core/network/auth_interceptor.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/network/session_events.dart';
import '../../../core/network/token_refresher.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/errors/app_failure.dart';
import '../models/auth_models.dart';
import '../models/mfa_error.dart';
import 'mfa_provider.dart';

// ─── Providers ───────────────────────────────────────────────────────────────

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

final dioProvider = Provider<Dio>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return DioClient.getInstance(storage, sessionEvents: ref.watch(sessionEventsProvider));
});

/// Token renewal for the chat socket, shared with the HTTP 401 handling so both never refresh
/// twice. Without the auth interceptor (tests with a plain Dio) nothing can be renewed.
final renewSessionProvider = Provider<RenewSession>((ref) {
  final refresher =
      ref.watch(dioProvider).interceptors.whereType<AuthInterceptor>().firstOrNull?.refresher;
  if (refresher != null) return refresher.renew;
  return ({String? staleAccessToken}) async => null;
});

// ─── Auth State ──────────────────────────────────────────────────────────────

class AuthState {
  final bool isAuthenticated;
  final UserInfo? user;
  final String role; // 'ca' | 'dqtv' | ''
  final bool isLoading;

  /// Why the last sign-in step failed (text: lib/l10n/failure_texts.dart)
  final AppFailure? error;

  /// Why the previous session ended, shown on the login screen until the next sign-in attempt
  final AppFailure? notice;

  const AuthState({
    this.isAuthenticated = false,
    this.user,
    this.role = '',
    this.isLoading = false,
    this.error,
    this.notice,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    UserInfo? user,
    String? role,
    bool? isLoading,
    AppFailure? error,
    AppFailure? notice,
  }) =>
      AuthState(
        isAuthenticated: isAuthenticated ?? this.isAuthenticated,
        user: user ?? this.user,
        role: role ?? this.role,
        isLoading: isLoading ?? this.isLoading,
        error: error,
        notice: notice,
      );
}

/// Result of a second-factor step
class MfaAttempt {
  final bool success;
  final MfaError? error;

  /// Enrolment during sign-in: the one-time codes to show before the home screen
  final List<String> recoveryCodes;

  /// Sign-in with a recovery code: how many are left
  final int? recoveryCodesRemaining;

  const MfaAttempt({
    this.success = false,
    this.error,
    this.recoveryCodes = const [],
    this.recoveryCodesRemaining,
  });
}

class AuthNotifier extends StateNotifier<AuthState> {
  final SecureStorageService _storage;
  final Dio _dio;
  late final MfaApi _mfa = MfaApi(_dio);

  /// Session from a completed enrolment, held until the recovery codes are acknowledged
  LoginResponse? _pendingSession;

  /// Bearer POST /auth/mfa/disable is out: the server ends every earlier session and answers the
  /// replacement, so the end of the earlier one is not a sign-out
  bool _replacingSession = false;

  StreamSubscription<SessionEnd>? _sessionEnds;

  /// Completes once a stored session, if any, has been restored
  late final Future<void> ready;

  AuthNotifier(this._storage, this._dio, {SessionEvents? sessionEvents}) : super(const AuthState()) {
    _sessionEnds = sessionEvents?.stream.listen(_onSessionEnded);
    ready = _checkAuth();
  }

  @override
  void dispose() {
    _sessionEnds?.cancel();
    super.dispose();
  }

  /// The refresh was refused (or the session is otherwise over): sign out and say why
  void _onSessionEnded(SessionEnd end) {
    // Enabling or disabling MFA ended the old session on purpose: the replacement held for the recovery
    // codes starts on acknowledgement, the one disabling answers is stored at once
    if (_pendingSession != null || _replacingSession) return;
    if (!state.isAuthenticated) return;
    _endSession(end.failure);
  }

  Future<void> _endSession(AppFailure notice) async {
    _pendingSession = null;
    // Signed out first, so a late session event for the same end is ignored
    state = AuthState(notice: notice);
    await _storage.clearTokens();
  }

  Future<void> _checkAuth() async {
    final token = await _storage.getAccessToken();
    if (token == null) return;

    // A stored session needs both tokens. An expired access token is fine:
    // the interceptor renews it on the first 401 using the refresh token.
    final refresh = await _storage.getRefreshToken();
    if (token.trim().isEmpty || refresh == null || refresh.trim().isEmpty) {
      await _storage.clearTokens();
      return;
    }

    // Sessions stored without an app role (e.g. by older builds) must log in again
    final role = await _storage.getUserRole();
    if (role != 'ca' && role != 'dqtv') {
      await _storage.clearTokens();
      return;
    }
    state = state.copyWith(isAuthenticated: true, role: role);
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
    } catch (e) {
      // 401 invalid_credentials, 403 account_disabled / account_locked / no_role_assigned, 429
      state = state.copyWith(isLoading: false, error: AppFailure.fromLogin(e));
      return null;
    }
  }

  /// POST /auth/mfa/verify for an MFA_REQUIRED challenge. The CA/DQTV gate applies to the
  /// signed-in user exactly as for a password-only login.
  Future<MfaAttempt> verifyMfa({
    required String mfaToken,
    required String method,
    required String code,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _mfa.verify(mfaToken: mfaToken, method: method, code: code);
      if (!await _persistAuth(response)) {
        return MfaAttempt(
          error: MfaError(state.error ?? const AppFailure(AppFailure.sessionStartFailed), restartLogin: true),
        );
      }
      return MfaAttempt(success: true, recoveryCodesRemaining: response.recoveryCodesRemaining);
    } catch (e) {
      return _mfaFailure(MfaError.from(e));
    }
  }

  /// POST /auth/mfa/enroll/confirm for an MFA_SETUP_REQUIRED challenge. On success the
  /// session is held (nothing stored, not signed in) until [acknowledgeRecoveryCodes], so
  /// the recovery codes are seen before the home screen.
  Future<MfaAttempt> confirmEnrollment({required String mfaToken, required String code}) async {
    state = state.copyWith(isLoading: true, error: null);
    _pendingSession = null;
    try {
      final response = await _mfa.confirmEnrollment(mfaToken: mfaToken, code: code);
      final rejection = response.sessionRejection;
      if (rejection != null) {
        await _storage.clearTokens();
        return _mfaFailure(MfaError(rejection, restartLogin: true));
      }
      _pendingSession = response;
      state = state.copyWith(isLoading: false);
      return MfaAttempt(success: true, recoveryCodes: response.recoveryCodes);
    } catch (e) {
      return _mfaFailure(MfaError.from(e));
    }
  }

  /// POST /auth/mfa/confirm from a signed-in session. Enabling MFA ends every earlier session of
  /// the account, this one included (Web/backend/src/auth/mfa/mfa.service.ts:338-356). The
  /// replacement session is held, as after enrolment during sign-in, until
  /// [acknowledgeRecoveryCodes]; the current state is left untouched meanwhile.
  Future<MfaAttempt> confirmSetup({required String mfaToken, required String code}) async {
    _pendingSession = null;
    try {
      final response = await _mfa.confirmSetup(mfaToken: mfaToken, code: code);
      _pendingSession = response;
      return MfaAttempt(success: true, recoveryCodes: response.recoveryCodes);
    } catch (e) {
      return MfaAttempt(error: MfaError.from(e));
    }
  }

  /// POST /auth/mfa/disable from a signed-in session. Disabling MFA ends every session of the account,
  /// this one included, and the answer carries the caller's replacement (mfa.service.ts disable), stored
  /// at once so the user stays signed in. Session ends reported while the call is out belong to the
  /// earlier session and are ignored. Returns why it failed, or null once MFA is off.
  Future<MfaError?> disableMfa({required String method, required String code}) async {
    _replacingSession = true;
    try {
      final LoginResponse response;
      try {
        response = await _mfa.disable(method: method, code: code);
      } catch (e) {
        // Refused (wrong code, required by role): nothing changed and the current session stays
        return MfaError.from(e);
      }
      final rejection = response.sessionRejection;
      if (rejection != null) {
        // MFA is off and every session gone, but this answer cannot start one here
        await _endSession(rejection);
        return MfaError(rejection, restartLogin: true);
      }
      try {
        await _persistAuth(response);
      } catch (e) {
        debugPrint('Replacement session could not be stored: $e');
        const failure = AppFailure(AppFailure.sessionStartFailed);
        await _endSession(failure);
        return const MfaError(failure, restartLogin: true);
      }
      return null;
    } finally {
      _replacingSession = false;
    }
  }

  /// Starts the session held since enrolment, once the recovery codes were acknowledged
  Future<void> acknowledgeRecoveryCodes() async {
    final session = _pendingSession;
    if (session == null) return;
    _pendingSession = null;
    // Signed in already (MFA enabled from the security screen): the old session is gone either way
    final rejection = session.sessionRejection;
    if (state.isAuthenticated && rejection != null) {
      await _endSession(rejection);
      return;
    }
    await _persistAuth(session);
  }

  /// POST /users/me/change-password. Success ends every session of the account, this one included
  /// (Web/backend/src/users/users.service.ts:180-183), so the user signs in with the new password.
  /// Returns null on success, otherwise why it was refused.
  Future<AppFailure?> changePassword({required String currentPassword, required String newPassword}) async {
    try {
      await _dio.post(
        ApiConstants.changePassword,
        data: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );
    } catch (e) {
      final failure = AppFailure.from(e);
      // invalid_credentials on this route means the current password, not the account
      return failure.code == 'invalid_credentials'
          ? AppFailure(AppFailure.currentPasswordInvalid, status: failure.status)
          : failure;
    }
    await _endSession(const AppFailure(AppFailure.passwordChanged));
    return null;
  }

  MfaAttempt _mfaFailure(MfaError error) {
    state = state.copyWith(isLoading: false, error: error.failure);
    return MfaAttempt(error: error);
  }

  Future<void> logout() async {
    try {
      await _dio.post(ApiConstants.logout);
    } catch (e) {
      // The server session may already be gone; the local sign-out below still happens
      debugPrint('Logout request failed: ${AppFailure.from(e)}');
    }
    await _storage.clearTokens();
    DioClient.reset();
    state = const AuthState();
  }

  /// Starts a session only for complete responses from CA/DQTV accounts.
  /// Returns false, with [AuthState.error] set, when the response is rejected.
  Future<bool> _persistAuth(LoginResponse loginResponse) async {
    final rejection = loginResponse.sessionRejection;
    if (rejection != null) {
      await _storage.clearTokens();
      state = state.copyWith(isAuthenticated: false, isLoading: false, error: rejection);
      return false;
    }
    // sessionRejection == null guarantees both tokens and user are present
    final user = loginResponse.user!;
    await _storage.saveAccessToken(loginResponse.accessToken!);
    await _storage.saveRefreshToken(loginResponse.refreshToken!);
    await _storage.saveUserId(user.id);
    await _storage.saveUserRole(user.appRole);
    await _storage.saveUsername(user.username);
    state = state.copyWith(
      isAuthenticated: true,
      user: user,
      role: user.appRole,
      isLoading: false,
    );
    return true;
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final storage = ref.watch(secureStorageProvider);
  final dio = ref.watch(dioProvider);
  return AuthNotifier(storage, dio, sessionEvents: ref.watch(sessionEventsProvider));
});

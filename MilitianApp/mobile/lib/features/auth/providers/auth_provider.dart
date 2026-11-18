import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../../../core/network/session_events.dart';
import '../../../core/storage/secure_storage_service.dart';
import '../../../shared/utils/api_failure.dart';
import '../models/auth_error.dart';
import '../models/login_request.dart';
import '../models/login_response.dart';
import '../models/mfa_error.dart';
import '../repositories/auth_repository.dart';
import '../repositories/auth_repository_impl.dart';

// --- Providers ---

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return SecureStorageService();
});

/// The app's authenticated Dio (Bearer token, shared token refresher). Screens that call the API
/// directly read it here so tests can put a fake behind it.
final apiDioProvider = Provider<Dio>((ref) {
  return DioClient.getInstance(ref.watch(secureStorageProvider));
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

  /// Why the last sign-in step failed; the login screen words it with authErrorText.
  final AuthError? error;

  /// Why the user was signed out without asking (session ended, password changed), for the login
  /// screen's notice (sessionEndText). Cleared by the next state change.
  final SessionEndReason? notice;

  const AuthState({
    this.isAuthenticated = false,
    this.user,
    this.isLoading = false,
    this.error,
    this.notice,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    UserInfo? user,
    bool? isLoading,
    AuthError? error,
    SessionEndReason? notice,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      notice: notice,
    );
  }
}

/// Outcome of a second-factor step, for the screen that asked.
class MfaAttempt {
  final bool success;
  final MfaError? error;

  /// New recovery codes to show once (enrolment during sign-in, or enabling MFA when signed in).
  final List<String> recoveryCodes;

  /// Unused recovery codes left after signing in with one.
  final int? recoveryCodesRemaining;

  const MfaAttempt.succeeded({this.recoveryCodes = const [], this.recoveryCodesRemaining})
      : success = true,
        error = null;

  const MfaAttempt.failed(MfaError this.error)
      : success = false,
        recoveryCodes = const [],
        recoveryCodesRemaining = null;
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repo;
  final SecureStorageService _storage;
  StreamSubscription<SessionEnd>? _sessionEnds;

  /// A session the server issued that waits for its recovery codes to be acknowledged: enrolment
  /// during sign-in, or the replacement session of Bearer POST /auth/mfa/confirm.
  LoginResponse? _pendingSession;

  /// Bearer POST /auth/mfa/disable is out: the server ends every earlier session and answers the
  /// replacement, so the end of the earlier one is not a sign-out.
  bool _replacingSession = false;

  /// Completes once the stored session has been checked on start: restored, discarded or absent (it
  /// completes with the storage error if the check failed). The splash screen waits for it instead of
  /// guessing how long secure storage takes.
  late final Future<void> ready;

  AuthNotifier(this._repo, this._storage, {SessionEvents? events}) : super(const AuthState()) {
    _sessionEnds = events?.stream.listen(_onSessionEnded);
    ready = _checkAuth();
  }

  @override
  void dispose() {
    _sessionEnds?.cancel();
    super.dispose();
  }

  /// A refused refresh cleared the stored tokens: sign out and say why on the login screen. While a
  /// replacement session is held, the session that ended is the earlier one; acknowledging the
  /// recovery codes stores the new one.
  void _onSessionEnded(SessionEnd end) {
    if (!mounted || _pendingSession != null || _replacingSession || !state.isAuthenticated) return;
    state = AuthState(notice: end.reason);
  }

  Future<void> _checkAuth() async {
    final token = await _storage.getAccessToken();
    if (token == null) return;

    // A stored session needs both tokens. An expired access token is fine:
    // the AuthInterceptor renews it on the first 401 using the refresh token.
    final refresh = await _storage.getRefreshToken();
    if (token.trim().isEmpty || refresh == null || refresh.trim().isEmpty) {
      await _storage.clearTokens();
      return;
    }

    // Sessions stored without a DQTV role (older builds, other accounts) must log in again
    if (!UserInfo.hasMilitiaRole(await _storage.getUserRoles())) {
      await _storage.clearTokens();
      return;
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
      // 401 invalid_credentials / invalid_otp, 403 account_disabled / account_locked /
      // no_role_assigned, 429 (Web/backend/src/auth/auth.service.ts, app.module.ts ThrottlerGuard)
      state = state.copyWith(isLoading: false, error: _authError(e));
      return null;
    }
  }

  /// POST /auth/mfa/verify for an MFA_REQUIRED sign-in. On success the session is stored
  /// and the user is authenticated.
  Future<MfaAttempt> verifyMfa({
    required String mfaToken,
    required String method,
    required String code,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repo.verifyMfa(mfaToken: mfaToken, method: method, code: code);
      _authenticate(response);
      return MfaAttempt.succeeded(recoveryCodesRemaining: response.recoveryCodesRemaining);
    } catch (e) {
      return _mfaFailed(e);
    }
  }

  /// POST /auth/mfa/enroll/confirm for an MFA_SETUP_REQUIRED sign-in. On success the session
  /// stays pending (nothing stored, not authenticated) until [acknowledgeRecoveryCodes], so
  /// the user sees the recovery codes before entering the app.
  Future<MfaAttempt> confirmEnrollment({
    required String mfaToken,
    required String code,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    _pendingSession = null;
    try {
      final response = await _repo.confirmEnrollment(mfaToken: mfaToken, code: code);
      _pendingSession = response;
      state = state.copyWith(isLoading: false);
      return MfaAttempt.succeeded(recoveryCodes: response.recoveryCodes);
    } catch (e) {
      return _mfaFailed(e);
    }
  }

  /// Bearer POST /auth/mfa/confirm while signed in. Enabling MFA ends every earlier session, this
  /// one too, and the answer carries the replacement (mfa.service.ts:338-361). Like enrolment during
  /// sign-in, the replacement is held until [acknowledgeRecoveryCodes]; session ends reported
  /// meanwhile belong to the earlier session and are ignored.
  Future<MfaAttempt> confirmMfaSetup({
    required String mfaToken,
    required String code,
  }) async {
    _pendingSession = null;
    final LoginResponse response;
    try {
      response = await _repo.confirmMfaSetup(mfaToken: mfaToken, code: code);
    } catch (e) {
      // Refused (wrong code, expired setup): nothing changed and the current session stays
      return MfaAttempt.failed(MfaError.from(e));
    }

    final rejection = response.sessionRejection;
    if (rejection != null) {
      // MFA is on and the earlier sessions are gone, but this answer cannot start one here
      return _endReplacedSession(AuthResponseError(rejection));
    }
    if (response.recoveryCodes.isEmpty) {
      // Nothing to acknowledge: keep the user signed in with the new session
      try {
        await _repo.persistSession(response);
      } catch (e) {
        return _endReplacedSession(_authError(e));
      }
      _authenticate(response);
      return const MfaAttempt.failed(MfaError(code: MfaError.recoveryCodesMissing));
    }
    _pendingSession = response;
    return MfaAttempt.succeeded(recoveryCodes: response.recoveryCodes);
  }

  /// Bearer POST /auth/mfa/disable while signed in. Disabling MFA ends every session of the account,
  /// this one too, and the answer carries the caller's replacement (mfa.service.ts disable), stored at
  /// once so the user stays signed in. Session ends reported while the call is out belong to the
  /// earlier session and are ignored. Returns why it failed, or null once MFA is off.
  Future<MfaError?> disableMfa({required String method, required String code}) async {
    _replacingSession = true;
    try {
      final LoginResponse response;
      try {
        response = await _repo.disableMfa(method: method, code: code);
      } catch (e) {
        // Refused (wrong code, required by role): nothing changed and the current session stays
        return MfaError.from(e);
      }
      final rejection = response.sessionRejection;
      if (rejection != null) {
        // MFA is off and every session gone, but this answer cannot start one here
        return (await _endReplacedSession(AuthResponseError(rejection))).error;
      }
      try {
        await _repo.persistSession(response);
      } catch (e) {
        return (await _endReplacedSession(_authError(e))).error;
      }
      _authenticate(response);
      return null;
    } finally {
      _replacingSession = false;
    }
  }

  Future<MfaAttempt> _endReplacedSession(AuthError error) async {
    _pendingSession = null;
    await _storage.clearTokens();
    state = AuthState(error: error);
    return MfaAttempt.failed(MfaError(
      code: MfaError.sessionRejected,
      restartLogin: true,
      issue: error is AuthResponseError ? error.issue : null,
      failure: error is AuthRequestError ? error.failure : null,
    ));
  }

  /// Stores the session held back by [confirmEnrollment] or [confirmMfaSetup]. Does nothing
  /// without one.
  Future<void> acknowledgeRecoveryCodes() async {
    final pending = _pendingSession;
    if (pending == null) return;
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repo.persistSession(pending);
      _pendingSession = null;
      _authenticate(pending);
    } catch (e) {
      // The held session cannot be used and any earlier one already ended: sign in again
      _pendingSession = null;
      await _storage.clearTokens();
      state = AuthState(error: _authError(e));
    }
  }

  /// POST /users/me/change-password. A successful change ends every session of the account, this
  /// one too (users.service.ts:180-229): the tokens are cleared and the login screen says so.
  /// Returns the refused call (worded with ErrorFlow.changePassword), or null once it is done.
  Future<ApiFailure?> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _repo.changePassword(currentPassword: currentPassword, newPassword: newPassword);
    } catch (e) {
      return ApiFailure.from(e);
    }
    _pendingSession = null;
    await _storage.clearTokens();
    state = const AuthState(notice: SessionEndReason.passwordChanged);
    return null;
  }

  Future<void> logout() async {
    _pendingSession = null;
    await _repo.logout();
    state = const AuthState();
  }

  void _authenticate(LoginResponse response) {
    state = state.copyWith(
      isAuthenticated: true,
      user: response.user,
      isLoading: false,
    );
  }

  MfaAttempt _mfaFailed(Object e) {
    // The server already accepted the code, so the challenge is used up: a session this app
    // refuses (non-DQTV account, incomplete tokens) can only be followed by a new sign-in
    final error = e is AuthResponseException
        ? MfaError(code: MfaError.sessionRejected, issue: e.issue, restartLogin: true)
        : MfaError.from(e);
    state = state.copyWith(isLoading: false, error: AuthMfaError(error));
    return MfaAttempt.failed(error);
  }

  /// A failed sign-in step as data: a refused answer keeps its issue, anything else the failed call.
  static AuthError _authError(Object e) =>
      e is AuthResponseException ? AuthResponseError(e.issue) : AuthRequestError(ApiFailure.from(e));
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final repo = ref.watch(authRepositoryProvider);
  final storage = ref.watch(secureStorageProvider);
  return AuthNotifier(repo, storage, events: ref.watch(sessionEventsProvider));
});

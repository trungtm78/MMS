import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../models/auth_models.dart';
import 'auth_provider.dart';

/// Second-factor routes (Web/backend/src/auth/mfa/mfa.controller.ts, contract T15).
/// Errors are rethrown as [DioException]; show them with MfaError.from().
class MfaApi {
  MfaApi(this._dio);

  final Dio _dio;

  // ─── Sign-in (public, driven by the mfaToken from POST /auth/login) ────────

  /// POST /auth/mfa/verify {mfaToken, method, code}. A recovery code is sent as typed;
  /// the server normalizes case, spaces and the hyphen.
  Future<LoginResponse> verify({
    required String mfaToken,
    required String method,
    required String code,
  }) async {
    final res = await _dio.post(
      ApiConstants.verifyMfa,
      data: {'mfaToken': mfaToken, 'method': method, 'code': code},
    );
    return LoginResponse.fromJson(_object(res.data));
  }

  /// POST /auth/mfa/enroll {mfaToken} → secret and otpauth URI for MFA_SETUP_REQUIRED
  Future<MfaEnrollment> enroll(String mfaToken) async {
    final res = await _dio.post(ApiConstants.mfaEnroll, data: {'mfaToken': mfaToken});
    return MfaEnrollment.fromJson(_object(res.data));
  }

  /// POST /auth/mfa/enroll/confirm {mfaToken, code} → SUCCESS with tokens and recovery codes
  Future<LoginResponse> confirmEnrollment({required String mfaToken, required String code}) async {
    final res = await _dio.post(
      ApiConstants.mfaEnrollConfirm,
      data: {'mfaToken': mfaToken, 'code': code},
    );
    return LoginResponse.fromJson(_object(res.data));
  }

  // ─── Signed-in management (Bearer) ─────────────────────────────────────────

  Future<MfaStatus> status() async {
    final res = await _dio.get(ApiConstants.mfaStatus);
    return MfaStatus.fromJson(_object(res.data));
  }

  /// POST /auth/mfa/setup (409 mfa_already_enabled)
  Future<MfaEnrollment> setup() async {
    final res = await _dio.post(ApiConstants.setupMfa);
    return MfaEnrollment.fromJson(_object(res.data));
  }

  /// POST /auth/mfa/confirm {mfaToken, code} → {recoveryCodes, user, tokens}. Enabling MFA ends
  /// every earlier session, the caller's included; the returned tokens replace them
  /// (Web/backend/src/auth/mfa/mfa.service.ts:338-356).
  Future<LoginResponse> confirmSetup({required String mfaToken, required String code}) async {
    final res = await _dio.post(
      ApiConstants.setupMfaConfirm,
      data: {'mfaToken': mfaToken, 'code': code},
    );
    _recoveryCodes(res.data);
    return LoginResponse.fromJson(_object(res.data));
  }

  /// POST /auth/mfa/recovery-codes/regenerate {code} → new recovery codes
  Future<List<String>> regenerateRecoveryCodes(String code) async {
    final res = await _dio.post(ApiConstants.mfaRegenerateRecoveryCodes, data: {'code': code});
    return _recoveryCodes(res.data);
  }

  /// POST /auth/mfa/disable {method, code} → 204 (403 mfa_required_by_role)
  Future<void> disable({required String method, required String code}) async {
    await _dio.post(ApiConstants.mfaDisable, data: {'method': method, 'code': code});
  }

  static Map<String, dynamic> _object(Object? body) {
    if (body is! Map) {
      throw const FormatException('MFA response is not a JSON object');
    }
    return Map<String, dynamic>.from(body);
  }

  static List<String> _recoveryCodes(Object? body) {
    final codes = _object(body)['recoveryCodes'];
    if (codes is! List) {
      throw const FormatException('MFA response has no recoveryCodes list');
    }
    return codes.whereType<String>().toList();
  }
}

final mfaApiProvider = Provider<MfaApi>((ref) => MfaApi(ref.watch(dioProvider)));

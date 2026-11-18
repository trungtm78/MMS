// Unit Tests: AppFailure — failures as codes for layers without a BuildContext
// Backend body (Web/backend/src/common/filters/http-exception.filter.ts):
//   {code, message, details?, errors?, statusCode, timestamp, path}; `message` is the error code
// Run: flutter test test/unit_app_failure_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/shared/errors/app_failure.dart';

DioException _response(int status, Object? body) {
  final options = RequestOptions(path: '/x');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: status, data: body),
  );
}

DioException _backendError(int status, String message, {Map<String, Object>? details}) => _response(status, {
      'code': 'E004',
      'message': message,
      'statusCode': status,
      if (details != null) 'details': details,
    });

DioException _transport(DioExceptionType type) =>
    DioException(requestOptions: RequestOptions(path: '/x'), type: type);

void main() {
  group('apiErrorCode / apiValidationErrors', () {
    test('UT-FAIL-01: the code is the body message', () {
      expect(apiErrorCode(_backendError(403, 'no_role_assigned')), 'no_role_assigned');
      expect(apiErrorCode(_backendError(403, '  ')), isNull);
      expect(apiErrorCode(_response(500, 'oops')), isNull);
      expect(apiErrorCode(Exception('x')), isNull);
    });

    test('UT-FAIL-02: validation_failed lists the backend messages', () {
      final e = _response(400, {
        'message': 'validation_failed',
        'errors': ['title must be a string', ' ', 42],
      });
      expect(apiValidationErrors(e), ['title must be a string']);
      expect(apiValidationErrors(_backendError(400, 'invalid_date')), isEmpty);
      expect(apiValidationErrors(Exception('x')), isEmpty);
    });
  });

  group('AppFailure.from', () {
    test('UT-FAIL-03: a backend response keeps code, status, details and detail values', () {
      final f = AppFailure.from(_backendError(401, 'invalid_code', details: {'attemptsRemaining': 3}));
      expect(f.code, 'invalid_code');
      expect(f.status, 401);
      expect(f.args, {'attemptsRemaining': 3});

      final v = AppFailure.from(_response(400, {'message': 'validation_failed', 'errors': ['a']}));
      expect(v.code, 'validation_failed');
      expect(v.details, ['a']);

      final bare = AppFailure.from(_response(502, 'Bad Gateway'));
      expect(bare.code, AppFailure.noCode);
      expect(bare.status, 502);
    });

    test('UT-FAIL-04: transport failures get app codes', () {
      expect(AppFailure.from(_transport(DioExceptionType.connectionTimeout)).code, AppFailure.timeout);
      expect(AppFailure.from(_transport(DioExceptionType.sendTimeout)).code, AppFailure.timeout);
      expect(AppFailure.from(_transport(DioExceptionType.receiveTimeout)).code, AppFailure.timeout);
      expect(AppFailure.from(_transport(DioExceptionType.connectionError)).code, AppFailure.network);
      expect(AppFailure.from(_transport(DioExceptionType.badCertificate)).code, AppFailure.badCertificate);
      expect(AppFailure.from(_transport(DioExceptionType.cancel)).code, AppFailure.cancelled);
      expect(AppFailure.from(_transport(DioExceptionType.unknown)).code, AppFailure.unexpected);
    });

    test('UT-FAIL-05: other errors: location plugin, bad data, anything else', () {
      expect(AppFailure.from(Exception('Location permission denied')).code, AppFailure.locationPermission);
      expect(AppFailure.from(Exception('The location service on the device is disabled')).code,
          AppFailure.locationDisabled);
      expect(AppFailure.from(const FormatException('no list')).code, AppFailure.badResponse);
      expect(AppFailure.from(StateError('x')).code, AppFailure.unknown);
    });

    test('UT-FAIL-06: an AppFailure passes through unchanged', () {
      const f = AppFailure(AppFailure.sessionEnded);
      expect(identical(AppFailure.from(f), f), isTrue);
    });
  });

  group('AppFailure.fromLogin', () {
    test('UT-FAIL-07: a 401 on sign-in means wrong credentials, never an expired session', () {
      expect(AppFailure.fromLogin(_backendError(401, 'Unauthorized')).code, 'invalid_credentials');
      expect(AppFailure.fromLogin(_backendError(401, 'invalid_credentials')).code, 'invalid_credentials');
    });

    test('UT-FAIL-08: second-factor 401 codes keep their meaning', () {
      for (final code in ['invalid_otp', 'invalid_code', 'mfa_token_invalid']) {
        expect(AppFailure.fromLogin(_backendError(401, code)).code, code);
      }
    });

    test('UT-FAIL-09: a 403 falls back to "not allowed to sign in" when its code has no text', () {
      final f = AppFailure.fromLogin(_backendError(403, 'something_new'));
      expect(f.code, 'something_new');
      expect(f.status, 403);
      expect(f.fallback, AppFailure.loginForbidden);
    });

    test('UT-FAIL-10: other failures are unchanged', () {
      final f = AppFailure.fromLogin(_backendError(429, 'ThrottlerException: Too Many Requests'));
      expect(f.status, 429);
      expect(f.fallback, isNull);
      expect(AppFailure.fromLogin(_transport(DioExceptionType.connectionError)).code, AppFailure.network);
    });
  });

  test('UT-FAIL-11: toString names the code and status for logs', () {
    expect(const AppFailure('not_a_participant', status: 403).toString(), 'AppFailure(not_a_participant, status: 403)');
  });
}

// Unit Tests: ApiFailure — a failed call as data (kind, backend code, status, validation messages).
// This is the context-free half of the backend error table; lib/l10n/error_texts.dart words it.
// Backend body (Web/backend/src/common/filters/http-exception.filter.ts):
//   {code, message, statusCode, timestamp, path} where `message` is the error code;
//   validation failures: message 'validation_failed' plus errors: string[] (class-validator)
// Run: flutter test test/unit_api_failure_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

DioException _dioError(int status, Object body) {
  final options = RequestOptions(path: '/x');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: status, data: body),
  );
}

DioException _backendError(int status, String message, {String code = 'E004'}) =>
    _dioError(status, {'code': code, 'message': message, 'statusCode': status});

DioException _validationError(List<Object?> errors) => _dioError(400, {
      'code': 'E001',
      'message': 'validation_failed',
      'errors': errors,
      'statusCode': 400,
      'timestamp': '2026-09-14T01:00:00.000Z',
      'path': '/api/v1/mms_core/work-reports',
    });

DioException _transport(DioExceptionType type) =>
    DioException(requestOptions: RequestOptions(path: '/x'), type: type);

class _Wrapped implements HasApiFailure {
  const _Wrapped(this.failure);

  @override
  final ApiFailure? failure;
}

void main() {
  group('ApiFailure.from a DioException', () {
    test('UT-FAIL-01: an error answer keeps the backend code and the status', () {
      final f = ApiFailure.from(_backendError(403, 'no_role_assigned'));
      expect(f.kind, FailureKind.response);
      expect(f.code, 'no_role_assigned');
      expect(f.status, 403);
      expect(f.validationErrors, isEmpty);
      expect(f.firstValidationError, isNull);
    });

    test('UT-FAIL-02: validation_failed keeps the class-validator messages', () {
      final f = ApiFailure.from(_validationError(['title should not be empty', 'content must be a string']));
      expect(f.code, 'validation_failed');
      expect(f.status, 400);
      expect(f.validationErrors, ['title should not be empty', 'content must be a string']);
      expect(f.firstValidationError, 'title should not be empty');
    });

    test('UT-FAIL-03: transport failures are classified, without code or status', () {
      const kinds = {
        DioExceptionType.connectionTimeout: FailureKind.timeout,
        DioExceptionType.sendTimeout: FailureKind.timeout,
        DioExceptionType.receiveTimeout: FailureKind.timeout,
        DioExceptionType.connectionError: FailureKind.connection,
        DioExceptionType.badCertificate: FailureKind.badCertificate,
        DioExceptionType.cancel: FailureKind.cancelled,
        DioExceptionType.unknown: FailureKind.requestFailed,
      };
      kinds.forEach((type, kind) {
        final f = ApiFailure.from(_transport(type));
        expect(f.kind, kind, reason: '$type');
        expect(f.code, isNull, reason: '$type');
        expect(f.status, isNull, reason: '$type');
      });
    });

    test('UT-FAIL-04: only a non-blank string message is a code', () {
      expect(ApiFailure.from(_dioError(502, 'Bad gateway')).code, isNull);
      expect(ApiFailure.from(_dioError(400, {'message': '  '})).code, isNull);
      expect(ApiFailure.from(_dioError(400, {'message': 42})).code, isNull);
      expect(ApiFailure.from(_dioError(400, {'message': ' invalid_date '})).code, 'invalid_date');
    });
  });

  group('ApiFailure.from anything else', () {
    test('UT-FAIL-05: location plugin errors', () {
      expect(ApiFailure.from(Exception('User denied permissions to access the device location.')).kind,
          FailureKind.locationPermissionDenied);
      expect(ApiFailure.from(Exception('The location service on the device is disabled.')).kind,
          FailureKind.locationServiceDisabled);
    });

    test('UT-FAIL-06: any other error is unexpected', () {
      final f = ApiFailure.from(StateError('boom'));
      expect(f.kind, FailureKind.unexpected);
      expect(f.code, isNull);
      expect(f.status, isNull);
    });

    test('UT-FAIL-07: a failure, or an exception carrying one, is returned as is', () {
      const failure = ApiFailure(code: 'task_not_found', status: 404);
      expect(ApiFailure.from(failure), same(failure));
      expect(ApiFailure.from(const _Wrapped(failure)), same(failure));
      expect(ApiFailure.from(const _Wrapped(null)).kind, FailureKind.unexpected);
    });

    test('UT-FAIL-08: toString names the kind, status and code', () {
      expect(const ApiFailure(code: 'x', status: 409).toString(), 'ApiFailure(response, status: 409, code: x)');
    });
  });

  group('apiErrorCode', () {
    test('UT-FAIL-09: reads the code from the filter body', () {
      expect(apiErrorCode(_backendError(403, 'no_role_assigned')), 'no_role_assigned');
      expect(apiErrorCode(Exception('x')), isNull);
    });
  });

  group('apiValidationErrors', () {
    test('UT-FAIL-10: returns the messages of a validation_failed body', () {
      expect(
        apiValidationErrors(_validationError([
          'location must be shorter than or equal to 255 characters',
          'title should not be empty',
        ])),
        [
          'location must be shorter than or equal to 255 characters',
          'title should not be empty',
        ],
      );
    });

    test('UT-FAIL-11: keeps only non-blank string entries', () {
      expect(apiValidationErrors(_validationError(['a', 3, null, ' ', 'b'])), ['a', 'b']);
    });

    test('UT-FAIL-12: is empty for anything else', () {
      expect(apiValidationErrors(_backendError(403, 'not_a_participant')), isEmpty);
      expect(
        apiValidationErrors(_dioError(400, {
          'message': 'Bad Request Exception',
          'errors': ['x'],
        })),
        isEmpty,
      );
      expect(apiValidationErrors(_dioError(400, 'plain text')), isEmpty);
      expect(apiValidationErrors(_dioError(400, {'message': 'validation_failed', 'errors': 'x'})), isEmpty);
      expect(apiValidationErrors(_transport(DioExceptionType.connectionError)), isEmpty);
      expect(apiValidationErrors(Exception('x')), isEmpty);
    });
  });
}

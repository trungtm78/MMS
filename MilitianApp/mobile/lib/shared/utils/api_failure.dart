import 'package:dio/dio.dart';

/// How a call failed, before any wording. lib/l10n/error_texts.dart turns a failure into text.
enum FailureKind {
  /// The server answered with an error status: see [ApiFailure.status] and [ApiFailure.code].
  response,

  /// Connect, send or receive timeout.
  timeout,

  /// The server could not be reached.
  connection,

  /// The server certificate was refused.
  badCertificate,

  /// The request was cancelled.
  cancelled,

  /// The HTTP client failed without saying how (DioExceptionType.unknown).
  requestFailed,

  /// The location permission was refused (geolocator).
  locationPermissionDenied,

  /// Location services are switched off on the device (geolocator).
  locationServiceDisabled,

  /// Anything else the app threw.
  unexpected,
}

/// A failed call as data: the kind of failure, the backend error code and the HTTP status. It holds no
/// text, so repositories, interceptors and notifiers can keep it; screens word it with
/// `failure.text(context.l10n)` or `errorTextFor(context.l10n, error)` (lib/l10n/error_texts.dart).
///
/// Backend error bodies (Web/backend/src/common/filters/http-exception.filter.ts) are
/// `{code, message, statusCode, timestamp, path}` where `message` is the error code; a 400
/// `validation_failed` also lists the class-validator messages in `errors`.
class ApiFailure {
  const ApiFailure({
    this.kind = FailureKind.response,
    this.code,
    this.status,
    this.validationErrors = const [],
  });

  /// Classifies any error: a failure, or an exception carrying one ([HasApiFailure]), as is; a
  /// DioException by its type and body; location plugin errors by their message; anything else as
  /// [FailureKind.unexpected].
  factory ApiFailure.from(Object error) {
    if (error is ApiFailure) return error;
    if (error is HasApiFailure) {
      final failure = error.failure;
      if (failure != null) return failure;
    }
    if (error is DioException) {
      return ApiFailure(
        kind: switch (error.type) {
          DioExceptionType.connectionTimeout ||
          DioExceptionType.sendTimeout ||
          DioExceptionType.receiveTimeout =>
            FailureKind.timeout,
          DioExceptionType.connectionError => FailureKind.connection,
          DioExceptionType.badCertificate => FailureKind.badCertificate,
          DioExceptionType.cancel => FailureKind.cancelled,
          DioExceptionType.badResponse => FailureKind.response,
          DioExceptionType.unknown => FailureKind.requestFailed,
        },
        code: apiErrorCode(error),
        status: error.response?.statusCode,
        validationErrors: apiValidationErrors(error),
      );
    }
    final message = error.toString().toLowerCase();
    if (message.contains('permission') && message.contains('location')) {
      return const ApiFailure(kind: FailureKind.locationPermissionDenied);
    }
    if (message.contains('location service') || message.contains('disabled')) {
      return const ApiFailure(kind: FailureKind.locationServiceDisabled);
    }
    return const ApiFailure(kind: FailureKind.unexpected);
  }

  final FailureKind kind;

  /// The backend error code (the body's `message`), when the server sent one.
  final String? code;

  /// The HTTP status of an error answer.
  final int? status;

  /// The class-validator messages of a 400 `validation_failed`, in the backend's (English) words.
  final List<String> validationErrors;

  String? get firstValidationError => validationErrors.isEmpty ? null : validationErrors.first;

  @override
  String toString() => 'ApiFailure(${kind.name}, status: $status, code: $code)';
}

/// Implemented by a feature exception that wraps a failed call, so [ApiFailure.from] (and
/// errorTextFor) unwrap it and a screen can word the exception directly.
abstract interface class HasApiFailure {
  /// The failed call, or null when the exception comes from a local check.
  ApiFailure? get failure;
}

/// The class-validator messages of a 400 whose body `message` is 'validation_failed'
/// (http-exception.filter.ts puts them in `errors`); empty for any other error.
List<String> apiValidationErrors(Object e) {
  if (e is! DioException) return const [];
  final data = e.response?.data;
  if (data is! Map || data['message'] != 'validation_failed') return const [];
  final errors = data['errors'];
  if (errors is! List) return const [];
  return errors.whereType<String>().where((m) => m.trim().isNotEmpty).toList();
}

/// The error code the backend sent in the response body's `message`, if any.
String? apiErrorCode(Object e) {
  if (e is! DioException) return null;
  final data = e.response?.data;
  if (data is Map) {
    final message = data['message'];
    if (message is String && message.trim().isNotEmpty) return message.trim();
  }
  return null;
}

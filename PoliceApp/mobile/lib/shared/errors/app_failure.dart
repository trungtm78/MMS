import 'package:dio/dio.dart';

/// Why an operation failed, as data. Layers without a BuildContext (providers, repositories,
/// interceptors, models) report failures this way; the UI turns them into text through the one
/// table in lib/l10n/failure_texts.dart.
class AppFailure implements Exception {
  const AppFailure(
    this.code, {
    this.status,
    this.details = const [],
    this.args = const {},
    this.fallback,
  });

  /// A backend error code — the body's `message` (Web/backend/src/common/filters/
  /// http-exception.filter.ts) — or one of the app codes below; [noCode] when a response had none
  final String code;

  /// HTTP status, when the failure is a response
  final int? status;

  /// What a validation_failed body listed, in the backend's words
  final List<String> details;

  /// Values the text needs: the body's `details` (e.g. attemptsRemaining) or app values (e.g. max)
  final Map<String, Object> args;

  /// App code whose text applies when [code] has none (e.g. an unknown 403 on sign-in)
  final String? fallback;

  static const noCode = '';

  // ── App codes: failures the backend does not name ─────────────────────────
  // Transport and data
  static const network = 'app_network';
  static const timeout = 'app_timeout';
  static const badCertificate = 'app_bad_certificate';
  static const cancelled = 'app_cancelled';
  static const unexpected = 'app_unexpected';
  static const unknown = 'app_unknown';
  static const badResponse = 'app_bad_response';
  static const locationPermission = 'app_location_permission';
  static const locationDisabled = 'app_location_disabled';

  // Session and sign-in
  static const loginForbidden = 'app_login_forbidden';
  static const sessionEnded = 'app_session_ended';
  static const passwordChanged = 'app_password_changed';
  static const sessionStartFailed = 'app_session_start_failed';
  static const missingTokens = 'app_missing_tokens';
  static const roleNotAllowed = 'app_role_not_allowed';
  static const currentPasswordInvalid = 'app_current_password_invalid';
  static const otpFormat = 'app_otp_format';
  static const recoveryCodeRequired = 'app_recovery_code_required';

  // Chat
  static const chatJoinFailed = 'app_chat_join_failed';
  static const directRequiresOne = 'app_direct_requires_one';
  static const groupRequiresParticipant = 'app_group_requires_participant';
  static const titleTooLong = 'app_title_too_long';
  static const participantSearchFailed = 'app_participant_search_failed';

  // Reports, approvals, attendance, files
  static const photoAccessDenied = 'app_photo_access_denied';
  static const photoPickFailed = 'app_photo_pick_failed';
  static const reportTypeInvalid = 'app_report_type_invalid';
  static const reviewStatusInvalid = 'app_review_status_invalid';
  static const dateFilterInvalid = 'app_date_filter_invalid';
  static const reportTitleRequired = 'app_report_title_required';
  static const reportTitleTooLong = 'app_report_title_too_long'; // args: max
  static const reportContentRequired = 'app_report_content_required';
  static const reportContentTooLong = 'app_report_content_too_long'; // args: max
  static const reportLocationTooLong = 'app_report_location_too_long'; // args: max
  static const reviewNoteTooLong = 'app_review_note_too_long'; // args: max
  static const attachmentsTooMany = 'app_attachments_too_many'; // args: max
  static const leaveReasonTooLong = 'app_leave_reason_too_long'; // args: max

  // Tasks, training, DQTV, profile, notifications
  // POST /tasks body checks (Web/backend/src/tasks/tasks.controller.ts CreateTaskDto)
  static const taskPriorityInvalid = 'app_task_priority_invalid';
  static const taskLocationNameTooLong = 'app_task_location_name_too_long'; // args: max
  static const taskCoordinatesIncomplete = 'app_task_coordinates_incomplete';
  static const taskLatitudeOutOfRange = 'app_task_latitude_out_of_range';
  static const taskLongitudeOutOfRange = 'app_task_longitude_out_of_range';
  // POST /tasks/:id/report body checks (tasks.controller.ts SubmitReportDto)
  static const taskReportDescriptionRequired = 'app_task_report_description_required';
  static const taskReportDescriptionTooLong = 'app_task_report_description_too_long'; // args: max

  /// Any caught error: a backend response (code, status, details), a transport failure, a
  /// location plugin error or unexpected data
  factory AppFailure.from(Object error) {
    if (error is AppFailure) return error;
    if (error is DioException) return _fromDio(error);
    if (error is FormatException) return const AppFailure(badResponse);
    // The location plugin reports its failures only as text
    final text = error.toString().toLowerCase();
    if (text.contains('permission') && text.contains('location')) {
      return const AppFailure(locationPermission);
    }
    if (text.contains('location service') || text.contains('disabled')) {
      return const AppFailure(locationDisabled);
    }
    return const AppFailure(unknown);
  }

  static const _secondFactorCodes = {'invalid_otp', 'invalid_code', 'mfa_token_invalid'};

  /// A failed sign-in step. A 401 there means wrong credentials or a wrong code, never an
  /// expired session; a 403 without a known code means the account may not sign in.
  factory AppFailure.fromLogin(Object error) {
    final failure = AppFailure.from(error);
    switch (failure.status) {
      case 401:
        return _secondFactorCodes.contains(failure.code)
            ? failure
            : const AppFailure('invalid_credentials', status: 401);
      case 403:
        return AppFailure(
          failure.code,
          status: 403,
          details: failure.details,
          args: failure.args,
          fallback: loginForbidden,
        );
    }
    return failure;
  }

  static AppFailure _fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const AppFailure(timeout);
      case DioExceptionType.connectionError:
        return const AppFailure(network);
      case DioExceptionType.badCertificate:
        return const AppFailure(badCertificate);
      case DioExceptionType.cancel:
        return const AppFailure(cancelled);
      case DioExceptionType.unknown:
        return const AppFailure(unexpected);
      case DioExceptionType.badResponse:
        return AppFailure(
          apiErrorCode(e) ?? noCode,
          status: e.response?.statusCode,
          details: apiValidationErrors(e),
          args: _detailValues(e),
        );
    }
  }

  /// Scalar values of the body's `details`, e.g. {attemptsRemaining: 3} for invalid_code
  static Map<String, Object> _detailValues(DioException e) {
    final body = e.response?.data;
    final details = body is Map ? body['details'] : null;
    if (details is! Map) return const {};
    return {
      for (final entry in details.entries)
        if (entry.key is String && (entry.value is num || entry.value is String))
          entry.key as String: entry.value as Object,
    };
  }

  @override
  String toString() => 'AppFailure($code, status: $status)';
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

/// Messages listed by a validation failure: {message: 'validation_failed', errors: [...]}
/// (Web/backend/src/common/filters/http-exception.filter.ts). They are class-validator texts.
List<String> apiValidationErrors(Object e) {
  if (e is! DioException) return const [];
  final data = e.response?.data;
  if (data is! Map || data['message'] != 'validation_failed') return const [];
  final errors = data['errors'];
  if (errors is! List) return const [];
  return errors.whereType<String>().where((m) => m.trim().isNotEmpty).toList();
}

// The backend error table: the one place a failed call becomes text.
//
// Use it from the UI only:
//   - an exception or any error object:  errorTextFor(context.l10n, error)
//   - a kept failure:                    failure.text(context.l10n)
//   - a sign-in / change-password / chat acknowledgement: pass the matching [ErrorFlow]
// Repositories keep an ApiFailure (lib/shared/utils/api_failure.dart) in their exceptions and never
// word errors themselves. A new backend code gets one case in [errorText] and one ARB key
// (error<Module><Code>, described with the backend file that sends it).

import '../shared/utils/api_failure.dart';
import 'app_localizations.dart';

/// Screen rules applied on top of the table.
enum ErrorFlow {
  /// Any API call.
  general,

  /// POST /auth/login and the second-factor sign-in routes: a 401 rejects the credentials or the
  /// code, never an expired session; an unknown 403 means the account may not sign in.
  login,

  /// POST /users/me/change-password: invalid_credentials means the current password is wrong
  /// (Web/backend/src/users/users.service.ts:198-199).
  changePassword,

  /// chat:join / chat:send acknowledgements (notifications.gateway.ts): an unknown code is named.
  chatAck,
}

/// Text for a failed call: the backend [code] when known, the first validation message of a
/// validation_failed, otherwise by HTTP [status] (for [FailureKind.response]) or by [kind].
String errorText(
  AppLocalizations l10n,
  String? code, {
  int? status,
  FailureKind kind = FailureKind.response,
  String? validationMessage,
  ErrorFlow flow = ErrorFlow.general,
}) =>
    switch ((flow, code, status, kind)) {
      // Sign-in: a 401 is about the credentials or the second-factor code
      (ErrorFlow.login, 'invalid_otp', 401, FailureKind.response) => l10n.errorAuthInvalidOtp,
      (ErrorFlow.login, 'invalid_code', 401, FailureKind.response) => l10n.errorMfaInvalidCode,
      (ErrorFlow.login, 'mfa_token_invalid', 401, FailureKind.response) => l10n.errorMfaTokenInvalid,
      (ErrorFlow.login, _, 401, FailureKind.response) => l10n.errorAuthInvalidCredentials,
      // Change password: the current password is wrong
      (ErrorFlow.changePassword, 'invalid_credentials', _, _) => l10n.errorPasswordCurrentWrong,

      // auth/auth.service.ts
      (_, 'invalid_credentials', _, _) => l10n.errorAuthInvalidCredentials,
      (_, 'account_disabled', _, _) => l10n.errorAuthAccountDisabled,
      (_, 'account_locked', _, _) => l10n.errorAuthAccountLocked,
      (_, 'no_role_assigned', _, _) => l10n.errorAuthNoRoleAssigned,
      (_, 'invalid_otp', _, _) => l10n.errorAuthInvalidOtp,
      (_, 'session_expired', _, _) => l10n.errorAuthSessionExpired,
      // auth/mfa/mfa.service.ts, auth/mfa/mfa-challenge.service.ts
      (_, 'invalid_code', _, _) => l10n.errorMfaInvalidCode,
      (_, 'mfa_token_invalid', _, _) => l10n.errorMfaTokenInvalid,
      (_, 'mfa_attempts_exceeded', _, _) => l10n.errorMfaAttemptsExceeded,
      (_, 'mfa_locked', _, _) => l10n.errorMfaLocked,
      (_, 'mfa_already_enabled', _, _) => l10n.errorMfaAlreadyEnabled,
      (_, 'mfa_not_enabled', _, _) => l10n.errorMfaNotEnabled,
      (_, 'mfa_required_by_role', _, _) => l10n.errorMfaRequiredByRole,
      (_, 'mfa_setup_not_started', _, _) => l10n.errorMfaSetupNotStarted,
      // auth/auth.service.ts:469-484 (POST /auth/refresh), common/guards/jwt-auth.guard.ts:44-47
      (_, 'mfa_reauthentication_required', _, _) => l10n.errorMfaReauthenticationRequired,
      (_, 'session_revoked' || 'refresh_token_reused' || 'refresh_token_revoked' || 'invalid_refresh_token', _, _) =>
        l10n.errorSessionEnded,
      // notifications/notifications.controller.ts
      (_, 'notification_not_found', _, _) => l10n.errorNotificationNotFound,
      // chat/chat.service.ts, notifications/notifications.gateway.ts
      (_, 'not_a_participant', _, _) => l10n.errorChatNotAParticipant,
      (_, 'message_too_long', _, _) => l10n.errorChatMessageTooLong,
      (_, 'message_content_required', _, _) => l10n.errorChatMessageContentRequired,
      (_, 'invalid_conversation_id', _, _) => l10n.errorChatInvalidConversationId,
      (_, 'direct_conversation_requires_one_participant', _, _) => l10n.errorChatDirectRequiresOneParticipant,
      (_, 'participant_not_found', _, _) => l10n.errorChatParticipantNotFound,
      (_, 'not_joined', _, _) => l10n.errorChatNotJoined,
      // leave/leave.service.ts (invalid_date; PATCH /leave/:id/cancel :424-446)
      (_, 'invalid_date', _, _) => l10n.errorDateInvalid,
      (_, 'leave_request_not_found', _, _) => l10n.errorLeaveRequestNotFound,
      (_, 'not_your_leave_request', _, _) => l10n.errorLeaveNotYourRequest,
      (_, 'leave_request_not_pending', _, _) => l10n.errorLeaveRequestNotPending,
      // tasks/tasks.service.ts
      (_, 'task_not_found', _, _) => l10n.errorTaskNotFound,
      (_, 'not_task_assignee', _, _) => l10n.errorTaskNotAssignee,
      // users/users.service.ts:180-219 (POST /users/me/change-password)
      (_, 'password_complexity', _, _) => l10n.errorPasswordComplexity,
      (_, 'password_reuse', _, _) => l10n.errorPasswordReuse,
      // users/users.service.ts searchUsers (GET /users/search)
      (_, 'search_query_too_short', _, _) => l10n.errorUserSearchQueryTooShort,
      // files/files.controller.ts, upload.interceptor.ts, content-checking-storage.ts (POST /files/upload)
      (_, 'file_required', _, _) => l10n.errorFileRequired,
      (_, 'file_empty', _, _) => l10n.errorFileEmpty,
      (_, 'file_field_invalid', _, _) => l10n.errorFileFieldInvalid,
      (_, 'multipart_malformed', _, _) => l10n.errorFileMultipartMalformed,
      (_, 'file_too_large', _, _) => l10n.errorFileTooLarge,
      (_, 'file_type_not_allowed', _, _) => l10n.errorFileTypeNotAllowed,
      // files/files.service.ts openForDownload (GET /files/:id) and attach (work and task reports)
      (_, 'file_not_found', _, _) => l10n.errorFileNotFound,
      (_, 'duplicate_file_ids', _, _) => l10n.errorFileDuplicateIds,
      (_, 'file_purpose_mismatch', _, _) => l10n.errorFilePurposeMismatch,
      (_, 'file_already_attached', _, _) => l10n.errorFileAlreadyAttached,

      // common/filters/http-exception.filter.ts: the first class-validator message
      (_, 'validation_failed', _, _) when validationMessage != null => l10n.errorValidationFailed(validationMessage),
      // A socket acknowledgement names a refusal the app does not know
      (ErrorFlow.chatAck, final String unknown, _, _) => l10n.errorChatJoinFailed(unknown),
      // Sign-in: an unknown 403 (a 429 without a known code falls to the throttler text below)
      (ErrorFlow.login, _, 403, FailureKind.response) => l10n.errorAuthLoginForbidden,

      // By status
      (_, _, 400, FailureKind.response) => l10n.errorStatusBadRequest,
      (_, _, 401, FailureKind.response) => l10n.errorAuthSessionExpired,
      (_, _, 403, FailureKind.response) => l10n.errorStatusForbidden,
      (_, _, 404, FailureKind.response) => l10n.errorStatusNotFound,
      (_, _, 409, FailureKind.response) => l10n.errorStatusConflict,
      (_, _, 422, FailureKind.response) => l10n.errorStatusUnprocessable,
      (_, _, 429, FailureKind.response) => l10n.errorStatusTooManyRequests,
      (_, _, final int s, FailureKind.response) when s >= 500 => l10n.errorStatusServer,
      (_, _, final int s, FailureKind.response) => l10n.errorStatusOther(s),

      // By kind
      (_, _, _, FailureKind.timeout) => l10n.errorNetworkTimeout,
      (_, _, _, FailureKind.connection) => l10n.errorNetworkConnection,
      (_, _, _, FailureKind.badCertificate) => l10n.errorNetworkBadCertificate,
      (_, _, _, FailureKind.cancelled) => l10n.errorNetworkCancelled,
      (_, _, _, FailureKind.requestFailed) => l10n.errorNetworkUnknown,
      (_, _, _, FailureKind.locationPermissionDenied) => l10n.errorLocationPermissionDenied,
      (_, _, _, FailureKind.locationServiceDisabled) => l10n.errorLocationServiceDisabled,
      (_, _, _, FailureKind.response || FailureKind.unexpected) => l10n.errorUnexpected,
    };

/// Text for any error object: a DioException, an ApiFailure, or a feature exception carrying one.
String errorTextFor(AppLocalizations l10n, Object error, {ErrorFlow flow = ErrorFlow.general}) =>
    ApiFailure.from(error).text(l10n, flow: flow);

extension ApiFailureText on ApiFailure {
  /// This failure worded by [errorText].
  String text(AppLocalizations l10n, {ErrorFlow flow = ErrorFlow.general}) => errorText(
        l10n,
        code,
        status: status,
        kind: kind,
        validationMessage: firstValidationError,
        flow: flow,
      );
}

import '../shared/errors/app_failure.dart';
import 'app_localizations.dart';

/// The one table from failure codes to texts: backend codes and the app codes of [AppFailure].
/// A code without a text falls back to [AppFailure.fallback], then to the validation details,
/// then to the HTTP status.
String failureText(AppLocalizations l10n, AppFailure failure) =>
    codeText(l10n, failure.code, failure.args) ??
    codeText(l10n, failure.fallback, failure.args) ??
    _validationText(l10n, failure) ??
    _statusText(l10n, failure.status) ??
    l10n.errorUnknown;

/// Text for one code (socket acknowledgements use this too), or null when the table has none
String? codeText(AppLocalizations l10n, String? code, [Map<String, Object> args = const {}]) =>
    switch (code) {
      // ── auth/auth.service.ts, users/users.service.ts ──────────────────────
      'invalid_credentials' => l10n.errorInvalidCredentials,
      'account_disabled' => l10n.errorAccountDisabled,
      'account_locked' => l10n.errorAccountLocked,
      'no_role_assigned' => l10n.errorNoRoleAssigned,
      'invalid_otp' => l10n.errorInvalidOtp,
      'session_expired' => l10n.errorSessionExpired,
      'mfa_reauthentication_required' => l10n.errorMfaReauthenticationRequired,
      'password_complexity' => l10n.errorPasswordComplexity,
      'password_reuse' => l10n.errorPasswordReuse,
      // ── auth/mfa/mfa.service.ts, mfa-challenge.service.ts ─────────────────
      'invalid_code' => switch (args['attemptsRemaining']) {
          final int attempts => l10n.errorInvalidCodeAttemptsRemaining(attempts),
          _ => l10n.errorInvalidCode,
        },
      'mfa_token_invalid' => l10n.errorMfaTokenInvalid,
      'mfa_attempts_exceeded' => l10n.errorMfaAttemptsExceeded,
      'mfa_locked' => l10n.errorMfaLocked,
      'mfa_already_enabled' => l10n.errorMfaAlreadyEnabled,
      'mfa_not_enabled' => l10n.errorMfaNotEnabled,
      'mfa_required_by_role' => l10n.errorMfaRequiredByRole,
      'mfa_setup_not_started' => l10n.errorMfaSetupNotStarted,
      // ── notifications/notifications.controller.ts ─────────────────────────
      'notification_not_found' => l10n.errorNotificationNotFound,
      // ── work-reports/work-reports.service.ts ──────────────────────────────
      'work_report_already_reviewed' => l10n.errorWorkReportAlreadyReviewed,
      'cannot_review_own_report' => l10n.errorCannotReviewOwnReport,
      'work_report_not_found' => l10n.errorWorkReportNotFound,
      'only_ca_can_review' => l10n.errorOnlyCaCanReview,
      // ── chat/chat.service.ts, notifications/notifications.gateway.ts ───────
      'not_a_participant' => l10n.errorNotAParticipant,
      'message_too_long' => l10n.errorMessageTooLong,
      'message_content_required' => l10n.errorMessageContentRequired,
      'invalid_conversation_id' => l10n.errorInvalidConversationId,
      'direct_conversation_requires_one_participant' => l10n.errorDirectConversationRequiresOneParticipant,
      'participant_not_found' => l10n.errorParticipantNotFound,
      'not_joined' => l10n.errorNotJoined,
      // ── leave/leave.service.ts ────────────────────────────────────────────
      'leave_request_not_pending' => l10n.errorLeaveRequestNotPending,
      'insufficient_leave_balance' => l10n.errorInsufficientLeaveBalance,
      'cannot_review_own_request' => l10n.errorCannotReviewOwnRequest,
      'leave_request_not_found' => l10n.errorLeaveRequestNotFound,
      'insufficient_role_to_review' => l10n.errorInsufficientRoleToReview,
      'insufficient_role_to_view_approvals' => l10n.errorInsufficientRoleToViewApprovals,
      // ── work-report and leave date filters ────────────────────────────────
      'invalid_date' => l10n.errorInvalidDate,

      // ── App: transport and data ───────────────────────────────────────────
      AppFailure.network => l10n.errorNetwork,
      AppFailure.timeout => l10n.errorTimeout,
      AppFailure.badCertificate => l10n.errorBadCertificate,
      AppFailure.cancelled => l10n.errorCancelled,
      AppFailure.unexpected => l10n.errorUnexpected,
      AppFailure.unknown => l10n.errorUnknown,
      AppFailure.badResponse => l10n.errorBadResponse,
      AppFailure.locationPermission => l10n.errorLocationPermission,
      AppFailure.locationDisabled => l10n.errorLocationDisabled,
      // ── App: session and sign-in ──────────────────────────────────────────
      AppFailure.loginForbidden => l10n.errorLoginForbidden,
      AppFailure.sessionEnded => l10n.authLoginNoticeSessionEnded,
      AppFailure.passwordChanged => l10n.authLoginNoticePasswordChanged,
      AppFailure.sessionStartFailed => l10n.errorSessionStartFailed,
      AppFailure.missingTokens => l10n.errorMissingTokens,
      AppFailure.roleNotAllowed => l10n.errorRoleNotAllowed,
      AppFailure.currentPasswordInvalid => l10n.errorCurrentPasswordInvalid,
      AppFailure.otpFormat => l10n.errorOtpFormat,
      AppFailure.recoveryCodeRequired => l10n.errorRecoveryCodeRequired,
      // ── App: chat ─────────────────────────────────────────────────────────
      AppFailure.chatJoinFailed => l10n.errorChatJoinFailed('${args['code'] ?? ''}'),
      AppFailure.directRequiresOne => l10n.errorDirectRequiresOne,
      AppFailure.groupRequiresParticipant => l10n.errorGroupRequiresParticipant,
      AppFailure.titleTooLong => l10n.errorTitleTooLong(switch (args['max']) {
          final int max => max,
          _ => 0,
        }),
      AppFailure.participantSearchFailed => l10n.errorParticipantSearchFailed,
      // ── App: reports, approvals, attendance ───────────────────────────────
      // files/upload.interceptor.ts, files.controller.ts, files.service.ts (T20)
      'file_required' => l10n.filesErrorFileRequired,
      'file_empty' => l10n.filesErrorFileEmpty,
      'file_field_invalid' => l10n.filesErrorFileFieldInvalid,
      'multipart_malformed' => l10n.filesErrorMultipartMalformed,
      'file_too_large' => l10n.filesErrorFileTooLarge,
      'file_type_not_allowed' => l10n.filesErrorFileTypeNotAllowed,
      'file_not_found' => l10n.filesErrorFileNotFound,
      'duplicate_file_ids' => l10n.filesErrorDuplicateFileIds,
      'file_purpose_mismatch' => l10n.filesErrorFilePurposeMismatch,
      'file_already_attached' => l10n.filesErrorFileAlreadyAttached,
      // local checks: photos, work reports, leave review
      AppFailure.photoAccessDenied => l10n.filesErrorPhotoAccessDenied,
      AppFailure.photoPickFailed => l10n.filesErrorPhotoPickFailed,
      AppFailure.reportTypeInvalid => l10n.reportsErrorTypeInvalid,
      AppFailure.reviewStatusInvalid => l10n.reportsErrorReviewStatusInvalid,
      AppFailure.dateFilterInvalid => l10n.reportsErrorDateFilterInvalid,
      AppFailure.reportTitleRequired => l10n.reportsErrorTitleRequired,
      AppFailure.reportContentRequired => l10n.reportsErrorContentRequired,
      AppFailure.reportTitleTooLong =>
        l10n.reportsErrorTitleTooLong(switch (args['max']) { final int max => max, _ => 0 }),
      AppFailure.reportContentTooLong =>
        l10n.reportsErrorContentTooLong(switch (args['max']) { final int max => max, _ => 0 }),
      AppFailure.reportLocationTooLong =>
        l10n.reportsErrorLocationTooLong(switch (args['max']) { final int max => max, _ => 0 }),
      AppFailure.reviewNoteTooLong =>
        l10n.reportsErrorReviewNoteTooLong(switch (args['max']) { final int max => max, _ => 0 }),
      AppFailure.attachmentsTooMany =>
        l10n.reportsErrorAttachmentsTooMany(switch (args['max']) { final int max => max, _ => 0 }),
      AppFailure.leaveReasonTooLong =>
        l10n.approvalsErrorReasonTooLong(switch (args['max']) { final int max => max, _ => 0 }),
      // ── App: tasks, training, DQTV, profile, notifications ────────────────
      AppFailure.taskPriorityInvalid => l10n.tasksErrorPriorityInvalid,
      AppFailure.taskLocationNameTooLong => l10n.tasksErrorLocationNameTooLong(switch (args['max']) {
          final int max => max,
          _ => 0,
        }),
      AppFailure.taskCoordinatesIncomplete => l10n.tasksErrorCoordinatesIncomplete,
      AppFailure.taskLatitudeOutOfRange => l10n.tasksErrorLatitudeOutOfRange,
      AppFailure.taskLongitudeOutOfRange => l10n.tasksErrorLongitudeOutOfRange,
      AppFailure.taskReportDescriptionRequired => l10n.tasksErrorReportDescriptionRequired,
      AppFailure.taskReportDescriptionTooLong =>
        l10n.tasksErrorReportDescriptionTooLong(switch (args['max']) { final int max => max, _ => 0 }),
      // Backend: tasks/tasks.service.ts, training/training.service.ts, militia/militia.service.ts,
      // kpi/kpi.service.ts, users/users.service.ts, sos/sos.service.ts, sos/sos-alerts.service.ts.
      // Task routes are scoped: a task outside the caller's scope is task_not_found.
      'task_not_found' => l10n.tasksErrorTaskNotFound,
      'task_not_acceptable' => l10n.tasksErrorTaskNotAcceptable,
      'task_closed' => l10n.tasksErrorTaskClosed,
      'task_cannot_be_edited_in_current_status' => l10n.tasksErrorTaskCannotBeEdited,
      'task_cannot_be_cancelled' => l10n.tasksErrorTaskCannotBeCancelled,
      'invalid_status' => l10n.commonErrorInvalidStatus,
      'incident_not_found' => l10n.alertsErrorIncidentNotFound,
      'invalid_status_transition' => l10n.alertsErrorInvalidStatusTransition,
      'assignee_not_found' => l10n.alertsErrorAssigneeNotFound,
      'militia_no_user_account' => l10n.tasksErrorMilitiaNoUserAccount,
      'dqtv_not_assigned_to_ca' => l10n.tasksErrorDqtvNotAssignedToCa,
      'insufficient_role_to_create_training' => l10n.trainingErrorInsufficientRoleToCreate,
      'militia_not_found' => l10n.dqtvErrorMilitiaNotFound,
      'kpi_not_visible' => l10n.dqtvErrorKpiNotVisible,
      'user_not_found' => l10n.profileErrorUserNotFound,
      _ => null,
    };

String? _validationText(AppLocalizations l10n, AppFailure failure) =>
    failure.code == 'validation_failed' && failure.details.isNotEmpty
        ? l10n.errorValidationDetail(failure.details.first)
        : null;

String? _statusText(AppLocalizations l10n, int? status) => switch (status) {
      null => null,
      400 => l10n.errorBadRequest,
      401 => l10n.errorSessionExpired,
      403 => l10n.errorForbidden,
      404 => l10n.errorNotFound,
      409 => l10n.errorConflict,
      422 => l10n.errorUnprocessable,
      429 => l10n.errorTooManyRequests,
      >= 500 => l10n.errorServer,
      final int other => l10n.errorHttpStatus(other),
    };

// Unit Tests: the one table from failure codes to texts (lib/l10n/failure_texts.dart)
// Run: flutter test test/unit_failure_texts_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/l10n/failure_texts.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/l10n.dart';

String _text(String code, {int? status, List<String> details = const [], Map<String, Object> args = const {}, String? fallback}) =>
    failureText(viL10n, AppFailure(code, status: status, details: details, args: args, fallback: fallback));

void main() {
  test('UT-FT-01: every backend code the apps handle has a text', () {
    const backendCodes = [
      // auth/auth.service.ts, users/users.service.ts
      'invalid_credentials', 'account_disabled', 'account_locked', 'no_role_assigned', 'invalid_otp',
      'session_expired', 'mfa_reauthentication_required', 'password_complexity', 'password_reuse',
      // auth/mfa/mfa.service.ts, mfa-challenge.service.ts
      'invalid_code', 'mfa_token_invalid', 'mfa_attempts_exceeded', 'mfa_locked', 'mfa_already_enabled',
      'mfa_not_enabled', 'mfa_required_by_role', 'mfa_setup_not_started',
      // notifications, work-reports, chat, leave
      'notification_not_found', 'work_report_already_reviewed', 'cannot_review_own_report',
      'work_report_not_found', 'only_ca_can_review', 'not_a_participant', 'message_too_long',
      'message_content_required', 'invalid_conversation_id', 'leave_request_not_pending',
      'insufficient_leave_balance', 'cannot_review_own_request', 'leave_request_not_found',
      'insufficient_role_to_review', 'insufficient_role_to_view_approvals',
      'direct_conversation_requires_one_participant', 'participant_not_found', 'not_joined', 'invalid_date',
    ];
    for (final code in backendCodes) {
      expect(codeText(viL10n, code), isNotNull, reason: code);
    }
    expect(codeText(viL10n, 'no_such_code'), isNull);
    expect(codeText(viL10n, null), isNull);
  });

  test('UT-FT-02: codes map to their texts', () {
    expect(_text('no_role_assigned', status: 403), viL10n.errorNoRoleAssigned);
    expect(_text('account_locked', status: 403), viL10n.errorAccountLocked);
    expect(_text('work_report_already_reviewed', status: 409), viL10n.errorWorkReportAlreadyReviewed);
    expect(_text('not_a_participant', status: 403), viL10n.errorNotAParticipant);
    expect(_text('leave_request_not_pending', status: 409), viL10n.errorLeaveRequestNotPending);
    expect(_text('invalid_date', status: 400), viL10n.errorInvalidDate);
  });

  test('UT-FT-03: invalid_code says how many attempts are left when the backend tells', () {
    expect(_text('invalid_code', status: 401), viL10n.errorInvalidCode);
    expect(_text('invalid_code', status: 401, args: {'attemptsRemaining': 2}),
        viL10n.errorInvalidCodeAttemptsRemaining(2));
  });

  test('UT-FT-04: an unknown code uses the fallback, then validation details, then the status', () {
    expect(_text('something_new', status: 403, fallback: AppFailure.loginForbidden), viL10n.errorLoginForbidden);
    expect(_text('validation_failed', status: 400, details: ['locationName must be shorter']),
        viL10n.errorValidationDetail('locationName must be shorter'));
    expect(_text('validation_failed', status: 400), viL10n.errorBadRequest);
    expect(_text('Bad Request Exception', status: 400), viL10n.errorBadRequest);
    expect(_text(AppFailure.noCode, status: 401), viL10n.errorSessionExpired);
    expect(_text('x', status: 403), viL10n.errorForbidden);
    expect(_text('x', status: 404), viL10n.errorNotFound);
    expect(_text('conflict_x', status: 409), viL10n.errorConflict);
    expect(_text('x', status: 422), viL10n.errorUnprocessable);
    expect(_text('ThrottlerException: Too Many Requests', status: 429), viL10n.errorTooManyRequests);
    expect(_text('x', status: 503), viL10n.errorServer);
    expect(_text('x', status: 418), viL10n.errorHttpStatus(418));
    expect(_text('x'), viL10n.errorUnknown);
  });

  test('UT-FT-05: app codes', () {
    expect(_text(AppFailure.network), viL10n.errorNetwork);
    expect(_text(AppFailure.timeout), viL10n.errorTimeout);
    expect(_text(AppFailure.badCertificate), viL10n.errorBadCertificate);
    expect(_text(AppFailure.cancelled), viL10n.errorCancelled);
    expect(_text(AppFailure.unexpected), viL10n.errorUnexpected);
    expect(_text(AppFailure.unknown), viL10n.errorUnknown);
    expect(_text(AppFailure.badResponse), viL10n.errorBadResponse);
    expect(_text(AppFailure.locationPermission), viL10n.errorLocationPermission);
    expect(_text(AppFailure.locationDisabled), viL10n.errorLocationDisabled);
    expect(_text(AppFailure.sessionEnded), viL10n.authLoginNoticeSessionEnded);
    expect(_text(AppFailure.passwordChanged), viL10n.authLoginNoticePasswordChanged);
    expect(_text(AppFailure.sessionStartFailed), viL10n.errorSessionStartFailed);
    expect(_text(AppFailure.missingTokens), viL10n.errorMissingTokens);
    expect(_text(AppFailure.roleNotAllowed), viL10n.errorRoleNotAllowed);
    expect(_text(AppFailure.currentPasswordInvalid), viL10n.errorCurrentPasswordInvalid);
    expect(_text(AppFailure.otpFormat), viL10n.errorOtpFormat);
    expect(_text(AppFailure.recoveryCodeRequired), viL10n.errorRecoveryCodeRequired);
    expect(_text(AppFailure.chatJoinFailed, args: {'code': 'weird'}), viL10n.errorChatJoinFailed('weird'));
    expect(_text(AppFailure.directRequiresOne), viL10n.errorDirectRequiresOne);
    expect(_text(AppFailure.groupRequiresParticipant), viL10n.errorGroupRequiresParticipant);
    expect(_text(AppFailure.titleTooLong, args: {'max': 255}), viL10n.errorTitleTooLong(255));
    expect(_text(AppFailure.participantSearchFailed), viL10n.errorParticipantSearchFailed);
  });
}

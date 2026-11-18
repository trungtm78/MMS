// Unit Tests: the backend error table (lib/l10n/error_texts.dart) — every backend code the app maps,
// the first validation message, status and network fallbacks, and the sign-in, change-password and
// chat-acknowledgement rules. Expected text comes from the resources (viL10n);
// test/unit_l10n_vi_test.dart pins a representative set to literal Vietnamese.
// Run: flutter test test/unit_error_texts_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/l10n/error_texts.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/l10n.dart';

final _l = viL10n;

DioException _answer(int status, Object body) {
  final options = RequestOptions(path: '/x');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: options, statusCode: status, data: body),
  );
}

void main() {
  group('backend codes', () {
    test('UT-ERR-01: every mapped backend code has its text, whatever the status', () {
      final expected = <String, String>{
        // auth/auth.service.ts
        'invalid_credentials': _l.errorAuthInvalidCredentials,
        'account_disabled': _l.errorAuthAccountDisabled,
        'account_locked': _l.errorAuthAccountLocked,
        'no_role_assigned': _l.errorAuthNoRoleAssigned,
        'invalid_otp': _l.errorAuthInvalidOtp,
        'session_expired': _l.errorAuthSessionExpired,
        // auth/mfa/mfa.service.ts, mfa-challenge.service.ts
        'invalid_code': _l.errorMfaInvalidCode,
        'mfa_token_invalid': _l.errorMfaTokenInvalid,
        'mfa_attempts_exceeded': _l.errorMfaAttemptsExceeded,
        'mfa_locked': _l.errorMfaLocked,
        'mfa_already_enabled': _l.errorMfaAlreadyEnabled,
        'mfa_not_enabled': _l.errorMfaNotEnabled,
        'mfa_required_by_role': _l.errorMfaRequiredByRole,
        'mfa_setup_not_started': _l.errorMfaSetupNotStarted,
        // auth/auth.service.ts:469-484 (POST /auth/refresh), common/guards/jwt-auth.guard.ts:44-47
        'mfa_reauthentication_required': _l.errorMfaReauthenticationRequired,
        'session_revoked': _l.errorSessionEnded,
        'refresh_token_reused': _l.errorSessionEnded,
        'refresh_token_revoked': _l.errorSessionEnded,
        'invalid_refresh_token': _l.errorSessionEnded,
        // notifications/notifications.controller.ts
        'notification_not_found': _l.errorNotificationNotFound,
        // chat/chat.service.ts, notifications/notifications.gateway.ts
        'not_a_participant': _l.errorChatNotAParticipant,
        'message_too_long': _l.errorChatMessageTooLong,
        'message_content_required': _l.errorChatMessageContentRequired,
        'invalid_conversation_id': _l.errorChatInvalidConversationId,
        'direct_conversation_requires_one_participant': _l.errorChatDirectRequiresOneParticipant,
        'participant_not_found': _l.errorChatParticipantNotFound,
        'not_joined': _l.errorChatNotJoined,
        // leave/leave.service.ts
        'invalid_date': _l.errorDateInvalid,
        'leave_request_not_found': _l.errorLeaveRequestNotFound,
        'not_your_leave_request': _l.errorLeaveNotYourRequest,
        'leave_request_not_pending': _l.errorLeaveRequestNotPending,
        // tasks/tasks.service.ts
        'task_not_found': _l.errorTaskNotFound,
        'not_task_assignee': _l.errorTaskNotAssignee,
        // users/users.service.ts:180-219
        'password_complexity': _l.errorPasswordComplexity,
        'password_reuse': _l.errorPasswordReuse,
      };
      expected.forEach((code, text) {
        for (final status in [400, 401, 403, 404, 409, 429, 500]) {
          expect(errorText(_l, code, status: status), text, reason: '$status $code');
        }
      });
      // Distinct wording, except the four codes of an ended session
      expect(expected.values.toSet(), hasLength(expected.length - 3));
    });

    test('UT-ERR-02: an unknown code or none falls back to the status', () {
      final byStatus = {
        400: _l.errorStatusBadRequest,
        401: _l.errorAuthSessionExpired,
        403: _l.errorStatusForbidden,
        404: _l.errorStatusNotFound,
        409: _l.errorStatusConflict,
        422: _l.errorStatusUnprocessable,
        429: _l.errorStatusTooManyRequests,
        500: _l.errorStatusServer,
        503: _l.errorStatusServer,
      };
      byStatus.forEach((status, text) {
        expect(errorText(_l, 'something_new', status: status), text, reason: '$status');
        expect(errorText(_l, null, status: status), text, reason: '$status');
      });
      expect(errorText(_l, null, status: 418), _l.errorStatusOther(418));
      // An error answer without a status
      expect(errorText(_l, null), _l.errorUnexpected);
    });

    test('UT-ERR-03: network and device failures, whatever status is passed', () {
      final byKind = {
        FailureKind.timeout: _l.errorNetworkTimeout,
        FailureKind.connection: _l.errorNetworkConnection,
        FailureKind.badCertificate: _l.errorNetworkBadCertificate,
        FailureKind.cancelled: _l.errorNetworkCancelled,
        FailureKind.requestFailed: _l.errorNetworkUnknown,
        FailureKind.locationPermissionDenied: _l.errorLocationPermissionDenied,
        FailureKind.locationServiceDisabled: _l.errorLocationServiceDisabled,
        FailureKind.unexpected: _l.errorUnexpected,
      };
      byKind.forEach((kind, text) {
        expect(errorText(_l, null, kind: kind), text, reason: '$kind');
        expect(errorText(_l, null, status: 500, kind: kind), text, reason: '$kind');
      });
    });

    test('UT-ERR-04: validation_failed shows the first class-validator message, else the 400 text', () {
      expect(
        errorText(_l, 'validation_failed', status: 400, validationMessage: 'title should not be empty'),
        _l.errorValidationFailed('title should not be empty'),
      );
      expect(errorText(_l, 'validation_failed', status: 400), _l.errorStatusBadRequest);
    });
  });

  group('sign-in rules (ErrorFlow.login)', () {
    test('UT-ERR-05: a 401 is the credentials or the second-factor code, never an expired session', () {
      String login401(String? code) => errorText(_l, code, status: 401, flow: ErrorFlow.login);
      expect(login401('invalid_credentials'), _l.errorAuthInvalidCredentials);
      expect(login401('session_expired'), _l.errorAuthInvalidCredentials);
      expect(login401('account_disabled'), _l.errorAuthInvalidCredentials);
      expect(login401(null), _l.errorAuthInvalidCredentials);
      expect(login401('invalid_otp'), _l.errorAuthInvalidOtp);
      expect(login401('invalid_code'), _l.errorMfaInvalidCode);
      expect(login401('mfa_token_invalid'), _l.errorMfaTokenInvalid);
    });

    test('UT-ERR-06: 403 and 429 keep a known code, otherwise the sign-in wording', () {
      String login(String? code, int status) => errorText(_l, code, status: status, flow: ErrorFlow.login);
      expect(login('no_role_assigned', 403), _l.errorAuthNoRoleAssigned);
      expect(login('account_disabled', 403), _l.errorAuthAccountDisabled);
      expect(login('account_locked', 403), _l.errorAuthAccountLocked);
      expect(login('something_new', 403), _l.errorAuthLoginForbidden);
      expect(login('mfa_locked', 429), _l.errorMfaLocked);
      expect(login('ThrottlerException: Too Many Requests', 429), _l.errorStatusTooManyRequests);
      // Everything else as for any call
      expect(errorText(_l, 'validation_failed', status: 400, validationMessage: 'x', flow: ErrorFlow.login),
          _l.errorValidationFailed('x'));
      expect(errorText(_l, null, kind: FailureKind.connection, flow: ErrorFlow.login), _l.errorNetworkConnection);
      expect(login(null, 500), _l.errorStatusServer);
    });
  });

  test('UT-ERR-07: change password: invalid_credentials is about the current password', () {
    expect(errorText(_l, 'invalid_credentials', status: 400, flow: ErrorFlow.changePassword),
        _l.errorPasswordCurrentWrong);
    expect(errorText(_l, 'password_reuse', status: 400, flow: ErrorFlow.changePassword), _l.errorPasswordReuse);
    // Elsewhere it stays the sign-in wording
    expect(errorText(_l, 'invalid_credentials', status: 400), _l.errorAuthInvalidCredentials);
  });

  test('UT-ERR-08: chat acknowledgements: a known code, else the refusal is named', () {
    expect(errorText(_l, 'not_a_participant', flow: ErrorFlow.chatAck), _l.errorChatNotAParticipant);
    expect(errorText(_l, 'room_full', flow: ErrorFlow.chatAck), _l.errorChatJoinFailed('room_full'));
  });

  test('UT-ERR-09: errorTextFor and ApiFailure.text word errors through the same table', () {
    expect(errorTextFor(_l, _answer(403, {'message': 'not_a_participant'})), _l.errorChatNotAParticipant);
    expect(
      errorTextFor(_l, _answer(400, {
        'message': 'validation_failed',
        'errors': ['location must be shorter than or equal to 255 characters'],
      })),
      _l.errorValidationFailed('location must be shorter than or equal to 255 characters'),
    );
    expect(
      errorTextFor(_l, DioException(requestOptions: RequestOptions(path: '/x'), type: DioExceptionType.connectionError)),
      _l.errorNetworkConnection,
    );
    expect(errorTextFor(_l, _answer(401, {'message': 'session_expired'}), flow: ErrorFlow.login),
        _l.errorAuthInvalidCredentials);
    expect(const ApiFailure(code: 'invalid_credentials', status: 400).text(_l, flow: ErrorFlow.changePassword),
        _l.errorPasswordCurrentWrong);
    expect(errorTextFor(_l, StateError('boom')), _l.errorUnexpected);
  });
}

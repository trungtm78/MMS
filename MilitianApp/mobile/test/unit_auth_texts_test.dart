// Unit Tests: auth text mappers (lib/features/auth/auth_texts.dart) — session-end notices, refused
// auth answers, sign-in errors and second-factor errors resolved through the resources.
// Run: flutter test test/unit_auth_texts_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/network/session_events.dart';
import 'package:militian_app/features/auth/auth_texts.dart';
import 'package:militian_app/features/auth/models/auth_error.dart';
import 'package:militian_app/features/auth/models/auth_response_exception.dart';
import 'package:militian_app/features/auth/models/mfa_error.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/l10n.dart';

final _l = viL10n;

void main() {
  test('UT-AUTHTXT-01: every session-end reason has a notice', () {
    final expected = {
      SessionEndReason.ended: _l.authLoginNoticeSessionEnded,
      SessionEndReason.passwordChanged: _l.authLoginNoticePasswordChanged,
      SessionEndReason.mfaReauthenticationRequired: _l.errorMfaReauthenticationRequired,
      SessionEndReason.accountDisabled: _l.errorAuthAccountDisabled,
      SessionEndReason.noRoleAssigned: _l.errorAuthNoRoleAssigned,
    };
    expect(expected.keys, containsAll(SessionEndReason.values));
    expected.forEach((reason, text) => expect(sessionEndText(_l, reason), text, reason: '$reason'));
  });

  test('UT-AUTHTXT-02: every refused auth answer has a text', () {
    final expected = {
      AuthResponseIssue.missingTokens: _l.errorAuthMissingTokens,
      AuthResponseIssue.roleNotAllowed: _l.errorAuthRoleNotAllowed,
      AuthResponseIssue.recoveryCodesMissing: _l.errorAuthRecoveryCodesMissing,
    };
    expect(expected.keys, containsAll(AuthResponseIssue.values));
    expected.forEach((issue, text) => expect(authIssueText(_l, issue), text, reason: '$issue'));
  });

  test('UT-AUTHTXT-03: sign-in errors use the sign-in rules of the error table', () {
    expect(authErrorText(_l, const AuthRequestError(ApiFailure(code: 'session_expired', status: 401))),
        _l.errorAuthInvalidCredentials);
    expect(authErrorText(_l, const AuthRequestError(ApiFailure(code: 'something_new', status: 403))),
        _l.errorAuthLoginForbidden);
    expect(authErrorText(_l, const AuthResponseError(AuthResponseIssue.roleNotAllowed)),
        _l.errorAuthRoleNotAllowed);
    expect(
      authErrorText(_l, const AuthMfaError(MfaError(code: MfaError.invalidCode, attemptsRemaining: 2))),
      _l.errorMfaInvalidCodeAttempts(2),
    );
  });

  group('mfaErrorText', () {
    test('UT-AUTHTXT-04: MFA codes, attempts left and app codes', () {
      expect(mfaErrorText(_l, const MfaError(code: MfaError.invalidCode, attemptsRemaining: 4)),
          _l.errorMfaInvalidCodeAttempts(4));
      expect(mfaErrorText(_l, const MfaError(code: MfaError.invalidCode)), _l.errorMfaInvalidCode);
      expect(mfaErrorText(_l, MfaError.missingChallenge()), _l.errorMfaTokenInvalid);
      expect(mfaErrorText(_l, const MfaError(code: MfaError.recoveryCodesMissing)),
          _l.errorAuthRecoveryCodesMissing);
      expect(
        mfaErrorText(_l, const MfaError(code: MfaError.sessionRejected, issue: AuthResponseIssue.roleNotAllowed)),
        _l.errorAuthRoleNotAllowed,
      );
    });

    test('UT-AUTHTXT-05: anything else is worded from the failed call', () {
      expect(
        mfaErrorText(_l, const MfaError(code: MfaError.throttled, failure: ApiFailure(status: 429))),
        _l.errorStatusTooManyRequests,
      );
      expect(
        mfaErrorText(_l, const MfaError(code: 'unknown', failure: ApiFailure(kind: FailureKind.connection))),
        _l.errorNetworkConnection,
      );
      expect(mfaErrorText(_l, const MfaError(code: 'unknown')), _l.errorUnexpected);
    });
  });
}

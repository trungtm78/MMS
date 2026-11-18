// Widget Tests: security screen (T15 Bearer routes)
//   GET /auth/mfa/status, POST /auth/mfa/setup, POST /auth/mfa/confirm,
//   POST /auth/mfa/recovery-codes/regenerate {code}, POST /auth/mfa/disable {method, code} → 204
//   (Web/backend/src/auth/mfa/mfa.controller.ts:133-186, mfa.service.ts:262-456)
// Run: flutter test test/widget_security_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/auth/screens/change_password_screen.dart';
import 'package:police_app/features/auth/screens/security_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _codes = List.generate(10, (i) => 'FGHJK-6789$i');

class _Backend {
  _Backend({
    required this.enabled,
    required this.required,
    this.disableStatus = 204,
    this.statusFailures = 0,
    this.setupStatus = 200,
    this.confirmStatus = 200,
    this.confirmCode = 'invalid_code',
    this.regenerateStatus = 200,
  });

  bool enabled;
  final bool required;
  final int disableStatus;
  final int setupStatus;
  final int confirmStatus;
  final String confirmCode;
  final int regenerateStatus;

  /// How many GET /auth/mfa/status calls fail with 500 before one succeeds
  int statusFailures;

  ResponseBody _error(int status, String code) =>
      jsonBody(status, {'code': 'E004', 'message': code, 'statusCode': status});

  ResponseBody handle(RequestOptions o) {
    switch (o.path) {
      case '/auth/mfa/status':
        if (statusFailures > 0) {
          statusFailures--;
          return _error(500, 'Internal server error');
        }
        return jsonBody(200, {
          'enabled': enabled,
          'enrolledAt': enabled ? '2026-09-01T02:00:00.000Z' : null,
          'required': required,
          'recoveryCodesRemaining': enabled ? 7 : 0,
        });
      case '/auth/mfa/setup':
        if (setupStatus != 200) return _error(setupStatus, 'mfa_already_enabled');
        return jsonBody(200, {
          'mfaToken': 'setup-token',
          'secret': 'KRSXG5CTMVRXEZLU',
          'otpauthUri': 'otpauth://totp/MMS:ca01?secret=KRSXG5CTMVRXEZLU&issuer=MMS',
          'qrUri': 'otpauth://totp/MMS:ca01?secret=KRSXG5CTMVRXEZLU&issuer=MMS',
          'expiresAt': '2026-09-14T01:10:00.000Z',
        });
      // Enabling MFA ends every earlier session and returns the replacement (mfa.service.ts:338-356)
      case '/auth/mfa/confirm':
        if (confirmStatus != 200) return _error(confirmStatus, confirmCode);
        enabled = true;
        return jsonBody(200, {
          'recoveryCodes': _codes,
          'user': {'id': 'u1', 'username': 'ca01', 'fullName': 'CA', 'status': 'active', 'role': 'ca_officer'},
          'tokens': {'accessToken': 'mfa_access', 'refreshToken': 'mfa_refresh', 'expiresIn': 900},
        });
      case '/auth/mfa/recovery-codes/regenerate':
        if (regenerateStatus != 200) return _error(regenerateStatus, 'invalid_code');
        return jsonBody(200, {'recoveryCodes': _codes});
      case '/auth/mfa/disable':
        if (disableStatus != 204) return _error(disableStatus, 'mfa_required_by_role');
        enabled = false;
        return ResponseBody.fromString('', 204);
    }
    return jsonBody(404, {'message': 'not found'});
  }
}

Future<FakeAdapter> _pump(WidgetTester tester, _Backend backend, {MemoryStorage? storage}) async {
  final adapter = FakeAdapter(backend.handle);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage ?? MemoryStorage(role: 'ca')),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedApp(const SecurityScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> _tapText<T extends Widget>(WidgetTester tester, String text) async {
  final finder = find.widgetWithText(T, text);
  await tester.ensureVisible(finder);
  // ensureVisible scrolls without laying out again; settle before reading the position
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

RequestOptions _last(FakeAdapter a, String path) => a.requests.lastWhere((r) => r.path == path);

void main() {
  testWidgets('WT-SEC-01: turning MFA on shows the QR step, then the recovery codes', (tester) async {
    final adapter = await _pump(tester, _Backend(enabled: false, required: true));

    expect(find.text(viL10n.authSecurityTitle), findsOneWidget);
    expect(find.text(viL10n.authSecurityMfaDisabled), findsOneWidget);
    await _tapText<ElevatedButton>(tester, viL10n.authSecurityEnableMfa);
    expect(find.text('KRSXG5CTMVRXEZLU'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('enroll_code_field')), '123456');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);

    expect(_last(adapter, '/auth/mfa/confirm').data, {'mfaToken': 'setup-token', 'code': '123456'});
    expect(find.text('FGHJK-67890'), findsOneWidget);
  });

  testWidgets('WT-SEC-02: a role that requires MFA cannot turn it off', (tester) async {
    await _pump(tester, _Backend(enabled: true, required: true));

    expect(find.text(viL10n.authSecurityMfaEnabled), findsOneWidget);
    expect(find.text(viL10n.authSecurityEnabledSince('01/09/2026')), findsOneWidget);
    expect(find.text(viL10n.authSecurityRecoveryCodesRemaining(7)), findsOneWidget);
    expect(find.text(viL10n.authSecurityMfaRequiredByRole), findsOneWidget);
    final disable = find.widgetWithText(OutlinedButton, viL10n.authSecurityDisableMfa);
    await tester.ensureVisible(disable);
    expect(tester.widget<OutlinedButton>(disable).onPressed, isNull);
  });

  testWidgets('WT-SEC-03: turning MFA off sends the method and code, then reloads the status', (tester) async {
    final adapter = await _pump(tester, _Backend(enabled: true, required: false));

    await _tapText<OutlinedButton>(tester, viL10n.authSecurityDisableMfa);
    expect(find.text(viL10n.authSecurityDisableDialogTitle), findsOneWidget);
    await tester.enterText(find.byKey(const Key('mfa_dialog_code')), '111111');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);

    expect(_last(adapter, '/auth/mfa/disable').data, {'method': 'totp', 'code': '111111'});
    expect(find.text(viL10n.authSecurityMfaDisabledDone), findsOneWidget);
    expect(find.text(viL10n.authSecurityMfaDisabled), findsOneWidget);
  });

  testWidgets('WT-SEC-04: regenerating recovery codes shows the new codes', (tester) async {
    final adapter = await _pump(tester, _Backend(enabled: true, required: false));

    await _tapText<OutlinedButton>(tester, viL10n.authSecurityRegenerateCodes);
    expect(find.text(viL10n.authSecurityRegenerateDialogTitle), findsOneWidget);
    await tester.enterText(find.byKey(const Key('mfa_dialog_code')), '222222');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);

    expect(_last(adapter, '/auth/mfa/recovery-codes/regenerate').data, {'code': '222222'});
    expect(find.text('FGHJK-67895'), findsOneWidget);
  });

  testWidgets('WT-SEC-05: the backend refusing to disable is shown', (tester) async {
    await _pump(tester, _Backend(enabled: true, required: false, disableStatus: 403));

    await _tapText<OutlinedButton>(tester, viL10n.authSecurityDisableMfa);
    await tester.enterText(find.byKey(const Key('mfa_dialog_code')), '111111');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);

    expect(find.text(viL10n.errorMfaRequiredByRole), findsOneWidget);
  });

  testWidgets('WT-SEC-06: the replacement session starts when the codes are acknowledged, not before',
      (tester) async {
    final storage = MemoryStorage(role: 'ca');
    await _pump(tester, _Backend(enabled: false, required: true), storage: storage);

    await _tapText<ElevatedButton>(tester, viL10n.authSecurityEnableMfa);
    await tester.enterText(find.byKey(const Key('enroll_code_field')), '123456');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);
    expect(storage.access, 'old_access');

    // Leaving would lose the only valid session: back does not close the codes
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('FGHJK-67890'), findsOneWidget);

    await _tapText<CheckboxListTile>(tester, viL10n.authRecoveryCodesSavedConfirm);
    await _tapText<ElevatedButton>(tester, viL10n.authRecoveryCodesContinue);

    expect(storage.access, 'mfa_access');
    expect(storage.refresh, 'mfa_refresh');
    expect(find.text(viL10n.authSecurityMfaEnabled), findsOneWidget);
  });

  testWidgets('WT-SEC-07: the security screen leads to the password change', (tester) async {
    await _pump(tester, _Backend(enabled: true, required: true));

    await _tapText<ListTile>(tester, viL10n.authSecurityChangePassword);

    expect(find.byType(ChangePasswordScreen), findsOneWidget);
  });

  testWidgets('WT-SEC-08: a failed status load is explained and can be retried', (tester) async {
    await _pump(tester, _Backend(enabled: false, required: false, statusFailures: 1));

    expect(find.text(viL10n.errorServer), findsOneWidget);
    await _tapText<ElevatedButton>(tester, viL10n.commonRetry);

    expect(find.text(viL10n.authSecurityMfaDisabled), findsOneWidget);
  });

  testWidgets('WT-SEC-09: a refused setup is shown', (tester) async {
    await _pump(tester, _Backend(enabled: false, required: false, setupStatus: 409));

    await _tapText<ElevatedButton>(tester, viL10n.authSecurityEnableMfa);
    expect(find.text(viL10n.errorMfaAlreadyEnabled), findsOneWidget);
  });

  testWidgets('WT-SEC-10: a wrong first code stays on the QR step; an expired one offers a restart', (tester) async {
    await _pump(tester, _Backend(enabled: false, required: false, confirmStatus: 401));

    await _tapText<ElevatedButton>(tester, viL10n.authSecurityEnableMfa);
    await tester.enterText(find.byKey(const Key('enroll_code_field')), '000000');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);
    expect(find.text(viL10n.errorInvalidCode), findsOneWidget);
    expect(find.text(viL10n.authSecurityRestartSetup), findsNothing);
  });

  testWidgets('WT-SEC-12: an expired enrolment challenge is restarted from the security screen', (tester) async {
    await _pump(tester, _Backend(enabled: false, required: false, confirmStatus: 401, confirmCode: 'mfa_token_invalid'));

    await _tapText<ElevatedButton>(tester, viL10n.authSecurityEnableMfa);
    await tester.enterText(find.byKey(const Key('enroll_code_field')), '123456');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);
    expect(find.text(viL10n.errorMfaTokenInvalid), findsOneWidget);

    await _tapText<OutlinedButton>(tester, viL10n.authSecurityRestartSetup);

    expect(find.text('KRSXG5CTMVRXEZLU'), findsNothing);
    expect(find.widgetWithText(ElevatedButton, viL10n.authSecurityEnableMfa), findsOneWidget);
  });

  testWidgets('WT-SEC-11: the code dialog checks input, offers recovery codes and can be cancelled',
      (tester) async {
    final adapter = await _pump(
      tester,
      _Backend(enabled: true, required: false, disableStatus: 403, regenerateStatus: 401),
    );

    await _tapText<OutlinedButton>(tester, viL10n.authSecurityDisableMfa);
    await tester.enterText(find.byKey(const Key('mfa_dialog_code')), '12');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);
    expect(find.text(viL10n.errorOtpFormat), findsOneWidget);

    await tester.tap(find.text(viL10n.authOtpMethodRecoveryCode));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('mfa_dialog_code')), ' ');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);
    expect(find.text(viL10n.errorRecoveryCodeRequired), findsOneWidget);

    await tester.enterText(find.byKey(const Key('mfa_dialog_code')), 'abcde-fghij');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);
    expect(_last(adapter, '/auth/mfa/disable').data, {'method': 'recovery_code', 'code': 'abcde-fghij'});
    expect(find.text(viL10n.errorMfaRequiredByRole), findsOneWidget);
    // One snackbar at a time: clear it so the next message shows at once
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).removeCurrentSnackBar();
    await tester.pumpAndSettle();

    await _tapText<OutlinedButton>(tester, viL10n.authSecurityRegenerateCodes);
    await _tapText<TextButton>(tester, viL10n.commonCancel);
    expect(adapter.requests.where((r) => r.path == '/auth/mfa/recovery-codes/regenerate'), isEmpty);

    await _tapText<OutlinedButton>(tester, viL10n.authSecurityRegenerateCodes);
    await tester.enterText(find.byKey(const Key('mfa_dialog_code')), '222222');
    await _tapText<ElevatedButton>(tester, viL10n.commonConfirm);
    expect(find.text(viL10n.errorInvalidCode), findsOneWidget);
  });
}

// Widget Tests: Security screen — second factor management for a signed-in user
//   - disabled: enable → QR/secret → POST /auth/mfa/confirm → recovery codes → reload. Enabling MFA
//     ends every earlier session; the answer {recoveryCodes, user, tokens} is the replacement, stored
//     only when the codes are acknowledged, and the codes screen cannot be left before that
//   - enabled + required by role: the disable button is disabled
//   - disable: method + code → POST /auth/mfa/disable → {user, tokens}: every session ended, the caller's
//     replacement is stored at once → reload
//   - regenerate: TOTP code → POST /auth/mfa/recovery-codes/regenerate → recovery codes
// Contract: Web/backend/src/auth/mfa/mfa.controller.ts (setup, confirm :142-153, status,
// recovery-codes/regenerate, disable), mfa.service.ts (status, disable, rejectCode, :338-361)
// Text is asserted through the resources (viL10n).
// Run: flutter test test/widget_security_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/auth/screens/recovery_codes_screen.dart';
import 'package:militian_app/features/profile/screens/security_screen.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

/// The account's second factor as GET /auth/mfa/status reports it.
class _Account {
  _Account({this.enabled = false, this.required = false, this.remaining = 0});
  bool enabled;
  bool required;
  int remaining;

  ResponseBody status(RequestOptions _) => jsonBody(200, {
        'enabled': enabled,
        'enrolledAt': enabled ? '2026-09-01T05:00:00.000Z' : null,
        'required': required,
        'recoveryCodesRemaining': enabled ? remaining : 0,
      });
}

Future<FakeAdapter> _pumpSecurity(
  WidgetTester tester,
  Map<String, ResponseBody Function(RequestOptions)> api, {
  MemoryStorage? storage,
}) async {
  final store = storage ?? MemoryStorage(roles: ['dqtv']);
  final adapter = FakeAdapter(routeTable(api));
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(store),
      authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(store, dio: dio)),
    ],
    child: localizedApp(const SecurityScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> _tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _enter(WidgetTester tester, String key, String text) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.enterText(finder, text);
  await tester.pump();
}

Future<void> _acknowledgeCodes(WidgetTester tester) async {
  await _tapKey(tester, 'ack_checkbox');
  await _tapKey(tester, 'continue_button');
}

VoidCallback? _onPressed(WidgetTester tester, String key) =>
    tester.widget<ButtonStyleButton>(find.byKey(Key(key))).onPressed;

List<String> _calls(FakeAdapter adapter) =>
    adapter.requests.map((o) => '${o.method} ${o.path}').toList();

void main() {
  testWidgets(
      'WT-SEC-01: enabling shows the QR, confirms the code, holds the replacement session on the '
      'codes screen until acknowledged, then stores it and reloads', (tester) async {
    final account = _Account();
    final storage = MemoryStorage(roles: ['dqtv']);
    final adapter = await _pumpSecurity(tester, {
      'GET /auth/mfa/status': account.status,
      'POST /auth/mfa/setup': (_) => jsonBody(200, backendEnrollment()),
      'POST /auth/mfa/confirm': (_) {
        account
          ..enabled = true
          ..remaining = 10;
        // Enabling MFA ended every earlier session; the answer carries the replacement
        return jsonBody(200, mfaConfirmSession());
      },
    }, storage: storage);

    expect(find.text(viL10n.profileSecurityTitle), findsOneWidget);
    expect(find.text(viL10n.profileSecurityHeading), findsOneWidget);
    expect(find.text(viL10n.profileSecurityIntro), findsOneWidget);
    expect(find.text(viL10n.profileSecurityStatusDisabled), findsOneWidget);

    await _tapKey(tester, 'enable_mfa');

    expect(find.text(viL10n.profileSecurityEnableButton), findsNothing);
    expect(find.byType(QrImageView), findsOneWidget);
    expect(
      find.byWidgetPredicate((w) => w is SelectableText && w.data == testTotpSecret),
      findsOneWidget,
    );

    await _enter(tester, 'enroll_code_field', '112233');
    await _tapKey(tester, 'enroll_confirm_button');

    expect(_calls(adapter), ['GET /auth/mfa/status', 'POST /auth/mfa/setup', 'POST /auth/mfa/confirm']);
    expect(adapter.requests.last.data, {'mfaToken': testMfaToken, 'code': '112233'});
    expect(find.byType(RecoveryCodesScreen), findsOneWidget);
    expect(find.text(testRecoveryCodes.first), findsOneWidget);
    // The replacement session is not stored yet
    expect(storage.access, 'old_access');

    // Ticking the box is not acknowledging: back does not leave the codes while the session is held
    await _tapKey(tester, 'ack_checkbox');
    await tester.state<NavigatorState>(find.byType(Navigator).last).maybePop();
    await tester.pumpAndSettle();
    expect(find.byType(RecoveryCodesScreen), findsOneWidget);
    expect(storage.access, 'old_access');

    await _tapKey(tester, 'continue_button');

    expect(find.byType(RecoveryCodesScreen), findsNothing);
    expect(storage.access, 'tok_access');
    expect(storage.refresh, 'tok_refresh');
    expect(storage.roles, ['dqtv']);
    expect(_calls(adapter).last, 'GET /auth/mfa/status');
    expect(find.text(viL10n.profileSecurityStatusEnabled), findsOneWidget);
    expect(find.text(viL10n.profileSecurityRecoveryCodesRemaining(10)), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
  });

  testWidgets('WT-SEC-02: a role that requires MFA cannot disable it', (tester) async {
    await _pumpSecurity(tester, {
      'GET /auth/mfa/status': _Account(enabled: true, required: true, remaining: 8).status,
    });

    expect(find.text(viL10n.profileSecurityStatusEnabled), findsOneWidget);
    expect(find.text(viL10n.profileSecurityEnabledOn('01/09/2026')), findsOneWidget);
    expect(find.text(viL10n.profileSecurityRecoveryCodesRemaining(8)), findsOneWidget);
    expect(find.text(viL10n.profileSecurityRecoveryCodesLow), findsNothing);
    expect(find.text(viL10n.profileSecurityRequiredNote), findsOneWidget);
    expect(find.text(viL10n.profileSecurityDisableButton), findsOneWidget);
    expect(_onPressed(tester, 'disable_mfa'), isNull);
    expect(_onPressed(tester, 'regenerate_codes'), isNotNull);
  });

  testWidgets('WT-SEC-03: disabling sends the chosen method and code, stores the replacement session, '
      'then reloads', (tester) async {
    final account = _Account(enabled: true, remaining: 8);
    final storage = MemoryStorage(roles: ['dqtv']);
    final adapter = await _pumpSecurity(tester, {
      'GET /auth/mfa/status': account.status,
      'POST /auth/mfa/disable': (_) {
        account.enabled = false;
        // Disabling MFA ended every session of the account; the answer carries the caller's new one
        return jsonBody(200, mfaDisableSession());
      },
    }, storage: storage);

    expect(_onPressed(tester, 'disable_mfa'), isNotNull);
    await _tapKey(tester, 'disable_mfa');
    final dialog = find.byType(AlertDialog);
    expect(find.descendant(of: dialog, matching: find.text(viL10n.profileSecurityDisableDialogTitle)), findsOneWidget);
    expect(find.text(viL10n.profileSecurityDisableDialogDescription), findsOneWidget);
    await tester.tap(find.text(viL10n.authMfaMethodRecoveryCode));
    await tester.pumpAndSettle();
    await _enter(tester, 'mfa_dialog_code_field', 'ABCDE-FGHJK');
    await _tapKey(tester, 'mfa_dialog_confirm');

    final disable = adapter.requests.firstWhere((o) => o.path == '/auth/mfa/disable');
    expect(disable.method, 'POST');
    expect(disable.data, {'method': 'recovery_code', 'code': 'ABCDE-FGHJK'});
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text(viL10n.profileSecurityDisabledSnack), findsOneWidget);
    expect(storage.access, 'tok_access');
    expect(storage.refresh, 'tok_refresh');
    expect(storage.roles, ['dqtv']);
    expect(_calls(adapter).last, 'GET /auth/mfa/status');
    expect(find.text(viL10n.profileSecurityStatusDisabled), findsOneWidget);
  });

  testWidgets('WT-SEC-04: a wrong code keeps the dialog open with the error', (tester) async {
    final adapter = await _pumpSecurity(tester, {
      'GET /auth/mfa/status': _Account(enabled: true, remaining: 8).status,
      'POST /auth/mfa/disable': (_) => jsonBody(401, backendError(401, 'invalid_code')),
    });

    await _tapKey(tester, 'disable_mfa');
    await _enter(tester, 'mfa_dialog_code_field', '000000');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    expect(adapter.requests.last.data, {'method': 'totp', 'code': '000000'});
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('mfa_error'))).data, viL10n.errorMfaInvalidCode);
    expect(find.text(viL10n.profileSecurityDisabledSnack), findsNothing);
  });

  testWidgets('WT-SEC-05: regenerating asks for a TOTP code and shows the new codes',
      (tester) async {
    final adapter = await _pumpSecurity(tester, {
      'GET /auth/mfa/status': _Account(enabled: true, remaining: 2).status,
      'POST /auth/mfa/recovery-codes/regenerate': (_) =>
          jsonBody(200, {'recoveryCodes': testRecoveryCodes}),
    });

    expect(find.text(viL10n.profileSecurityRecoveryCodesLow), findsOneWidget);
    await _tapKey(tester, 'regenerate_codes');
    expect(find.text(viL10n.profileSecurityRegenerateDialogDescription), findsOneWidget);
    expect(find.text(viL10n.authMfaMethodRecoveryCode), findsNothing);
    await _enter(tester, 'mfa_dialog_code_field', '445566');
    await _tapKey(tester, 'mfa_dialog_confirm');

    final regenerate =
        adapter.requests.firstWhere((o) => o.path == '/auth/mfa/recovery-codes/regenerate');
    expect(regenerate.method, 'POST');
    expect(regenerate.data, {'code': '445566'});
    expect(find.byType(RecoveryCodesScreen), findsOneWidget);
    expect(find.text(testRecoveryCodes.last), findsOneWidget);

    await _acknowledgeCodes(tester);

    expect(find.byType(RecoveryCodesScreen), findsNothing);
    expect(_calls(adapter).last, 'GET /auth/mfa/status');
  });

  testWidgets('WT-SEC-06: a status error can be retried', (tester) async {
    var calls = 0;
    await _pumpSecurity(tester, {
      'GET /auth/mfa/status': (o) => ++calls == 1
          ? jsonBody(500, backendError(500, 'Internal server error'))
          : _Account().status(o),
    });

    expect(find.text(viL10n.errorStatusServer), findsOneWidget);
    expect(find.text(viL10n.profileSecurityRetryButton), findsOneWidget);

    await _tapKey(tester, 'reload_status');

    expect(find.text(viL10n.profileSecurityStatusDisabled), findsOneWidget);
  });

  testWidgets('WT-SEC-07: enabling when it was enabled elsewhere explains it and shows the new state',
      (tester) async {
    final account = _Account(required: true);
    await _pumpSecurity(tester, {
      'GET /auth/mfa/status': account.status,
      'POST /auth/mfa/setup': (_) {
        account.enabled = true;
        return jsonBody(409, backendError(409, 'mfa_already_enabled'));
      },
    });
    expect(find.text(viL10n.profileSecurityRequiredNote), findsOneWidget);

    await _tapKey(tester, 'enable_mfa');

    expect(tester.widget<Text>(find.byKey(const Key('mfa_action_error'))).data, viL10n.errorMfaAlreadyEnabled);
    expect(find.text(viL10n.profileSecurityStatusEnabled), findsOneWidget);
  });

  testWidgets('WT-SEC-08: a confirmed setup without recovery codes suggests creating new ones',
      (tester) async {
    final account = _Account();
    final storage = MemoryStorage(roles: ['dqtv']);
    await _pumpSecurity(tester, {
      'GET /auth/mfa/status': account.status,
      'POST /auth/mfa/setup': (_) => jsonBody(200, backendEnrollment()),
      'POST /auth/mfa/confirm': (_) {
        account
          ..enabled = true
          ..remaining = 0;
        return jsonBody(200, mfaConfirmSession()..remove('recoveryCodes'));
      },
    }, storage: storage);

    await _tapKey(tester, 'enable_mfa');
    await _enter(tester, 'enroll_code_field', '112233');
    await _tapKey(tester, 'enroll_confirm_button');

    expect(find.byType(RecoveryCodesScreen), findsNothing);
    expect(tester.widget<Text>(find.byKey(const Key('mfa_action_error'))).data,
        viL10n.errorAuthRecoveryCodesMissing);
    expect(find.text(viL10n.profileSecurityStatusEnabled), findsOneWidget);
    expect(storage.access, 'tok_access');
  });

  testWidgets('WT-SEC-09: cancelling a setup, or restarting a locked one, returns to the status',
      (tester) async {
    await _pumpSecurity(tester, {
      'GET /auth/mfa/status': _Account().status,
      'POST /auth/mfa/setup': (_) => jsonBody(200, backendEnrollment()),
      'POST /auth/mfa/confirm': (_) => jsonBody(429, backendError(429, 'mfa_locked')),
    });

    await _tapKey(tester, 'enable_mfa');
    expect(find.text(viL10n.commonCancelButton), findsOneWidget);
    await _tapKey(tester, 'cancel_setup');
    expect(find.byType(QrImageView), findsNothing);
    expect(find.text(viL10n.profileSecurityStatusDisabled), findsOneWidget);

    await _tapKey(tester, 'enable_mfa');
    await _enter(tester, 'enroll_code_field', '112233');
    await _tapKey(tester, 'enroll_confirm_button');
    expect(tester.widget<Text>(find.byKey(const Key('mfa_error'))).data, viL10n.errorMfaLocked);
    expect(find.text(viL10n.profileSecurityRestartSetupButton), findsOneWidget);

    await _tapKey(tester, 'restart_login');

    expect(find.byType(QrImageView), findsNothing);
    expect(find.text(viL10n.profileSecurityStatusDisabled), findsOneWidget);
  });

  testWidgets('WT-SEC-10: a blank recovery code is refused locally; cancel closes the dialog',
      (tester) async {
    final adapter = await _pumpSecurity(tester, {
      'GET /auth/mfa/status': _Account(enabled: true, remaining: 8).status,
    });

    await _tapKey(tester, 'disable_mfa');
    await tester.tap(find.text(viL10n.authMfaMethodRecoveryCode));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.authMfaRecoveryCodeHint), findsOneWidget);
    await _tapKey(tester, 'mfa_dialog_confirm');
    expect(find.text(viL10n.validationRecoveryCodeRequired), findsOneWidget);

    await tester.tap(find.text(viL10n.authMfaMethodTotp));
    await tester.pumpAndSettle();
    await _enter(tester, 'mfa_dialog_code_field', '12');
    await _tapKey(tester, 'mfa_dialog_confirm');
    expect(find.text(viL10n.validationOtpFormat), findsOneWidget);

    await tester.tap(find.widgetWithText(TextButton, viL10n.commonCancelButton));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
    expect(_calls(adapter), ['GET /auth/mfa/status']);
  });
}

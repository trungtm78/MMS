// Widget Tests: enrolment during sign-in (MFA_SETUP_REQUIRED, T15)
//   POST /auth/mfa/enroll {mfaToken} → {mfaToken, secret, otpauthUri, qrUri, expiresAt}
//   POST /auth/mfa/enroll/confirm {mfaToken, code} → {status: SUCCESS, user, tokens, recoveryCodes}
// The recovery codes are shown once and must be acknowledged before the home screen.
// Run: flutter test test/widget_mfa_enroll_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/auth/screens/mfa_setup_screen.dart';
import 'package:police_app/features/auth/screens/recovery_codes_screen.dart';
import 'package:police_app/shared/services/external_link_service.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _codes = List.generate(10, (i) => 'ABCDE-1234$i');

const _enrollment = {
  'mfaToken': 'mfa-token',
  'secret': 'JBSWY3DPEHPK3PXP',
  'otpauthUri': 'otpauth://totp/MMS:dqtv01?secret=JBSWY3DPEHPK3PXP&issuer=MMS',
  'qrUri': 'otpauth://totp/MMS:dqtv01?secret=JBSWY3DPEHPK3PXP&issuer=MMS',
  'expiresAt': '2026-09-14T01:10:00.000Z',
};

ResponseBody _backend(RequestOptions o, {int confirmStatus = 200}) {
  if (o.path == '/auth/mfa/enroll') return jsonBody(200, _enrollment);
  if (confirmStatus != 200) {
    return jsonBody(confirmStatus, {
      'code': 'E004',
      'message': 'invalid_code',
      'details': {'attemptsRemaining': 4},
      'statusCode': confirmStatus,
    });
  }
  return jsonBody(200, {
    'status': 'SUCCESS',
    'user': {'id': 'u1', 'username': 'dqtv01', 'fullName': 'DQ', 'status': 'active', 'role': 'dqtv'},
    'tokens': {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900},
    'recoveryCodes': _codes,
  });
}

Future<(FakeAdapter, MemoryStorage)> _pump(
  WidgetTester tester, {
  ResponseBody Function(RequestOptions)? handler,
  int confirmStatus = 200,
  OpenExternalUrl? openUrl,
}) async {
  final adapter = FakeAdapter(handler ?? (o) => _backend(o, confirmStatus: confirmStatus));
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final storage = MemoryStorage(access: null, refresh: null);
  final router = GoRouter(initialLocation: '/setup', routes: [
    GoRoute(path: '/setup', builder: (_, __) => const MfaSetupScreen(mfaToken: 'mfa-token')),
    GoRoute(
      path: Routes.recoveryCodes,
      builder: (_, state) {
        final args = state.extra as RecoveryCodesArgs;
        return RecoveryCodesScreen(codes: args.codes, completesLogin: args.completesLogin);
      },
    ),
    GoRoute(path: Routes.login, builder: (_, __) => const Scaffold(body: Text('LOGIN'))),
    GoRoute(path: Routes.caHome, builder: (_, __) => const Scaffold(body: Text('HOME CA'))),
    GoRoute(path: Routes.dqtvHome, builder: (_, __) => const Scaffold(body: Text('HOME DQTV'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    // A fresh scope and screen each time, even when a test pumps twice
    key: UniqueKey(),
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      dioProvider.overrideWithValue(dio),
      // Never reach a real app launcher from a test
      openExternalUrlProvider.overrideWithValue(openUrl ?? (_) async => false),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return (adapter, storage);
}

Finder get _confirm => find.widgetWithText(ElevatedButton, viL10n.commonConfirm);

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-ENR-01: shows the QR code, the secret and a way to open the authenticator', (tester) async {
    final (adapter, _) = await _pump(tester);

    expect(adapter.requests.first.path, '/auth/mfa/enroll');
    expect(adapter.requests.first.data, {'mfaToken': 'mfa-token'});
    expect(find.text(viL10n.authMfaSetupTitle), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    expect(find.text('JBSWY3DPEHPK3PXP'), findsOneWidget);
    expect(find.byKey(const Key('open_authenticator')), findsOneWidget);
    expect(find.textContaining(viL10n.authEnrollExpiresAt('').trim()), findsOneWidget);
  });

  testWidgets('WT-ENR-02: confirming shows the recovery codes once; home only after acknowledging', (tester) async {
    final (adapter, storage) = await _pump(tester);

    await tester.enterText(find.byKey(const Key('enroll_code_field')), '123456');
    await _tap(tester, _confirm);

    expect(adapter.requests.last.path, '/auth/mfa/enroll/confirm');
    expect(adapter.requests.last.data, {'mfaToken': 'mfa-token', 'code': '123456'});
    for (final code in _codes) {
      expect(find.text(code), findsOneWidget);
    }
    final continueButton = find.widgetWithText(ElevatedButton, viL10n.authRecoveryCodesContinue);
    expect(tester.widget<ElevatedButton>(continueButton).onPressed, isNull);
    expect(storage.access, isNull);

    await tester.tap(find.text(viL10n.authRecoveryCodesSavedConfirm));
    await tester.pump();
    await tester.tap(continueButton);
    await tester.pumpAndSettle();

    expect(find.text('HOME DQTV'), findsOneWidget);
    expect(storage.access, 'tok_access');
  });

  testWidgets('WT-ENR-03: a wrong first code shows the attempts left', (tester) async {
    await _pump(tester, confirmStatus: 401);

    await tester.enterText(find.byKey(const Key('enroll_code_field')), '000000');
    await _tap(tester, _confirm);

    expect(find.text(viL10n.errorInvalidCodeAttemptsRemaining(4)), findsOneWidget);
    expect(find.text('ABCDE-12340'), findsNothing);
  });

  testWidgets('WT-ENR-04: an expired challenge cannot be retried, only restarted', (tester) async {
    await _pump(tester, handler: (_) => jsonBody(401, {'code': 'E004', 'message': 'mfa_token_invalid', 'statusCode': 401}));

    expect(find.text(viL10n.errorMfaTokenInvalid), findsOneWidget);
    expect(find.text(viL10n.commonRetry), findsNothing);
    await _tap(tester, find.byKey(const Key('restart_login')));
    expect(find.text('LOGIN'), findsOneWidget);
  });

  testWidgets('WT-ENR-05: an unreadable enrolment can be retried', (tester) async {
    var calls = 0;
    final (adapter, _) = await _pump(tester, handler: (o) => ++calls == 1 ? jsonBody(200, ['x']) : _backend(o));

    expect(find.text(viL10n.errorBadResponse), findsOneWidget);
    await _tap(tester, find.text(viL10n.commonRetry));

    expect(find.text('JBSWY3DPEHPK3PXP'), findsOneWidget);
    expect(adapter.requests, hasLength(2));
  });

  testWidgets('WT-ENR-06: the panel checks the code format, copies the secret and reports a missing app',
      (tester) async {
    final (adapter, _) = await _pump(tester);
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied.add((call.arguments as Map)['text'] as String);
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

    await tester.enterText(find.byKey(const Key('enroll_code_field')), '12');
    await _tap(tester, _confirm);
    expect(find.text(viL10n.errorOtpFormat), findsOneWidget);
    expect(adapter.requests, hasLength(1));

    await _tap(tester, find.byTooltip(viL10n.authEnrollCopySecretTooltip));
    expect(copied, ['JBSWY3DPEHPK3PXP']);
    expect(find.text(viL10n.authEnrollSecretCopied), findsOneWidget);
    // One snackbar at a time: clear it so the next message shows at once
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).removeCurrentSnackBar();
    await tester.pumpAndSettle();

    // No app takes the otpauth link
    await _tap(tester, find.byKey(const Key('open_authenticator')));
    expect(find.text(viL10n.authEnrollOpenAuthenticatorFailed), findsOneWidget);
  });

  testWidgets('WT-ENR-07: the otpauth link goes to the authenticator app; a launcher error is reported',
      (tester) async {
    final opened = <Uri>[];
    await _pump(tester, openUrl: (uri) async {
      opened.add(uri);
      return true;
    });

    await _tap(tester, find.byKey(const Key('open_authenticator')));

    expect(opened.single.toString(), _enrollment['otpauthUri']);
    expect(find.text(viL10n.authEnrollOpenAuthenticatorFailed), findsNothing);

    await _pump(tester, openUrl: (uri) async => throw PlatformException(code: 'ACTIVITY_NOT_FOUND'));
    await _tap(tester, find.byKey(const Key('open_authenticator')));
    expect(find.text(viL10n.authEnrollOpenAuthenticatorFailed), findsOneWidget);
  });
}

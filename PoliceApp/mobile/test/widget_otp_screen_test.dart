// Widget Tests: second-factor sign-in (T15) — POST /auth/mfa/verify {mfaToken, method, code}
// Errors: 401 invalid_code (details.attemptsRemaining), 401 mfa_token_invalid → back to login
// (Web/backend/src/auth/mfa/mfa.service.ts:164-236, 609-663)
// Run: flutter test test/widget_otp_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/auth/screens/otp_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

const _success = {
  'status': 'SUCCESS',
  'user': {'id': 'u1', 'username': 'ca01', 'fullName': 'CA', 'status': 'active', 'role': 'ca_officer'},
  'tokens': {'accessToken': 'tok_access', 'refreshToken': 'tok_refresh', 'expiresIn': 900},
};

Future<(FakeAdapter, MemoryStorage)> _pump(
  WidgetTester tester,
  ResponseBody Function(RequestOptions) handler, {
  List<String> methods = const ['totp', 'recovery_code'],
}) async {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final storage = MemoryStorage(access: null, refresh: null);
  final router = GoRouter(initialLocation: '/otp', routes: [
    GoRoute(path: '/otp', builder: (_, __) => OtpScreen(mfaToken: 'mfa-token', methods: methods)),
    GoRoute(path: Routes.login, builder: (_, __) => const Scaffold(body: Text('LOGIN'))),
    GoRoute(path: Routes.caHome, builder: (_, __) => const Scaffold(body: Text('HOME CA'))),
    GoRoute(path: Routes.dqtvHome, builder: (_, __) => const Scaffold(body: Text('HOME DQTV'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return (adapter, storage);
}

Finder get _confirm => find.widgetWithText(ElevatedButton, viL10n.commonConfirm);

void main() {
  testWidgets('WT-OTP-01: a TOTP code signs in and opens the home screen', (tester) async {
    final (adapter, storage) = await _pump(tester, (_) => jsonBody(200, _success));

    expect(find.text(viL10n.authOtpTitle), findsOneWidget);
    expect(find.text(viL10n.authOtpInstructionTotp), findsOneWidget);
    await tester.enterText(find.byKey(const Key('otp_field')), '123456');
    await tester.tap(_confirm);
    await tester.pumpAndSettle();

    expect(adapter.requests.single.path, '/auth/mfa/verify');
    expect(adapter.requests.single.data, {'mfaToken': 'mfa-token', 'method': 'totp', 'code': '123456'});
    expect(find.text('HOME CA'), findsOneWidget);
    expect(storage.access, 'tok_access');
  });

  testWidgets('WT-OTP-02: a recovery code is sent as typed and the codes left are shown', (tester) async {
    final (adapter, _) = await _pump(tester, (_) => jsonBody(200, {..._success, 'recoveryCodesRemaining': 4}));

    await tester.tap(find.text(viL10n.authOtpMethodRecoveryCode));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.authOtpInstructionRecoveryCode), findsOneWidget);
    await tester.enterText(find.byKey(const Key('recovery_field')), ' abcde fghij ');
    await tester.tap(_confirm);
    await tester.pumpAndSettle();

    expect(adapter.requests.single.data,
        {'mfaToken': 'mfa-token', 'method': 'recovery_code', 'code': ' abcde fghij '});
    expect(find.text('HOME CA'), findsOneWidget);
    // The snackbar belongs to the app's messenger and stays up on the home screen
    expect(find.text(viL10n.authOtpRecoveryCodesRemaining(4)), findsOneWidget);
  });

  testWidgets('WT-OTP-03: a wrong code shows the attempts left and stays on the screen', (tester) async {
    await _pump(tester, (_) => jsonBody(401, {
          'code': 'E004',
          'message': 'invalid_code',
          'details': {'attemptsRemaining': 2},
          'statusCode': 401,
        }));

    await tester.enterText(find.byKey(const Key('otp_field')), '000000');
    await tester.tap(_confirm);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorInvalidCodeAttemptsRemaining(2)), findsOneWidget);
    expect(find.byKey(const Key('restart_login')), findsNothing);
  });

  testWidgets('WT-OTP-04: an expired challenge offers to sign in again', (tester) async {
    await _pump(tester, (_) => jsonBody(401, {'code': 'E004', 'message': 'mfa_token_invalid', 'statusCode': 401}));

    await tester.enterText(find.byKey(const Key('otp_field')), '123456');
    await tester.tap(_confirm);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorMfaTokenInvalid), findsOneWidget);
    expect(tester.widget<ElevatedButton>(_confirm).onPressed, isNull);
    expect(find.text(viL10n.authRestartLogin), findsOneWidget);
    await tester.tap(find.byKey(const Key('restart_login')));
    await tester.pumpAndSettle();
    expect(find.text('LOGIN'), findsOneWidget);
  });

  testWidgets('WT-OTP-05: only the methods the challenge allows are offered', (tester) async {
    await _pump(tester, (_) => jsonBody(200, _success), methods: const ['totp']);

    expect(find.text(viL10n.authOtpMethodRecoveryCode), findsNothing);
    expect(find.byKey(const Key('otp_field')), findsOneWidget);
  });

  testWidgets('WT-OTP-06: malformed codes are refused before any request', (tester) async {
    final (adapter, _) = await _pump(tester, (_) => jsonBody(200, _success));

    await tester.enterText(find.byKey(const Key('otp_field')), '12ab');
    await tester.tap(_confirm);
    await tester.pumpAndSettle();
    expect(find.text(viL10n.errorOtpFormat), findsOneWidget);

    await tester.tap(find.text(viL10n.authOtpMethodRecoveryCode));
    await tester.pumpAndSettle();
    await tester.tap(_confirm);
    await tester.pumpAndSettle();
    expect(find.text(viL10n.errorRecoveryCodeRequired), findsOneWidget);
    expect(adapter.requests, isEmpty);
  });

  testWidgets('WT-OTP-07: a recovery-code-only challenge starts on the recovery code field', (tester) async {
    await _pump(tester, (_) => jsonBody(200, _success), methods: const ['recovery_code']);

    expect(find.byKey(const Key('recovery_field')), findsOneWidget);
    expect(find.byKey(const Key('otp_field')), findsNothing);
  });
}

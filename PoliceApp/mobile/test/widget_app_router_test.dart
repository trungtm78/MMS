// Widget Tests: the app router — sign-in routes, their route extras and the signed-out guard
// Run: flutter test test/widget_app_router_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/core/router/app_router.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/models/auth_models.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/auth/screens/forgot_password_screen.dart';
import 'package:police_app/features/auth/screens/login_screen.dart';
import 'package:police_app/features/auth/screens/mfa_setup_screen.dart';
import 'package:police_app/features/auth/screens/otp_screen.dart';
import 'package:police_app/features/auth/screens/recovery_codes_screen.dart';
import 'package:police_app/shared/widgets/auth_layout.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Future<(GoRouter, FakeAdapter)> _pumpRouter(WidgetTester tester) async {
  final adapter = FakeAdapter((_) => jsonBody(401, {'code': 'E004', 'message': 'invalid_credentials', 'statusCode': 401}));
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  late GoRouter router;
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)),
      dioProvider.overrideWithValue(dio),
    ],
    child: Consumer(builder: (context, ref, _) {
      router = ref.watch(appRouterProvider);
      return localizedRouterApp(router);
    }),
  ));
  await tester.pumpAndSettle();
  return (router, adapter);
}

Future<void> _go(WidgetTester tester, GoRouter router, String location, {Object? extra}) async {
  router.go(location, extra: extra);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-ROUTER-01: signed out, the app starts on login and guarded routes go back to it', (tester) async {
    final (router, _) = await _pumpRouter(tester);
    expect(find.byType(LoginScreen), findsOneWidget);

    await _go(tester, router, Routes.caHome);
    expect(find.byType(LoginScreen), findsOneWidget);

    await _go(tester, router, Routes.forgotPassword);
    expect(find.byType(ForgotPasswordScreen), findsOneWidget);
  });

  testWidgets('WT-ROUTER-02: the OTP route takes the challenge or a bare token', (tester) async {
    final (router, _) = await _pumpRouter(tester);

    await _go(tester, router, Routes.otp,
        extra: const LoginResponse(status: LoginStatus.mfaRequired, mfaToken: 'mfa', methods: [mfaMethodRecoveryCode]));
    expect(find.byType(OtpScreen), findsOneWidget);
    expect(find.byKey(const Key('recovery_field')), findsOneWidget);

    await _go(tester, router, Routes.login);
    await _go(tester, router, Routes.otp, extra: const LoginResponse(status: LoginStatus.mfaRequired, mfaToken: 'mfa'));
    expect(find.byKey(const Key('otp_field')), findsOneWidget);
    expect(find.text(viL10n.authOtpMethodRecoveryCode), findsNothing);

    await _go(tester, router, Routes.login);
    await _go(tester, router, Routes.otp, extra: 'mfa-token');
    expect(find.byType(OtpScreen), findsOneWidget);
  });

  testWidgets('WT-ROUTER-03: the enrolment route takes the challenge or a bare token', (tester) async {
    final (router, adapter) = await _pumpRouter(tester);

    await _go(tester, router, Routes.mfaSetup,
        extra: const LoginResponse(status: LoginStatus.mfaSetupRequired, mfaToken: 'from-response'));
    expect(find.byType(MfaSetupScreen), findsOneWidget);
    expect(adapter.requests.last.data, {'mfaToken': 'from-response'});

    await _go(tester, router, Routes.login);
    await _go(tester, router, Routes.mfaSetup, extra: 'bare-token');
    expect(adapter.requests.last.data, {'mfaToken': 'bare-token'});
  });

  testWidgets('WT-ROUTER-04: the recovery codes route takes its arguments or a plain list', (tester) async {
    final (router, _) = await _pumpRouter(tester);
    final codes = List.generate(3, (i) => 'ABCDE-1234$i');

    await _go(tester, router, Routes.recoveryCodes, extra: RecoveryCodesArgs(codes, completesLogin: true));
    expect(find.byType(RecoveryCodesScreen), findsOneWidget);
    expect(find.text(viL10n.authRecoveryCodesSaveInstruction(3)), findsOneWidget);

    await _go(tester, router, Routes.login);
    await _go(tester, router, Routes.recoveryCodes, extra: codes.take(2).toList());
    expect(find.text(viL10n.authRecoveryCodesSaveInstruction(2)), findsOneWidget);

    await _go(tester, router, Routes.login);
    await _go(tester, router, Routes.recoveryCodes);
    expect(find.text(viL10n.authRecoveryCodesSaveInstruction(0)), findsOneWidget);
  });

  testWidgets('WT-ROUTER-05: a refused sign-in keeps the login screen', (tester) async {
    await _pumpRouter(tester);

    await tester.enterText(find.byType(TextFormField).first, 'ca01');
    await tester.enterText(find.byType(TextFormField).last, 'wrong');
    // The card title reads the same as the button
    final submit = find.descendant(of: find.byType(AuthPrimaryButton), matching: find.text(viL10n.authLoginSubmit));
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text(viL10n.errorInvalidCredentials), findsOneWidget);
  });
}

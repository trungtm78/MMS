// Widget Tests: forgot password has no backend
// Web/backend/src/auth/auth.controller.ts has no forgot-password, verify-otp or reset-password
// route; passwords are reset by an administrator (POST /admin/users/:id/reset-password).
// Run: flutter test test/widget_forgot_password_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/constants/app_version.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/auth/screens/forgot_password_screen.dart';
import 'package:militian_app/shared/widgets/app_logo.dart';
import 'package:militian_app/shared/widgets/auth_layout.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

void main() {
  testWidgets('WT-FP-01: explains that recovery goes through an administrator and calls nothing', (tester) async {
    final storage = MemoryStorage(access: null, refresh: null);
    final adapter = FakeAdapter((_) => jsonBody(404, {'message': 'Cannot POST'}));
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(storage),
        authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: dio)),
      ],
      child: localizedApp(const ForgotPasswordScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(AppLogo), findsOneWidget);
    expect(find.text(viL10n.authForgotPasswordTitle.toUpperCase()), findsOneWidget);
    expect(find.text(viL10n.authForgotPasswordUnsupported), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(adapter.requests, isEmpty);
  });

  // Same layout as the login screen (C:\MMS\DESIGN.md, Mobile auth screens)
  testWidgets('WT-FP-03: the shared auth layout', (tester) async {
    await tester.pumpWidget(localizedApp(const ForgotPasswordScreen()));
    await tester.pumpAndSettle();

    expect(find.byType(AuthBrandHeader), findsOneWidget);
    expect(find.text(viL10n.appTitle.toUpperCase()), findsOneWidget);
    expect(find.descendant(of: find.byType(AuthCard), matching: find.text(viL10n.authForgotPasswordUnsupported)),
        findsOneWidget);
    expect(find.byType(AuthPrimaryButton), findsOneWidget);
    expect(find.text(viL10n.authLoginVersion(appVersion)), findsOneWidget);
    expect(tester.getSize(find.byType(AuthBackground)), tester.getSize(find.byType(Scaffold)));
  });

  testWidgets('WT-FP-02: the button goes back to the login screen', (tester) async {
    await tester.pumpWidget(localizedApp(Builder(
      builder: (context) => Scaffold(
        body: TextButton(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const ForgotPasswordScreen()),
          ),
          child: const Text('OPEN'),
        ),
      ),
    )));
    await tester.tap(find.text('OPEN'));
    await tester.pumpAndSettle();
    expect(find.byType(ForgotPasswordScreen), findsOneWidget);

    await tester.ensureVisible(find.text(viL10n.authForgotPasswordBack));
    await tester.tap(find.text(viL10n.authForgotPasswordBack));
    await tester.pumpAndSettle();

    expect(find.byType(ForgotPasswordScreen), findsNothing);
    expect(find.text('OPEN'), findsOneWidget);
  });

  testWidgets('WT-FP-04: opened directly (nothing to go back to), the button opens the login route',
      (tester) async {
    final router = GoRouter(initialLocation: Routes.forgotPassword, routes: [
      GoRoute(path: Routes.forgotPassword, builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(path: Routes.login, builder: (_, __) => const Scaffold(body: Text('LOGIN'))),
    ]);
    await tester.pumpWidget(localizedRouterApp(router));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text(viL10n.authForgotPasswordBack));
    await tester.tap(find.text(viL10n.authForgotPasswordBack));
    await tester.pumpAndSettle();

    expect(find.text('LOGIN'), findsOneWidget);
  });
}

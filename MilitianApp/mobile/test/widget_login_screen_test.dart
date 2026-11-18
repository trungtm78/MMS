// Widget Tests: the login screen layout, shared with the Công An app (C:\MMS\DESIGN.md, Mobile auth
// screens): brand header, card, labelled fields, inline errors, forgot-password link, version line,
// a background that fills the screen.
// Sign-in behaviour (validation, MFA steps, biometrics) is covered in widget_auth_mfa_screens_test.dart.
// Run: flutter test test/widget_login_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/constants/app_version.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/auth/screens/login_screen.dart';
import 'package:militian_app/shared/widgets/app_logo.dart';
import 'package:militian_app/shared/widgets/auth_layout.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Future<void> _pump(WidgetTester tester, Map<String, ResponseBody Function(RequestOptions)> api) async {
  final storage = MemoryStorage(access: null, refresh: null);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = FakeAdapter(routeTable(api));
  final router = GoRouter(initialLocation: Routes.login, routes: [
    GoRoute(path: Routes.login, builder: (_, __) => const LoginScreen()),
    GoRoute(path: Routes.forgotPassword, builder: (_, __) => const Scaffold(body: Text('FORGOT'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: dio)),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-LOGIN-06: the shared auth layout: brand header, card, version, full-height background',
      (tester) async {
    await _pump(tester, {});

    expect(find.descendant(of: find.byType(AuthBrandHeader), matching: find.byType(AppLogo)), findsOneWidget);
    // The emblem is shown whole, not cropped into a circle
    expect(find.byType(ClipOval), findsNothing);
    expect(find.text(viL10n.appTitle.toUpperCase()), findsOneWidget);
    expect(find.text(viL10n.authLoginSubtitle), findsOneWidget);
    expect(find.text(viL10n.authLoginUnit), findsOneWidget);
    expect(find.descendant(of: find.byType(AuthCard), matching: find.text(viL10n.authLoginCardTitle)),
        findsWidgets);
    expect(find.text(viL10n.authLoginUsernameLabel), findsOneWidget);
    expect(find.text(viL10n.authLoginPasswordLabel), findsOneWidget);
    expect(find.byType(AuthPrimaryButton), findsOneWidget);
    expect(find.text(viL10n.authLoginVersion(appVersion)), findsOneWidget);
    // The gradient covers the whole screen, not just the content
    expect(tester.getSize(find.byType(AuthBackground)), tester.getSize(find.byType(Scaffold)));
  });

  testWidgets('WT-LOGIN-07: a refused sign-in is explained inside the card', (tester) async {
    await _pump(tester, {'POST /auth/login': (_) => jsonBody(401, backendError(401, 'invalid_credentials'))});

    await tester.enterText(find.byKey(const Key('username_field')), 'dqtv01');
    await tester.enterText(find.byKey(const Key('password_field')), 'wrong-password');
    await _tap(tester, find.byKey(const Key('login_button')));

    expect(
      find.descendant(
          of: find.byKey(const Key('login_error')), matching: find.text(viL10n.errorAuthInvalidCredentials)),
      findsOneWidget,
    );
  });

  testWidgets('WT-LOGIN-08: the password can be revealed and the forgot-password screen opened', (tester) async {
    await _pump(tester, {});

    TextField password() => tester.widget<TextField>(
          find.descendant(of: find.byKey(const Key('password_field')), matching: find.byType(TextField)),
        );
    expect(password().obscureText, isTrue);
    expect(find.byTooltip(viL10n.authLoginShowPassword), findsOneWidget);
    await tester.tap(find.byIcon(Icons.visibility_off));
    await tester.pump();
    expect(password().obscureText, isFalse);
    expect(find.byTooltip(viL10n.authLoginHidePassword), findsOneWidget);

    await _tap(tester, find.text(viL10n.authLoginForgotPassword));
    expect(find.text('FORGOT'), findsOneWidget);
  });
}

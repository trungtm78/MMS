// Widget Tests: the login screen — notice after an ended session, validation, errors, MFA routing
// Run: flutter test test/widget_login_notice_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/core/constants/app_version.dart';
import 'package:police_app/core/network/session_events.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/auth/screens/login_screen.dart';
import 'package:police_app/shared/widgets/app_logo.dart';
import 'package:police_app/shared/widgets/auth_layout.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Future<(ProviderContainer, MemoryStorage)> _pump(
  WidgetTester tester,
  ResponseBody Function(RequestOptions) handler, {
  MemoryStorage? storage,
}) async {
  final store = storage ?? MemoryStorage(access: null, refresh: null);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = FakeAdapter(handler);
  final router = GoRouter(initialLocation: Routes.login, routes: [
    GoRoute(path: Routes.login, builder: (_, __) => const LoginScreen()),
    GoRoute(path: Routes.otp, builder: (_, __) => const Scaffold(body: Text('OTP'))),
    GoRoute(path: Routes.mfaSetup, builder: (_, __) => const Scaffold(body: Text('MFA SETUP'))),
    GoRoute(path: Routes.forgotPassword, builder: (_, __) => const Scaffold(body: Text('FORGOT'))),
    GoRoute(path: Routes.caHome, builder: (_, __) => const Scaffold(body: Text('HOME CA'))),
    GoRoute(path: Routes.dqtvHome, builder: (_, __) => const Scaffold(body: Text('HOME DQTV'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    // A fresh scope and screen each time, even when a test pumps twice
    key: UniqueKey(),
    overrides: [
      secureStorageProvider.overrideWithValue(store),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedRouterApp(router),
  ));
  final container = ProviderScope.containerOf(tester.element(find.byType(LoginScreen)));
  await container.read(authStateProvider.notifier).ready;
  await tester.pumpAndSettle();
  return (container, store);
}

Future<void> _signIn(WidgetTester tester, {String username = 'ca01', String password = 'secret'}) async {
  await tester.enterText(find.byType(TextFormField).first, username);
  await tester.enterText(find.byType(TextFormField).last, password);
  // The card title reads the same as the button
  final button = find.descendant(of: find.byType(AuthPrimaryButton), matching: find.text(viL10n.authLoginSubmit));
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Map<String, Object> _user(String role) =>
    {'id': 'u1', 'username': 'user01', 'fullName': 'User', 'status': 'active', 'role': role};

void main() {
  testWidgets('WT-LOGIN-NOTICE-01: an ended session is explained until the next sign-in attempt',
      (tester) async {
    final (container, storage) = await _pump(
      tester,
      (_) => jsonBody(401, {'code': 'E004', 'message': 'invalid_credentials', 'statusCode': 401}),
      storage: MemoryStorage(role: 'ca'),
    );
    expect(container.read(authStateProvider).isAuthenticated, isTrue);
    expect(find.text(viL10n.authLoginNoticeSessionEnded), findsNothing);

    container.read(sessionEventsProvider).end('refresh_token_reused');
    await tester.pumpAndSettle();

    expect(find.text(viL10n.authLoginNoticeSessionEnded), findsOneWidget);
    expect(storage.access, isNull);

    await _signIn(tester, password: 'sai');

    expect(find.text(viL10n.authLoginNoticeSessionEnded), findsNothing);
    expect(find.text(viL10n.errorInvalidCredentials), findsOneWidget);
  });

  testWidgets('WT-LOGIN-02: empty fields are refused before any request', (tester) async {
    await _pump(tester, (_) => jsonBody(500, {}));

    expect(find.text(viL10n.appTitle.toUpperCase()), findsOneWidget);
    await _signIn(tester, username: ' ', password: '');

    expect(find.text(viL10n.authLoginUsernameRequired), findsOneWidget);
    expect(find.text(viL10n.authLoginPasswordRequired), findsOneWidget);
  });

  testWidgets('WT-LOGIN-03: MFA challenges open their screens; success opens the home by role', (tester) async {
    for (final (status, screen) in [('MFA_REQUIRED', 'OTP'), ('MFA_SETUP_REQUIRED', 'MFA SETUP')]) {
      await _pump(tester, (_) => jsonBody(200, {'status': status, 'mfaToken': 'mfa-token'}));
      await _signIn(tester);
      expect(find.text(screen), findsOneWidget, reason: status);
    }

    await _pump(tester, (_) => jsonBody(200, {
          'status': 'SUCCESS',
          'user': _user('dqtv'),
          'tokens': {'accessToken': 'a', 'refreshToken': 'r'},
        }));
    await _signIn(tester);
    expect(find.text('HOME DQTV'), findsOneWidget);
  });

  testWidgets('WT-LOGIN-05: the Công an badge heads the screen', (tester) async {
    await _pump(tester, (_) => jsonBody(500, {}));

    expect(find.byType(AppLogo), findsOneWidget);
    expect(find.byIcon(Icons.local_police), findsNothing);
  });

  // The login screens of both apps share one layout (C:\MMS\DESIGN.md, Mobile auth screens)
  testWidgets('WT-LOGIN-06: the shared auth layout: brand header, card, version, full-height background',
      (tester) async {
    await _pump(tester, (_) => jsonBody(500, {}));

    expect(find.descendant(of: find.byType(AuthBrandHeader), matching: find.byType(AppLogo)), findsOneWidget);
    expect(find.text(viL10n.appTitle.toUpperCase()), findsOneWidget);
    expect(find.text(viL10n.authLoginSubtitle), findsOneWidget);
    expect(find.text(viL10n.authLoginUnit), findsOneWidget);
    expect(find.descendant(of: find.byType(AuthCard), matching: find.text(viL10n.authLoginCardTitle)),
        findsWidgets);
    expect(find.byType(AuthPrimaryButton), findsOneWidget);
    expect(find.text(viL10n.authLoginVersion(appVersion)), findsOneWidget);
    // The gradient covers the whole screen, not just the content
    expect(tester.getSize(find.byType(AuthBackground)), tester.getSize(find.byType(Scaffold)));
  });

  testWidgets('WT-LOGIN-07: a refused sign-in is explained inside the card, not in a snackbar', (tester) async {
    await _pump(tester, (_) => jsonBody(401, {'code': 'E004', 'message': 'invalid_credentials', 'statusCode': 401}));

    await _signIn(tester, password: 'sai');

    expect(
      find.descendant(of: find.byKey(const Key('login_error')), matching: find.text(viL10n.errorInvalidCredentials)),
      findsOneWidget,
    );
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('WT-LOGIN-04: the password can be revealed and the forgot-password screen opened', (tester) async {
    await _pump(tester, (_) => jsonBody(500, {}));

    TextField password() => tester.widget<TextField>(
          find.descendant(of: find.byType(TextFormField).last, matching: find.byType(TextField)),
        );
    expect(password().obscureText, isTrue);
    await tester.tap(find.byIcon(Icons.visibility_off));
    await tester.pump();
    expect(password().obscureText, isFalse);

    await tester.ensureVisible(find.text(viL10n.authLoginForgotPassword));
    await tester.tap(find.text(viL10n.authLoginForgotPassword));
    await tester.pumpAndSettle();
    expect(find.text('FORGOT'), findsOneWidget);
  });
}

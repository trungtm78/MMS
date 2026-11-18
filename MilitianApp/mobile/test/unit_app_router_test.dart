// Tests: the app router
//   - one router for the app's lifetime: a new GoRouter starts again at the splash screen, so a router
//     rebuilt on every AuthState (loading, error, MFA step) would drop the user out of the
//     second-factor screens
//   - the splash screen leaves when AuthNotifier.ready says the stored session was checked, however
//     long that takes (no fixed wait)
//   - signed-out users land on login; the sign-in and account routes build their screens from their
//     extras
// Run: flutter test test/unit_app_router_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/router/app_router.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/models/login_response.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/auth/screens/forgot_password_screen.dart';
import 'package:militian_app/features/auth/screens/login_screen.dart';
import 'package:militian_app/features/auth/screens/mfa_enroll_screen.dart';
import 'package:militian_app/features/auth/screens/otp_screen.dart';
import 'package:militian_app/features/auth/screens/recovery_codes_screen.dart';
import 'package:militian_app/features/profile/screens/change_password_screen.dart';
import 'package:militian_app/features/profile/screens/security_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Dio _dio(Map<String, ResponseBody Function(RequestOptions)> api) =>
    Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = FakeAdapter(routeTable(api));

ProviderContainer _container(Map<String, ResponseBody Function(RequestOptions)> api) {
  final storage = MemoryStorage(access: null, refresh: null);
  final container = ProviderContainer(overrides: [
    secureStorageProvider.overrideWithValue(storage),
    authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: _dio(api))),
  ]);
  addTearDown(container.dispose);
  return container;
}

/// A storage whose token read fails, like an unreadable keychain.
class _BrokenStorage extends MemoryStorage {
  @override
  Future<String?> getAccessToken() async => throw StateError('keychain unavailable');
}

/// SplashScreen in a router whose home and login are marker pages.
Future<void> _pumpSplash(WidgetTester tester, MemoryStorage storage) async {
  final router = GoRouter(
    initialLocation: Routes.splash,
    routes: [
      GoRoute(path: Routes.splash, builder: (context, state) => const SplashScreen()),
      GoRoute(path: Routes.login, builder: (context, state) => const Scaffold(body: Text('LOGIN_PAGE'))),
      GoRoute(path: Routes.home, builder: (context, state) => const Scaffold(body: Text('HOME_PAGE'))),
    ],
  );
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: _dio({}))),
    ],
    child: localizedRouterApp(router),
  ));
}

/// The app router with a fake sign-in backend.
Future<(ProviderContainer, GoRouter)> _pumpAppRouter(
  WidgetTester tester,
  Map<String, ResponseBody Function(RequestOptions)> api,
) async {
  final storage = MemoryStorage(access: null, refresh: null);
  final container = ProviderContainer(overrides: [
    secureStorageProvider.overrideWithValue(storage),
    authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: _dio(api))),
  ]);
  final router = container.read(routerProvider);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: localizedRouterApp(router)));
  await tester.pumpAndSettle();
  return (container, router);
}

Future<void> _go(WidgetTester tester, GoRouter router, String location, {Object? extra}) async {
  router.go(location, extra: extra);
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('one router for the app', () {
    test('an MFA_REQUIRED login keeps the same router', () async {
      final container = _container({'POST /auth/login': (_) => jsonBody(200, mfaRequiredLogin())});
      final router = container.read(routerProvider);

      final challenge = await container.read(authStateProvider.notifier).login('dqtv01', 'x');

      expect(challenge?.requiresMfa, isTrue);
      expect(container.read(routerProvider), same(router));
    });

    test('signing in keeps the same router', () async {
      final container = _container({'POST /auth/mfa/verify': (_) => jsonBody(200, backendSession('dqtv'))});
      final router = container.read(routerProvider);

      final attempt = await container
          .read(authStateProvider.notifier)
          .verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '123456');

      expect(attempt.success, isTrue);
      expect(container.read(authStateProvider).isAuthenticated, isTrue);
      expect(container.read(routerProvider), same(router));
    });
  });

  group('SplashScreen', () {
    testWidgets('UT-ROUTER-03: waits for the stored-session check, however long it takes', (tester) async {
      final storage = GatedStorage(roles: ['dqtv']);
      await _pumpSplash(tester, storage);

      // Far longer than any fixed wait would be: the check is still out
      await tester.pump(const Duration(seconds: 5));
      // Room for a page transition, had the splash left (its spinner never lets pumpAndSettle settle)
      await tester.pump(const Duration(seconds: 1));
      expect(find.byType(SplashScreen), findsOneWidget);
      expect(find.text('LOGIN_PAGE'), findsNothing);

      storage.release.complete();
      await tester.pumpAndSettle();

      expect(find.text('HOME_PAGE'), findsOneWidget);
    });

    testWidgets('UT-ROUTER-04: without a stored session it goes to login once checked', (tester) async {
      await _pumpSplash(tester, MemoryStorage(access: null, refresh: null));
      await tester.pumpAndSettle();

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
    });

    testWidgets('UT-ROUTER-05: a check that fails still leaves the splash for login', (tester) async {
      await _pumpSplash(tester, _BrokenStorage());
      await tester.pumpAndSettle();

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
    });
  });

  group('routes', () {
    testWidgets('UT-ROUTER-06: signed out, the app opens on login and signed-in routes redirect there',
        (tester) async {
      final (_, router) = await _pumpAppRouter(tester, {});
      expect(find.byType(LoginScreen), findsOneWidget);

      await _go(tester, router, Routes.security);

      expect(find.byType(SecurityScreen), findsNothing);
      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('UT-ROUTER-08: signed out, the forgot-password screen opens and leads back to login',
        (tester) async {
      final (_, router) = await _pumpAppRouter(tester, {});

      await _go(tester, router, Routes.forgotPassword);
      expect(find.byType(ForgotPasswordScreen), findsOneWidget);

      await tester.ensureVisible(find.text(viL10n.authForgotPasswordBack));
      await tester.tap(find.text(viL10n.authForgotPasswordBack));
      await tester.pumpAndSettle();

      expect(find.byType(ForgotPasswordScreen), findsNothing);
      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('UT-ROUTER-07: second-factor and account routes build their screens', (tester) async {
      final (container, router) = await _pumpAppRouter(tester, {
        'POST /auth/mfa/verify': (_) => jsonBody(200, backendSession('dqtv')),
        'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment()),
        'GET /auth/mfa/status': (_) =>
            jsonBody(200, {'enabled': false, 'required': false, 'recoveryCodesRemaining': 0}),
      });

      await _go(tester, router, Routes.otpVerify,
          extra: LoginResponse.fromJson(mfaRequiredLogin({'methods': ['totp']})));
      expect(tester.widget<OtpScreen>(find.byType(OtpScreen)).methods, ['totp']);

      await _go(tester, router, Routes.mfaSetup, extra: testMfaToken);
      expect(tester.widget<MfaEnrollScreen>(find.byType(MfaEnrollScreen)).mfaToken, testMfaToken);

      await _go(tester, router, Routes.recoveryCodes,
          extra: const RecoveryCodesArgs(testRecoveryCodes, completesLogin: true));
      expect(tester.widget<RecoveryCodesScreen>(find.byType(RecoveryCodesScreen)).completesLogin, isTrue);

      // Signing in on a second-factor screen keeps the user there
      await _go(tester, router, Routes.otpVerify, extra: testMfaToken);
      // Driven by the frame pump, not awaited directly: the call completes inside fake time
      final signIn = container
          .read(authStateProvider.notifier)
          .verifyMfa(mfaToken: testMfaToken, method: 'totp', code: '123456');
      await tester.pumpAndSettle();
      expect((await signIn).success, isTrue);
      expect(container.read(authStateProvider).isAuthenticated, isTrue);
      expect(find.byType(OtpScreen), findsOneWidget);

      await _go(tester, router, Routes.security);
      expect(find.byType(SecurityScreen), findsOneWidget);

      await _go(tester, router, Routes.changePassword);
      expect(find.byType(ChangePasswordScreen), findsOneWidget);
      // The chat detail route is not opened here: ChatScreen.dispose reads `ref`, which riverpod
      // refuses once the screen is unmounted (chat area, reported to its owner)
    });
  });
}

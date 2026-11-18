// Widget Tests: change password, and the login-screen notice after a session ends
//   POST /users/me/change-password {currentPassword, newPassword} → 204; 400 invalid_credentials |
//   password_complexity | password_reuse (Web/backend/src/users/users.controller.ts:15-23, 42-47;
//   users.service.ts:180-229). The change ends every session, this one too: the app signs out and
//   the login screen says why. A session ended by a refused refresh shows its own notice there.
// Text is asserted through the resources (viL10n).
// Run: flutter test test/widget_change_password_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/network/session_events.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/auth/screens/login_screen.dart';
import 'package:militian_app/features/profile/screens/change_password_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

class _App {
  _App(this.adapter, this.storage, this.events);
  final FakeAdapter adapter;
  final MemoryStorage storage;
  final SessionEvents events;

  Iterable<RequestOptions> get changes =>
      adapter.requests.where((o) => o.path == '/users/me/change-password');
}

/// A signed-in DQTV on the change-password screen, with a router that sends a signed-out user to
/// the login screen like the app router does.
Future<_App> _open(WidgetTester tester, [ResponseBody Function(RequestOptions)? change]) async {
  final storage = MemoryStorage(roles: ['dqtv']);
  final events = SessionEvents();
  final adapter = FakeAdapter(routeTable({'POST /users/me/change-password': change ?? noContent}));
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final container = ProviderContainer(overrides: [
    secureStorageProvider.overrideWithValue(storage),
    authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: dio)),
    sessionEventsProvider.overrideWithValue(events),
  ]);
  // Restore the stored session first, as the splash screen does
  await container.read(authStateProvider.notifier).ready;
  expect(container.read(authStateProvider).isAuthenticated, isTrue);

  final signedIn = ValueNotifier<bool>(true);
  container.listen<AuthState>(
    authStateProvider,
    (previous, next) => signedIn.value = next.isAuthenticated,
  );
  final router = GoRouter(
    initialLocation: Routes.changePassword,
    refreshListenable: signedIn,
    redirect: (context, state) =>
        !signedIn.value && state.matchedLocation != Routes.login ? Routes.login : null,
    routes: [
      GoRoute(path: Routes.login, builder: (context, state) => const LoginScreen()),
      GoRoute(path: Routes.changePassword, builder: (context, state) => const ChangePasswordScreen()),
    ],
  );
  await tester.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return _App(adapter, storage, events);
}

Future<void> _submit(
  WidgetTester tester, {
  required String current,
  required String next,
  String? confirm,
  bool fromKeyboard = false,
}) async {
  await tester.enterText(find.byKey(const Key('current_password')), current);
  await tester.enterText(find.byKey(const Key('new_password')), next);
  await tester.enterText(find.byKey(const Key('confirm_password')), confirm ?? next);
  if (fromKeyboard) {
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    return;
  }
  final submit = find.byKey(const Key('change_password_submit'));
  await tester.ensureVisible(submit);
  await tester.pumpAndSettle();
  await tester.tap(submit);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-PWD-01: local checks keep a doomed request from going out', (tester) async {
    final app = await _open(tester);

    expect(find.text(viL10n.profileChangePasswordTitle), findsOneWidget);
    expect(find.text(viL10n.profileChangePasswordRules), findsOneWidget);
    expect(find.text(viL10n.profileChangePasswordCurrentLabel), findsOneWidget);
    expect(find.text(viL10n.profileChangePasswordNewLabel), findsOneWidget);
    expect(find.text(viL10n.profileChangePasswordConfirmLabel), findsOneWidget);

    await _submit(tester, current: '', next: '', confirm: '');
    expect(find.text(viL10n.validationRequired), findsNWidgets(3));

    await _submit(tester, current: 'Cu@123456', next: 'abcdefgh');
    expect(find.text(viL10n.validationNewPasswordComplexity), findsOneWidget);

    await _submit(tester, current: 'Cu@123456', next: 'Moi@123456', confirm: 'Moi@123457');
    expect(find.text(viL10n.profileChangePasswordMismatch), findsOneWidget);

    await _submit(tester, current: 'Moi@123456', next: 'Moi@123456');
    expect(find.text(viL10n.profileChangePasswordSameAsCurrent), findsOneWidget);

    expect(app.changes, isEmpty);
  });

  testWidgets('WT-PWD-02: a wrong current password is explained and the session stays', (tester) async {
    final app = await _open(tester, (_) => jsonBody(400, backendError(400, 'invalid_credentials')));

    await _submit(tester, current: 'Sai@123456', next: 'Moi@123456');

    expect(app.changes, hasLength(1));
    expect(find.text(viL10n.errorPasswordCurrentWrong), findsOneWidget);
    expect(find.byType(ChangePasswordScreen), findsOneWidget);
    expect(app.storage.access, 'old_access');
  });

  testWidgets('WT-PWD-04: a reused password is explained with the backend rule', (tester) async {
    final app = await _open(tester, (_) => jsonBody(400, backendError(400, 'password_reuse')));

    await _submit(tester, current: 'Cu@123456', next: 'Moi@123456', fromKeyboard: true);

    expect(app.changes, hasLength(1));
    expect(find.text(viL10n.errorPasswordReuse), findsOneWidget);
  });

  testWidgets('WT-PWD-03: success signs out and the login screen shows the notice', (tester) async {
    final app = await _open(tester);

    await _submit(tester, current: 'Cu@123456', next: 'Moi@123456');

    expect(app.changes.single.data, {'currentPassword': 'Cu@123456', 'newPassword': 'Moi@123456'});
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byKey(const Key('login_notice')), findsOneWidget);
    expect(find.text(viL10n.authLoginNoticePasswordChanged), findsOneWidget);
    expect(app.storage.access, isNull);
    expect(app.storage.refresh, isNull);
  });

  testWidgets('WT-LOGIN-01: a session ended by a refused refresh shows the notice on the login screen',
      (tester) async {
    final app = await _open(tester);

    app.events.end(SessionEnd.forCode('refresh_token_reused'));
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byKey(const Key('login_notice')), findsOneWidget);
    expect(find.text(viL10n.authLoginNoticeSessionEnded), findsOneWidget);
  });

  testWidgets('WT-LOGIN-06: an account disabled meanwhile is named in the notice', (tester) async {
    final app = await _open(tester);

    app.events.end(SessionEnd.forCode('account_disabled'));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorAuthAccountDisabled), findsOneWidget);
  });
}

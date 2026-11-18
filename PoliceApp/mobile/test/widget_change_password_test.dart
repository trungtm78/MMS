// Widget Tests: self password change
//   POST /users/me/change-password {currentPassword, newPassword} → 204, ending every session
//   (Web/backend/src/users/users.controller.ts:15-23,42-47; users.service.ts:180-219)
// Run: flutter test test/widget_change_password_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/auth/screens/change_password_screen.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

class _Screen {
  _Screen(this.storage, this.adapter, this.container);

  final MemoryStorage storage;
  final FakeAdapter adapter;
  final ProviderContainer container;
}

Future<_Screen> _pump(WidgetTester tester, ResponseBody Function(RequestOptions) handler) async {
  final storage = MemoryStorage(role: 'ca');
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedApp(const ChangePasswordScreen()),
  ));
  final container = ProviderScope.containerOf(tester.element(find.byType(ChangePasswordScreen)));
  await container.read(authStateProvider.notifier).ready;
  await tester.pumpAndSettle();
  return _Screen(storage, adapter, container);
}

Finder get _submitButton => find.widgetWithText(ElevatedButton, viL10n.authChangePasswordSubmit);

Future<void> _submit(WidgetTester tester, {required String current, required String next, String? confirm}) async {
  await tester.enterText(find.byKey(const Key('current_password')), current);
  await tester.enterText(find.byKey(const Key('new_password')), next);
  await tester.enterText(find.byKey(const Key('confirm_password')), confirm ?? next);
  await tester.ensureVisible(_submitButton);
  await tester.pumpAndSettle();
  await tester.tap(_submitButton);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-PWD-01: the backend password rules are checked before sending', (tester) async {
    final s = await _pump(tester, (_) => ResponseBody.fromString('', 204));

    expect(find.text(viL10n.authChangePasswordNote), findsOneWidget);
    await _submit(tester, current: '', next: 'abcdefgh');
    expect(find.text(viL10n.authChangePasswordCurrentRequired), findsOneWidget);
    expect(find.text(viL10n.errorPasswordComplexity), findsOneWidget);

    await _submit(tester, current: 'Old@12345', next: 'New@12345', confirm: 'New@12346');
    expect(find.text(viL10n.authChangePasswordMismatch), findsOneWidget);

    await _submit(tester, current: 'Old@12345', next: 'Old@12345');
    expect(find.text(viL10n.authChangePasswordMustDiffer), findsOneWidget);

    expect(s.adapter.requests, isEmpty);
  });

  testWidgets('WT-PWD-02: a successful change signs out with the password-changed notice', (tester) async {
    final s = await _pump(tester, (_) => ResponseBody.fromString('', 204));
    expect(s.container.read(authStateProvider).isAuthenticated, isTrue);

    await _submit(tester, current: 'Old@12345', next: 'New@12345');

    final request = s.adapter.requests.single;
    expect(request.path, '/users/me/change-password');
    expect(request.data, {'currentPassword': 'Old@12345', 'newPassword': 'New@12345'});
    expect(s.storage.access, isNull);
    expect(s.storage.refresh, isNull);
    final auth = s.container.read(authStateProvider);
    expect(auth.isAuthenticated, isFalse);
    expect(auth.notice?.code, AppFailure.passwordChanged);
  });

  testWidgets('WT-PWD-03: a wrong current password is shown and the session stays', (tester) async {
    final s = await _pump(
      tester,
      (_) => jsonBody(400, {'code': 'E001', 'message': 'invalid_credentials', 'statusCode': 400}),
    );

    await _submit(tester, current: 'Wrong@123', next: 'New@12345');

    expect(find.text(viL10n.errorCurrentPasswordInvalid), findsOneWidget);
    expect(s.storage.access, 'old_access');
    expect(s.container.read(authStateProvider).isAuthenticated, isTrue);
    expect(tester.widget<ElevatedButton>(_submitButton).onPressed, isNotNull);
  });

  testWidgets('WT-PWD-04: the passwords can be shown and hidden', (tester) async {
    await _pump(tester, (_) => ResponseBody.fromString('', 204));

    TextField field() => tester.widget<TextField>(
          find.descendant(of: find.byKey(const Key('new_password')), matching: find.byType(TextField)),
        );
    expect(field().obscureText, isTrue);

    await tester.tap(find.byTooltip(viL10n.authChangePasswordShow));
    await tester.pump();
    expect(field().obscureText, isFalse);
    expect(find.byTooltip(viL10n.authChangePasswordHide), findsOneWidget);
  });
}

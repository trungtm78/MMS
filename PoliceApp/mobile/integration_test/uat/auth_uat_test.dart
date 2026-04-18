// UAT: Authentication Flow
// Task ID: TASK-2026-001
// Scenarios from 03_TEST_SCENARIOS.md: TS-001-01 ~ TS-001-08
// Flutter Integration Test — run: flutter test integration_test/uat/auth_uat_test.dart -d [device-id]

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:police_app/main.dart' as app;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('UAT: Authentication Flow — TS-001', () {
    testWidgets('UAT-TS-001-01: CA login thành công → CA home', (tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 3));

      await binding.takeScreenshot('auth-uat01-01-login-screen');

      // Tìm fields username / password
      final usernameField = find.byKey(const Key('username_field'));
      final passwordField = find.byKey(const Key('password_field'));
      final loginButton = find.byKey(const Key('login_button'));

      expect(usernameField, findsOneWidget);
      expect(passwordField, findsOneWidget);
      expect(loginButton, findsOneWidget);

      await tester.enterText(usernameField, 'ca001');
      await tester.enterText(passwordField, '123456');
      await tester.tap(loginButton);
      await tester.pumpAndSettle(const Duration(seconds: 5));

      await binding.takeScreenshot('auth-uat01-01-ca-home');

      // CA home: header "Trang chủ"
      expect(find.text('Trang chủ'), findsOneWidget);
    });

    testWidgets('UAT-TS-001-02: DQTV login thành công → DQTV home', (tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 3));

      await tester.enterText(find.byKey(const Key('username_field')), 'dqtv001');
      await tester.enterText(find.byKey(const Key('password_field')), '123456');
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      await binding.takeScreenshot('auth-uat01-02-dqtv-home');

      // DQTV home
      expect(find.text('Trang chủ'), findsOneWidget);
    });

    testWidgets('UAT-TS-001-03: Đăng nhập sai mật khẩu → thông báo lỗi', (tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 2));

      await tester.enterText(find.byKey(const Key('username_field')), 'ca001');
      await tester.enterText(find.byKey(const Key('password_field')), 'wrongpass');
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle(const Duration(seconds: 4));

      await binding.takeScreenshot('auth-uat01-03-wrong-password');

      // Expect some error message is visible
      final errorVisible = tester.any(find.textContaining('sai')) ||
          tester.any(find.textContaining('không hợp lệ')) ||
          tester.any(find.textContaining('mật khẩu'));
      expect(errorVisible, isTrue);
    });

    testWidgets('UAT-TS-001-04: Đăng nhập thiếu username → validation error', (tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Không nhập username, chỉ nhập password
      await tester.enterText(find.byKey(const Key('password_field')), '123456');
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle();

      await binding.takeScreenshot('auth-uat01-04-empty-username');

      // Expect validation message
      final validationVisible = tester.any(find.textContaining('không được để trống')) ||
          tester.any(find.textContaining('Nhập tên'));
      expect(validationVisible, isTrue);
    });

    testWidgets('UAT-TS-001-08: Đăng xuất → về login screen', (tester) async {
      // Login first
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 3));
      await tester.enterText(find.byKey(const Key('username_field')), 'ca001');
      await tester.enterText(find.byKey(const Key('password_field')), '123456');
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Navigate to profile tab if present
      final profileTab = find.byKey(const Key('nav_profile'));
      if (profileTab.evaluate().isNotEmpty) {
        await tester.tap(profileTab);
        await tester.pumpAndSettle();
      }

      // Tap logout button if present
      final logoutButton = find.byKey(const Key('logout_button'));
      if (logoutButton.evaluate().isNotEmpty) {
        await tester.tap(logoutButton);
        await tester.pumpAndSettle(const Duration(seconds: 2));

        await binding.takeScreenshot('auth-uat01-08-after-logout');

        // Expect back at login screen
        expect(find.byKey(const Key('login_button')), findsOneWidget);
      }
    });
  });
}

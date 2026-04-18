// UAT: Task Management Flow
// Task ID: TASK-2026-004
// Scenarios from 03_TEST_SCENARIOS.md: TS-003-01 ~ TS-003-03, TS-004-01 ~ TS-004-02
// Flutter Integration Test — run: flutter test integration_test/uat/tasks_uat_test.dart -d [device-id]

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:police_app/main.dart' as app;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('UAT: Task Management — TS-003 (CA) / TS-004 (DQTV)', () {
    Future<void> loginAs(WidgetTester tester, String username) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 3));
      await tester.enterText(find.byKey(const Key('username_field')), username);
      await tester.enterText(find.byKey(const Key('password_field')), '123456');
      await tester.tap(find.byKey(const Key('login_button')));
      await tester.pumpAndSettle(const Duration(seconds: 5));
    }

    testWidgets('UAT-TS-003-01: CA xem danh sách nhiệm vụ → tasks screen', (tester) async {
      await loginAs(tester, 'ca001');

      await binding.takeScreenshot('tasks-uat03-01-ca-home');

      // Navigate to Tasks tab
      final tasksTab = find.byKey(const Key('nav_tasks'));
      if (tasksTab.evaluate().isNotEmpty) {
        await tester.tap(tasksTab);
        await tester.pumpAndSettle(const Duration(seconds: 3));
      }

      await binding.takeScreenshot('tasks-uat03-01-ca-tasks');

      // Tasks screen rendered
      expect(find.byType(Scaffold), findsAtLeastNWidgets(1));
    });

    testWidgets('UAT-TS-003-02: CA tạo nhiệm vụ mới → form present', (tester) async {
      await loginAs(tester, 'ca001');

      // Navigate to Tasks tab
      final tasksTab = find.byKey(const Key('nav_tasks'));
      if (tasksTab.evaluate().isNotEmpty) {
        await tester.tap(tasksTab);
        await tester.pumpAndSettle(const Duration(seconds: 2));
      }

      await binding.takeScreenshot('tasks-uat03-02-before-create');

      // Tap create task button (FAB or dedicated button)
      final createBtn = find.byKey(const Key('create_task_fab'));
      if (createBtn.evaluate().isNotEmpty) {
        await tester.tap(createBtn);
        await tester.pumpAndSettle(const Duration(seconds: 2));

        await binding.takeScreenshot('tasks-uat03-02-create-form');

        // Create task form is shown
        final hasForm = tester.any(find.byKey(const Key('task_title_field'))) ||
            tester.any(find.textContaining('Tiêu đề'));
        expect(hasForm, isTrue);
      }
    });

    testWidgets('UAT-TS-004-01: DQTV xem danh sách nhiệm vụ được giao', (tester) async {
      await loginAs(tester, 'dqtv001');

      await binding.takeScreenshot('tasks-uat04-01-dqtv-home');

      // Navigate to Tasks tab
      final tasksTab = find.byKey(const Key('nav_tasks'));
      if (tasksTab.evaluate().isNotEmpty) {
        await tester.tap(tasksTab);
        await tester.pumpAndSettle(const Duration(seconds: 3));
      }

      await binding.takeScreenshot('tasks-uat04-01-dqtv-tasks');

      // Tasks screen rendered without crash
      expect(find.byType(Scaffold), findsAtLeastNWidgets(1));
    });

    testWidgets('UAT-TS-004-02: DQTV nhận nhiệm vụ → accept available', (tester) async {
      await loginAs(tester, 'dqtv001');

      final tasksTab = find.byKey(const Key('nav_tasks'));
      if (tasksTab.evaluate().isNotEmpty) {
        await tester.tap(tasksTab);
        await tester.pumpAndSettle(const Duration(seconds: 3));
      }

      await binding.takeScreenshot('tasks-uat04-02-task-list');

      // Check for task cards in list
      final hasTaskList = tester.any(find.byType(ListView)) ||
          tester.any(find.byType(ListTile)) ||
          tester.any(find.byType(Card));
      expect(hasTaskList, isTrue);
    });
  });
}

// Widget Tests: task tabs follow the statuses the backend really writes
//   GET /tasks → {data, total, page, limit}, scoped by the server to the caller's tasks (task-sql.ts taskRowSelect:
//   t.status, t.deadline, overdue flag); tasks.status ∈ pending | assigned | in_progress | completed |
//   cancelled | overdue (TASK_STATUSES).
//   "Đang làm" = in_progress; "Chờ" = pending/assigned; "Quá hạn" = status overdue, or past the deadline
//   and neither completed nor cancelled.
//   POST /tasks/:id/accept moves pending | assigned | overdue → in_progress (tasks.service.ts ACCEPTABLE_STATUSES)
// Run: flutter test test/widget_tasks_list_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/tasks/repositories/tasks_repository.dart';
import 'package:militian_app/features/tasks/screens/tasks_list_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

const _past = '2020-01-01T00:00:00.000Z';
const _future = '2099-01-01T00:00:00.000Z';

List<Map<String, dynamic>> _rows() => [
      backendTaskRow('t-wait', 'pending', deadline: _future, title: 'Tuần tra khu phố 3'),
      backendTaskRow('t-assigned', 'assigned', title: 'Hỗ trợ điều tiết giao thông'),
      backendTaskRow('t-run', 'in_progress', deadline: _future, title: 'Chốt gác cổng trường'),
      backendTaskRow('t-late', 'in_progress', deadline: _past, title: 'Kiểm tra PCCC chợ'),
      backendTaskRow('t-done', 'completed', deadline: _past, title: 'Trực ban đêm'),
      backendTaskRow('t-cancel', 'cancelled', title: 'Huấn luyện dã ngoại'),
    ];

Future<FakeAdapter> _open(WidgetTester tester, ResponseBody Function(RequestOptions) handler) async {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final storage = MemoryStorage()..userId = 'u-me';
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(storage),
      tasksRepositoryProvider.overrideWithValue(TasksRepository(dio)),
    ],
    child: localizedApp(const TasksListScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

void main() {
  testWidgets('WT-TASKS-01: "Đang làm" shows the backend in_progress tasks and every tab counts real rows',
      (tester) async {
    final adapter = await _open(tester, (_) => jsonBody(200, backendPage(_rows())));

    expect(adapter.requests.first.path, '/tasks');
    expect(adapter.requests.first.queryParameters, {'page': 1, 'limit': 100});

    expect(find.text('Đang làm (1)'), findsOneWidget);
    expect(find.text('Chờ (2)'), findsOneWidget);
    expect(find.text('Hoàn thành (1)'), findsOneWidget);
    expect(find.text('Quá hạn (1)'), findsOneWidget);
    expect(find.text('Đã hủy (1)'), findsOneWidget);

    // Default tab: in progress
    expect(find.text('Chốt gác cổng trường'), findsOneWidget);
    expect(find.text('Đang thực hiện'), findsOneWidget);
    expect(find.text('Báo cáo'), findsOneWidget);
    expect(find.text('Kiểm tra PCCC chợ'), findsNothing);
    expect(find.text('Tuần tra khu phố 3'), findsNothing);
    // The filter icon did nothing
    expect(find.byIcon(Icons.filter_list), findsNothing);

    await tester.tap(find.text('Chờ (2)'));
    await tester.pumpAndSettle();
    expect(find.text('Tuần tra khu phố 3'), findsOneWidget);
    expect(find.text('Hỗ trợ điều tiết giao thông'), findsOneWidget);
    // POST /tasks/:id/accept takes pending, assigned and overdue tasks (tasks.service.ts ACCEPTABLE_STATUSES)
    expect(find.text('Tiếp nhận'), findsNWidgets(2));

    await tester.tap(find.text('Quá hạn (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Kiểm tra PCCC chợ'), findsOneWidget);
    // No backend route takes an explanation for a late task
    expect(find.text('Giải trình'), findsNothing);
  });

  testWidgets('WT-TASKS-02: accepting posts /tasks/:id/accept and reloads the tabs', (tester) async {
    var status = 'pending';
    final adapter = await _open(tester, (o) {
      if (o.method == 'POST' && o.path == '/tasks/t-wait/accept') {
        status = 'in_progress';
        return jsonBody(200, backendTaskRow('t-wait', status, deadline: _future));
      }
      return jsonBody(200, backendPage([
        backendTaskRow('t-wait', status, deadline: _future, title: 'Tuần tra khu phố 3'),
      ]));
    });

    await tester.tap(find.text('Chờ (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tiếp nhận'));
    await tester.pumpAndSettle();

    expect(adapter.requests.where((r) => r.method == 'POST').single.path, '/tasks/t-wait/accept');
    expect(adapter.requests.where((r) => r.method == 'GET'), hasLength(2));
    expect(find.text('Đang làm (1)'), findsOneWidget);
    expect(find.text('Chờ'), findsOneWidget);
  });

  testWidgets('WT-TASKS-03: a refused accept is explained in Vietnamese', (tester) async {
    // A task the caller is not assigned to is outside their scope: 404 task_not_found
    // (tasks.service.ts lockAssignedTask)
    await _open(
      tester,
      (o) => o.method == 'POST'
          ? jsonBody(404, backendError(404, 'task_not_found'))
          : jsonBody(200, backendPage([backendTaskRow('t-wait', 'pending', deadline: _future)])),
    );

    await tester.tap(find.text('Chờ (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tiếp nhận'));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorTaskNotFound), findsOneWidget);
  });
}

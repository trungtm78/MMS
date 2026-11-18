// Widget Tests: DQTV task list
//   GET /tasks?limit= → {data, total, page, limit}: one row per task of the caller's scope with
//   status, overdue (open past its deadline), deadline, code, locationName, unitCode, updatedAt
//   (Web/backend/src/tasks/tasks.service.ts listTasksPaginated, task-sql.ts taskRowSelect)
// Run: flutter test test/widget_tasks_screen_dqtv_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/tasks/screens/tasks_screen_dqtv.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Map<String, Object?> _row(
  String id,
  String status, {
  bool overdue = false,
  String? deadline = '2026-09-20T01:00:00.000Z',
  String? location,
}) =>
    {
      'id': id,
      'code': 'TASK-20260914-$id',
      'title': 'Task $id',
      'description': null,
      'type': 'patrol',
      'priority': 'medium',
      'status': status,
      'deadline': deadline,
      'createdAt': '2026-09-14T01:00:00.000Z',
      'updatedAt': '2026-09-14T01:00:00.000Z',
      'overdue': overdue,
      'unitCode': 'KP1',
      'assigneeId': 'u-1',
      'assigneeName': 'Nguyen Van A',
      'militiaId': 'mp-1',
      'militiaCode': 'DQ-001',
      'locationName': location,
      'locationLat': null,
      'locationLng': null,
    };

final _rows = [
  _row('T1', 'pending', overdue: true, deadline: '2026-09-10T01:00:00.000Z', location: 'Gate A'),
  _row('T2', 'assigned'),
  _row('T3', 'in_progress'),
  _row('T4', 'completed'),
  _row('T5', 'cancelled', deadline: null),
];

ResponseBody _page(List<Map<String, Object?>> rows) =>
    jsonBody(200, {'data': rows, 'total': rows.length, 'page': 1, 'limit': 50});

Future<FakeAdapter> _pump(WidgetTester tester, ResponseBody Function(RequestOptions) handler) async {
  tester.view.physicalSize = const Size(900, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, state) => const MyTasksScreen()),
    GoRoute(
      path: '/dqtv/tasks/:id',
      builder: (context, state) => Scaffold(body: Text('task ${state.pathParameters['id']}')),
    ),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

String _deadline(String iso) => DateFormat('dd/MM/yyyy').format(DateTime.parse(iso).toLocal());

void main() {
  testWidgets('WT-MYT-01: groups one row per task by its status and marks overdue tasks', (tester) async {
    final adapter = await _pump(tester, (_) => _page(_rows));

    expect(adapter.requests.single.path, '/tasks');
    expect(adapter.requests.single.queryParameters, {'limit': 50});
    expect(find.text(viL10n.tasksMyListTitle), findsOneWidget);
    expect(find.text(viL10n.tasksMyListTabAll(5)), findsOneWidget);
    expect(find.text(viL10n.tasksMyListTabToAccept(2)), findsOneWidget);
    expect(find.text(viL10n.tasksMyListTabInProgress(1)), findsOneWidget);
    expect(find.text(viL10n.tasksMyListTabCompleted(1)), findsOneWidget);

    for (final id in ['T1', 'T2', 'T3', 'T4', 'T5']) {
      expect(find.text('Task $id'), findsOneWidget);
    }
    expect(find.text(viL10n.tasksStatusPending), findsOneWidget);
    expect(find.text(viL10n.tasksStatusOverdue), findsOneWidget);
    expect(find.text(viL10n.tasksStatusCancelled), findsOneWidget);
    expect(find.text('TASK-20260914-T1  •  ${viL10n.tasksMyListDeadline(_deadline('2026-09-10T01:00:00.000Z'))}'),
        findsOneWidget);
    expect(find.text('TASK-20260914-T5  •  ${viL10n.tasksMyListDeadline('-')}'), findsOneWidget);
    expect(find.text('Gate A'), findsOneWidget);
  });

  testWidgets('WT-MYT-02: each tab lists its own tasks', (tester) async {
    await _pump(tester, (_) => _page(_rows));

    await _tap(tester, find.text(viL10n.tasksMyListTabToAccept(2)));
    expect(find.text('Task T1'), findsOneWidget);
    expect(find.text('Task T2'), findsOneWidget);
    expect(find.text('Task T3'), findsNothing);

    await _tap(tester, find.text(viL10n.tasksMyListTabInProgress(1)));
    expect(find.text('Task T3'), findsOneWidget);
    expect(find.text('Task T1'), findsNothing);

    await _tap(tester, find.text(viL10n.tasksMyListTabCompleted(1)));
    expect(find.text('Task T4'), findsOneWidget);
    expect(find.text('Task T5'), findsNothing);
  });

  testWidgets('WT-MYT-03: no tasks shows the empty state', (tester) async {
    await _pump(tester, (_) => _page(const []));

    expect(find.text(viL10n.tasksMyListEmpty), findsOneWidget);
    expect(find.text(viL10n.tasksMyListTabAll(0)), findsOneWidget);
  });

  testWidgets('WT-MYT-04: a failed load says why, and retry loads the tasks', (tester) async {
    var fail = true;
    final adapter = await _pump(tester, (_) => fail ? jsonBody(500, {'statusCode': 500}) : _page(_rows));

    expect(find.text(viL10n.tasksMyListLoadFailed(viL10n.errorServer)), findsOneWidget);

    fail = false;
    await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));

    expect(find.text('Task T3'), findsOneWidget);
    expect(adapter.requests, hasLength(2));
  });

  testWidgets('WT-MYT-05: a list that is not the envelope is reported as unreadable', (tester) async {
    await _pump(tester, (_) => jsonBody(200, ['T1']));

    expect(find.text(viL10n.tasksMyListLoadFailed(viL10n.errorBadResponse)), findsOneWidget);
  });

  testWidgets('WT-MYT-06: tapping a task opens it', (tester) async {
    await _pump(tester, (_) => _page(_rows));

    await _tap(tester, find.text('Task T3'));

    expect(find.text('task T3'), findsOneWidget);
  });
}

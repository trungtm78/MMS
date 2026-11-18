// Widget Tests: task detail screen (DQTV)
//   GET   /tasks/:id          → the task row itself, scoped to the caller: id, code, title, description,
//                               priority, status, deadline, createdAt, updatedAt, overdue, unitCode,
//                               assigneeName, militiaCode, locationName/Lat/Lng; 404 task_not_found
//                               outside the scope (Web/backend/src/tasks/tasks.service.ts getTaskById)
//   POST  /tasks/:id/accept   → from pending, assigned or overdue; 409 task_not_acceptable otherwise;
//                               404 task_not_found for anyone else
//   Completion is a report (POST /tasks/:id/report, task_report_screen.dart), not a progress update
// Run: flutter test test/widget_task_detail_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/tasks/screens/task_detail_screen.dart';
import 'package:police_app/features/tasks/screens/task_report_screen.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

Map<String, Object?> _task({
  String status = 'pending',
  String priority = 'high',
  bool overdue = false,
  List<Map<String, Object?>> attachments = const [],
}) =>
    {
      'id': 't-1',
      'code': 'TASK-20260914-ABC123',
      'title': 'Patrol block 3',
      'description': 'Check the market gate',
      'type': 'patrol',
      'priority': priority,
      'status': status,
      'deadline': '2026-09-20T01:00:00.000Z',
      'createdAt': '2026-09-14T02:30:00.000Z',
      'updatedAt': '2026-09-14T02:30:00.000Z',
      'overdue': overdue,
      'unitCode': 'KP1',
      'assigneeId': 'u-1',
      'assigneeName': 'Nguyen Van A',
      'militiaId': 'mp-1',
      'militiaCode': 'DQ-001',
      'locationName': 'Phu Dinh market',
      'locationLat': 10.729123,
      'locationLng': 106.643789,
      'attachments': attachments,
    };

ResponseBody _error(int status, String code) =>
    jsonBody(status, {'code': 'E000', 'message': code, 'statusCode': status});

String _local(String iso) => DateFormat('dd/MM/yyyy HH:mm').format(DateTime.parse(iso).toLocal());

Future<FakeAdapter> _pump(WidgetTester tester, ResponseBody Function(RequestOptions) handler) async {
  tester.view.physicalSize = const Size(900, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: localizedApp(const TaskDetailScreen(taskId: 't-1')),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Finder _button(String text) => find.widgetWithText(ElevatedButton, text);

List<String> _calls(FakeAdapter adapter) => adapter.requests.map((r) => '${r.method} ${r.path}').toList();

void main() {
  testWidgets('WT-TASK-D01: shows the task the backend returns as a bare object', (tester) async {
    final adapter = await _pump(tester, (_) => jsonBody(200, _task()));

    expect(adapter.requests.single.path, '/tasks/t-1');
    expect(find.text(viL10n.tasksDetailTitle), findsOneWidget);
    expect(find.text('Patrol block 3'), findsOneWidget);
    expect(find.text('TASK-20260914-ABC123'), findsOneWidget);
    expect(find.text(viL10n.tasksStatusPending), findsOneWidget);
    expect(find.text(viL10n.tasksStatusOverdue), findsNothing);
    expect(find.text(viL10n.tasksPriorityHigh), findsOneWidget);
    expect(find.text('Check the market gate'), findsOneWidget);
    expect(find.text('Phu Dinh market (10.72912, 106.64379)'), findsOneWidget);
    expect(find.text(viL10n.tasksDetailDeadline), findsOneWidget);
    expect(find.text(_local('2026-09-20T01:00:00.000Z')), findsOneWidget);
    expect(find.text(_local('2026-09-14T02:30:00.000Z')), findsOneWidget);
    expect(find.text(viL10n.tasksDetailSectionAssignee), findsOneWidget);
    expect(find.text('Nguyen Van A'), findsOneWidget);
    expect(find.text('DQ-001'), findsOneWidget);
    expect(find.text(viL10n.tasksDetailNotFound), findsNothing);
  });

  testWidgets('WT-TASK-D02: a pending task is accepted, reloaded and can then be reported', (tester) async {
    var status = 'pending';
    final adapter = await _pump(tester, (o) {
      if (o.path == '/tasks/t-1/accept') status = 'in_progress';
      return jsonBody(200, _task(status: status));
    });

    await tester.tap(_button(viL10n.tasksDetailAccept));
    await tester.pumpAndSettle();

    expect(_calls(adapter), ['GET /tasks/t-1', 'POST /tasks/t-1/accept', 'GET /tasks/t-1']);
    expect(find.text(viL10n.tasksDetailAccepted), findsOneWidget);
    expect(find.text(viL10n.tasksStatusInProgress), findsOneWidget);
    expect(_button(viL10n.tasksDetailAccept), findsNothing);
    expect(_button(viL10n.tasksDetailReport), findsOneWidget);
  });

  testWidgets('WT-TASK-D03: a task in progress is completed through a report, then reloaded', (tester) async {
    var status = 'in_progress';
    final adapter = await _pump(tester, (o) {
      if (o.path == '/tasks/t-1/report') {
        status = 'completed';
        return jsonBody(201, {'id': 'r-1', 'taskId': 't-1', 'submittedAt': '2026-09-14T03:00:00.000Z', 'photos': []});
      }
      return jsonBody(200, _task(status: status, priority: 'medium'));
    });
    expect(find.text(viL10n.tasksPriorityMedium), findsOneWidget);

    await tester.tap(_button(viL10n.tasksDetailReport));
    await tester.pumpAndSettle();
    expect(find.byType(TaskReportScreen), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).first, 'Patrolled block 3');
    await tester.tap(_button(viL10n.tasksReportSubmit));
    await tester.pumpAndSettle();
    await tester.tap(_button(viL10n.tasksReportDone));
    await tester.pumpAndSettle();

    expect(find.byType(TaskReportScreen), findsNothing);
    expect(_calls(adapter), ['GET /tasks/t-1', 'POST /tasks/t-1/report', 'GET /tasks/t-1']);
    expect(find.text(viL10n.tasksStatusCompleted), findsOneWidget);
    expect(_button(viL10n.tasksDetailReport), findsNothing);
  });

  testWidgets('WT-TASK-D04: leaving the report without sending keeps the task as it was', (tester) async {
    final adapter = await _pump(tester, (_) => jsonBody(200, _task(status: 'in_progress')));

    await tester.tap(_button(viL10n.tasksDetailReport));
    await tester.pumpAndSettle();
    // AppHeader's back arrow
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();

    expect(find.byType(TaskReportScreen), findsNothing);
    expect(_calls(adapter), ['GET /tasks/t-1']);
    expect(_button(viL10n.tasksDetailReport), findsOneWidget);
  });

  testWidgets('WT-TASK-D05: accepting a task outside the caller scope says it was not found', (tester) async {
    await _pump(tester, (o) => o.path == '/tasks/t-1/accept' ? _error(404, 'task_not_found') : jsonBody(200, _task()));

    await tester.tap(_button(viL10n.tasksDetailAccept));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksDetailAcceptFailed(viL10n.tasksErrorTaskNotFound)), findsOneWidget);
    expect(_button(viL10n.tasksDetailAccept), findsOneWidget);
  });

  testWidgets('WT-TASK-D06: accepting a task that moved on meanwhile shows the conflict', (tester) async {
    await _pump(
      tester,
      (o) => o.path == '/tasks/t-1/accept' ? _error(409, 'task_not_acceptable') : jsonBody(200, _task()),
    );

    await tester.tap(_button(viL10n.tasksDetailAccept));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksDetailAcceptFailed(viL10n.tasksErrorTaskNotAcceptable)), findsOneWidget);
  });

  testWidgets('WT-TASK-D07: a failed load says why, and retry loads the task', (tester) async {
    var fail = true;
    await _pump(tester, (_) => fail ? _error(404, 'task_not_found') : jsonBody(200, _task(status: 'completed')));

    expect(find.text(viL10n.tasksDetailLoadFailed(viL10n.tasksErrorTaskNotFound)), findsOneWidget);

    fail = false;
    await tester.tap(_button(viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text('Patrol block 3'), findsOneWidget);
    expect(find.text(viL10n.tasksStatusCompleted), findsOneWidget);
    // A completed task has nothing left to do
    expect(_button(viL10n.tasksDetailAccept), findsNothing);
    expect(_button(viL10n.tasksDetailReport), findsNothing);
  });

  testWidgets('WT-TASK-D08: a response without a task object says the task was not found', (tester) async {
    await _pump(tester, (_) => jsonBody(200, ['t-1']));

    expect(find.text(viL10n.tasksDetailNotFound), findsOneWidget);
  });

  testWidgets('WT-TASK-D09: optional fields are left out and unknown codes are shown as they are',
      (tester) async {
    await _pump(tester, (_) {
      final task = _task(status: 'archived', priority: 'critical')
        ..['description'] = null
        ..['deadline'] = null
        ..['locationName'] = null
        ..['locationLat'] = null
        ..['locationLng'] = null
        ..['code'] = null
        ..['assigneeName'] = null
        ..['militiaCode'] = null;
      return jsonBody(200, task);
    });

    expect(find.text('archived'), findsOneWidget);
    expect(find.text('critical'), findsOneWidget);
    expect(find.text(viL10n.tasksDetailDescription), findsNothing);
    expect(find.text(viL10n.tasksDetailLocation), findsNothing);
    expect(find.text(viL10n.tasksDetailDeadline), findsNothing);
    expect(find.text(viL10n.tasksDetailSectionAssignee), findsNothing);
    expect(find.text(viL10n.tasksDetailCreatedAt), findsOneWidget);
    expect(_button(viL10n.tasksDetailAccept), findsNothing);
  });

  testWidgets('WT-TASK-D10: an assigned task past its deadline is marked overdue and can be accepted',
      (tester) async {
    await _pump(tester, (_) => jsonBody(200, _task(status: 'assigned', overdue: true)));

    expect(find.text(viL10n.tasksStatusAssigned), findsOneWidget);
    expect(find.text(viL10n.tasksStatusOverdue), findsOneWidget);
    expect(_button(viL10n.tasksDetailAccept), findsOneWidget);
  });

  testWidgets('WT-TASK-D12: the files the creator attached are shown, images as thumbnails', (tester) async {
    final adapter = await _pump(tester, (o) {
      if (o.path == '/files/f1') return pngBody(o);
      return jsonBody(200, _task(attachments: [
        fileView('f1', name: 'gate.jpg'),
        fileView('f2', name: 'brief.pdf', mimeType: 'application/pdf'),
      ]));
    });

    expect(find.text(viL10n.tasksDetailSectionAttachments), findsOneWidget);
    expect(find.byType(AuthenticatedImage), findsOneWidget);
    expect(find.text('brief.pdf'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path == '/files/f1'), hasLength(1));
  });

  testWidgets('WT-TASK-D13: the attachments follow the task answered after accepting', (tester) async {
    var accepted = false;
    await _pump(tester, (o) {
      if (o.path == '/tasks/t-1/accept') accepted = true;
      return jsonBody(
        200,
        _task(
          status: accepted ? 'in_progress' : 'pending',
          attachments: accepted ? [fileView('f3', name: 'map.pdf', mimeType: 'application/pdf')] : const [],
        ),
      );
    });
    expect(find.text(viL10n.tasksDetailSectionAttachments), findsNothing);

    await tester.tap(_button(viL10n.tasksDetailAccept));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksDetailSectionAttachments), findsOneWidget);
    expect(find.text('map.pdf'), findsOneWidget);
  });

  testWidgets('WT-TASK-D11: a task stored as overdue can be accepted and is not marked twice', (tester) async {
    await _pump(tester, (_) => jsonBody(200, _task(status: 'overdue', overdue: true)));

    expect(find.text(viL10n.tasksStatusOverdue), findsOneWidget);
    expect(_button(viL10n.tasksDetailAccept), findsOneWidget);
  });
}

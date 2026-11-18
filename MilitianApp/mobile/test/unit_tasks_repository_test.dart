// Unit Tests: TasksRepository against Web/backend/src/tasks (tasks.controller.ts, tasks.service.ts, task-sql.ts)
//   Every route is scoped to the caller: out of scope 404 task_not_found; a malformed id 400 (ParseUUIDPipe).
//   GET   /tasks?page=&limit= → {data, total, page, limit}: one row per task, `total` counts tasks, limit 1..100.
//         Members reach only their own assignments (common/access/member-scope.ts: userIds [caller]), so every row
//         is the caller's task and no assignee filter is applied.
//   GET   /tasks/:id → the task with attachments [{id, url, name, mimeType, size}]
//   POST  /tasks/:id/accept → the task (attachments included); 409 task_not_acceptable unless pending|assigned|overdue
//   POST  /tasks/:id/report {description, completedAt?, location?, photoIds?} → 201 {id, taskId, submittedAt, photos};
//         409 task_closed on a completed or cancelled task
//   PATCH /tasks/:id/progress accepts only status in_progress: the app never calls it (starting a task is accept,
//         completing it is the report)
// Run: flutter test test/unit_tasks_repository_test.dart

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/tasks/repositories/tasks_repository.dart';

import 'helpers/fakes.dart';

(TasksRepository, FakeAdapter) _repo(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (TasksRepository(dio), adapter);
}

Matcher _api(String? code, int status) => throwsA(isA<TasksException>()
    .having((e) => e.failure?.code, 'code', code)
    .having((e) => e.issue, 'issue', isNull)
    .having((e) => e.statusCode, 'statusCode', status));

final _malformed = throwsA(isA<TasksException>().having((e) => e.issue, 'issue', TasksIssue.malformedResponse));

void main() {
  group('myTasks', () {
    test('UT-TR-01: reads pages of 100 until `total` tasks are in, keeping every row', () async {
      final page1 = [for (var i = 0; i < 100; i++) backendTaskRow('a$i', 'pending')];
      final page2 = [backendTaskRow('b1', 'in_progress'), backendTaskRow('b2', 'completed')];
      final (repo, adapter) = _repo((o) => jsonBody(
            200,
            o.queryParameters['page'] == 1
                ? backendPage(page1, total: 102)
                : backendPage(page2, total: 102, page: 2),
          ));

      final tasks = await repo.myTasks();

      expect(adapter.requests.map((r) => '${r.method} ${r.path}').toSet(), {'GET /tasks'});
      expect(adapter.requests.map((r) => r.queryParameters), [
        {'page': 1, 'limit': 100},
        {'page': 2, 'limit': 100},
      ]);
      expect(tasks, hasLength(102));
      expect(tasks.last['id'], 'b2');
    });

    test('UT-TR-02: a full page that already holds `total` tasks is the last one', () async {
      final page1 = [for (var i = 0; i < 100; i++) backendTaskRow('a$i', 'pending')];
      final (repo, adapter) = _repo((o) => jsonBody(
            200,
            o.queryParameters['page'] == 1 ? backendPage(page1, total: 100) : backendPage(const [], total: 100, page: 2),
          ));

      expect(await repo.myTasks(), hasLength(100));
      expect(adapter.requests, hasLength(1));
    });

    test('UT-TR-03: rows are the caller\'s whatever assigneeId says; a repeated id is listed once', () async {
      final rows = [
        backendTaskRow('t1', 'in_progress', assigneeId: 'u-me'),
        backendTaskRow('t1', 'in_progress', assigneeId: 'u-me'),
        backendTaskRow('t2', 'pending', assigneeId: null),
        {'title': 'row without id'},
      ];
      final (repo, _) = _repo((_) => jsonBody(200, backendPage(rows, total: 2)));

      expect((await repo.myTasks()).map((t) => t['id']), ['t1', 't2']);
    });

    test('UT-TR-04: a page that is not the pagination contract is an error, not an empty list', () async {
      for (final body in <Object>[
        [backendTaskRow('t1', 'pending')],
        {'items': []},
      ]) {
        final (repo, _) = _repo((_) => jsonBody(200, body));
        await expectLater(repo.myTasks(), _malformed, reason: '$body');
      }
    });

    test('UT-TR-05: a short page ends the read even when total is missing', () async {
      final (repo, adapter) = _repo((_) => jsonBody(200, {'data': [backendTaskRow('t1', 'pending')]}));
      expect(await repo.myTasks(), hasLength(1));
      expect(adapter.requests, hasLength(1));
    });
  });

  test('UT-TR-06: task(id) reads GET /tasks/:id with its attachments', () async {
    final (repo, adapter) = _repo((_) => jsonBody(
          200,
          backendTaskRow('t1', 'assigned', attachments: [
            backendFile('f1', name: 'map.png'),
            backendFile('f2', name: 'orders.pdf', mimeType: 'application/pdf', size: '2048'),
          ]),
        ));

    final task = await repo.task('t1');

    expect(adapter.requests.single.method, 'GET');
    expect(adapter.requests.single.path, '/tasks/t1');
    expect(task['status'], 'assigned');
    final files = taskAttachmentsOf(task);
    expect(files.map((f) => (f.id, f.name, f.mimeType, f.size, f.isImage)), [
      ('f1', 'map.png', 'image/png', 68, true),
      ('f2', 'orders.pdf', 'application/pdf', 2048, false),
    ]);
    expect(taskAttachmentsOf(backendTaskRow('t2', 'pending')), isEmpty);
  });

  group('accept', () {
    test('UT-TR-07: POST /tasks/:id/accept returns the task with its attachments', () async {
      final (repo, adapter) = _repo(
          (_) => jsonBody(200, backendTaskRow('t1', 'in_progress', attachments: [backendFile('f1')])));

      final task = await repo.accept('t1');

      expect(adapter.requests.single.method, 'POST');
      expect(adapter.requests.single.path, '/tasks/t1/accept');
      expect(task['status'], 'in_progress');
      expect(taskAttachmentsOf(task).single.id, 'f1');
    });

    test('UT-TR-08: refusals keep their code: out of scope 404, not acceptable 409, malformed id 400', () async {
      for (final (status, code) in [(404, 'task_not_found'), (409, 'task_not_acceptable')]) {
        final (repo, _) = _repo((_) => jsonBody(status, backendError(status, code)));
        await expectLater(repo.accept('t1'), _api(code, status), reason: code);
      }
      final (repo, _) = _repo((_) => jsonBody(400, backendError(400, 'Validation failed (uuid is expected)')));
      await expectLater(repo.accept('not-a-uuid'), _api('Validation failed (uuid is expected)', 400));
    });

    test('UT-TR-09: an answer that is not a task is malformed', () async {
      final (repo, _) = _repo((_) => jsonBody(200, ['t1']));
      await expectLater(repo.accept('t1'), _malformed);
      await expectLater(repo.task('t1'), _malformed);
    });
  });

  group('submitReport', () {
    test('UT-TR-10: POST /tasks/:id/report sends the report and returns it with its photos', () async {
      final (repo, adapter) = _repo((_) => jsonBody(201, {
            'id': 'r1',
            'taskId': 't1',
            'submittedAt': '2026-09-14T09:00:00.000Z',
            'photos': [backendFile('p1'), backendFile('p2', size: '70')],
          }));

      final report = await repo.submitReport(
        't1',
        description: ' Patrol done ',
        completedAt: DateTime.utc(2026, 9, 14, 8),
        location: 'Ward 3',
        photoIds: ['p1', 'p2'],
      );

      expect(adapter.requests.single.method, 'POST');
      expect(adapter.requests.single.path, '/tasks/t1/report');
      expect(adapter.requests.single.data, {
        'description': 'Patrol done',
        'completedAt': '2026-09-14T08:00:00.000Z',
        'location': 'Ward 3',
        'photoIds': ['p1', 'p2'],
      });
      expect(report.id, 'r1');
      expect(report.photos.map((p) => (p.id, p.size)), [('p1', 68), ('p2', 70)]);
    });

    test('UT-TR-11: a refused body never leaves the device; 409 task_closed keeps its code', () async {
      final (repo, adapter) = _repo((_) => jsonBody(409, backendError(409, 'task_closed')));

      await expectLater(
        repo.submitReport('t1', description: '  '),
        throwsA(isA<TasksException>().having((e) => e.issue, 'issue', TasksIssue.reportDescriptionRequired)),
      );
      expect(adapter.requests, isEmpty);

      await expectLater(repo.submitReport('t1', description: 'Done'), _api('task_closed', 409));
    });

    test('UT-TR-12: an answer without a report id is malformed', () async {
      final (repo, _) = _repo((_) => jsonBody(201, {'photos': []}));
      await expectLater(repo.submitReport('t1', description: 'Done'), _malformed);
    });
  });

  test('UT-TR-13: no app code calls PATCH /tasks/:id/progress (it takes only in_progress; completion is the report)',
      () {
    final offenders = [
      for (final file in Directory('lib').listSync(recursive: true).whereType<File>())
        if (file.path.endsWith('.dart') && !file.path.contains('${Platform.pathSeparator}l10n${Platform.pathSeparator}'))
          if (RegExp(r"/progress'|updateTaskProgress").hasMatch(file.readAsStringSync())) file.path,
    ];
    expect(offenders, isEmpty);
  });
}

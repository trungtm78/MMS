// Unit Tests: POST /tasks/:id/report body
//   SubmitReportDto (Web/backend/src/tasks/tasks.controller.ts): description 1..1000, completedAt ISO (optional),
//   location <= 200 (optional), audioNoteUrl (optional), photoIds: ids from POST /files/upload (purpose task_report),
//   unique, at most 10, in display order. The app never sends audioNoteUrl: there is no voice upload route.
//   Local refusals are TasksException issues, worded by the screen (tasks_texts.dart).
// Run: flutter test test/unit_task_report_request_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/tasks/task_report_request.dart';
import 'package:militian_app/features/tasks/tasks_exception.dart';

Matcher _refused(TasksIssue issue) =>
    throwsA(isA<TasksException>().having((e) => e.issue, 'issue', issue).having((e) => e.failure, 'failure', isNull));

void main() {
  test('UT-TRR-01: trimmed description, UTC completedAt, location and the photo ids in display order', () {
    final body = buildTaskReportBody(
      description: '  Market patrol finished  ',
      completedAt: DateTime.utc(2026, 9, 14, 8, 30),
      location: '  Ben Thanh market ',
      photoIds: ['p2', 'p1'],
    );

    expect(body, {
      'description': 'Market patrol finished',
      'completedAt': '2026-09-14T08:30:00.000Z',
      'location': 'Ben Thanh market',
      'photoIds': ['p2', 'p1'],
    });
  });

  test('UT-TRR-02: a local completedAt is sent in UTC', () {
    final local = DateTime(2026, 9, 14, 15, 30);
    final body = buildTaskReportBody(description: 'Done', completedAt: local);
    expect(body['completedAt'], local.toUtc().toIso8601String());
    expect(body['completedAt'], endsWith('Z'));
  });

  test('UT-TRR-03: optional fields are left out when empty', () {
    expect(buildTaskReportBody(description: 'Done'), {'description': 'Done'});
    expect(buildTaskReportBody(description: 'Done', location: '   ', photoIds: const []), {'description': 'Done'});
  });

  test('UT-TRR-04: never audioNoteUrl', () {
    final body = buildTaskReportBody(
        description: 'Done', completedAt: DateTime.utc(2026), location: 'Headquarters', photoIds: ['p1']);
    expect(body.keys, isNot(contains('audioNoteUrl')));
  });

  test('UT-TRR-05: the backend limits are checked before sending', () {
    expect(() => buildTaskReportBody(description: '   '), _refused(TasksIssue.reportDescriptionRequired));
    expect(() => buildTaskReportBody(description: 'a' * 1001), _refused(TasksIssue.reportDescriptionTooLong));
    expect(buildTaskReportBody(description: ' ${'a' * 1000} ')['description'], hasLength(1000));
    expect(() => buildTaskReportBody(description: 'Done', location: 'l' * 201),
        _refused(TasksIssue.reportLocationTooLong));
    expect(buildTaskReportBody(description: 'Done', location: ' ${'l' * 200} ')['location'], hasLength(200));
  });

  test('UT-TRR-06: at most 10 photos, each once', () {
    expect(maxTaskReportPhotos, 10);
    final ten = [for (var i = 0; i < 10; i++) 'p$i'];
    expect(buildTaskReportBody(description: 'Done', photoIds: ten)['photoIds'], ten);
    expect(() => buildTaskReportBody(description: 'Done', photoIds: [...ten, 'p10']),
        _refused(TasksIssue.reportTooManyPhotos));
    expect(() => buildTaskReportBody(description: 'Done', photoIds: ['p1', 'p2', 'p1']),
        _refused(TasksIssue.reportDuplicatePhotos));
  });
}

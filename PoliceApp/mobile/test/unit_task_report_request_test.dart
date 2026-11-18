// Unit Tests: POST /tasks/:id/report body and response
// Backend SubmitReportDto (Web/backend/src/tasks/tasks.controller.ts:121-147): description 1..1000
// (required), completedAt?, location? 0..200, audioNoteUrl?, photoIds? ≤ 10 unique UUIDs from
// POST /files/upload (purpose task_report). Response (tasks.service.ts submitReport):
// {id, taskId, submittedAt, photos: FileView[]}.
// Run: flutter test test/unit_task_report_request_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/tasks/models/task_report_request.dart';
import 'package:police_app/shared/errors/app_failure.dart';

Matcher _failsWith(String code, [Map<String, Object> args = const {}]) => throwsA(
      isA<AppFailure>().having((f) => f.code, 'code', code).having((f) => f.args, 'args', args),
    );

void main() {
  test('UT-TREP-01: the body carries the trimmed texts and the photo ids in order', () {
    expect(
      buildTaskReportBody(description: ' Patrolled block 3 ', location: ' Gate A ', photoIds: ['f2', 'f1']),
      {'description': 'Patrolled block 3', 'location': 'Gate A', 'photoIds': ['f2', 'f1']},
    );
    // Empty optional fields are left out
    expect(buildTaskReportBody(description: 'Done', location: '  '), {'description': 'Done'});
  });

  test('UT-TREP-02: the description is required and at most 1000 characters', () {
    expect(maxTaskReportDescriptionLength, 1000);
    expect(taskReportDescriptionFailure('   ')?.code, AppFailure.taskReportDescriptionRequired);
    expect(taskReportDescriptionFailure('x' * 1001)?.code, AppFailure.taskReportDescriptionTooLong);
    expect(taskReportDescriptionFailure('x' * 1001)?.args, {'max': 1000});
    expect(taskReportDescriptionFailure(' ${'x' * 1000} '), isNull);
    expect(() => buildTaskReportBody(description: ''), _failsWith(AppFailure.taskReportDescriptionRequired));
  });

  test('UT-TREP-03: the location is at most 200 characters', () {
    expect(maxTaskReportLocationLength, 200);
    expect(taskReportLocationFailure('x' * 200), isNull);
    expect(taskReportLocationFailure('x' * 201)?.code, AppFailure.taskLocationNameTooLong);
    expect(
      () => buildTaskReportBody(description: 'Done', location: 'x' * 201),
      _failsWith(AppFailure.taskLocationNameTooLong, {'max': 200}),
    );
  });

  test('UT-TREP-04: at most 10 photos, each once', () {
    expect(maxTaskReportPhotos, 10);
    final ten = [for (var i = 0; i < 10; i++) 'f$i'];
    expect(buildTaskReportBody(description: 'Done', photoIds: ten)['photoIds'], ten);
    expect(
      () => buildTaskReportBody(description: 'Done', photoIds: [...ten, 'f10']),
      _failsWith(AppFailure.attachmentsTooMany, {'max': 10}),
    );
    expect(
      () => buildTaskReportBody(description: 'Done', photoIds: ['f1', 'f1']),
      _failsWith('duplicate_file_ids'),
    );
  });

  test('UT-TREP-05: the response is read with its photos; anything else is unreadable', () {
    final result = TaskReportResult.fromJson({
      'id': 'r-1',
      'taskId': 't-1',
      'submittedAt': '2026-09-14T03:00:00.000Z',
      'photos': [
        {'id': 'f1', 'url': '/api/v1/mms_core/files/f1', 'name': 'a.jpg', 'mimeType': 'image/jpeg', 'size': 120},
        {'name': 'no id'},
      ],
    });
    expect(result.id, 'r-1');
    expect(result.taskId, 't-1');
    expect(result.submittedAt, DateTime.utc(2026, 9, 14, 3));
    expect(result.photos.map((p) => p.id), ['f1']);

    expect(TaskReportResult.fromJson({'id': 'r-2', 'taskId': 't-1'}).photos, isEmpty);
    expect(TaskReportResult.fromJson({'id': 'r-2', 'taskId': 't-1'}).submittedAt, isNull);
    expect(() => TaskReportResult.fromJson(['r-1']), throwsFormatException);
    expect(() => TaskReportResult.fromJson({'taskId': 't-1'}), throwsFormatException);
  });
}

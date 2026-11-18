// Unit Tests: POST /tasks body built by the create-task screen
// Backend DTO (Web/backend/src/tasks/tasks.controller.ts:47-102), global ValidationPipe
// forbidNonWhitelisted (src/main.ts): title, description, type, priority (urgent|high|medium|low),
// deadline, unitId, locationName (1..500), locationLat, locationLng, assigneeMilitiaId (required).
// GET /tasks/:id returns locationName/locationLat/locationLng (tasks.service.ts:166-187).
// Run: flutter test test/unit_create_task_request_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/tasks/models/create_task_request.dart';
import 'package:police_app/shared/errors/app_failure.dart';

const _allowedKeys = {
  'title', 'description', 'type', 'priority', 'deadline', 'unitId',
  'locationName', 'locationLat', 'locationLng', 'assigneeMilitiaId', 'attachmentIds',
};

/// Refused locally with [code] (and [args]), never with a text
Matcher _failsWith(String code, [Map<String, Object> args = const {}]) => throwsA(
      isA<AppFailure>().having((f) => f.code, 'code', code).having((f) => f.args, 'args', args),
    );

void main() {
  test('UT-TASK-01: location goes in locationName/Lat/Lng, the description is left alone', () {
    final body = buildCreateTaskBody(
      title: ' Patrol ',
      description: ' Block 3 ',
      locationName: ' Phu Dinh market ',
      locationLat: 10.7291,
      locationLng: 106.6437,
      priority: 'medium',
      deadline: DateTime.utc(2026, 9, 20, 8),
      assigneeMilitiaId: 'mp-1',
    );

    expect(_allowedKeys.containsAll(body.keys), isTrue, reason: '${body.keys}');
    expect(body['title'], 'Patrol');
    expect(body['description'], 'Block 3');
    expect(body['locationName'], 'Phu Dinh market');
    expect(body['locationLat'], 10.7291);
    expect(body['locationLng'], 106.6437);
    expect(body['priority'], 'medium');
    expect(body['deadline'], '2026-09-20T08:00:00.000Z');
    expect(body['assigneeMilitiaId'], 'mp-1');
  });

  test('UT-TASK-02: empty optional fields are omitted', () {
    final body = buildCreateTaskBody(
      title: 'Patrol',
      description: '  ',
      locationName: '',
      priority: 'low',
      assigneeMilitiaId: 'mp-1',
    );
    expect(body, {'title': 'Patrol', 'priority': 'low', 'assigneeMilitiaId': 'mp-1'});
  });

  test('UT-TASK-03: priorities offered are exactly the backend set', () {
    expect(taskPriorities, ['low', 'medium', 'high', 'urgent']);
  });

  test('UT-TASK-04: values the backend would reject are refused with a failure code', () {
    Map<String, dynamic> build({String name = '', double? lat, double? lng}) => buildCreateTaskBody(
          title: 't',
          locationName: name,
          locationLat: lat,
          locationLng: lng,
          priority: 'low',
          assigneeMilitiaId: 'mp-1',
        );
    expect(() => build(name: 'x' * 501), _failsWith(AppFailure.taskLocationNameTooLong, {'max': 500}));
    expect(() => build(lat: 10.7), _failsWith(AppFailure.taskCoordinatesIncomplete));
    expect(() => build(lat: 91, lng: 106), _failsWith(AppFailure.taskLatitudeOutOfRange));
    expect(() => build(lat: 10, lng: 181), _failsWith(AppFailure.taskLongitudeOutOfRange));
    expect(build(name: 'x' * 500)['locationName'], hasLength(500));
  });

  test('UT-TASK-06: a priority outside the backend set is refused with a failure code', () {
    expect(
      () => buildCreateTaskBody(title: 't', priority: 'normal', assigneeMilitiaId: 'mp-1'),
      _failsWith(AppFailure.taskPriorityInvalid),
    );
  });

  test('UT-TASK-07: attachments are at most 10 distinct upload ids, left out when there are none', () {
    // CreateTaskDto.attachmentIds @ArrayMaxSize(10) @ArrayUnique (tasks.controller.ts TASK_ATTACHMENTS_PER_REQUEST)
    expect(maxTaskAttachments, 10);
    Map<String, dynamic> build(List<String> ids) =>
        buildCreateTaskBody(title: 't', priority: 'low', assigneeMilitiaId: 'mp-1', attachmentIds: ids);
    expect(build(const []).containsKey('attachmentIds'), isFalse);
    final ten = [for (var i = 0; i < 10; i++) 'f$i'];
    expect(build(ten)['attachmentIds'], ten);
    expect(() => build([...ten, 'f10']), _failsWith(AppFailure.attachmentsTooMany, {'max': 10}));
    expect(() => build(['f1', 'f1']), _failsWith('duplicate_file_ids'));
  });

  test('UT-TASK-05: taskLocationLabel reads the task location fields', () {
    expect(
      taskLocationLabel({'locationName': 'Phu Dinh market', 'locationLat': 10.729123, 'locationLng': 106.643789}),
      'Phu Dinh market (10.72912, 106.64379)',
    );
    expect(taskLocationLabel({'locationName': 'Phu Dinh market', 'locationLat': null, 'locationLng': null}),
        'Phu Dinh market');
    expect(taskLocationLabel({'locationName': null, 'locationLat': 10.5, 'locationLng': 106.25}),
        '10.50000, 106.25000');
    // Coordinates as numeric strings read the same as numbers
    expect(
      taskLocationLabel({'locationName': 'Phu Dinh market', 'locationLat': '10.729123', 'locationLng': '106.643789'}),
      'Phu Dinh market (10.72912, 106.64379)',
    );
    expect(taskLocationLabel({'locationLat': 'abc', 'locationLng': '106.6'}), isNull);
    expect(taskLocationLabel({'locationName': '  '}), isNull);
    expect(taskLocationLabel({}), isNull);
  });
}

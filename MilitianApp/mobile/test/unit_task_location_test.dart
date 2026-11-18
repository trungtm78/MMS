// Unit Tests: task location text
//   GET /tasks and GET /tasks/:id return locationName, locationLat, locationLng (Web/backend/src/tasks/task-sql.ts
//   taskRowSelect: location_lat::float8, so JSON numbers); NUMERIC values may still come as numeric strings, and both
//   shapes read the same. There is no `location` field.
// Run: flutter test test/unit_task_location_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/tasks/task_location.dart';

void main() {
  test('UT-TLOC-01: name with coordinates sent as JSON numbers', () {
    expect(
      taskLocationText({'locationName': '  Ben Thanh market ', 'locationLat': 10.772, 'locationLng': 106.698}),
      'Ben Thanh market (10.77200, 106.69800)',
    );
    expect(
      taskLocationText({'locationName': 'Headquarters', 'locationLat': 10, 'locationLng': -106.5}),
      'Headquarters (10.00000, -106.50000)',
    );
  });

  test('UT-TLOC-02: coordinates sent as numeric strings read the same', () {
    expect(
      taskLocationText({'locationName': 'Ben Thanh market', 'locationLat': '10.772', 'locationLng': ' 106.698 '}),
      'Ben Thanh market (10.77200, 106.69800)',
    );
    expect(taskLocationText({'locationName': null, 'locationLat': '10', 'locationLng': -106.5}), '10.00000, -106.50000');
  });

  test('UT-TLOC-03: name only when a coordinate is missing or not a number', () {
    expect(taskLocationText({'locationName': 'Ben Thanh market', 'locationLat': null, 'locationLng': null}),
        'Ben Thanh market');
    expect(taskLocationText({'locationName': 'Ben Thanh market', 'locationLat': 10.7}), 'Ben Thanh market');
    expect(taskLocationText({'locationName': 'Ben Thanh market', 'locationLat': 'abc', 'locationLng': '106.6'}),
        'Ben Thanh market');
    expect(taskLocationText({'locationName': 'Ben Thanh market', 'locationLat': true, 'locationLng': 106.6}),
        'Ben Thanh market');
  });

  test('UT-TLOC-04: coordinates only when there is no name', () {
    expect(taskLocationText({'locationName': null, 'locationLat': 10.772, 'locationLng': 106.698}),
        '10.77200, 106.69800');
    expect(taskLocationText({'locationName': '   ', 'locationLat': 10.772, 'locationLng': 106.698}),
        '10.77200, 106.69800');
  });

  test('UT-TLOC-05: null when there is nothing to show', () {
    expect(taskLocationText({}), isNull);
    expect(taskLocationText({'locationName': ' ', 'locationLat': null, 'locationLng': 106.6}), isNull);
    expect(taskLocationText({'locationName': 42}), isNull);
    // The old field never comes from the backend
    expect(taskLocationText({'location': 'Ward 3'}), isNull);
  });
}

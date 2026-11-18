// Unit Tests: numbers read from JSON. NUMERIC columns (training days, coordinates, KPI scores, amounts)
// arrive as JSON numbers or as numeric strings, depending on the backend version.
// Run: flutter test test/unit_json_number_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/shared/utils/json_number.dart';

void main() {
  test('UT-NUM-01: a JSON number and a numeric string read the same', () {
    expect(jsonNumber(8.5), 8.5);
    expect(jsonNumber(10), 10);
    expect(jsonNumber('8.50'), 8.5);
    expect(jsonNumber(' 15 '), 15);
    expect(jsonNumber('-1.25'), -1.25);
    expect(jsonNumber('106.643789'), 106.643789);
  });

  test('UT-NUM-02: anything else is not a number', () {
    for (final value in <Object?>[null, '', '  ', 'abc', '1,5', 'NaN', 'Infinity', true, [1], {'a': 1}]) {
      expect(jsonNumber(value), isNull, reason: '$value');
    }
    expect(jsonNumber(double.nan), isNull);
    expect(jsonNumber(double.infinity), isNull);
  });
}

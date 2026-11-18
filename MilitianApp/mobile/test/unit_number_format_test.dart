// Unit Tests: numbers from the backend and Vietnamese decimals
//   NUMERIC columns (training_records.total_days, task coordinates, KPI scores, amounts) arrive as JSON numbers;
//   older answers sent them as numeric strings, so both shapes are read. BIGINT counts may still be strings.
// Run: flutter test test/unit_number_format_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/utils/number_format.dart';

void main() {
  test('whole numbers have no decimal part', () {
    expect(formatDecimal(10), '10');
    expect(formatDecimal(12.0), '12');
    expect(formatDecimal(0), '0');
    expect(formatDecimal(-3.0), '-3');
  });

  test('fractions use a decimal comma without trailing zeros', () {
    expect(formatDecimal(0.5), '0,5');
    expect(formatDecimal(28.5), '28,5');
    expect(formatDecimal(1.25), '1,25');
    expect(formatDecimal(2.50), '2,5');
    expect(formatDecimal(1 / 3), '0,33');
    expect(formatDecimal(-2.25), '-2,25');
  });

  test('fractionDigits limits the precision', () {
    expect(formatDecimal(87.456, fractionDigits: 1), '87,5');
    expect(formatDecimal(87.04, fractionDigits: 1), '87');
  });

  test('UT-NUM-01: parseDecimal reads a JSON number and a numeric string alike', () {
    expect(parseDecimal(3), 3.0);
    expect(parseDecimal('3'), 3.0);
    expect(parseDecimal(2.5), 2.5);
    expect(parseDecimal('2.5'), 2.5);
    expect(parseDecimal('1.50'), 1.5);
    expect(parseDecimal(' 12 '), 12.0);
    expect(parseDecimal(-106.5), -106.5);
    expect(parseDecimal('-106.5'), -106.5);
  });

  test('UT-NUM-02: parseDecimal refuses anything else', () {
    expect(parseDecimal('abc'), isNull);
    expect(parseDecimal(''), isNull);
    expect(parseDecimal(null), isNull);
    expect(parseDecimal(true), isNull);
    expect(parseDecimal('NaN'), isNull);
    expect(parseDecimal(double.infinity), isNull);
  });

  test('UT-NUM-03: parseWholeNumber reads a count sent as an int, a whole double or a numeric string', () {
    expect(parseWholeNumber(18), 18);
    expect(parseWholeNumber('18'), 18);
    expect(parseWholeNumber(3.0), 3);
    expect(parseWholeNumber('3.0'), 3);
    expect(parseWholeNumber(' 7 '), 7);
    expect(parseWholeNumber(0), 0);
    // BIGINT counts beyond double precision stay exact when sent as text
    expect(parseWholeNumber('9007199254740993'), 9007199254740993);
  });

  test('UT-NUM-04: parseWholeNumber refuses fractions and non-numbers', () {
    for (final value in <Object?>[2.5, '2.5', 'abc', '', null, true, double.nan, double.infinity, <int>[]]) {
      expect(parseWholeNumber(value), isNull, reason: '$value');
    }
  });
}

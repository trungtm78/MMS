// Unit Tests: calendar days from DATE columns
// Backend: DATE columns are sent as the 'YYYY-MM-DD' text Postgres returns
// (Web/backend/src/database/pg-types.ts); they are days, not instants.
// Run: flutter test test/unit_calendar_date_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/shared/utils/calendar_date.dart';

void main() {
  test('UT-DATE-01: YYYY-MM-DD is that calendar day', () {
    expect(parseCalendarDate('2026-09-20'), DateTime(2026, 9, 20));
  });

  test('UT-DATE-02: a timestamp keeps the day it was written with, no timezone conversion', () {
    expect(parseCalendarDate('2026-09-20T17:00:00.000Z'), DateTime(2026, 9, 20));
    expect(parseCalendarDate('2026-09-20T23:30:00+07:00'), DateTime(2026, 9, 20));
  });

  test('UT-DATE-03: anything else is null', () {
    for (final v in [null, '', '20/09/2026', 20260920, '2026-13-01', '2026-02-30', 'abcd-ef-gh']) {
      expect(parseCalendarDate(v), isNull, reason: '$v');
    }
  });

  test('UT-DATE-04: formatting', () {
    expect(toCalendarDateString(DateTime(2026, 9, 5)), '2026-09-05');
    expect(formatCalendarDate('2026-09-05'), '05/09/2026');
    expect(formatCalendarDate(null), '');
    expect(formatCalendarRange('2026-09-05', '2026-09-07'), '05/09/2026 – 07/09/2026');
    expect(formatCalendarRange('2026-09-05', '2026-09-05'), '05/09/2026');
    expect(formatCalendarRange('2026-09-05', null), '05/09/2026');
    expect(formatCalendarRange(null, null), '');
  });

  test('UT-DATE-05: today in Vietnam (UTC+7) whatever the device timezone', () {
    expect(vietnamToday(DateTime.utc(2026, 9, 15, 20)), DateTime(2026, 9, 16));
    expect(vietnamToday(DateTime.utc(2026, 9, 15, 16, 59)), DateTime(2026, 9, 15));
  });
}

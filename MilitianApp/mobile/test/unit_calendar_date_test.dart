// Unit Tests: calendar dates (DATE columns arrive as plain 'YYYY-MM-DD',
// Web/backend/src/database/pg-types.ts) are read and shown without timezone shifts
// Run: flutter test test/unit_calendar_date_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/utils/calendar_date.dart';

void main() {
  group('parseCalendarDate', () {
    test('reads YYYY-MM-DD as a local calendar day', () {
      final d = parseCalendarDate('2026-09-20')!;
      expect(d, DateTime(2026, 9, 20));
      expect(d.isUtc, isFalse);
      expect(d.hour, 0);
    });

    test('takes the leading date of a timestamp without converting its timezone', () {
      expect(parseCalendarDate('2026-09-20T17:00:00.000Z'), DateTime(2026, 9, 20));
      expect(parseCalendarDate('2026-12-31T23:30:00+07:00'), DateTime(2026, 12, 31));
      expect(parseCalendarDate('2026-01-01 00:00:00'), DateTime(2026, 1, 1));
    });

    test('leap days', () {
      expect(parseCalendarDate('2028-02-29'), DateTime(2028, 2, 29));
      expect(parseCalendarDate('2026-02-29'), isNull);
    });

    test('anything else is null', () {
      for (final v in <Object?>[
        '2026-02-30',
        '2026-13-01',
        '2026-00-10',
        '2026-09-00',
        '20/09/2026',
        '2026-9-20',
        '2026-09-201',
        ' 2026-09-20',
        '',
        'abc',
        null,
        20260920,
        2026.0,
      ]) {
        expect(parseCalendarDate(v), isNull, reason: '$v');
      }
    });
  });

  test('toCalendarDateString writes YYYY-MM-DD and ignores the time of day', () {
    expect(toCalendarDateString(DateTime(2026, 9, 5, 23, 59)), '2026-09-05');
    expect(toCalendarDateString(DateTime(2026, 12, 31)), '2026-12-31');
    expect(toCalendarDateString(DateTime(987, 1, 2)), '0987-01-02');
  });

  test('formatCalendarDate shows dd/MM/yyyy, or empty text', () {
    expect(formatCalendarDate('2026-09-05'), '05/09/2026');
    expect(formatCalendarDate('2026-09-20T17:00:00.000Z'), '20/09/2026');
    expect(formatCalendarDate('2026-02-30'), '');
    expect(formatCalendarDate(null), '');
    expect(formatCalendarDate(42), '');
  });

  group('formatCalendarRange', () {
    test('two different days', () {
      expect(formatCalendarRange('2026-09-20', '2026-09-22'), '20/09/2026 – 22/09/2026');
    });

    test('a single day when both ends are equal or the end is missing', () {
      expect(formatCalendarRange('2026-09-20', '2026-09-20'), '20/09/2026');
      expect(formatCalendarRange('2026-09-20', '2026-09-20T17:00:00.000Z'), '20/09/2026');
      expect(formatCalendarRange('2026-09-20', null), '20/09/2026');
      expect(formatCalendarRange('2026-09-20', ''), '20/09/2026');
      expect(formatCalendarRange('2026-09-20', 'x'), '20/09/2026');
    });

    test('empty without a start day', () {
      expect(formatCalendarRange(null, '2026-09-22'), '');
      expect(formatCalendarRange('bad', '2026-09-22'), '');
      expect(formatCalendarRange(null, null), '');
    });
  });
}

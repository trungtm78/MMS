// Widget Tests: AttendanceCalendar — one month of GET /attendance?from=&to=&limit=31
//   work_date is a DATE column ('YYYY-MM-DD'); status present|checked_in|checked_out|absent|leave|holiday
// Run: flutter test test/widget_attendance_calendar_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/attendance/widgets/attendance_calendar.dart';
import 'package:police_app/shared/utils/calendar_date.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

const _present = Color(0xFFA7F3D0);
const _absent = Color(0xFFFECACA);
const _leave = Color(0xFFBFDBFE);
const _holiday = Color(0xFFE2E8F0);

String _day(DateTime month, int day) => toCalendarDateString(DateTime(month.year, month.month, day));

Color? _dayColor(WidgetTester tester, int day) {
  final cell = find.ancestor(of: find.text('$day'), matching: find.byType(Container)).first;
  return (tester.widget<Container>(cell).decoration as BoxDecoration?)?.color;
}

ResponseBody _month(List<Map<String, Object?>> rows) =>
    jsonBody(200, {'data': rows, 'total': rows.length, 'page': 1, 'limit': 31});

Future<FakeAdapter> _pump(
  WidgetTester tester,
  ResponseBody Function(RequestOptions) handler, {
  Future<void> Function(RequestOptions)? gate,
}) async {
  useTallSurface(tester);
  final adapter = FakeAdapter(handler, gate: gate);
  await tester.pumpWidget(
      scopedApp(fakeDio(adapter), const Scaffold(body: SingleChildScrollView(child: AttendanceCalendar()))));
  return adapter;
}

void main() {
  final now = DateTime.now();
  final current = DateTime(now.year, now.month);
  final next = DateTime(now.year, now.month + 1);
  final previous = DateTime(now.year, now.month - 1);

  testWidgets('WT-ATT-01: the month shows its title, weekdays and legend, with days coloured by status',
      (tester) async {
    final adapter = await _pump(
      tester,
      (_) => _month([
        {'workDate': _day(current, 3), 'status': 'present'},
        {'workDate': _day(current, 4), 'status': 'absent'},
        {'workDate': '${_day(current, 5)}T00:00:00.000Z', 'status': 'leave'},
        {'workDate': _day(current, 6), 'status': 'holiday'},
        {'workDate': _day(current, 7), 'status': 'checked_out'},
        {'workDate': 'not a date', 'status': 'present'},
        {'workDate': _day(current, 8)},
      ]),
    );
    await tester.pumpAndSettle();

    final last = DateTime(current.year, current.month + 1, 0);
    expect(adapter.requests.single.path, '/attendance');
    expect(adapter.requests.single.queryParameters,
        {'from': _day(current, 1), 'to': _day(current, last.day), 'limit': 31});
    expect(find.text(viL10n.attendanceCalendarMonth(current.month, current.year)), findsOneWidget);
    for (final label in [
      viL10n.attendanceCalendarWeekdayMon,
      viL10n.attendanceCalendarWeekdayTue,
      viL10n.attendanceCalendarWeekdayWed,
      viL10n.attendanceCalendarWeekdayThu,
      viL10n.attendanceCalendarWeekdayFri,
      viL10n.attendanceCalendarWeekdaySat,
      viL10n.attendanceCalendarWeekdaySun,
      viL10n.attendanceCalendarLegendPresent,
      viL10n.attendanceCalendarLegendAbsent,
      viL10n.attendanceCalendarLegendLeave,
      viL10n.attendanceCalendarLegendHoliday,
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(_dayColor(tester, 3), _present);
    expect(_dayColor(tester, 4), _absent);
    expect(_dayColor(tester, 5), _leave);
    expect(_dayColor(tester, 6), _holiday);
    expect(_dayColor(tester, 7), _present);
    expect(_dayColor(tester, 8), Colors.transparent);
  });

  testWidgets('WT-ATT-02: previous and next load their month; an answer for a month no longer shown is ignored',
      (tester) async {
    final gates = <String, Completer<void>>{};
    final adapter = await _pump(
      tester,
      (o) {
        final from = o.queryParameters['from'] as String;
        final month = parseCalendarDate(from)!;
        return _month([
          {'workDate': _day(month, 3), 'status': from == _day(current, 1) ? 'present' : 'absent'},
        ]);
      },
      gate: (o) => o.queryParameters['from'] == _day(next, 1)
          ? (gates['next'] = Completer<void>()).future
          : Future<void>.value(),
    );
    await tester.pumpAndSettle();
    expect(_dayColor(tester, 3), _present);

    await tester.tap(find.byTooltip(viL10n.attendanceCalendarNextMonth));
    await pumpUntil(tester, () => gates.containsKey('next'));
    expect(find.text(viL10n.attendanceCalendarMonth(next.month, next.year)), findsOneWidget);

    await tester.tap(find.byTooltip(viL10n.attendanceCalendarPreviousMonth));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.attendanceCalendarMonth(current.month, current.year)), findsOneWidget);
    expect(_dayColor(tester, 3), _present);

    // The next month's answer arrives after the user went back: it changes nothing
    gates['next']!.complete();
    await tester.pumpAndSettle();
    expect(find.text(viL10n.attendanceCalendarMonth(current.month, current.year)), findsOneWidget);
    expect(_dayColor(tester, 3), _present);

    await tester.tap(find.byTooltip(viL10n.attendanceCalendarPreviousMonth));
    await tester.pumpAndSettle();
    expect(adapter.requests.last.queryParameters['from'], _day(previous, 1));
    expect(find.text(viL10n.attendanceCalendarMonth(previous.month, previous.year)), findsOneWidget);
    expect(_dayColor(tester, 3), _absent);
  });

  testWidgets('WT-ATT-03: a month that fails to load, or answers without data, says why and loads again on retry',
      (tester) async {
    var calls = 0;
    await _pump(
      tester,
      (_) => switch (++calls) {
        1 => errorBody(500, 'boom'),
        2 => jsonBody(200, ['not', 'a', 'page']),
        _ => _month([{'workDate': _day(current, 3), 'status': 'absent'}]),
      },
    );
    await tester.pumpAndSettle();

    expect(find.text(viL10n.attendanceCalendarLoadError(viL10n.errorServer)), findsOneWidget);

    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.attendanceCalendarLoadError(viL10n.errorBadResponse)), findsOneWidget);

    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.textContaining(viL10n.attendanceCalendarLoadError('')), findsNothing);
    expect(_dayColor(tester, 3), _absent);
  });
}

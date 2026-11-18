/// Calendar days (DATE columns) travel as plain 'YYYY-MM-DD'
/// (Web/backend/src/database/pg-types.ts). They name a day, not an instant, so they are
/// read and written without any timezone conversion.
library;

final _leadingDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})(?=$|[T ])');

/// The day named by the leading YYYY-MM-DD of [value] as a local DateTime at midnight,
/// or null when [value] is not a string starting with a real calendar day.
DateTime? parseCalendarDate(Object? value) {
  if (value is! String) return null;
  final m = _leadingDate.firstMatch(value);
  if (m == null) return null;
  final year = int.parse(m.group(1)!);
  final month = int.parse(m.group(2)!);
  final day = int.parse(m.group(3)!);
  if (month < 1 || month > 12 || day < 1) return null;
  final date = DateTime(year, month, day);
  // DateTime rolls 2026-02-30 over to March; such a day does not exist
  return date.year == year && date.month == month && date.day == day ? date : null;
}

String _pad(int n, [int width = 2]) => n.toString().padLeft(width, '0');

/// 'YYYY-MM-DD' of the calendar day of [date]; the time of day is ignored.
String toCalendarDateString(DateTime date) =>
    '${_pad(date.year, 4)}-${_pad(date.month)}-${_pad(date.day)}';

/// 'dd/MM/yyyy', or '' when [value] is not a calendar day.
String formatCalendarDate(Object? value) {
  final d = parseCalendarDate(value);
  return d == null ? '' : '${_pad(d.day)}/${_pad(d.month)}/${_pad(d.year, 4)}';
}

/// 'dd/MM/yyyy – dd/MM/yyyy'; a single day when both ends are the same day or [to] is
/// missing; '' when [from] is missing.
String formatCalendarRange(Object? from, Object? to) {
  final start = parseCalendarDate(from);
  if (start == null) return '';
  final end = parseCalendarDate(to);
  final first = formatCalendarDate(from);
  if (end == null || end == start) return first;
  return '$first – ${formatCalendarDate(to)}';
}

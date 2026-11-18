/// Calendar days from DATE columns. The backend sends them as the 'YYYY-MM-DD' text
/// Postgres returns (Web/backend/src/database/pg-types.ts): a day, not an instant, so it is
/// never converted between timezones.
library;

final _leadingDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})');

String _two(int n) => n.toString().padLeft(2, '0');

/// The day written at the start of [value] ('YYYY-MM-DD', optionally followed by a time),
/// or null when there is none or it is not a real date.
DateTime? parseCalendarDate(Object? value) {
  if (value is! String) return null;
  final match = _leadingDate.firstMatch(value.trim());
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  final date = DateTime(year, month, day);
  return date.year == year && date.month == month && date.day == day ? date : null;
}

/// 'YYYY-MM-DD', the form the backend expects for date filters and DATE fields.
String toCalendarDateString(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${_two(date.month)}-${_two(date.day)}';

/// 'dd/MM/yyyy', or '' when [value] is not a calendar date.
String formatCalendarDate(Object? value) {
  final date = parseCalendarDate(value);
  return date == null ? '' : '${_two(date.day)}/${_two(date.month)}/${date.year}';
}

/// 'dd/MM/yyyy – dd/MM/yyyy', one date when both are the same or [to] is missing.
String formatCalendarRange(Object? from, Object? to) {
  final start = formatCalendarDate(from);
  if (start.isEmpty) return '';
  final end = formatCalendarDate(to);
  return end.isEmpty || end == start ? start : '$start – $end';
}

/// Today's calendar day in Vietnam (UTC+7, no daylight saving), whatever the device timezone.
DateTime vietnamToday([DateTime? now]) {
  final vn = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 7));
  return DateTime(vn.year, vn.month, vn.day);
}

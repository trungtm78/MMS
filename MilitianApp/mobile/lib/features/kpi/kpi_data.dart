import '../../shared/utils/number_format.dart';

int? _wholeNumber(Object? value) {
  final d = parseDecimal(value);
  if (d == null || d != d.roundToDouble()) return null;
  return d.toInt();
}

int? _month(Object? value) {
  final m = _wholeNumber(value);
  return m != null && m >= 1 && m <= 12 ? m : null;
}

/// GET /kpi/current → a bare object (Web/backend/src/kpi/kpi.service.ts:243-322). Every value
/// may be null: score is null when this month has not been evaluated; attendanceScore and
/// taskScore are not computed by the backend yet. Numbers may arrive as strings.
class KpiCurrent {
  final double? score;
  final double? change;
  final int? rank;
  final double? attendanceScore;
  final double? taskScore;
  final int? month;
  final int? year;

  const KpiCurrent({
    this.score,
    this.change,
    this.rank,
    this.attendanceScore,
    this.taskScore,
    this.month,
    this.year,
  });

  factory KpiCurrent.fromJson(Object? body) {
    if (body is! Map) return const KpiCurrent();
    return KpiCurrent(
      score: parseDecimal(body['score']),
      change: parseDecimal(body['change']),
      rank: _wholeNumber(body['rank']),
      attendanceScore: parseDecimal(body['attendanceScore']),
      taskScore: parseDecimal(body['taskScore']),
      month: _month(body['month']),
      year: _wholeNumber(body['year']),
    );
  }

  bool get isEvaluated => score != null;
}

/// One evaluated month of GET /kpi/history.
class KpiTrendPoint {
  final int month;
  final int year;
  final double score;

  const KpiTrendPoint({required this.month, required this.year, required this.score});

  String get label => 'T$month';
}

/// The last [months] evaluated months of GET /kpi/history (a bare array of
/// {month, year, score, recommendation}, kpi.service.ts:324-351), oldest first.
/// Rows without a valid month, year or score are skipped.
List<KpiTrendPoint> kpiTrend(Object? historyBody, {int months = 6}) {
  if (historyBody is! List || months <= 0) return const [];
  final points = <KpiTrendPoint>[];
  for (final row in historyBody) {
    if (row is! Map) continue;
    final month = _month(row['month']);
    final year = _wholeNumber(row['year']);
    final score = parseDecimal(row['score']);
    if (month == null || year == null || score == null) continue;
    points.add(KpiTrendPoint(month: month, year: year, score: score));
  }
  points.sort((a, b) => a.year != b.year ? a.year.compareTo(b.year) : a.month.compareTo(b.month));
  return points.length <= months ? points : points.sublist(points.length - months);
}

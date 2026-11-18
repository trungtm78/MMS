import '../../shared/utils/number_format.dart';

/// KPI_MAX_SCORE (Web/backend/src/kpi/kpi.service.ts): the top of the evaluation scale, used when an
/// answer does not carry a usable maxScore
const kpiDefaultMaxScore = 10.0;

int? _month(Object? value) {
  final m = parseWholeNumber(value);
  return m != null && m >= 1 && m <= 12 ? m : null;
}

/// A rank: 1 or more
int? _rank(Object? value) {
  final r = parseWholeNumber(value);
  return r != null && r >= 1 ? r : null;
}

/// A count: 0 or more
int? _count(Object? value) {
  final c = parseWholeNumber(value);
  return c != null && c >= 0 ? c : null;
}

double _scale(Object? value) {
  final max = parseDecimal(value);
  return max != null && max > 0 ? max : kpiDefaultMaxScore;
}

/// GET /kpi/current → a bare object (Web/backend/src/kpi/kpi.service.ts getCurrentScore). score is the
/// month's average on the scale 1..[maxScore], null when the month has no evaluation (rank,
/// rankInUnit, change and the component scores are then null too, unitSize and maxScore are kept).
/// [rank] is the standing among every member scored that month, [rankInUnit] among the [unitSize]
/// members of the caller's unit scored that month. Numbers may arrive as strings; a value that is not
/// a usable number is null, never a made-up one.
class KpiCurrent {
  final double? score;
  final double? change;
  final int? rank;
  final int? rankInUnit;
  final int? unitSize;
  final double? attendanceScore;
  final double? taskScore;
  final double maxScore;
  final int? month;
  final int? year;

  const KpiCurrent({
    this.score,
    this.change,
    this.rank,
    this.rankInUnit,
    this.unitSize,
    this.attendanceScore,
    this.taskScore,
    this.maxScore = kpiDefaultMaxScore,
    this.month,
    this.year,
  });

  factory KpiCurrent.fromJson(Object? body) {
    if (body is! Map) return const KpiCurrent();
    return KpiCurrent(
      score: parseDecimal(body['score']),
      change: parseDecimal(body['change']),
      rank: _rank(body['rank']),
      rankInUnit: _rank(body['rankInUnit']),
      unitSize: _count(body['unitSize']),
      attendanceScore: parseDecimal(body['attendanceScore']),
      taskScore: parseDecimal(body['taskScore']),
      maxScore: _scale(body['maxScore']),
      month: _month(body['month']),
      year: parseWholeNumber(body['year']),
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
}

/// The last [months] evaluated months of GET /kpi/history (a bare array of
/// {month, year, score, recommendation}, kpi.service.ts getHistory), oldest first.
/// Rows without a valid month, year or score are skipped.
List<KpiTrendPoint> kpiTrend(Object? historyBody, {int months = 6}) {
  if (historyBody is! List || months <= 0) return const [];
  final points = <KpiTrendPoint>[];
  for (final row in historyBody) {
    if (row is! Map) continue;
    final month = _month(row['month']);
    final year = parseWholeNumber(row['year']);
    final score = parseDecimal(row['score']);
    if (month == null || year == null || score == null) continue;
    points.add(KpiTrendPoint(month: month, year: year, score: score));
  }
  points.sort((a, b) => a.year != b.year ? a.year.compareTo(b.year) : a.month.compareTo(b.month));
  return points.length <= months ? points : points.sublist(points.length - months);
}

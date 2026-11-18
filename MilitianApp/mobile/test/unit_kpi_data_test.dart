// Unit Tests: KPI data from the backend, never fabricated
//   GET /kpi/current → bare {score, totalScore, change, rank, rankInUnit, unitSize, month, year, attendanceScore,
//     taskScore, maxScore} (Web/backend/src/kpi/kpi.service.ts getCurrentScore): score is the month's average on the
//     evaluation scale 1..maxScore (10); nullable when the month has no evaluation. NUMERIC values are JSON numbers;
//     numeric strings read the same.
//   GET /kpi/history → bare [{month, year, score, recommendation}], newest first (ORDER BY year DESC, month DESC).
// Run: flutter test test/unit_kpi_data_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/kpi/kpi_data.dart';

void main() {
  group('KpiCurrent.fromJson', () {
    test('UT-KPI-01: an evaluated month as the backend sends it', () {
      final kpi = KpiCurrent.fromJson({
        'score': 8.5,
        'totalScore': 8.5,
        'change': -0.25,
        'rank': 3,
        'rankInUnit': 2,
        'unitSize': 12,
        'month': 9,
        'year': 2026,
        'attendanceScore': 9,
        'taskScore': 8.25,
        'maxScore': 10,
      });

      expect(kpi.score, 8.5);
      expect(kpi.change, -0.25);
      expect(kpi.rank, 3);
      expect(kpi.rankInUnit, 2);
      expect(kpi.unitSize, 12);
      expect(kpi.attendanceScore, 9.0);
      expect(kpi.taskScore, 8.25);
      expect(kpi.maxScore, 10.0);
      expect(kpi.month, 9);
      expect(kpi.year, 2026);
      expect(kpi.isEvaluated, isTrue);
    });

    test('UT-KPI-02: numeric strings read the same', () {
      final kpi = KpiCurrent.fromJson({
        'score': '9.20',
        'change': '1.5',
        'rank': '2',
        'rankInUnit': '1',
        'unitSize': '5',
        'attendanceScore': '9.5',
        'taskScore': '8.75',
        'maxScore': '10',
        'month': '9',
        'year': '2026',
      });

      expect(kpi.score, 9.2);
      expect(kpi.change, 1.5);
      expect(kpi.rank, 2);
      expect(kpi.rankInUnit, 1);
      expect(kpi.unitSize, 5);
      expect(kpi.attendanceScore, 9.5);
      expect(kpi.taskScore, 8.75);
      expect(kpi.maxScore, 10.0);
      expect(kpi.month, 9);
      expect(kpi.year, 2026);
    });

    test('UT-KPI-03: a month without an evaluation keeps the unit size and the scale', () {
      final kpi = KpiCurrent.fromJson({
        'score': null,
        'totalScore': null,
        'change': null,
        'rank': null,
        'rankInUnit': null,
        'unitSize': 4,
        'month': 9,
        'year': 2026,
        'attendanceScore': null,
        'taskScore': null,
        'maxScore': 10,
      });

      expect(kpi.score, isNull);
      expect(kpi.change, isNull);
      expect(kpi.rank, isNull);
      expect(kpi.rankInUnit, isNull);
      expect(kpi.unitSize, 4);
      expect(kpi.maxScore, 10.0);
      expect(kpi.isEvaluated, isFalse);
      expect(kpi.month, 9);
    });

    test('UT-KPI-04: malformed values are null, never a made-up number; the scale falls back to 10', () {
      final kpi = KpiCurrent.fromJson({
        'score': 'abc',
        'rank': 2.7,
        'rankInUnit': 'first',
        'unitSize': -1,
        'change': true,
        'month': 13,
        'maxScore': 0,
      });
      expect(kpi.score, isNull);
      expect(kpi.rank, isNull);
      expect(kpi.rankInUnit, isNull);
      expect(kpi.unitSize, isNull);
      expect(kpi.change, isNull);
      expect(kpi.month, isNull);
      expect(kpi.maxScore, kpiDefaultMaxScore);
      expect(kpiDefaultMaxScore, 10.0);
      expect(KpiCurrent.fromJson({'rank': 3.0}).rank, 3);
      expect(KpiCurrent.fromJson({'maxScore': 'x'}).maxScore, 10.0);
      expect(KpiCurrent.fromJson({'maxScore': 5}).maxScore, 5.0);

      for (final body in <Object?>[
        null,
        [],
        'x',
        {'data': {'score': 9}},
      ]) {
        final empty = KpiCurrent.fromJson(body);
        expect(empty.score, isNull, reason: '$body');
        expect(empty.isEvaluated, isFalse, reason: '$body');
        expect(empty.year, isNull, reason: '$body');
        expect(empty.maxScore, 10.0, reason: '$body');
      }
    });
  });

  group('kpiTrend', () {
    // Newest first, as GET /kpi/history orders it
    final history = <Object?>[
      {'month': 13, 'year': 2026, 'score': 9},
      {'month': 9, 'year': 2026, 'score': '8.5', 'recommendation': 'reward'},
      {'month': 8, 'year': 2026, 'score': 8.7},
      {'month': 7, 'year': 2026, 'score': 8.6},
      {'month': 5, 'year': 2026, 'score': 8.4},
      {'month': 3, 'year': 2026, 'score': '8.2'},
      {'month': 2, 'year': 2026, 'score': null},
      {'month': 1, 'year': 2026, 'score': 8, 'recommendation': null},
      {'month': 12, 'year': 2025, 'score': 7.9},
      'junk',
    ];

    test('UT-KPI-05: the last 6 evaluated months, oldest first', () {
      final trend = kpiTrend(history);
      expect(trend.map((p) => p.month), [1, 3, 5, 7, 8, 9]);
      expect(trend.map((p) => p.score), [8, 8.2, 8.4, 8.6, 8.7, 8.5]);
      expect(trend.last.year, 2026);
    });

    test('UT-KPI-06: ordered across years whatever order the rows come in', () {
      final trend = kpiTrend(history.reversed.toList(), months: 7);
      expect((trend.first.month, trend.first.year), (12, 2025));
      expect(trend.map((p) => p.month), [12, 1, 3, 5, 7, 8, 9]);
    });

    test('UT-KPI-07: months limits the length', () {
      expect(kpiTrend(history, months: 3).map((p) => p.month), [7, 8, 9]);
      expect(kpiTrend(history, months: 0), isEmpty);
    });

    test('UT-KPI-08: no history', () {
      expect(kpiTrend([]), isEmpty);
      expect(kpiTrend(null), isEmpty);
      expect(kpiTrend({'data': history}), isEmpty);
    });
  });
}

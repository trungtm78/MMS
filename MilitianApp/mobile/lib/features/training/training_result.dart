import '../../shared/utils/number_format.dart';

/// Days of a training record: training_records.total_days is NUMERIC, so it may arrive as a
/// string. Anything that is not a number counts as 0.
double trainingDays(Object? value) => parseDecimal(value) ?? 0;

const _trainingTypeLabels = {
  'military': 'Quân sự',
  'political': 'Chính trị',
  'fire': 'PCCC',
  'first_aid': 'Sơ cứu',
  'other': 'Khác',
};

/// Vietnamese name of a training_type code; unknown codes are shown as they are.
String trainingTypeLabel(String code) => _trainingTypeLabels[code] ?? code;

/// Whether [record] belongs under the filter chip [filter] ('all' or a training_type code).
bool trainingMatchesFilter(Map<String, dynamic> record, String filter) =>
    filter == 'all' || record['trainingType'] == filter;

/// Outcome of a training record, from the Web backend's
/// `training_records.result` code (pass | fail | not_evaluated).
enum TrainingOutcome {
  passed('Đạt'),
  failed('Không đạt'),
  notEvaluated('Chưa đánh giá');

  const TrainingOutcome(this.label);

  /// Vietnamese display text.
  final String label;

  static TrainingOutcome fromRecord(Map<String, dynamic> record) {
    switch (record['result']) {
      case 'pass':
        return passed;
      case 'fail':
        return failed;
      case 'not_evaluated':
        return notEvaluated;
    }
    // Older payloads carried a boolean instead of the result code
    final legacy = record['passed'];
    if (legacy is bool) return legacy ? passed : failed;
    return notEvaluated;
  }
}

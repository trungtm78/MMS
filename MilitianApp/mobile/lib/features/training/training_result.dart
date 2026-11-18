import '../../shared/utils/number_format.dart';

/// Days of a training record: training_records.total_days is NUMERIC, so it may arrive as a
/// string. Anything that is not a number counts as 0.
double trainingDays(Object? value) => parseDecimal(value) ?? 0;

/// training_records.training_type codes (Web/backend/src/training/training.service.ts), in the
/// order the filter chips show them. Worded by trainingTypeText (training_texts.dart).
const trainingTypeCodes = ['military', 'political', 'fire', 'first_aid', 'other'];

/// The filter chip that shows every record
const trainingFilterAll = 'all';

/// Whether [record] belongs under the filter chip [filter] ([trainingFilterAll] or a training_type code).
bool trainingMatchesFilter(Map<String, dynamic> record, String filter) =>
    filter == trainingFilterAll || record['trainingType'] == filter;

/// Outcome of a training record, from the Web backend's `training_records.result` code
/// (pass | fail | not_evaluated). Worded by trainingOutcomeText (training_texts.dart).
enum TrainingOutcome {
  passed,
  failed,
  notEvaluated;

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

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

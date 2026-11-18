/// Training records as returned by GET /training
/// (Web/backend/src/training/training.service.ts listRecords, dto/create-training.dto.ts).
/// Codes only: the screen maps outcomes and types to texts (lib/l10n/app_vi.arb).
library;

import '../../shared/utils/json_number.dart';

/// Outcome of a record from `training_records.result` (pass | fail | not_evaluated).
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

int countPassed(Iterable<Map<String, dynamic>> records) =>
    records.where((r) => TrainingOutcome.fromRecord(r) == TrainingOutcome.passed).length;

/// training_type codes (create-training.dto.ts TRAINING_TYPES)
enum TrainingType {
  military('military'),
  political('political'),
  fire('fire'),
  firstAid('first_aid'),
  other('other');

  const TrainingType(this.code);

  /// The backend code
  final String code;

  /// The type of a code; null for a code the app does not know
  static TrainingType? fromCode(String? code) => values.where((t) => t.code == code).firstOrNull;
}

/// CreateTrainingDto / UpdateTrainingDto totalDays: @IsNumber @Min(0.5) @Max(365)
/// (Web/backend/src/training/dto/create-training.dto.ts:38-41, update-training.dto.ts:36-40)
const minTrainingDays = 0.5;
const maxTrainingDays = 365.0;

/// Why a typed number of days cannot be sent
enum TrainingDaysError { required, notANumber, tooManyDecimals, belowMinimum, aboveMaximum }

/// A typed number of days: the value to send, or why it is refused
typedef TrainingDaysEntry = ({double? days, TrainingDaysError? error});

final _daysPattern = RegExp(r'^(-?)(\d*)(?:\.(\d*))?$');

/// Reads the days typed in the form ('15', '1,5' or '1.5') the way the backend takes them: required,
/// [minTrainingDays]..[maxTrainingDays], and at most one decimal place, since training_records.total_days
/// is DECIMAL(5,1) (Web/backend/migrations/012_combined.sql:49) and would round anything finer.
TrainingDaysEntry readTrainingDays(String input) {
  final text = input.trim().replaceAll(',', '.');
  if (text.isEmpty) return (days: null, error: TrainingDaysError.required);
  final match = _daysPattern.firstMatch(text);
  final whole = match?.group(2) ?? '';
  final fraction = match?.group(3) ?? '';
  if (match == null || (whole.isEmpty && fraction.isEmpty)) {
    return (days: null, error: TrainingDaysError.notANumber);
  }
  if (fraction.replaceFirst(RegExp(r'0+$'), '').length > 1) {
    return (days: null, error: TrainingDaysError.tooManyDecimals);
  }
  final days = double.parse('${match.group(1)}${whole.isEmpty ? '0' : whole}.${fraction}0');
  if (days < minTrainingDays) return (days: null, error: TrainingDaysError.belowMinimum);
  if (days > maxTrainingDays) return (days: null, error: TrainingDaysError.aboveMaximum);
  return (days: days, error: null);
}

/// total_days is NUMERIC: a JSON number or a numeric string; anything unreadable counts as 0.
double trainingDays(Object? value) => jsonNumber(value)?.toDouble() ?? 0;

/// '15' or '2,5'
String formatTrainingDays(double days) =>
    days == days.roundToDouble() ? days.toInt().toString() : days.toString().replaceAll('.', ',');

/// The caller's unit from GET /users/me (unitScope; null for ward-wide accounts).
String? unitCodeFromProfile(Object? body) {
  if (body is! Map) return null;
  final scope = body['unitScope'];
  return scope is String && scope.trim().isNotEmpty ? scope.trim() : null;
}

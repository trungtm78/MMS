// Unit Tests: training records as returned by GET /training
// Backend: result ∈ pass | fail | not_evaluated, trainingType ∈ military | political | fire |
// first_aid | other (Web/backend/src/training/dto/create-training.dto.ts:13-21); total_days is
// NUMERIC (sent as a string); GET /users/me returns unitScope (Web/backend/src/users/users.service.ts:55-75).
// The model holds codes only; the screen maps them to texts (lib/l10n/app_vi.arb).
// Run: flutter test test/unit_training_record_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/training/training_record.dart';

void main() {
  test('UT-TRN-01: result codes map to outcomes', () {
    expect(TrainingOutcome.fromRecord({'result': 'pass'}), TrainingOutcome.passed);
    expect(TrainingOutcome.fromRecord({'result': 'fail'}), TrainingOutcome.failed);
    expect(TrainingOutcome.fromRecord({'result': 'not_evaluated'}), TrainingOutcome.notEvaluated);
    expect(TrainingOutcome.fromRecord({}), TrainingOutcome.notEvaluated);
    // Older payloads carried a boolean
    expect(TrainingOutcome.fromRecord({'passed': true}), TrainingOutcome.passed);
    expect(TrainingOutcome.fromRecord({'passed': false}), TrainingOutcome.failed);
  });

  test('UT-TRN-02: a display label is not a backend code', () {
    expect(TrainingOutcome.fromRecord({'result': 'Dat'}), TrainingOutcome.notEvaluated);
  });

  test('UT-TRN-03: countPassed counts only pass results', () {
    final records = [
      {'result': 'pass'},
      {'result': 'pass'},
      {'result': 'fail'},
      {'result': 'not_evaluated'},
    ];
    expect(countPassed(records), 2);
  });

  test('UT-TRN-04: training types are the backend codes; day counts', () {
    expect(TrainingType.values.map((t) => t.code), ['military', 'political', 'fire', 'first_aid', 'other']);
    expect(TrainingType.fromCode('military'), TrainingType.military);
    expect(TrainingType.fromCode('first_aid'), TrainingType.firstAid);
    expect(TrainingType.fromCode('other'), TrainingType.other);
    expect(TrainingType.fromCode('xyz'), isNull);
    expect(TrainingType.fromCode(null), isNull);
    expect(trainingDays('15.0'), 15);
    expect(trainingDays(2.5), 2.5);
    expect(trainingDays(null), 0);
    expect(trainingDays('abc'), 0);
    // NUMERIC total_days as a JSON number or a numeric string; never NaN
    expect(trainingDays(15), 15);
    expect(trainingDays('2.5'), 2.5);
    expect(trainingDays('NaN'), 0);
    expect(formatTrainingDays(15), '15');
    expect(formatTrainingDays(2.5), '2,5');
  });

  test('UT-TRN-06: a days entry follows CreateTrainingDto (0.5..365) and the DECIMAL(5,1) column', () {
    // create-training.dto.ts:38-41 @IsNumber @Min(0.5) @Max(365); migrations/012_combined.sql:49
    expect(minTrainingDays, 0.5);
    expect(maxTrainingDays, 365);

    TrainingDaysEntry ok(double days) => (days: days, error: null);
    TrainingDaysEntry refused(TrainingDaysError error) => (days: null, error: error);

    // Accepted: the edges, a comma or a dot, trailing zeros, surrounding spaces
    expect(readTrainingDays('0.5'), ok(0.5));
    expect(readTrainingDays('0,5'), ok(0.5));
    expect(readTrainingDays('.5'), ok(0.5));
    expect(readTrainingDays('1,5'), ok(1.5));
    expect(readTrainingDays('1.50'), ok(1.5));
    expect(readTrainingDays(' 15 '), ok(15));
    expect(readTrainingDays('365'), ok(365));
    expect(readTrainingDays('365.0'), ok(365));

    // Refused
    expect(readTrainingDays(''), refused(TrainingDaysError.required));
    expect(readTrainingDays('   '), refused(TrainingDaysError.required));
    expect(readTrainingDays('0'), refused(TrainingDaysError.belowMinimum));
    expect(readTrainingDays('0.4'), refused(TrainingDaysError.belowMinimum));
    expect(readTrainingDays('-1'), refused(TrainingDaysError.belowMinimum));
    expect(readTrainingDays('365.1'), refused(TrainingDaysError.aboveMaximum));
    expect(readTrainingDays('366'), refused(TrainingDaysError.aboveMaximum));
    expect(readTrainingDays('1.25'), refused(TrainingDaysError.tooManyDecimals));
    expect(readTrainingDays('0,05'), refused(TrainingDaysError.tooManyDecimals));
    for (final input in ['abc', '1..5', '1,5,0', '1e2', 'NaN', 'Infinity', '1 5', '-']) {
      expect(readTrainingDays(input), refused(TrainingDaysError.notANumber), reason: input);
    }
  });

  test('UT-TRN-05: unit code from GET /users/me', () {
    expect(unitCodeFromProfile({'id': 'u1', 'unitScope': 'KP1'}), 'KP1');
    expect(unitCodeFromProfile({'id': 'u1', 'unitScope': null}), isNull);
    expect(unitCodeFromProfile('not a map'), isNull);
  });
}

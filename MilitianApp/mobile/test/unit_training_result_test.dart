// Unit Tests: training records (GET /training rows, Web/backend/src/training/training.service.ts listRecords)
//   result: pass | fail | not_evaluated; trainingType: military | political | fire | first_aid | other;
//   totalDays NUMERIC: a JSON number now, a numeric string in older answers, both read the same.
//   Wording lives in lib/features/training/training_texts.dart.
// Run: flutter test test/unit_training_result_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/training/training_result.dart';
import 'package:militian_app/features/training/training_texts.dart';

import 'helpers/l10n.dart';

final _l = viL10n;

void main() {
  group('TrainingOutcome.fromRecord', () {
    test('maps backend result codes pass / fail / not_evaluated', () {
      expect(TrainingOutcome.fromRecord({'result': 'pass'}), TrainingOutcome.passed);
      expect(TrainingOutcome.fromRecord({'result': 'fail'}), TrainingOutcome.failed);
      expect(TrainingOutcome.fromRecord({'result': 'not_evaluated'}), TrainingOutcome.notEvaluated);
    });

    test('falls back to a legacy passed flag when result is absent', () {
      expect(TrainingOutcome.fromRecord({'passed': true}), TrainingOutcome.passed);
      expect(TrainingOutcome.fromRecord({'passed': false}), TrainingOutcome.failed);
    });

    test('missing or unrecognised result is not evaluated', () {
      expect(TrainingOutcome.fromRecord({}), TrainingOutcome.notEvaluated);
      expect(TrainingOutcome.fromRecord({'result': 'excellent'}), TrainingOutcome.notEvaluated);
      expect(TrainingOutcome.fromRecord({'result': 42}), TrainingOutcome.notEvaluated);
    });
  });

  test('UT-TRN-01: every outcome is worded from the resources', () {
    expect({for (final o in TrainingOutcome.values) o: trainingOutcomeText(_l, o)}, {
      TrainingOutcome.passed: _l.trainingOutcomePassed,
      TrainingOutcome.failed: _l.trainingOutcomeFailed,
      TrainingOutcome.notEvaluated: _l.trainingOutcomeNotEvaluated,
    });
  });

  group('trainingDays', () {
    test('UT-TRN-02: a JSON number and a numeric string read the same', () {
      expect(trainingDays(5), 5.0);
      expect(trainingDays('5'), 5.0);
      expect(trainingDays(2.5), 2.5);
      expect(trainingDays('2.5'), 2.5);
      expect(trainingDays('1.50'), 1.5);
    });

    test('anything else counts as 0', () {
      expect(trainingDays(null), 0);
      expect(trainingDays('abc'), 0);
      expect(trainingDays(true), 0);
    });
  });

  test('UT-TRN-03: the backend type codes, in filter order, each worded; unknown codes show as they are', () {
    expect(trainingTypeCodes, ['military', 'political', 'fire', 'first_aid', 'other']);
    expect([for (final c in trainingTypeCodes) trainingTypeText(_l, c)], [
      _l.trainingTypeMilitary,
      _l.trainingTypePolitical,
      _l.trainingTypeFire,
      _l.trainingTypeFirstAid,
      _l.trainingTypeOther,
    ]);
    expect(trainingTypeText(_l, 'diving'), 'diving');
  });

  test('trainingMatchesFilter compares the backend code', () {
    const firstAid = {'trainingType': 'first_aid'};
    expect(trainingMatchesFilter(firstAid, 'first_aid'), isTrue);
    expect(trainingMatchesFilter(firstAid, 'fire'), isFalse);
    expect(trainingMatchesFilter(firstAid, 'all'), isTrue);
    expect(trainingMatchesFilter({'trainingType': 'military'}, 'military'), isTrue);
    expect(trainingMatchesFilter({'trainingType': 'other'}, 'political'), isFalse);
    expect(trainingMatchesFilter({}, 'military'), isFalse);
  });
}

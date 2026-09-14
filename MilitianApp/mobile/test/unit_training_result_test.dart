// Unit Tests: training record outcome (backend result codes → label)
// Run: flutter test test/unit_training_result_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/training/training_result.dart';

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

  test('TrainingOutcome.label is the Vietnamese display text', () {
    expect(TrainingOutcome.passed.label, 'Đạt');
    expect(TrainingOutcome.failed.label, 'Không đạt');
    expect(TrainingOutcome.notEvaluated.label, 'Chưa đánh giá');
  });
}

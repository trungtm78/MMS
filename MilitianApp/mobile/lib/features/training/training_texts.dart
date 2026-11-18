// Training wording: the outcome of a record and the training_type codes of
// Web/backend/src/training/training.service.ts, through the ARB.

import '../../l10n/app_localizations.dart';
import 'training_result.dart';

String trainingOutcomeText(AppLocalizations l10n, TrainingOutcome outcome) => switch (outcome) {
      TrainingOutcome.passed => l10n.trainingOutcomePassed,
      TrainingOutcome.failed => l10n.trainingOutcomeFailed,
      TrainingOutcome.notEvaluated => l10n.trainingOutcomeNotEvaluated,
    };

/// Name of a training_type code; an unknown code is shown as it is.
String trainingTypeText(AppLocalizations l10n, String code) => switch (code) {
      'military' => l10n.trainingTypeMilitary,
      'political' => l10n.trainingTypePolitical,
      'fire' => l10n.trainingTypeFire,
      'first_aid' => l10n.trainingTypeFirstAid,
      'other' => l10n.trainingTypeOther,
      _ => code,
    };

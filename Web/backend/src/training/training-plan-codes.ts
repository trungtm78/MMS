// Coded values of training plans and sessions. Migration 026 enforces the plan statuses
// with a CHECK constraint (src/database/coded-values.spec.ts compares them).

// Labels of the training types (the codes of training_records.training_type)
export const TRAINING_TYPE_LABELS: Record<string, string> = {
  military: 'Quân sự',
  political: 'Chính trị',
  fire: 'Phòng cháy, chữa cháy',
  first_aid: 'Sơ cấp cứu',
  other: 'Khác',
};

export const TRAINING_PLAN_STATUSES = ['draft', 'active', 'completed'] as const;
export type TrainingPlanStatus = (typeof TRAINING_PLAN_STATUSES)[number];

// A plan moves forward only: the status each target requires the plan to be in
export const TRAINING_PLAN_TRANSITIONS = {
  active: 'draft',
  completed: 'active',
} as const satisfies Record<string, TrainingPlanStatus>;
export type TrainingPlanTarget = keyof typeof TRAINING_PLAN_TRANSITIONS;
export const TRAINING_PLAN_TARGETS = Object.keys(
  TRAINING_PLAN_TRANSITIONS,
) as TrainingPlanTarget[];

// A session's status follows from its dates and the Vietnamese calendar day
export const TRAINING_SESSION_STATUSES = [
  'upcoming',
  'ongoing',
  'completed',
] as const;
export type TrainingSessionStatus = (typeof TRAINING_SESSION_STATUSES)[number];

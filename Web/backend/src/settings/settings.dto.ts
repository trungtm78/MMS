import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EVALUATION_PERIODS,
  KPI_TARGET_RANGES,
  type EvaluationPeriod,
  type KpiTargets,
} from './kpi-targets.service';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPreferences,
} from './notification-preferences.service';

const R = KPI_TARGET_RANGES;

// PUT /settings/kpi-targets: the whole set of targets, every field required
export class KpiTargetsDto implements KpiTargets {
  @IsInt()
  @Min(R.minAttendanceDays.min)
  @Max(R.minAttendanceDays.max)
  minAttendanceDays!: number;

  @IsInt()
  @Min(R.minTasksCompleted.min)
  @Max(R.minTasksCompleted.max)
  minTasksCompleted!: number;

  @IsInt()
  @Min(R.maxOverdueTasks.min)
  @Max(R.maxOverdueTasks.max)
  maxOverdueTasks!: number;

  @IsInt()
  @Min(R.minTrainingHours.min)
  @Max(R.minTrainingHours.max)
  minTrainingHours!: number;

  @IsIn(EVALUATION_PERIODS)
  evaluationPeriod!: EvaluationPeriod;
}

export class NotificationChannelsDto implements Record<
  NotificationChannel,
  boolean
> {
  @IsBoolean() inApp!: boolean;
  @IsBoolean() push!: boolean;
  @IsBoolean() email!: boolean;
}

export class NotificationCategoriesDto implements Record<
  NotificationCategory,
  boolean
> {
  @IsBoolean() taskAssigned!: boolean;
  @IsBoolean() taskOverdue!: boolean;
  @IsBoolean() attendanceReminder!: boolean;
  @IsBoolean() leaveApproval!: boolean;
  @IsBoolean() systemAnnouncements!: boolean;
  @IsBoolean() sosAlerts!: boolean;
}

// PUT /settings/notifications: every channel and category, so a request never leaves a
// preference to chance
export class NotificationPreferencesDto implements NotificationPreferences {
  @IsDefined()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  channels!: NotificationChannelsDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => NotificationCategoriesDto)
  categories!: NotificationCategoriesDto;
}

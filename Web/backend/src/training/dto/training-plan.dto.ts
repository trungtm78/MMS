import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../common/validation/is-date-only';
import {
  TRAINING_PLAN_STATUSES,
  TRAINING_PLAN_TARGETS,
  type TrainingPlanStatus,
  type TrainingPlanTarget,
} from '../training-plan-codes';
import { TRAINING_TYPES } from './create-training.dto';

export type TrainingType = (typeof TRAINING_TYPES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// A filter left blank in the web form arrives as an empty query parameter
const blankAsAbsent = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;
// A four-digit query year becomes a number; anything else is left for @IsInt to refuse
const queryYear = ({ value }: { value: unknown }) => {
  if (value === '') return undefined;
  return typeof value === 'string' && /^\d{4}$/.test(value)
    ? Number(value)
    : value;
};

// Whole or half days, as training_records.total_days counts them
const DAYS = { maxDecimalPlaces: 1, allowNaN: false, allowInfinity: false };

// ── Kế hoạch huấn luyện ─────────────────────────────────────────────────────────

// POST /training/plans { year, type, requiredDays, title?, unitCode? }
export class CreateTrainingPlanDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  // A training type code (military, political, fire, first_aid, other)
  @IsIn(TRAINING_TYPES)
  type!: TrainingType;

  @IsNumber(DAYS)
  @Min(0.5)
  @Max(365)
  requiredDays!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  title?: string;

  // Omitted: the caller's unit, or the whole ward for ward-level roles
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unitCode?: string;
}

// GET /training/plans?year=&status=&unitCode=
export class TrainingPlanQueryDto {
  @Transform(queryYear)
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsIn(TRAINING_PLAN_STATUSES)
  status?: TrainingPlanStatus;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitCode?: string;
}

// PATCH /training/plans/:id/status { status: 'active' | 'completed' }
export class UpdateTrainingPlanStatusDto {
  @IsIn(TRAINING_PLAN_TARGETS)
  status!: TrainingPlanTarget;
}

// ── Đợt huấn luyện ──────────────────────────────────────────────────────────────

// POST /training/sessions
export class CreateTrainingSessionDto {
  @IsUUID('all')
  planId!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsDateOnly()
  startDate!: string;

  @IsDateOnly()
  endDate!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;

  @IsNumber(DAYS)
  @Min(0.5)
  @Max(366)
  daysCount!: number;
}

// GET /training/sessions?planId=&year=&unitCode=
export class TrainingSessionQueryDto {
  @Transform(blankAsAbsent)
  @IsOptional()
  @IsUUID('all')
  planId?: string;

  @Transform(queryYear)
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitCode?: string;
}

// ── Điểm danh ───────────────────────────────────────────────────────────────────

export class AttendanceEntryDto {
  // militia_profiles.id, as GET /training/sessions/:id/members lists it
  @IsUUID('all')
  memberId!: string;

  @IsBoolean()
  attended!: boolean;
}

// POST /training/sessions/:id/attendance { attendance: [{ memberId, attended }] }
export class SessionAttendanceDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ArrayUnique((entry: AttendanceEntryDto) => entry?.memberId)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  attendance!: AttendanceEntryDto[];
}

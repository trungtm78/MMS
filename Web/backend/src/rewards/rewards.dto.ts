import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsDateOnly } from '../common/validation/is-date-only';
import {
  APPEAL_OUTCOMES,
  DISCIPLINE_FORMS,
  DISCIPLINE_STATUSES,
  REWARD_AUTHORITIES,
  REWARD_BASES,
  REWARD_FORMS,
  type AppealOutcome,
  type DisciplineForm,
  type DisciplineStatus,
  type RewardAuthority,
  type RewardBasis,
  type RewardForm,
} from './reward-codes';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// A filter left blank in the web form arrives as an empty query parameter
const blankAsAbsent = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

// ── Khen thưởng ─────────────────────────────────────────────────────────────────

// POST /rewards. The member is identified by id: a name can match several members.
export class CreateRewardDto {
  @IsUUID('all')
  militiaId!: string;

  @IsIn(REWARD_FORMS)
  rewardType!: RewardForm;

  @IsIn(REWARD_AUTHORITIES)
  issuingAuthority!: RewardAuthority;

  @IsOptional()
  @IsIn(REWARD_BASES)
  basis?: RewardBasis;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  criteria?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  decisionNumber?: string;

  @IsDateOnly()
  issuedDate!: string;
}

// GET /rewards?from=&to=&rewardType=&militiaId=&unitCode=
export class RewardQueryDto {
  @Transform(blankAsAbsent)
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsIn(REWARD_FORMS)
  rewardType?: RewardForm;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsUUID('all')
  militiaId?: string;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitCode?: string;
}

// ── Kỷ luật ─────────────────────────────────────────────────────────────────────

// POST /discipline
export class CreateDisciplineDto {
  @IsUUID('all')
  militiaId!: string;

  @IsIn(DISCIPLINE_FORMS)
  disciplineType!: DisciplineForm;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  violation!: string;

  @IsOptional()
  @IsDateOnly()
  violationDate?: string;

  @IsDateOnly()
  decisionDate!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  decisionNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  issuedBy?: string;
}

// GET /discipline?from=&to=&disciplineType=&status=&militiaId=&unitCode=
export class DisciplineQueryDto {
  @Transform(blankAsAbsent)
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsDateOnly()
  to?: string;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsIn(DISCIPLINE_FORMS)
  disciplineType?: DisciplineForm;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsIn(DISCIPLINE_STATUSES)
  status?: DisciplineStatus;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsUUID('all')
  militiaId?: string;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitCode?: string;
}

// PATCH /discipline/:id/appeal — the grounds of the complaint are required
export class FileAppealDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  // The day the complaint was received; today in Vietnam when omitted
  @IsOptional()
  @IsDateOnly()
  filedDate?: string;
}

// PATCH /discipline/:id/appeal/decision
export class DecideAppealDto {
  @IsIn(APPEAL_OUTCOMES)
  outcome!: AppealOutcome;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  resolution!: string;

  // The day the appeal was decided; today in Vietnam when omitted
  @IsOptional()
  @IsDateOnly()
  decidedDate?: string;
}

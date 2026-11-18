import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

// Mirrors the CHECK constraints on exemptions (migration 019)
export const EXEMPTION_TYPES = ['exemption', 'deferral'] as const;
export const EXEMPTION_STATUSES = ['active', 'expired', 'revoked'] as const;
// A decision can only leave "active"; it is never re-activated
export const REVIEW_STATUSES = ['expired', 'revoked'] as const;

export type ExemptionType = (typeof EXEMPTION_TYPES)[number];
export type ExemptionStatus = (typeof EXEMPTION_STATUSES)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// strict ISO 8601 rejects impossible calendar dates such as 2027-02-30
function IsDateOnly(): PropertyDecorator {
  return (target, key) => {
    Matches(DATE_ONLY, { message: `${String(key)} must be a YYYY-MM-DD date` })(
      target,
      key,
    );
    IsISO8601({ strict: true })(target, key);
  };
}

export class CreateExemptionDto {
  @IsUUID('all')
  militiaId!: string;

  @IsIn(EXEMPTION_TYPES)
  type!: ExemptionType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  legalBasis!: string;

  @IsDateOnly()
  effectiveDate!: string;

  @IsOptional()
  @IsDateOnly()
  expiryDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  documents?: string[];
}

export class ReviewExemptionDto {
  @IsIn(REVIEW_STATUSES)
  status!: ReviewStatus;
}

export class ExemptionQueryDto {
  @IsOptional()
  @IsIn(EXEMPTION_STATUSES)
  status?: ExemptionStatus;

  @IsOptional()
  @IsUUID('all')
  militiaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitCode?: string;
}

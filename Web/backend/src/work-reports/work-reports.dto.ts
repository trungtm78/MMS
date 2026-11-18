import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Allowed by the work_reports.report_type CHECK constraint (migration 010)
export const WORK_REPORT_TYPES = ['daily', 'incident', 'monthly'] as const;
export type WorkReportType = (typeof WORK_REPORT_TYPES)[number];

export const REVIEW_DECISIONS = ['approved', 'rejected'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// POST /work-reports
export class CreateWorkReportBodyDto {
  @IsIn(WORK_REPORT_TYPES)
  reportType!: WorkReportType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  period?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  // Ids from POST /files/upload, uploaded by the author and not attached elsewhere, in the
  // order they are shown (work_report_attachments allows positions 0-9)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

// PATCH /work-reports/:id/review
export class ReviewWorkReportBodyDto {
  @IsIn(REVIEW_DECISIONS)
  reviewStatus!: ReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /work-reports?type=&userId=&reviewStatus=&from=&to=&page=&limit=
export class WorkReportQueryDto {
  @IsOptional()
  @IsIn(WORK_REPORT_TYPES)
  type?: WorkReportType;

  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @IsOptional()
  @IsIn(REVIEW_STATUSES)
  reviewStatus?: ReviewStatus;

  // Vietnamese calendar days, both inclusive
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

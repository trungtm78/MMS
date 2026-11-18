import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateOnly } from '../common/validation/is-date-only';
import {
  CUSTOM_REPORT_DATASETS,
  CUSTOM_REPORT_GROUPINGS,
  type CustomReportDataset,
  type CustomReportGrouping,
} from './custom-report.definitions';
import { CUSTOM_REPORT_MAX_ROWS } from './custom-reports.service';

// A blank filter reads as absent, as the query pipes do
const blankAsAbsent = () =>
  Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  );

// GET /reports/custom and /reports/custom/export
export class CustomReportQueryDto {
  @IsIn(CUSTOM_REPORT_DATASETS, { message: 'invalid_dataset' })
  dataset!: CustomReportDataset;

  @blankAsAbsent()
  @IsOptional()
  @IsDateOnly({ message: 'invalid_date' })
  from?: string;

  @blankAsAbsent()
  @IsOptional()
  @IsDateOnly({ message: 'invalid_date' })
  to?: string;

  @blankAsAbsent()
  @IsOptional()
  @IsIn(CUSTOM_REPORT_GROUPINGS, { message: 'invalid_group_by' })
  groupBy?: CustomReportGrouping;

  // Which values a dataset accepts is checked against its definition
  @blankAsAbsent()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]{1,40}$/, { message: 'invalid_status' })
  status?: string;

  @blankAsAbsent()
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'invalid_unit_code' })
  unitCode?: string;

  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === undefined ? undefined : Number(value),
  )
  @IsOptional()
  @IsInt({ message: 'invalid_limit' })
  @Min(1, { message: 'invalid_limit' })
  @Max(CUSTOM_REPORT_MAX_ROWS, { message: 'invalid_limit' })
  limit?: number;
}

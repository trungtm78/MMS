import {
  IsUUID,
  IsNotEmpty,
  IsIn,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

export const TRAINING_TYPES = [
  'military',
  'political',
  'fire',
  'first_aid',
  'other',
] as const;

export const TRAINING_RESULTS = ['pass', 'fail', 'not_evaluated'] as const;

export class CreateTrainingDto {
  @IsUUID()
  @IsNotEmpty()
  militiaId: string;

  @IsString()
  @IsIn(TRAINING_TYPES)
  trainingType: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsNumber()
  @Min(0.5)
  @Max(365)
  totalDays: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  instructor?: string;

  @IsOptional()
  @IsString()
  @IsIn(TRAINING_RESULTS)
  result?: string;

  @IsOptional()
  @IsString()
  certificateNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

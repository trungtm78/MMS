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

export class CreateTrainingDto {
  @IsUUID()
  @IsNotEmpty()
  militiaId: string;

  @IsString()
  @IsIn(['military', 'political', 'fire', 'first_aid', 'other'])
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
  @IsIn(['pass', 'fail', 'not_evaluated'])
  result?: string;

  @IsOptional()
  @IsString()
  certificateNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

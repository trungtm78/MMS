import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TRAINING_RESULTS, TRAINING_TYPES } from './create-training.dto';

// Present only when sent; null is refused because the column cannot be empty
const IfSent = () => ValidateIf((_dto, value) => value !== undefined);

// PATCH /training/:id — the fields of CreateTrainingDto, each optional, validated the same way
export class UpdateTrainingDto {
  @IfSent()
  @IsUUID()
  militiaId?: string;

  @IfSent()
  @IsString()
  @IsIn(TRAINING_TYPES)
  trainingType?: string;

  @IfSent()
  @IsDateString()
  fromDate?: string;

  @IfSent()
  @IsDateString()
  toDate?: string;

  @IfSent()
  @IsNumber()
  @Min(0.5)
  @Max(365)
  totalDays?: number;

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

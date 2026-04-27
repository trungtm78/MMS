import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DataCorrectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  field: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  requestedValue: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

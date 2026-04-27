import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsIn,
  IsUUID,
  Matches,
} from 'class-validator';

export class CreateLeaveDto {
  @IsUUID()
  @IsNotEmpty()
  leaveTypeId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from_date must be YYYY-MM-DD' })
  fromDate: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to_date must be YYYY-MM-DD' })
  toDate: string;

  @IsBoolean()
  @IsOptional()
  isHalfDay?: boolean;

  @IsString()
  @IsIn(['morning', 'afternoon'])
  @IsOptional()
  halfDayPeriod?: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsUUID()
  @IsOptional()
  replacementId?: string;
}

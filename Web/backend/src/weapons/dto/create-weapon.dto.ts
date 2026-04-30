import { IsString, IsNotEmpty, IsOptional, IsIn, IsDateString, Length } from 'class-validator';

export class CreateWeaponDto {
  @IsString() @IsNotEmpty() @Length(1, 100) serialNumber: string;
  @IsString() @IsNotEmpty() @Length(1, 100) type: string;
  @IsDateString() acquiredAt: string;
  @IsIn(['good', 'damaged', 'maintenance']) condition: string;
  @IsString() @IsNotEmpty() @Length(1, 200) storageLocation: string;
  @IsOptional() @IsString() responsiblePersonId?: string;
}

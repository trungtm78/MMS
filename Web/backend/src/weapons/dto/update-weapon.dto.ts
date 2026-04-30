import { IsString, IsOptional, IsIn, IsDateString, Length } from 'class-validator';

export class UpdateWeaponDto {
  @IsOptional() @IsString() @Length(1, 100) serialNumber?: string;
  @IsOptional() @IsString() @Length(1, 100) type?: string;
  @IsOptional() @IsDateString() acquiredAt?: string;
  @IsOptional() @IsIn(['good', 'damaged', 'maintenance']) condition?: string;
  @IsOptional() @IsString() @Length(1, 200) storageLocation?: string;
  @IsOptional() @IsString() responsiblePersonId?: string;
  @IsOptional() @IsIn(['active', 'retired', 'maintenance']) status?: string;
}

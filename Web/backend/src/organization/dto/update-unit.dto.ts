import { IsString, IsOptional, IsUUID, Length, IsNumber } from 'class-validator'

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string

  @IsOptional()
  @IsUUID()
  commanderId?: string

  @IsOptional()
  @IsNumber()
  capacity?: number

  @IsOptional()
  @IsString()
  wardId?: string

  @IsOptional()
  @IsUUID()
  parentId?: string
}

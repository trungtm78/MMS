import { IsString, IsOptional, IsBoolean, Length } from 'class-validator'

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

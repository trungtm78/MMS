import { IsString, IsNotEmpty, IsOptional, IsIn, IsUUID, Length, IsNumber } from 'class-validator'

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  name: string

  @IsString()
  @IsNotEmpty()
  @IsIn(['tieu_doi', 'trung_doi', 'dai_doi'])
  type: 'tieu_doi' | 'trung_doi' | 'dai_doi'

  @IsOptional()
  @IsUUID()
  parentId?: string

  @IsOptional()
  @IsUUID()
  commanderId?: string

  @IsOptional()
  @IsNumber()
  capacity?: number

  @IsOptional()
  @IsString()
  wardId?: string
}

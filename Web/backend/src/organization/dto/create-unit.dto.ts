import { IsString, IsOptional, IsNumber, IsUUID } from 'class-validator'

export class CreateUnitDto {
  @IsString()
  type: 'tieu_doi' | 'trung_doi' | 'dai_doi'

  @IsString()
  name: string

  @IsOptional()
  @IsUUID()
  commanderId?: string

  @IsOptional()
  @IsUUID()
  parentId?: string

  @IsNumber()
  capacity: number
}

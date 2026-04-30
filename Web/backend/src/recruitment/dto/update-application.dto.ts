import { IsOptional, IsString, IsIn, Length } from 'class-validator';

export class UpdateApplicationDto {
  @IsOptional() @IsIn(['new', 'reviewing', 'approved', 'rejected'])
  status?: 'new' | 'reviewing' | 'approved' | 'rejected';

  @IsOptional() @IsString() @Length(0, 2000)
  reviewerNotes?: string;
}

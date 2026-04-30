import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReturnAllocationDto {
  @IsDateString() returnedAt: string;
  @IsOptional() @IsString() returnNotes?: string;
}

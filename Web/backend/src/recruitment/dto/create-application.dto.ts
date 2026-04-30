import {
  IsString, IsNotEmpty, IsOptional, IsInt, Min, Max,
  Length, IsEmail, Matches,
} from 'class-validator';

export class CreateApplicationDto {
  @IsString() @IsNotEmpty() @Length(2, 100)
  name: string;

  @IsOptional() @IsInt() @Min(16) @Max(65)
  age?: number;

  @IsOptional() @IsString() @Length(0, 500)
  address?: string;

  @IsOptional() @IsString() @Matches(/^[0-9+\-\s()]{7,20}$/)
  phone?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @Length(0, 20)
  idNumber?: string;

  @IsOptional() @IsString() @Length(0, 100)
  district?: string;
}

import { IsUUID, IsNotEmpty, IsString, IsOptional, IsDateString, Length } from 'class-validator';

export class CreateAllocationDto {
  @IsUUID() weaponId: string;
  @IsUUID() recipientId: string;       // maps to entity field recipientId
  @IsDateString() issuedAt: string;   // maps to entity field issuedAt
  @IsString() @IsNotEmpty() @Length(1, 500) purpose: string;  // REQUIRED in entity
  @IsOptional() @IsDateString() returnedAt?: string;
}

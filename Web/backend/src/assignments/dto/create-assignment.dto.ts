import { IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID()
  caUserId: string;

  @IsUUID()
  dqtvUserId: string;
}

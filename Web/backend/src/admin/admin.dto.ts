import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ROLE_CODES, type RoleCode } from '../common/constants/roles';

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// POST /admin/users — the password is generated server-side and returned once
export class CreateUserBodyDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,50}$/, {
    message:
      'username must be 3-50 letters, digits, dots, underscores or hyphens',
  })
  username!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+() .-]{6,20}$/, { message: 'phone must be a phone number' })
  phone?: string;

  @IsIn(ROLE_CODES)
  role!: RoleCode;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitCode?: string;
}

// PATCH /admin/users/:id/status
export class UpdateUserStatusDto {
  @IsIn(USER_STATUSES)
  status!: UserStatusValue;
}

// PATCH /admin/users/:id/role
export class UpdateUserRoleDto {
  @IsIn(ROLE_CODES)
  role!: RoleCode;
}

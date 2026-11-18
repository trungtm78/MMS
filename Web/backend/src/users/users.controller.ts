// US-SS-08: UsersController — search users + units + self-service profile
import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsByteLength,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  USER_SEARCH_MAX_LENGTH,
  USER_SEARCH_MAX_LIMIT,
  USER_SEARCH_MIN_LENGTH,
  UsersService,
} from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SearchQueryDto } from '../common/dto/search-query.dto';
import type { JwtPayload } from '../auth/auth.service';

// GET /users/search?q=&limit= — q is required: 2..100 characters once trimmed
export class UserSearchQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(USER_SEARCH_MIN_LENGTH)
  @MaxLength(USER_SEARCH_MAX_LENGTH)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USER_SEARCH_MAX_LIMIT)
  limit?: number;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

// bcrypt reads only the first 72 bytes of a password: a longer one would quietly equal
// every password sharing those bytes, so the limit is in bytes (Vietnamese letters take
// up to three). The current password is only bounded, so older long passwords still work.
export const PASSWORD_MAX_BYTES = 72;
export const CURRENT_PASSWORD_MAX_LENGTH = 1024;

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CURRENT_PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @IsByteLength(1, PASSWORD_MAX_BYTES)
  newPassword: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /users/me — fetch current user profile
  @Get('me')
  async getMe(@Request() req: { user: JwtPayload }) {
    return this.usersService.getProfile(req.user.sub);
  }

  // PATCH /users/me — update own profile (fullName, email, phone)
  @Patch('me')
  async updateMe(
    @Request() req: { user: JwtPayload },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.sub, dto);
  }

  // POST /users/me/change-password
  @Post('me/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Request() req: { user: JwtPayload },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(
      req.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // GET /users/search?q=&limit= — only people the caller may reach (ContactPolicy)
  @Get('search')
  async searchUsers(
    @Request() req: { user: JwtPayload },
    @Query() query: UserSearchQueryDto,
  ) {
    return this.usersService.searchUsers(req.user, query.q, query.limit ?? 20);
  }

  // GET /users/profile — alias of /users/me for mobile apps (A5)
  @Get('profile')
  async getProfile(@Request() req: { user: JwtPayload }) {
    return this.usersService.getProfile(req.user.sub);
  }

  // GET /users/police-profile — CA officer specific fields (A5)
  @Get('police-profile')
  async getPoliceProfile(@Request() req: { user: JwtPayload }) {
    return this.usersService.getPoliceProfile(req.user.sub);
  }
}

// Separate controller for units search (used by UserForm SmartSelect)
import { Controller as Ctrl2 } from '@nestjs/common';

// Note: units controller lives here for co-location with users module
// Route: GET /units/search?q=&limit=
@Ctrl2('units')
@UseGuards(JwtAuthGuard)
export class UnitsController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async searchUnits(@Query() query: SearchQueryDto) {
    return this.usersService.searchUnits(query.q ?? '', query.limit ?? 20);
  }
}

// US-SS-08: UsersController — search users + units + self-service profile
import { Controller, Get, Patch, Post, Body, Query, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { IsOptional, IsString, IsEmail, MaxLength, IsNotEmpty } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SearchQueryDto } from '../common/dto/search-query.dto';
import type { JwtPayload } from '../auth/auth.service';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
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
  async updateMe(@Request() req: { user: JwtPayload }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, dto);
  }

  // POST /users/me/change-password
  @Post('me/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Request() req: { user: JwtPayload }, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(req.user.sub, dto.currentPassword, dto.newPassword);
  }

  // GET /users/search?q=&limit=
  @Get('search')
  async searchUsers(@Query() query: SearchQueryDto) {
    return this.usersService.searchUsers(query.q ?? '', query.limit ?? 20);
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

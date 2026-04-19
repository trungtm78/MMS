// US-SS-08: UsersController — search users + units + self-service profile
import { Controller, Get, Patch, Body, Query, UseGuards, Request } from '@nestjs/common';
import { IsOptional, IsString, IsEmail, MaxLength } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SearchQueryDto } from '../common/dto/search-query.dto';
import type { JwtPayload } from '../auth/auth.service';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) fullName?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
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

  // GET /users/search?q=&limit=
  @Get('search')
  async searchUsers(@Query() query: SearchQueryDto) {
    return this.usersService.searchUsers(query.q ?? '', query.limit ?? 20);
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

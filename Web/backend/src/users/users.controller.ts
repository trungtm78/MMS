// US-SS-08: UsersController — search users + units
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SearchQueryDto } from '../common/dto/search-query.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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

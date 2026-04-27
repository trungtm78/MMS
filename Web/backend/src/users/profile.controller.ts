import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  // GET /profile — alias for /users/me
  @Get('profile')
  getProfile(@Request() req: { user: JwtPayload }) {
    return this.usersService.getProfile(req.user.sub);
  }

  // GET /police-profile — police-specific profile fields
  @Get('police-profile')
  @UseGuards(RolesGuard)
  @Roles('ca_officer', 'police_ward', 'police_area', 'system_admin')
  getPoliceProfile(@Request() req: { user: JwtPayload }) {
    return this.usersService.getPoliceProfile(req.user.sub);
  }
}

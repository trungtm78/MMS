import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService, CreateUserDto } from './admin.service';
import type { JwtPayload } from '../auth/auth.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'office_staff')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(
    @Request() req: { user: JwtPayload },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('unitCode') unitCode?: string,
  ) {
    return this.adminService.listUsers(req.user, page, Math.min(limit, 100), unitCode);
  }

  @Get('users/:id')
  getUserById(@Request() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.adminService.getUserById(req.user, id);
  }

  @Post('users')
  createUser(@Request() req: { user: JwtPayload }, @Body() dto: CreateUserDto) {
    return this.adminService.createUser(req.user, dto);
  }

  @Patch('users/:id/status')
  updateStatus(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body('status') status: 'active' | 'inactive' | 'suspended',
  ) {
    return this.adminService.updateStatus(req.user, id, status);
  }

  @Patch('users/:id/role')
  updateRole(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
    @Body('role') role: string,
  ) {
    return this.adminService.updateRole(req.user, id, role);
  }

  @Post('users/:id/reset-password')
  resetPassword(@Request() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.adminService.resetPassword(req.user, id);
  }
}

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
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import type { CreateUserDto } from './admin.service';
import type { JwtPayload } from '../auth/auth.service';

const EDITABLE_KEYS = new Set([
  'session_timeout_minutes',
  'password_min_length',
  'max_login_attempts',
  'gps_retention_days',
  'min_wage_region_1',
  'training_daily_allowance_rate',
]);

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'office_staff')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('users')
  listUsers(
    @Request() req: { user: JwtPayload },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('unitCode') unitCode?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.listUsers(req.user, page, Math.min(limit, 100), unitCode, role);
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

  @Get('system-settings')
  @Roles('system_admin')
  async getSystemSettings() {
    const rows = await this.dataSource.query<{ key: string; value: string; description: string }[]>(
      `SELECT key, value, description FROM system_settings ORDER BY key`,
    );
    return rows.reduce<Record<string, string>>((acc, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {});
  }

  @Patch('system-settings')
  @Roles('system_admin')
  async updateSystemSettings(
    @Request() req: { user: JwtPayload },
    @Body() dto: Record<string, string>,
  ) {
    const keys = Object.keys(dto);
    const invalid = keys.filter((k) => !EDITABLE_KEYS.has(k));
    if (invalid.length) {
      throw new BadRequestException(`Not allowed to edit: ${invalid.join(', ')}`);
    }
    for (const key of keys) {
      await this.dataSource.query(
        `INSERT INTO system_settings(key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(dto[key]), req.user.sub],
      );
    }
    return { updated: keys.length };
  }
}

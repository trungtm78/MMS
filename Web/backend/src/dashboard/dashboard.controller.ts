import { Controller, Get, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import type { JwtPayload } from '../auth/auth.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('compliance')
  @UseGuards(RolesGuard)
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  getComplianceStats(
    @Request() req: { user: JwtPayload },
    @Query('unitCode') unitCode?: string,
  ) {
    return this.service.getComplianceStats(req.user, unitCode);
  }
}

// Sprint 3: Mau 03-BC report — live under /reports prefix
import { Controller as ReportController } from '@nestjs/common';
@ReportController('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly service: DashboardService) {}

  // GET /reports/mau-03-bc?year=&unitCode=
  @Get('mau-03-bc')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  getMau03Bc(
    @Query('year') year?: string,
    @Query('unitCode') unitCode?: string,
  ) {
    return this.service.getMau03Bc(
      year ? parseInt(year, 10) : new Date().getFullYear(),
      unitCode,
    );
  }

  // GET /reports/mau-03-bc/export?year=&unitCode= → xlsx
  @Get('mau-03-bc/export')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async exportMau03Bc(
    @Query('year') year: string | undefined,
    @Query('unitCode') unitCode: string | undefined,
    @Res() res: Response,
  ) {
    return this.service.exportMau03Bc(
      year ? parseInt(year, 10) : new Date().getFullYear(),
      unitCode,
      res,
    );
  }
}

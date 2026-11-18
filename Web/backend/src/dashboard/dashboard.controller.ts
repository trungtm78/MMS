import {
  Controller,
  Get,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import type { JwtPayload } from '../auth/auth.service';
import { businessDate } from '../common/time/business-date';
import { YearPipe } from '../common/pipes/query-pipes';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  // Counters cover what the caller may see: their unit, their assigned DQTV, or themselves
  @Get('stats')
  getStats(@Request() req: { user: JwtPayload }) {
    return this.service.getStats(req.user);
  }

  // Monthly task counts and unit headcounts of the overview charts, over the same scope
  @Get('charts')
  getCharts(
    @Request() req: { user: JwtPayload },
    @Query('year', YearPipe) year?: number,
  ) {
    return this.service.getCharts(req.user, year ?? businessDate().year);
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

  // GET /reports/mau-03-bc?year=&unitCode= — unitCode only applies to wide roles
  @Get('mau-03-bc')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  getMau03Bc(
    @Request() req: { user: JwtPayload },
    @Query('year', YearPipe) year?: number,
    @Query('unitCode') unitCode?: string,
  ) {
    return this.service.getMau03Bc(
      req.user,
      year ?? businessDate().year,
      unitCode,
    );
  }

  // GET /reports/mau-03-bc/export?year=&unitCode= → xlsx
  @Get('mau-03-bc/export')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async exportMau03Bc(
    @Request() req: { user: JwtPayload },
    @Query('year', YearPipe) year: number | undefined,
    @Query('unitCode') unitCode: string | undefined,
    @Res() res: Response,
  ) {
    return this.service.exportMau03Bc(
      req.user,
      year ?? businessDate().year,
      unitCode,
      res,
    );
  }
}

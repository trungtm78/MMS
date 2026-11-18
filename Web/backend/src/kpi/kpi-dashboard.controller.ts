import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.service';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { MonthPipe, YearPipe } from '../common/pipes/query-pipes';
import { KpiDashboardService } from './kpi-dashboard.service';

// Kept apart from KpiController, which serves individual scores and the summary report
@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KpiDashboardController {
  constructor(private readonly dashboard: KpiDashboardService) {}

  // GET /kpi/dashboard?year=&month= | ?periodId= &unitCode=&top=&trendMonths=
  // The current Vietnamese month by default; unitCode narrows only for ward-wide roles
  @Get('dashboard')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  getDashboard(
    @Request() req: { user: JwtPayload },
    @Query('periodId', new ParseUUIDPipe({ optional: true })) periodId?: string,
    @Query('year', YearPipe) year?: number,
    @Query('month', MonthPipe) month?: number,
    @Query('unitCode') unitCode?: string,
    @Query('top', new DefaultValuePipe(5), ParseIntPipe) top = 5,
    @Query('trendMonths', new DefaultValuePipe(6), ParseIntPipe)
    trendMonths = 6,
  ) {
    return this.dashboard.getDashboard(req.user, {
      periodId,
      year,
      month,
      unitCode: unitCode || undefined,
      top,
      trendMonths,
    });
  }
}

import {
  Controller,
  Get,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { JwtPayload } from '../auth/auth.service';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CustomReportQueryDto } from './custom-report-query.dto';
import { CustomReportsService } from './custom-reports.service';

// Beside ReportsController (/reports/mau-03-bc), with the same report readers
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
export class CustomReportsController {
  constructor(private readonly reports: CustomReportsService) {}

  // GET /reports/custom?dataset=&from=&to=&groupBy=&status=&unitCode=&limit=
  @Get('custom')
  generate(
    @Request() req: { user: JwtPayload },
    @Query() query: CustomReportQueryDto,
  ) {
    return this.reports.generate(req.user, query);
  }

  // GET /reports/custom/export — the same parameters, as xlsx
  @Get('custom/export')
  async export(
    @Request() req: { user: JwtPayload },
    @Query() query: CustomReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.reports.export(req.user, query, res);
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  Response as Res,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsNumber, IsString, IsOptional, Min, Max, IsInt } from 'class-validator';
import type { Response } from 'express';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

class CreatePayrollPeriodDto {
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsInt() @Min(1) @Max(12) month: number;
}

class AdjustKpiDto {
  @IsNumber() @Min(0) @Max(100)
  adjustedScore: number;

  @IsString()
  adjustmentNote: string;

  @IsOptional() @IsString()
  periodId?: string;
}

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // GET /payroll/periods
  @Get('periods')
  async listPeriods(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const result = await this.payrollService.listPeriods(page, limit);
    // Frontend payrollApi.listPeriods expects PayrollPeriod[] directly
    return result.data;
  }

  // GET /payroll/kpi
  @Get('kpi')
  async getKpiScores(
    @Query('periodId') periodId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.payrollService.getKpiScores(periodId, page, limit);
  }

  // PATCH /payroll/kpi/:militiaId?periodId= — manual KPI score override
  @Patch('kpi/:militiaId')
  @Roles('system_admin', 'police_ward')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async adjustKpi(
    @Param('militiaId') militiaId: string,
    @Query('periodId') periodId: string,
    @Body() dto: AdjustKpiDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.payrollService.adjustKpi(
      militiaId,
      dto.periodId ?? periodId,
      dto.adjustedScore,
      dto.adjustmentNote,
      req.user.sub,
    );
  }

  // GET /payroll/periods/:id/export-pdf — printable HTML payroll sheet (NĐ 72/2020)
  @Get('periods/:id/export-pdf')
  async exportPdf(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.payrollService.exportHtml(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // POST /payroll/periods/:id/calculate — trigger allowance calculation (NĐ 72/2020)
  @Post('periods/:id/calculate')
  @HttpCode(HttpStatus.OK)
  async calculate(@Param('id') id: string) {
    return this.payrollService.calculateAllowances(id);
  }

  // POST /payroll/periods — create a new payroll period
  @Post('periods')
  @Roles('system_admin')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createPeriod(@Body() dto: CreatePayrollPeriodDto) {
    return this.payrollService.createPeriod(dto.year, dto.month);
  }

  // POST /payroll/periods/:id/reopen — reopen a locked period
  @Post('periods/:id/reopen')
  @Roles('system_admin', 'police_ward')
  @HttpCode(HttpStatus.OK)
  async reopenPeriod(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ) {
    return this.payrollService.reopenPeriod(id, req.user);
  }

  // POST /payroll/periods/:id/lock
  @Post('periods/:id/lock')
  @HttpCode(HttpStatus.OK)
  async lockPeriod(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ) {
    return this.payrollService.lockPeriod(id, req.user);
  }
}

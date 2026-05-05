import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  Min,
  Max,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { KpiService } from './kpi.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

export class EvaluateDto {
  @IsUUID()
  @IsNotEmpty()
  targetUserId: string;

  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  criteria: string[];

  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10, { each: true })
  scores: number[];

  @IsString()
  @IsIn(['reward', 'maintain', 'training', 'warning', 'discipline'])
  recommendation: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('kpi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  // POST /kpi/evaluate — CA officers evaluate DQTV members
  @Post('evaluate')
  @Roles('ca_officer', 'ca_ward', 'ca_area', 'system_admin')
  @HttpCode(HttpStatus.CREATED)
  async evaluate(
    @Body() dto: EvaluateDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.kpiService.submitEvaluation(dto, { sub: req.user.sub, role: req.user.role });
  }

  // GET /kpi/current?userId=&month=&year=
  @Get('current')
  @Roles('dqtv_member', 'dqtv', 'ca_officer', 'system_admin', 'police_ward', 'police_area')
  async getCurrent(
    @Request() req: { user: { sub: string } },
    @Query('userId') userId?: string,
    @Query('month', new DefaultValuePipe(0), ParseIntPipe) month = 0,
    @Query('year', new DefaultValuePipe(0), ParseIntPipe) year = 0,
  ) {
    const targetUserId = userId ?? req.user.sub;
    return this.kpiService.getCurrentScore(
      targetUserId,
      month > 0 ? month : undefined,
      year > 0 ? year : undefined,
    );
  }

  // GET /kpi/history?userId=
  @Get('history')
  @Roles('dqtv_member', 'dqtv', 'ca_officer', 'system_admin', 'police_ward', 'police_area')
  async getHistory(
    @Request() req: { user: { sub: string } },
    @Query('userId') userId?: string,
  ) {
    const targetUserId = userId ?? req.user.sub;
    return this.kpiService.getHistory(targetUserId);
  }

  // GET /kpi/summary-report?periodId=&unitCode=
  @Get('summary-report')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async getSummaryReport(
    @Request() req: { user: JwtPayload },
    @Query('periodId') periodId: string,
    @Query('unitCode') unitCode?: string,
  ) {
    return this.kpiService.getSummaryReport(req.user, periodId, unitCode);
  }

  // GET /kpi/export?periodId=&unitCode= → xlsx
  @Get('export')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async exportKpi(
    @Request() req: { user: JwtPayload },
    @Query('periodId') periodId: string,
    @Query('unitCode') unitCode: string | undefined,
    @Res() res: Response,
  ) {
    return this.kpiService.exportKpi(req.user, periodId, unitCode, res);
  }
}

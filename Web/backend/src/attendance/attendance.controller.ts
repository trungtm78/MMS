// US-SS-07: AttendanceController
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
  IsOptional,
  IsUUID,
  IsIn,
  IsDateString,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceService } from './attendance.service';
import { businessDate } from '../common/time/business-date';
import {
  IsoDatePipe,
  YearMonthPipe,
  type YearMonth,
} from '../common/pipes/query-pipes';
import { resolveTimesheetRange } from './timesheet';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ExcelExportService } from '../common/services/excel-export.service';
import type { JwtPayload } from '../auth/auth.service';

export class CreateAttendanceDto {
  @IsUUID()
  @IsNotEmpty()
  militiaId: string;

  @IsDateString()
  workDate: string;

  @IsString()
  @IsIn(['present', 'absent', 'late', 'half_day'])
  status: 'present' | 'absent' | 'late' | 'half_day';

  @IsOptional()
  @IsString()
  checkinAt?: string;

  @IsOptional()
  @IsString()
  checkoutAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class LocationDto {
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsNumber() accuracy?: number;
}

export class CheckInDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @IsString()
  source?: string;
}

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'office_staff', 'ca_officer')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly excelExportService: ExcelExportService,
  ) {}

  // GET /attendance/summary?from=&to=&unitCode= — aggregate summary per militia
  @Get('summary')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async getAttendanceSummary(
    @Request() req: { user: JwtPayload },
    @Query('from', IsoDatePipe) from?: string,
    @Query('to', IsoDatePipe) to?: string,
    @Query('unitCode') unitCode?: string,
  ) {
    // Defaults to the Vietnamese month to date
    const today = businessDate().isoDate;
    const effectiveFrom = from ?? `${today.slice(0, 8)}01`;
    const effectiveTo = to ?? today;
    return this.attendanceService.getAttendanceSummary(
      req.user,
      effectiveFrom,
      effectiveTo,
      unitCode || undefined,
    );
  }

  // GET /attendance/export?from=&to=&unitCode= — xlsx export
  @Get('export')
  @Roles('system_admin', 'police_ward', 'police_area', 'office_staff')
  async exportAttendanceSummary(
    @Request() req: { user: JwtPayload },
    @Res() res: Response,
    @Query('from', IsoDatePipe) from?: string,
    @Query('to', IsoDatePipe) to?: string,
    @Query('unitCode') unitCode?: string,
  ) {
    // Defaults to the Vietnamese month to date
    const today = businessDate().isoDate;
    const effectiveFrom = from ?? `${today.slice(0, 8)}01`;
    const effectiveTo = to ?? today;
    const workbook = await this.attendanceService.exportAttendanceSummary(
      req.user,
      effectiveFrom,
      effectiveTo,
      unitCode || undefined,
    );
    const filename = `DiemDanh_TongHop_${effectiveFrom}_${effectiveTo}_${unitCode ?? 'ToanBo'}_${today}.xlsx`;
    await this.excelExportService.streamToResponse(workbook, res, filename);
  }

  // GET /attendance/timesheet?month=YYYY-MM | from=&to= (at most 62 days) &unitCode=&page=&limit=
  // Day-by-day grid per member with totals by status, the current Vietnamese month by
  // default. Staff see the members they manage (unitCode narrows only for ward-wide roles);
  // militia members see only themselves.
  @Get('timesheet')
  @Roles(
    'system_admin',
    'police_ward',
    'police_area',
    'office_staff',
    'ca_officer',
    'dqtv',
    'dqtv_member',
  )
  async getTimesheet(
    @Request() req: { user: JwtPayload },
    @Query('month', YearMonthPipe) month?: YearMonth,
    @Query('from', IsoDatePipe) from?: string,
    @Query('to', IsoDatePipe) to?: string,
    @Query('unitCode') unitCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const range = resolveTimesheetRange(
      { month, from, to },
      businessDate().isoDate,
    );
    return this.attendanceService.getTimesheet(req.user, {
      ...range,
      unitCode: unitCode || undefined,
      page,
      limit,
    });
  }

  // GET /attendance?date=&from=&to=&page=&limit= — paginated report
  // date: single date filter; from+to: range filter (used by calendar widget)
  // Fallback when no filter: returns today
  @Get()
  async list(
    @Request() req: { user: JwtPayload },
    @Query('date', IsoDatePipe) date?: string,
    @Query('from', IsoDatePipe) from?: string,
    @Query('to', IsoDatePipe) to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.attendanceService.listAttendancePaginated(req.user, {
      date,
      from,
      to,
      page,
      limit,
    });
  }

  // POST /attendance — record attendance (admin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateAttendanceDto,
  ) {
    return this.attendanceService.record(req.user, dto);
  }

  // POST /attendance/check-in — mobile self-service check-in
  @Post('check-in')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  @HttpCode(HttpStatus.CREATED)
  async checkIn(@Request() req: { user: JwtPayload }, @Body() dto: CheckInDto) {
    return this.attendanceService.checkIn(req.user.sub, dto);
  }

  // POST /attendance/check-out — mobile self-service check-out. Clients may send a
  // location, but check-out records only the time, so the request body is not read.
  @Post('check-out')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  @HttpCode(HttpStatus.OK)
  async checkOut(@Request() req: { user: JwtPayload }) {
    return this.attendanceService.checkOut(req.user.sub);
  }

  // GET /attendance/today — today's status for current user
  @Get('today')
  @Roles('dqtv_member', 'dqtv')
  async getToday(@Request() req: { user: JwtPayload }) {
    return this.attendanceService.getTodayStatus(req.user.sub);
  }

  // GET /attendance/stats — monthly summary for current user
  @Get('stats')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  async getStats(@Request() req: { user: JwtPayload }) {
    return this.attendanceService.getStats(req.user.sub);
  }
}

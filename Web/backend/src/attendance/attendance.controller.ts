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
  BadRequestException,
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
  @IsOptional() @ValidateNested() @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional() @IsString()
  source?: string;
}

export class CheckOutDto {
  @IsOptional() @ValidateNested() @Type(() => LocationDto)
  location?: LocationDto;
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
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitCode') unitCode?: string,
  ) {
    const effectiveFrom = from ?? new Date().toISOString().slice(0, 8) + '01';
    const effectiveTo = to ?? new Date().toISOString().slice(0, 10);
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
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitCode') unitCode?: string,
  ) {
    const effectiveFrom = from ?? new Date().toISOString().slice(0, 8) + '01';
    const effectiveTo = to ?? new Date().toISOString().slice(0, 10);
    const workbook = await this.attendanceService.exportAttendanceSummary(
      req.user,
      effectiveFrom,
      effectiveTo,
      unitCode || undefined,
    );
    const date = new Date().toISOString().slice(0, 10);
    const filename = `DiemDanh_TongHop_${effectiveFrom}_${effectiveTo}_${unitCode ?? 'ToanBo'}_${date}.xlsx`;
    await this.excelExportService.streamToResponse(workbook, res, filename);
  }

  // GET /attendance?date=&from=&to=&page=&limit= — paginated report
  // date: single date filter; from+to: range filter (used by calendar widget)
  // Fallback when no filter: returns today
  @Get()
  async list(
    @Request() req: { user: JwtPayload },
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.attendanceService.listAttendancePaginated(req.user, { date, from, to, page, limit });
  }

  // POST /attendance — record attendance (admin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.record(dto);
  }

  // POST /attendance/check-in — mobile self-service check-in
  @Post('check-in')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  @HttpCode(HttpStatus.CREATED)
  async checkIn(
    @Request() req: { user: JwtPayload },
    @Body() dto: CheckInDto,
  ) {
    return this.attendanceService.checkIn(req.user.sub, dto);
  }

  // POST /attendance/check-out — mobile self-service check-out
  @Post('check-out')
  @Roles('dqtv_member', 'dqtv', 'system_admin')
  @HttpCode(HttpStatus.OK)
  async checkOut(
    @Request() req: { user: JwtPayload },
    @Body() dto: CheckOutDto,
  ) {
    return this.attendanceService.checkOut(req.user.sub, dto);
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

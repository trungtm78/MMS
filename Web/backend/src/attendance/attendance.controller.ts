// US-SS-07: AttendanceController
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsIn,
  IsDateString,
} from 'class-validator';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin', 'office_staff', 'ca_officer')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

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

  // POST /attendance — record attendance
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.record(dto);
  }
}

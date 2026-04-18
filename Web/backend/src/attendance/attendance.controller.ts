// US-SS-07: AttendanceController
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // GET /attendance?militiaId=&workDate=&page=&limit=
  @Get()
  async list(
    @Query('militiaId') militiaId?: string,
    @Query('workDate') workDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendanceService.list({
      militiaId,
      workDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  // POST /attendance — record attendance
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async record(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.record(dto);
  }
}

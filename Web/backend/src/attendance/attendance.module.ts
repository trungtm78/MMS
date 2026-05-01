// US-SS-07: AttendanceModule
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from './attendance.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ExcelExportService } from '../common/services/excel-export.service';

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceRecord])],
  controllers: [AttendanceController],
  providers: [AttendanceService, JwtAuthGuard, ExcelExportService],
  exports: [AttendanceService],
})
export class AttendanceModule {}

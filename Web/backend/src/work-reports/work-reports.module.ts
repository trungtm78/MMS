import { Module } from '@nestjs/common';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';

@Module({
  controllers: [WorkReportsController],
  providers: [WorkReportsService],
  exports: [WorkReportsService],
})
export class WorkReportsModule {}

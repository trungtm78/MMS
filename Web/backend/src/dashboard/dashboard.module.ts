import { Module } from '@nestjs/common';
import { DashboardController, ReportsController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ExcelExportService } from '../common/services/excel-export.service';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [AssignmentsModule],
  controllers: [DashboardController, ReportsController],
  providers: [DashboardService, ExcelExportService],
})
export class DashboardModule {}

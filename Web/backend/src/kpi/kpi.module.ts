import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ExcelExportService } from '../common/services/excel-export.service';
import { SettingsModule } from '../settings/settings.module';
import { KpiDashboardController } from './kpi-dashboard.controller';
import { KpiDashboardService } from './kpi-dashboard.service';

@Module({
  imports: [AssignmentsModule, SettingsModule],
  controllers: [KpiController, KpiDashboardController],
  providers: [KpiService, KpiDashboardService, ExcelExportService],
  exports: [KpiService],
})
export class KpiModule {}

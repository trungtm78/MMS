import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ExcelExportService } from '../common/services/excel-export.service';

@Module({
  imports: [AssignmentsModule],
  controllers: [KpiController],
  providers: [KpiService, ExcelExportService],
  exports: [KpiService],
})
export class KpiModule {}

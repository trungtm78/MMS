import { Module } from '@nestjs/common';
import { ExcelExportService } from '../common/services/excel-export.service';
import { CustomReportsController } from './custom-reports.controller';
import { CustomReportsService } from './custom-reports.service';

@Module({
  controllers: [CustomReportsController],
  providers: [CustomReportsService, ExcelExportService],
})
export class CustomReportsModule {}

import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { ExcelExportService } from '../common/services/excel-export.service';

@Module({
  controllers: [AuditController],
  providers: [ExcelExportService],
})
export class AuditModule {}

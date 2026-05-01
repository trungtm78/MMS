import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExcelExportService } from '../common/services/excel-export.service';

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, JwtAuthGuard, RolesGuard, ExcelExportService],
  exports: [PayrollService],
})
export class PayrollModule {}

import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, JwtAuthGuard, RolesGuard],
  exports: [PayrollService],
})
export class PayrollModule {}

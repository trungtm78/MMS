import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  controllers: [LeaveController],
  providers: [LeaveService, JwtAuthGuard],
  exports: [LeaveService],
})
export class LeaveModule {}

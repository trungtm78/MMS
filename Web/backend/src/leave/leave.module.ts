import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  // CA officers review the leave of the DQTV assigned to them
  imports: [AssignmentsModule],
  controllers: [LeaveController],
  providers: [LeaveService, JwtAuthGuard],
  exports: [LeaveService],
})
export class LeaveModule {}

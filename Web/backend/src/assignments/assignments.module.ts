import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService, JwtAuthGuard],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}

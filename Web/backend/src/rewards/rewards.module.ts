import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DisciplineController } from './discipline.controller';
import { DisciplineService } from './discipline.service';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

// Khen thưởng, kỷ luật and khiếu nại (Luật Dân quân tự vệ 2019, Nghị định 72/2020)
@Module({
  imports: [AssignmentsModule],
  controllers: [RewardsController, DisciplineController],
  providers: [RewardsService, DisciplineService, JwtAuthGuard],
  exports: [RewardsService, DisciplineService],
})
export class RewardsModule {}

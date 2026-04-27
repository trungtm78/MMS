import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  controllers: [TrainingController],
  providers: [TrainingService, JwtAuthGuard],
  exports: [TrainingService],
})
export class TrainingModule {}

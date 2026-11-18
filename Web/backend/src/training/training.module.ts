import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { TrainingPlansController } from './training-plans.controller';
import { TrainingPlansService } from './training-plans.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ExcelExportService } from '../common/services/excel-export.service';

@Module({
  // TrainingPlansController first: its static /training/plans and /training/sessions
  // routes must be matched before TrainingController's GET /training/:id
  controllers: [TrainingPlansController, TrainingController],
  providers: [
    TrainingService,
    TrainingPlansService,
    JwtAuthGuard,
    ExcelExportService,
  ],
  exports: [TrainingService, TrainingPlansService],
})
export class TrainingModule {}

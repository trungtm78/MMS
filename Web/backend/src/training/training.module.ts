import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ExcelExportService } from '../common/services/excel-export.service';

@Module({
  controllers: [TrainingController],
  providers: [TrainingService, JwtAuthGuard, ExcelExportService],
  exports: [TrainingService],
})
export class TrainingModule {}

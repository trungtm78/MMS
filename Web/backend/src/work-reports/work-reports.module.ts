import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { FilesModule } from '../files/files.module';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';

@Module({
  // Reports carry uploaded files as attachments
  imports: [AssignmentsModule, FilesModule],
  controllers: [WorkReportsController],
  providers: [WorkReportsService],
  exports: [WorkReportsService],
})
export class WorkReportsModule {}

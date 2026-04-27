import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GpsRetentionService } from './gps-retention.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [GpsRetentionService],
})
export class SchedulerModule {}

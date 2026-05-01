import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GpsRetentionService } from './gps-retention.service';
import { ComplianceAlertsService } from './compliance-alerts.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule],
  providers: [GpsRetentionService, ComplianceAlertsService],
})
export class SchedulerModule {}

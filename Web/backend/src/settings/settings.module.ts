import { Module } from '@nestjs/common';
import { KpiTargetsService } from './kpi-targets.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { SettingsController } from './settings.controller';

@Module({
  controllers: [SettingsController],
  providers: [KpiTargetsService, NotificationPreferencesService],
  // KPI reports compare results with the targets; notification senders filter recipients
  exports: [KpiTargetsService, NotificationPreferencesService],
})
export class SettingsModule {}

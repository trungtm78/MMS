import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';

@Module({
  // CA officers see their assigned DQTV; new positions are pushed over the gateway
  imports: [AssignmentsModule, NotificationsModule],
  controllers: [GpsController],
  providers: [GpsService],
  exports: [GpsService],
})
export class GpsModule {}

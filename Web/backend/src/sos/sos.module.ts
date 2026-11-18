import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { SosAlertsService } from './sos-alerts.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssignmentsModule } from '../assignments/assignments.module';

@Module({
  imports: [NotificationsModule, AssignmentsModule],
  controllers: [SosController],
  providers: [SosService, SosAlertsService],
  exports: [SosService],
})
export class SosModule {}

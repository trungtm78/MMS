import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DeviceSessionsController } from './device-sessions.controller';
import { DeviceSessionsService } from './device-sessions.service';

@Module({
  controllers: [DevicesController, DeviceSessionsController],
  providers: [DeviceSessionsService],
})
export class DevicesModule {}

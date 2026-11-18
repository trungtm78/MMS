import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ChatMessagesController } from './chat-messages.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [ChatModule],
  controllers: [NotificationsController, ChatMessagesController],
  providers: [NotificationsGateway],
  exports: [NotificationsGateway],
})
export class NotificationsModule {}

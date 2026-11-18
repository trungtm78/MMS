import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ContactPolicyModule } from '../users/contact-policy.module';

// NotificationsModule imports this module for its socket handlers, so ChatModule
// must not import NotificationsModule back.
@Module({
  // Who may be added to a conversation: the rule GET /users/search lists by
  imports: [ContactPolicyModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}

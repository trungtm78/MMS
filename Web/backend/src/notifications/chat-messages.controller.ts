import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { JwtPayload } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { Roles } from '../common/decorators/roles.decorator';
import { ROLE_CODES } from '../common/constants/roles';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsGateway } from './notifications.gateway';

export class SendChatMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(ChatService.MAX_MESSAGE_LENGTH)
  content!: string;
}

// POST /chat/conversations/:id/messages — the HTTP twin of the chat:send socket event,
// used by clients without a live socket. It lives beside the gateway because
// ChatModule cannot import NotificationsModule, and it stores through ChatService so
// both paths validate and broadcast the same way.
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLE_CODES)
export class ChatMessagesController {
  constructor(
    private readonly chatService: ChatService,
    private readonly gateway: NotificationsGateway,
  ) {}

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async send(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendChatMessageDto,
  ) {
    if (!(await this.chatService.isMember(req.user.sub, conversationId))) {
      throw new ForbiddenException('not_a_participant');
    }
    const message = await this.chatService.saveMessage(
      req.user.sub,
      conversationId,
      dto.content,
    );
    this.gateway.emitToConversation(conversationId, 'chat:message', message);
    return message;
  }

  // POST /chat/conversations/:id/read — marks the conversation read for the caller and
  // tells the other participants, like the mark_read socket event
  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    const receipt = await this.chatService.markRead(
      req.user.sub,
      conversationId,
    );
    this.gateway.emitToConversation(conversationId, 'chat:read', {
      conversationId,
      userId: req.user.sub,
      readAt: receipt.readAt,
    });
    return receipt;
  }
}

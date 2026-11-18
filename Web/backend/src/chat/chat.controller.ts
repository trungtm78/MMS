import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CONVERSATION_TYPES, ChatService } from './chat.service';
import type { ConversationType } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ROLE_CODES } from '../common/constants/roles';
import type { JwtPayload } from '../auth/auth.service';

class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  participantIds: string[];

  @IsOptional()
  @IsIn(CONVERSATION_TYPES)
  conversationType?: ConversationType;
}

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
// Every signed-in role may chat; conversation membership decides the rest
@Roles(...ROLE_CODES)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // GET /chat/conversations
  @Get('conversations')
  listConversations(@Request() req: { user: JwtPayload }) {
    return this.chatService.listConversations(req.user.sub);
  }

  // POST /chat/conversations: 201 with the new conversation, or 200 with the existing
  // direct conversation of the pair; both answer like an item of the conversation list
  @Post('conversations')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createConversation(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateConversationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { conversation, created } = await this.chatService.createConversation(
      req.user,
      dto,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return conversation;
  }

  // GET /chat/conversations/:id/messages
  @Get('conversations/:id/messages')
  getMessages(
    @Request() req: { user: JwtPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.chatService.getMessages(req.user.sub, id, page, limit);
  }
}

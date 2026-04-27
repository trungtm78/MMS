import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

class CreateConversationDto {
  @IsOptional() @IsString()
  title?: string;

  @IsArray()
  participantIds: string[];

  @IsOptional() @IsString()
  conversationType?: string;
}

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dqtv_member', 'dqtv', 'ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'office_staff', 'system_admin')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // GET /chat/conversations
  @Get('conversations')
  listConversations(@Request() req: { user: JwtPayload }) {
    return this.chatService.listConversations(req.user.sub);
  }

  // POST /chat/conversations
  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  createConversation(
    @Request() req: { user: JwtPayload },
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createConversation(req.user.sub, dto);
  }

  // GET /chat/conversations/:id/messages
  @Get('conversations/:id/messages')
  getMessages(
    @Request() req: { user: JwtPayload },
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.chatService.getMessages(req.user.sub, id, page, limit);
  }
}

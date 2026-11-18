import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ChatController } from '../chat/chat.controller';
import { ChatService } from '../chat/chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/auth.service';
import {
  ChatMessagesController,
  SendChatMessageDto,
} from './chat-messages.controller';
import { NotificationsGateway } from './notifications.gateway';

const CONV_ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

const chatService = {
  isMember: jest.fn(),
  saveMessage: jest.fn(),
  markRead: jest.fn(),
};
const gateway = { emitToConversation: jest.fn() };
const req = {
  user: { sub: 'u1', role: 'police_area', unitScope: 'KV1' } as JwtPayload,
};

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

// PoliceApp sends chat messages over HTTP; the socket path and this route must agree
describe('ChatMessagesController', () => {
  let controller: ChatMessagesController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatMessagesController],
      providers: [
        { provide: ChatService, useValue: chatService },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ChatMessagesController);
  });

  it('stores the message and broadcasts it to the conversation room', async () => {
    const stored = {
      id: 'm1',
      conversationId: CONV_ID,
      senderId: 'u1',
      content: 'hi',
    };
    chatService.isMember.mockResolvedValueOnce(true);
    chatService.saveMessage.mockResolvedValueOnce(stored);

    await expect(
      controller.send(req, CONV_ID, { content: 'hi' }),
    ).resolves.toEqual(stored);
    expect(chatService.saveMessage).toHaveBeenCalledWith('u1', CONV_ID, 'hi');
    expect(gateway.emitToConversation).toHaveBeenCalledWith(
      CONV_ID,
      'chat:message',
      stored,
    );
  });

  it('refuses callers who are not participants', async () => {
    chatService.isMember.mockResolvedValueOnce(false);

    await expect(
      controller.send(req, CONV_ID, { content: 'hi' }),
    ).rejects.toThrow(new ForbiddenException('not_a_participant'));
    expect(chatService.saveMessage).not.toHaveBeenCalled();
    expect(gateway.emitToConversation).not.toHaveBeenCalled();
  });

  it.each([
    ['empty content', { content: '' }],
    [
      'content longer than a message may be',
      { content: 'x'.repeat(ChatService.MAX_MESSAGE_LENGTH + 1) },
    ],
    ['extra fields', { content: 'hi', senderId: 'someone-else' }],
  ])('rejects a body with %s', async (_label, body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: SendChatMessageDto }),
    ).rejects.toThrow(BadRequestException);
  });

  // Clients mark a conversation read when it is opened; the other participants see it
  it('records a read receipt over HTTP and broadcasts it', async () => {
    const readAt = new Date('2026-10-01T02:00:00Z');
    chatService.markRead.mockResolvedValueOnce({
      conversationId: CONV_ID,
      readAt,
    });

    await expect(controller.markRead(req, CONV_ID)).resolves.toEqual({
      conversationId: CONV_ID,
      readAt,
    });
    expect(chatService.markRead).toHaveBeenCalledWith('u1', CONV_ID);
    expect(gateway.emitToConversation).toHaveBeenCalledWith(
      CONV_ID,
      'chat:read',
      { conversationId: CONV_ID, userId: 'u1', readAt },
    );
  });

  it('uses the same guards and roles as the rest of the chat API', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ChatMessagesController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, ChatMessagesController)).toEqual(
      Reflect.getMetadata(ROLES_KEY, ChatController),
    );
  });
});

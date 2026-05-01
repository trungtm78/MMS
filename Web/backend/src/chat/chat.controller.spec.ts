import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ForbiddenException } from '@nestjs/common';

const mockChatService = {
  listConversations: jest.fn(),
  createConversation: jest.fn(),
  getMessages: jest.fn(),
};

const userReq = { user: { sub: 'user-1', role: 'dqtv_member', unitScope: 'UNIT_001' } };

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
    jest.clearAllMocks();
  });

  describe('listConversations', () => {
    it('returns conversations for calling user', () => {
      const convs = [{ id: 'c1', title: 'Team Chat' }];
      mockChatService.listConversations.mockReturnValueOnce(convs);

      const result = controller.listConversations(userReq as any);

      expect(result).toEqual(convs);
      expect(mockChatService.listConversations).toHaveBeenCalledWith('user-1');
    });

    it('returns empty array when user has no conversations', () => {
      mockChatService.listConversations.mockReturnValueOnce([]);

      const result = controller.listConversations(userReq as any);

      expect(result).toHaveLength(0);
    });
  });

  describe('createConversation', () => {
    it('creates conversation and returns it', () => {
      const dto = { participantIds: ['user-2'], conversationType: 'direct' };
      const created = { id: 'c-new', ...dto };
      mockChatService.createConversation.mockReturnValueOnce(created);

      const result = controller.createConversation(userReq as any, dto as any);

      expect(result).toEqual(created);
      expect(mockChatService.createConversation).toHaveBeenCalledWith('user-1', dto);
    });

    it('propagates error from service', () => {
      mockChatService.createConversation.mockImplementationOnce(() => {
        throw new Error('participant_not_found');
      });

      expect(() => controller.createConversation(userReq as any, { participantIds: [] } as any)).toThrow(
        'participant_not_found',
      );
    });
  });

  describe('getMessages', () => {
    it('returns paginated messages for conversation', () => {
      const msgs = { data: [{ id: 'm1', content: 'Hello' }], total: 1, page: 1, limit: 50 };
      mockChatService.getMessages.mockReturnValueOnce(msgs);

      const result = controller.getMessages(userReq as any, 'c1', 1, 50);

      expect(result).toEqual(msgs);
      expect(mockChatService.getMessages).toHaveBeenCalledWith('user-1', 'c1', 1, 50);
    });

    it('propagates ForbiddenException when user is not a participant', () => {
      mockChatService.getMessages.mockImplementationOnce(() => {
        throw new ForbiddenException('not_a_participant');
      });

      expect(() => controller.getMessages(userReq as any, 'c-other', 1, 50)).toThrow(ForbiddenException);
    });
  });
});

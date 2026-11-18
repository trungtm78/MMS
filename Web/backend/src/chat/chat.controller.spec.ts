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

const userReq = {
  user: { sub: 'user-1', role: 'dqtv_member', unitScope: 'UNIT_001' },
};

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

      const result = controller.listConversations(userReq as never);

      expect(result).toEqual(convs);
      expect(mockChatService.listConversations).toHaveBeenCalledWith('user-1');
    });

    it('returns empty array when user has no conversations', () => {
      mockChatService.listConversations.mockReturnValueOnce([]);

      const result = controller.listConversations(userReq as never);

      expect(result).toHaveLength(0);
    });
  });

  describe('createConversation', () => {
    const dto = {
      participantIds: ['user-2'],
      conversationType: 'direct' as const,
    };
    const summary = { id: 'c-1', conversationType: 'direct', participants: [] };
    const response = () => ({ status: jest.fn() });

    it('answers 201 with the conversation it opened', async () => {
      mockChatService.createConversation.mockResolvedValueOnce({
        conversation: summary,
        created: true,
      });
      const res = response();

      await expect(
        controller.createConversation(userReq as never, dto, res as never),
      ).resolves.toEqual(summary);

      expect(res.status).toHaveBeenCalledWith(201);
      // The creator's contact scope decides who may be added, so the service gets the caller
      expect(mockChatService.createConversation).toHaveBeenCalledWith(
        userReq.user,
        dto,
      );
    });

    // Opening a direct conversation that already exists returns it, as messaging apps do
    it('answers 200 with the existing direct conversation of the pair', async () => {
      mockChatService.createConversation.mockResolvedValueOnce({
        conversation: summary,
        created: false,
      });
      const res = response();

      await expect(
        controller.createConversation(userReq as never, dto, res as never),
      ).resolves.toEqual(summary);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('propagates error from service', async () => {
      mockChatService.createConversation.mockRejectedValueOnce(
        new Error('participant_not_found'),
      );

      await expect(
        controller.createConversation(
          userReq as never,
          { participantIds: [] },
          response() as never,
        ),
      ).rejects.toThrow('participant_not_found');
    });
  });

  describe('getMessages', () => {
    it('returns paginated messages for conversation', () => {
      const msgs = {
        data: [{ id: 'm1', content: 'Hello' }],
        total: 1,
        page: 1,
        limit: 50,
      };
      mockChatService.getMessages.mockReturnValueOnce(msgs);

      const result = controller.getMessages(userReq as never, 'c1', 1, 50);

      expect(result).toEqual(msgs);
      expect(mockChatService.getMessages).toHaveBeenCalledWith(
        'user-1',
        'c1',
        1,
        50,
      );
    });

    it('propagates ForbiddenException when user is not a participant', () => {
      mockChatService.getMessages.mockImplementationOnce(() => {
        throw new ForbiddenException('not_a_participant');
      });

      expect(() =>
        controller.getMessages(userReq as never, 'c-other', 1, 50),
      ).toThrow(ForbiddenException);
    });
  });
});

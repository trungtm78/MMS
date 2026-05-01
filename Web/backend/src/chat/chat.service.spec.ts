import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';

const mockDataSource = { query: jest.fn() };

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<ChatService>(ChatService);
    jest.clearAllMocks();
  });

  describe('saveMessage', () => {
    it('inserts message and returns row', async () => {
      const row = {
        id: 'm-1',
        conversationId: 'c-1',
        senderId: 'user-1',
        content: 'Hello',
        createdAt: new Date().toISOString(),
      };
      mockDataSource.query.mockResolvedValueOnce([row]);

      const result = await service.saveMessage('user-1', 'c-1', 'Hello');

      expect(result).toEqual(row);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        ['c-1', 'user-1', 'Hello'],
      );
    });

    it('SQL uses RETURNING clause', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'm-1' }]);

      await service.saveMessage('user-1', 'c-1', 'Test');

      const [sql] = mockDataSource.query.mock.calls[0];
      expect(sql).toContain('RETURNING');
    });
  });

  describe('listConversations', () => {
    it('returns array of conversations for user', async () => {
      const convs = [
        { id: 'c-1', title: 'Team Chat', conversationType: 'group', createdAt: new Date().toISOString() },
      ];
      mockDataSource.query.mockResolvedValueOnce(convs);

      const result = await service.listConversations('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id', 'c-1');
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('conversation_participants'),
        ['user-1'],
      );
    });

    it('returns empty array when user has no conversations', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.listConversations('new-user');

      expect(result).toHaveLength(0);
    });

    it('queries by user_id filter', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listConversations('user-42');

      const [, params] = mockDataSource.query.mock.calls[0];
      expect(params[0]).toBe('user-42');
    });
  });

  describe('createConversation', () => {
    it('creates conversation and adds all participants', async () => {
      const convRow = { id: 'c-new', title: 'New Chat', conversationType: 'direct', createdAt: new Date().toISOString() };
      mockDataSource.query
        .mockResolvedValueOnce([convRow])         // INSERT conversation
        .mockResolvedValueOnce([])                 // INSERT participant 1 (creator)
        .mockResolvedValueOnce([]);                // INSERT participant 2

      const result = await service.createConversation('user-1', {
        participantIds: ['user-2'],
        conversationType: 'direct',
      });

      expect(result).toEqual(convRow);
      // First call is INSERT into conversations
      const [sql] = mockDataSource.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO conversations');
    });

    it('deduplicates participants (creator + participantIds)', async () => {
      const convRow = { id: 'c-new', title: null, conversationType: 'direct', createdAt: '' };
      // creator appears in both creatorId and participantIds
      mockDataSource.query
        .mockResolvedValueOnce([convRow])
        .mockResolvedValueOnce([]);  // only one participant insert (deduped)

      await service.createConversation('user-1', {
        participantIds: ['user-1'],  // same as creator
      });

      // total calls: 1 (INSERT conv) + 1 (INSERT single participant after dedup)
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('isMember', () => {
    it('returns true when user is a participant', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ 1: 1 }]);

      const result = await service.isMember('user-1', 'c-1');

      expect(result).toBe(true);
    });

    it('returns false when user is not a participant', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.isMember('outsider', 'c-1');

      expect(result).toBe(false);
    });
  });

  describe('getMessages', () => {
    it('returns paginated messages for participant', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }])          // membership check
        .mockResolvedValueOnce([{ count: '5' }])     // count
        .mockResolvedValueOnce([{ id: 'm-1', content: 'Hi' }]);  // messages

      const result = await service.getMessages('user-1', 'c-1', 1, 50);

      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
    });

    it('throws ForbiddenException when user is not a participant', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);  // membership check returns empty

      await expect(service.getMessages('outsider', 'c-1', 1, 50)).rejects.toThrow(ForbiddenException);
    });

    it('caps limit at 200', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.getMessages('user-1', 'c-1', 1, 999);

      // Third call (SELECT messages): second param should be the capped limit
      const [, params] = mockDataSource.query.mock.calls[2];
      expect(params[1]).toBe(200);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ContactPolicy } from '../users/contact-policy';

const mockManager = { query: jest.fn() };
const mockDataSource = {
  query: jest.fn(),
  transaction: jest.fn(),
};
const mockContacts = { scopeOf: jest.fn() };
const creator = { sub: 'user-1', role: 'office_staff', unitScope: 'KV2' };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];
const sqlOf = (mock: jest.Mock, call: number) => String(callsOf(mock)[call][0]);
const paramsOf = (mock: jest.Mock, call: number) =>
  callsOf(mock)[call][1] as unknown[];

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: ContactPolicy, useValue: mockContacts },
      ],
    }).compile();
    service = module.get<ChatService>(ChatService);
    jest.resetAllMocks();
    mockDataSource.transaction.mockImplementation(
      (work: (mgr: typeof mockManager) => unknown) => work(mockManager),
    );
    mockContacts.scopeOf.mockResolvedValue({ units: ['KV2'], userIds: [] });
  });

  describe('saveMessage', () => {
    it('inserts the trimmed message and returns it with createdAt from sent_at', async () => {
      const row = {
        id: 'm-1',
        conversationId: 'c-1',
        senderId: 'user-1',
        content: 'Hello',
        createdAt: new Date(),
      };
      mockDataSource.query.mockResolvedValueOnce([row]);

      const result = await service.saveMessage('user-1', 'c-1', '  Hello  ');

      expect(result).toEqual(row);
      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(
        /INSERT INTO messages\s*\(conversation_id, sender_id, content\)/,
      );
      expect(sql).toMatch(/sent_at AS "createdAt"/);
      expect(sql).not.toMatch(/created_at/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual([
        'c-1',
        'user-1',
        'Hello',
      ]);
    });

    it('rejects blank content without touching the database', async () => {
      await expect(service.saveMessage('user-1', 'c-1', '   ')).rejects.toThrow(
        new BadRequestException('message_content_required'),
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    // The request DTO's @MaxLength counts characters as users see them; so must the service
    it('counts emoji and other astral characters as one character each', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'm-1' }]);

      await expect(
        service.saveMessage(
          'user-1',
          'c-1',
          '😀'.repeat(ChatService.MAX_MESSAGE_LENGTH),
        ),
      ).resolves.toEqual({ id: 'm-1' });
      await expect(
        service.saveMessage(
          'user-1',
          'c-1',
          '😀'.repeat(ChatService.MAX_MESSAGE_LENGTH + 1),
        ),
      ).rejects.toThrow(new BadRequestException('message_too_long'));
    });

    it('rejects content longer than the message limit', async () => {
      await expect(
        service.saveMessage(
          'user-1',
          'c-1',
          'x'.repeat(ChatService.MAX_MESSAGE_LENGTH + 1),
        ),
      ).rejects.toThrow(new BadRequestException('message_too_long'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('listConversations', () => {
    it('maps name/type to title/conversationType and ignores deleted messages', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listConversations('user-42');

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(/c\.name AS title/);
      expect(sql).toMatch(/c\.type AS "conversationType"/);
      expect(sql).toMatch(/ORDER BY m\.sent_at DESC/);
      expect(sql).toMatch(/deleted_at IS NULL/);
      expect(sql).not.toMatch(/c\.title|conversation_type|m\.created_at/);
      // No conversation filter: every conversation of the caller
      expect(sql).toMatch(/\$2::uuid IS NULL OR c\.id = \$2/);
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['user-42', null]);
    });

    it('returns the rows unchanged', async () => {
      const convs = [
        { id: 'c-1', title: 'Team Chat', conversationType: 'group' },
      ];
      mockDataSource.query.mockResolvedValueOnce(convs);

      await expect(service.listConversations('user-1')).resolves.toEqual(convs);
    });
  });

  // Untitled direct chats are named after the other participant, and the list shows how
  // many messages arrived since the caller last read the conversation
  describe('conversation list details', () => {
    it('lists the other participants and the unread count', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listConversations('user-42');

      const sql = sqlOf(mockDataSource.query, 0);
      expect(sql).toMatch(/AS participants/);
      expect(sql).toMatch(/op\.user_id <> cp\.user_id/);
      expect(sql).toMatch(/AS "unreadCount"/);
      expect(sql).toMatch(/um\.sender_id <> cp\.user_id/);
      expect(sql).toMatch(
        /um\.sent_at > COALESCE\(cp\.last_read_at, '-infinity'\)/,
      );
    });
  });

  describe('markRead', () => {
    it("moves the caller's read marker to now", async () => {
      const readAt = new Date('2026-10-01T02:00:00Z');
      mockDataSource.query.mockResolvedValueOnce([
        [{ last_read_at: readAt }],
        1,
      ]);

      await expect(service.markRead('user-1', 'c-1')).resolves.toEqual({
        conversationId: 'c-1',
        readAt,
      });
      expect(sqlOf(mockDataSource.query, 0)).toMatch(
        /^\s*UPDATE conversation_participants SET last_read_at = now\(\)/,
      );
      expect(paramsOf(mockDataSource.query, 0)).toEqual(['c-1', 'user-1']);
    });

    it('refuses callers who are not participants', async () => {
      mockDataSource.query.mockResolvedValueOnce([[], 0]);

      await expect(service.markRead('outsider', 'c-1')).rejects.toThrow(
        new ForbiddenException('not_a_participant'),
      );
    });
  });

  describe('createConversation', () => {
    const summaryRow = {
      id: 'c-new',
      title: 'Tổ 1',
      conversationType: 'group',
      participants: [{ id: 'user-2' }, { id: 'user-3' }],
      unreadCount: 0,
    };

    // Flutter agent: the create answer had no participants, so clients could not name the
    // conversation they had just opened
    it('creates the conversation and every participant in one transaction, answering like the list', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'user-2' }, { id: 'user-3' }])
        .mockResolvedValueOnce([{ id: 'c-new' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([summaryRow]);

      const result = await service.createConversation(creator, {
        title: 'Tổ 1',
        conversationType: 'group',
        participantIds: ['user-2', 'user-3', 'user-2'],
      });

      expect(result).toEqual({ conversation: summaryRow, created: true });
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      // The other participants, checked against the creator's contact scope
      expect(mockContacts.scopeOf).toHaveBeenCalledWith(creator);
      expect(paramsOf(mockManager.query, 0)).toEqual([
        ['user-2', 'user-3'],
        ['KV2'],
        [],
      ]);

      expect(sqlOf(mockManager.query, 1)).toMatch(
        /INSERT INTO conversations\s*\(name, type, created_by, direct_key\)/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual([
        'Tổ 1',
        'group',
        'user-1',
        null,
      ]);

      expect(sqlOf(mockManager.query, 2)).toMatch(
        /INSERT INTO conversation_participants/,
      );
      expect(paramsOf(mockManager.query, 2)).toEqual([
        'c-new',
        ['user-1', 'user-2', 'user-3'],
      ]);

      // The summary the conversation list gives, read inside the same transaction
      expect(sqlOf(mockManager.query, 3)).toMatch(/AS participants/);
      expect(sqlOf(mockManager.query, 3)).toMatch(/AS "unreadCount"/);
      expect(paramsOf(mockManager.query, 3)).toEqual(['user-1', 'c-new']);
    });

    it('defaults to a direct conversation keyed by the sorted pair of ids', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'user-2' }])
        .mockResolvedValueOnce([{ id: 'c-new' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([summaryRow]);

      await service.createConversation(creator, {
        participantIds: ['user-2'],
      });

      expect(sqlOf(mockManager.query, 1)).toMatch(
        /ON CONFLICT \(direct_key\) WHERE direct_key IS NOT NULL DO NOTHING/,
      );
      expect(paramsOf(mockManager.query, 1)).toEqual([
        null,
        'direct',
        'user-1',
        'user-1:user-2',
      ]);
    });

    it('keys a pair the same whichever of the two opens it', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ id: 'c-new' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([summaryRow]);

      await service.createConversation(
        { ...creator, sub: 'user-2' },
        { participantIds: ['user-1'] },
      );

      expect(paramsOf(mockManager.query, 1)[3]).toBe('user-1:user-2');
    });

    // Flutter agent: a second direct conversation with the same person was opened
    it('returns the existing direct conversation of the pair instead of opening another', async () => {
      const existing = {
        ...summaryRow,
        id: 'c-old',
        title: null,
        conversationType: 'direct',
      };
      mockManager.query
        .mockResolvedValueOnce([{ id: 'user-2' }])
        // The pair already has its conversation: nothing is inserted
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'c-old' }])
        .mockResolvedValueOnce([existing]);

      await expect(
        service.createConversation(creator, { participantIds: ['user-2'] }),
      ).resolves.toEqual({ conversation: existing, created: false });

      expect(sqlOf(mockManager.query, 2)).toMatch(
        /SELECT id FROM conversations WHERE direct_key = \$1/,
      );
      expect(paramsOf(mockManager.query, 2)).toEqual(['user-1:user-2']);
      expect(
        callsOf(mockManager.query).some(([sql]) =>
          /INSERT INTO conversation_participants/.test(String(sql)),
        ),
      ).toBe(false);
      expect(paramsOf(mockManager.query, 3)).toEqual(['user-1', 'c-old']);
    });

    it.each([
      ['no other participant', ['user-1']],
      ['more than one other participant', ['user-2', 'user-3']],
    ])(
      'rejects a direct conversation with %s',
      async (_label, participantIds) => {
        await expect(
          service.createConversation(creator, {
            conversationType: 'direct',
            participantIds,
          }),
        ).rejects.toThrow(
          new BadRequestException(
            'direct_conversation_requires_one_participant',
          ),
        );
        expect(mockDataSource.transaction).not.toHaveBeenCalled();
      },
    );

    it('rejects participants that do not exist and creates nothing', async () => {
      mockManager.query.mockResolvedValueOnce([{ id: 'user-1' }]);

      await expect(
        service.createConversation(creator, {
          conversationType: 'group',
          participantIds: ['ghost'],
        }),
      ).rejects.toThrow(new BadRequestException('participant_not_found'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    // GET /users/search offers exactly the people this check accepts (ContactPolicy): an
    // inactive account or someone outside the creator's scope is answered like an unknown id
    it('only adds active accounts inside the creator contact scope', async () => {
      mockManager.query.mockResolvedValueOnce([]);

      await service
        .createConversation(creator, { participantIds: ['user-2'] })
        .catch(() => undefined);

      const sql = sqlOf(mockManager.query, 0);
      expect(sql).toMatch(/u\.id = ANY\(\$1::uuid\[\]\)/);
      expect(sql).toMatch(/u\.status = 'active'/);
      expect(sql).toMatch(/unnest\(\$2::text\[\]\) AS cu\(code\)/);
      expect(sql).toMatch(/u\.id = ANY\(\$3::uuid\[\]\)/);
    });

    it('refuses a participant outside the creator scope and creates nothing', async () => {
      // user-3 is filtered out by the scope condition
      mockManager.query.mockResolvedValueOnce([{ id: 'user-2' }]);

      await expect(
        service.createConversation(creator, {
          conversationType: 'group',
          participantIds: ['user-2', 'user-3'],
        }),
      ).rejects.toThrow(new BadRequestException('participant_not_found'));
      expect(mockManager.query).toHaveBeenCalledTimes(1);
    });

    it('propagates a scope refusal before opening a transaction', async () => {
      mockContacts.scopeOf.mockRejectedValueOnce(
        new ForbiddenException('no_unit_scope'),
      );

      await expect(
        service.createConversation(
          { sub: 'p', role: 'police_area', unitScope: null },
          { participantIds: ['user-2'] },
        ),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('lets a creator open a group with nobody else without checking anyone', async () => {
      mockManager.query
        .mockResolvedValueOnce([{ id: 'c-new' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([summaryRow]);

      await service.createConversation(creator, {
        conversationType: 'group',
        participantIds: [],
      });

      expect(sqlOf(mockManager.query, 0)).toMatch(/INSERT INTO conversations/);
    });
  });

  describe('isMember', () => {
    it('returns true when user is a participant', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ 1: 1 }]);

      await expect(service.isMember('user-1', 'c-1')).resolves.toBe(true);
    });

    it('returns false when user is not a participant', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.isMember('outsider', 'c-1')).resolves.toBe(false);
    });
  });

  describe('getMessages', () => {
    it('returns non-deleted messages newest first with createdAt from sent_at', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }])
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([{ id: 'm-1', content: 'Hi' }]);

      const result = await service.getMessages('user-1', 'c-1', 1, 50);

      expect(result).toEqual({
        data: [{ id: 'm-1', content: 'Hi' }],
        total: 5,
        page: 1,
        limit: 50,
      });
      expect(sqlOf(mockDataSource.query, 1)).toMatch(/deleted_at IS NULL/);
      const sql = sqlOf(mockDataSource.query, 2);
      expect(sql).toMatch(/m\.sent_at AS "createdAt"/);
      expect(sql).toMatch(/ORDER BY m\.sent_at DESC/);
      expect(sql).toMatch(/deleted_at IS NULL/);
      expect(sql).not.toMatch(/created_at/);
    });

    it('throws ForbiddenException when user is not a participant', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.getMessages('outsider', 'c-1', 1, 50),
      ).rejects.toThrow(ForbiddenException);
    });

    it('caps limit at 200', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ 1: 1 }])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.getMessages('user-1', 'c-1', 1, 999);

      expect(paramsOf(mockDataSource.query, 2)[1]).toBe(200);
    });
  });
});

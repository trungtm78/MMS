import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getConversations,
  getOrCreateDirectConversation,
  getMessages,
  createMessage,
  markConversationRead,
} from './chat.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

describe('chat.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getConversations ──────────────────────────────────────────────────────

  describe('getConversations', () => {
    it('returns list of conversations with participants and unread count', async () => {
      const convRows = [
        { id: 'conv-1', type: 'direct', name: null, last_content: 'Hello', last_sent_at: new Date() },
      ];
      const participants = [
        { userId: 'user-1', username: 'user1', fullName: 'User One', avatarUrl: null },
        { userId: 'user-2', username: 'user2', fullName: 'User Two', avatarUrl: null },
      ];

      mockQueryMany
        .mockResolvedValueOnce(convRows)       // conversation rows
        .mockResolvedValueOnce(participants);   // participants for conv-1
      mockQueryOne.mockResolvedValueOnce({ count: '3' }); // unread count

      const result = await getConversations('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('conv-1');
      expect(result[0].unreadCount).toBe(3);
      expect(result[0].participants).toHaveLength(2);
    });

    it('returns empty array when user has no conversations', async () => {
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getConversations('user-1');

      expect(result).toEqual([]);
    });
  });

  // ─── getOrCreateDirectConversation ────────────────────────────────────────

  describe('getOrCreateDirectConversation', () => {
    it('returns existing conversation id when one exists', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 'conv-existing' });

      const id = await getOrCreateDirectConversation('user-1', 'user-2');

      expect(id).toBe('conv-existing');
      expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });

    it('creates new conversation and adds participants when none exists', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)                  // no existing
        .mockResolvedValueOnce({ id: 'conv-new' })    // INSERT conversations
        .mockResolvedValueOnce(undefined);             // INSERT participants

      const id = await getOrCreateDirectConversation('user-1', 'user-2');

      expect(id).toBe('conv-new');
      expect(mockQueryOne).toHaveBeenCalledTimes(3);
    });
  });

  // ─── getMessages ──────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('returns paginated messages and updates last_read_at', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ '1': 1 })      // participant check (truthy)
        .mockResolvedValueOnce({ count: '2' })   // total count
        .mockResolvedValueOnce(undefined);        // update last_read_at

      mockQueryMany.mockResolvedValueOnce([
        {
          id: 'msg-1',
          conversation_id: 'conv-1',
          sender_id: 'user-2',
          sender_name: 'User Two',
          sender_avatar: null,
          content: 'Hi there',
          message_type: 'text',
          metadata: null,
          sent_at: new Date(),
          edited_at: null,
        },
      ]);

      const result = await getMessages('conv-1', 'user-1', { page: 1, limit: 50 });

      expect(result.total).toBe(2);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Hi there');
    });

    it('throws when user is not a participant', async () => {
      mockQueryOne.mockResolvedValueOnce(null); // not a participant

      await expect(
        getMessages('conv-1', 'user-outsider', { page: 1, limit: 50 })
      ).rejects.toThrow('Không có quyền truy cập cuộc trò chuyện này');
    });
  });

  // ─── createMessage ────────────────────────────────────────────────────────

  describe('createMessage', () => {
    it('inserts message and returns it with sender info', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ '1': 1 }) // participant check
        .mockResolvedValueOnce({            // INSERT message
          id: 'msg-new',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: 'Hello',
          message_type: 'text',
          metadata: null,
          sent_at: new Date(),
        })
        .mockResolvedValueOnce({ full_name: 'User One', avatar_url: null }) // sender info
        .mockResolvedValueOnce(undefined); // UPDATE conversations

      const result = await createMessage('conv-1', 'user-1', 'Hello');

      expect(result.id).toBe('msg-new');
      expect(result.senderName).toBe('User One');
      expect(result.content).toBe('Hello');
      expect(result.editedAt).toBeNull();
    });

    it('throws when sender is not a participant', async () => {
      mockQueryOne.mockResolvedValueOnce(null); // not a participant

      await expect(
        createMessage('conv-1', 'outsider', 'Hack')
      ).rejects.toThrow('Không có quyền gửi tin nhắn');
    });
  });

  // ─── markConversationRead ─────────────────────────────────────────────────

  describe('markConversationRead', () => {
    it('updates last_read_at for the user in the conversation', async () => {
      mockQueryOne.mockResolvedValueOnce(undefined);

      await markConversationRead('conv-1', 'user-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE conversation_participants'),
        ['conv-1', 'user-1']
      );
    });
  });
});

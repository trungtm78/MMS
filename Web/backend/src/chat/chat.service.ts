import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ChatService {
  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
  ) {}

  async saveMessage(
    senderId: string,
    conversationId: string,
    content: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `INSERT INTO messages(conversation_id, sender_id, content, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId",
                 content, created_at AS "createdAt"`,
      [conversationId, senderId, content],
    );
    return rows[0];
  }

  async listConversations(userId: string): Promise<unknown[]> {
    return this.ds.query(
      `SELECT c.id, c.title, c.conversation_type AS "conversationType",
              c.created_at AS "createdAt",
              (SELECT content FROM messages m WHERE m.conversation_id = c.id
               ORDER BY m.created_at DESC LIMIT 1) AS "lastMessage",
              (SELECT created_at FROM messages m WHERE m.conversation_id = c.id
               ORDER BY m.created_at DESC LIMIT 1) AS "lastMessageAt"
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       WHERE cp.user_id = $1
       ORDER BY "lastMessageAt" DESC NULLS LAST`,
      [userId],
    );
  }

  async createConversation(
    creatorId: string,
    dto: { title?: string; participantIds: string[]; conversationType?: string },
  ): Promise<Record<string, unknown>> {
    const conversationType = dto.conversationType ?? 'direct';
    const rows = await this.ds.query<Record<string, unknown>[]>(
      `INSERT INTO conversations(title, conversation_type, created_by, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, title, conversation_type AS "conversationType", created_at AS "createdAt"`,
      [dto.title ?? null, conversationType, creatorId],
    );
    const conv = rows[0];
    const allParticipants = [...new Set([creatorId, ...dto.participantIds])];
    for (const pid of allParticipants) {
      await this.ds.query(
        `INSERT INTO conversation_participants(conversation_id, user_id, joined_at)
         VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
        [conv['id'], pid],
      );
    }
    return conv;
  }

  async isMember(userId: string, conversationId: string): Promise<boolean> {
    const rows = await this.ds.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2`,
      [conversationId, userId],
    );
    return rows.length > 0;
  }

  async getMessages(
    userId: string,
    conversationId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    // S1 IDOR fix: verify caller is a participant before returning messages
    const membership = await this.ds.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2`,
      [conversationId, userId],
    );
    if (!membership.length) throw new ForbiddenException('not_a_participant');

    const safLimit = Math.min(Math.max(1, limit), 200);
    const offset = (Math.max(1, page) - 1) * safLimit;

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1`,
      [conversationId],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query(
      `SELECT m.id, m.sender_id AS "senderId", u.username AS "senderName",
              m.content, m.created_at AS "createdAt"
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, safLimit, offset],
    );
    return { data, total, page, limit: safLimit };
  }
}

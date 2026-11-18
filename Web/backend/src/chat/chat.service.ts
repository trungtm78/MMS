import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { queryRows } from '../database/query-rows';
import {
  ContactPolicy,
  contactScopeSql,
  type ContactActor,
} from '../users/contact-policy';

// conversations.type CHECK constraint (migration 009)
export const CONVERSATION_TYPES = ['direct', 'group'] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export interface CreateConversationInput {
  title?: string;
  participantIds: string[];
  conversationType?: ConversationType;
}

export interface CreatedConversation {
  /** The conversation as the caller's conversation list shows it */
  conversation: Record<string, unknown>;
  /** false when the pair already had a direct conversation, which is returned instead */
  created: boolean;
}

type Queryable = Pick<DataSource | EntityManager, 'query'>;

// API field names (title, conversationType, createdAt) are mapped from the
// migration 009 columns (name, type, sent_at) here and nowhere else.
@Injectable()
export class ChatService {
  static readonly MAX_MESSAGE_LENGTH = 4000;

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly contacts: ContactPolicy,
  ) {}

  async saveMessage(
    senderId: string,
    conversationId: string,
    content: string,
  ): Promise<Record<string, unknown>> {
    const text = content.trim();
    if (!text) throw new BadRequestException('message_content_required');
    // Characters as users see them (code points), like the request DTO's @MaxLength
    if (Array.from(text).length > ChatService.MAX_MESSAGE_LENGTH) {
      throw new BadRequestException('message_too_long');
    }

    const rows = await this.ds.query<Record<string, unknown>[]>(
      `WITH inserted AS (
         INSERT INTO messages (conversation_id, sender_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, conversation_id, sender_id, content, sent_at
       )
       SELECT i.id, i.conversation_id AS "conversationId", i.sender_id AS "senderId",
              u.username AS "senderName", i.content, i.sent_at AS "createdAt"
       FROM inserted i
       JOIN users u ON u.id = i.sender_id`,
      [conversationId, senderId, text],
    );
    return rows[0];
  }

  async listConversations(userId: string): Promise<unknown[]> {
    return this.conversationSummaries(this.ds, userId);
  }

  // The caller's conversations, or one of them. participants: everyone in the conversation
  // except the caller, so untitled direct chats can be named; unreadCount: messages from
  // others since the caller last read it
  private conversationSummaries(
    runner: Queryable,
    userId: string,
    conversationId: string | null = null,
  ): Promise<Record<string, unknown>[]> {
    return runner.query<Record<string, unknown>[]>(
      `SELECT c.id, c.name AS title, c.type AS "conversationType",
              c.created_at AS "createdAt",
              lm.content AS "lastMessage", lm.sent_at AS "lastMessageAt",
              COALESCE(parts.participants, '[]'::json) AS participants,
              unread.count AS "unreadCount"
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       LEFT JOIN LATERAL (
         SELECT m.content, m.sent_at
         FROM messages m
         WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
         ORDER BY m.sent_at DESC
         LIMIT 1
       ) lm ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object('id', ou.id, 'fullName', ou.full_name, 'username', ou.username)
                  ORDER BY ou.full_name
                ) AS participants
         FROM conversation_participants op
         JOIN users ou ON ou.id = op.user_id
         WHERE op.conversation_id = c.id AND op.user_id <> cp.user_id
       ) parts ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS count
         FROM messages um
         WHERE um.conversation_id = c.id AND um.deleted_at IS NULL
           AND um.sender_id <> cp.user_id
           AND um.sent_at > COALESCE(cp.last_read_at, '-infinity')
       ) unread ON true
       WHERE cp.user_id = $1
         AND ($2::uuid IS NULL OR c.id = $2)
       ORDER BY COALESCE(lm.sent_at, c.created_at) DESC`,
      [userId, conversationId],
    );
  }

  async markRead(
    userId: string,
    conversationId: string,
  ): Promise<{ conversationId: string; readAt: Date }> {
    const rows = await queryRows<{ last_read_at: Date }>(
      this.ds,
      `UPDATE conversation_participants SET last_read_at = now()
       WHERE conversation_id = $1 AND user_id = $2
       RETURNING last_read_at`,
      [conversationId, userId],
    );
    if (!rows.length) throw new ForbiddenException('not_a_participant');
    return { conversationId, readAt: rows[0].last_read_at };
  }

  // Every other participant must be an active account the creator may reach
  // (ContactPolicy, the rule GET /users/search lists by). Unknown, inactive and
  // out-of-scope ids answer alike, so the directory cannot be probed through chat.
  // A direct conversation is one per pair of people (migration 031): opening it again, from
  // either side, returns the existing one, as messaging apps do.
  async createConversation(
    creator: ContactActor,
    dto: CreateConversationInput,
  ): Promise<CreatedConversation> {
    const creatorId = creator.sub;
    const type = dto.conversationType ?? 'direct';
    const members = [...new Set([creatorId, ...dto.participantIds])];
    if (type === 'direct' && members.length !== 2) {
      throw new BadRequestException(
        'direct_conversation_requires_one_participant',
      );
    }
    const others = members.filter((id) => id !== creatorId);
    const scope = await this.contacts.scopeOf(creator);
    // The pair's two ids sorted, so both people key the same conversation
    const directKey = type === 'direct' ? [...members].sort().join(':') : null;

    return this.ds.transaction(async (mgr) => {
      if (others.length > 0) {
        const found = await mgr.query<{ id: string }[]>(
          `SELECT u.id FROM users u
           WHERE u.id = ANY($1::uuid[])
             AND u.status = 'active'
             AND ${contactScopeSql('u.id', '$2', '$3')}`,
          [others, scope.units, scope.userIds],
        );
        const reachable = new Set(found.map((row) => row.id));
        if (!others.every((id) => reachable.has(id))) {
          throw new BadRequestException('participant_not_found');
        }
      }

      const { id, created } = await this.openConversation(mgr, {
        title: dto.title?.trim() || null,
        type,
        creatorId,
        members,
        directKey,
      });
      const [conversation] = await this.conversationSummaries(
        mgr,
        creatorId,
        id,
      );
      return { conversation, created };
    });
  }

  // Inserts the conversation and its participants, unless the pair's direct conversation
  // exists; the unique key makes concurrent openings of one pair agree on a single row
  private async openConversation(
    mgr: EntityManager,
    input: {
      title: string | null;
      type: ConversationType;
      creatorId: string;
      members: string[];
      directKey: string | null;
    },
  ): Promise<{ id: string; created: boolean }> {
    const inserted = await mgr.query<{ id: string }[]>(
      `INSERT INTO conversations (name, type, created_by, direct_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (direct_key) WHERE direct_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [input.title, input.type, input.creatorId, input.directKey],
    );
    if (inserted.length === 0) {
      const [existing] = await mgr.query<{ id: string }[]>(
        `SELECT id FROM conversations WHERE direct_key = $1`,
        [input.directKey],
      );
      return { id: existing.id, created: false };
    }

    await mgr.query(
      `INSERT INTO conversation_participants (conversation_id, user_id)
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [inserted[0].id, input.members],
    );
    return { id: inserted[0].id, created: true };
  }

  async isMember(userId: string, conversationId: string): Promise<boolean> {
    const rows = await this.ds.query<unknown[]>(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
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
    if (!(await this.isMember(userId, conversationId))) {
      throw new ForbiddenException('not_a_participant');
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (safePage - 1) * safeLimit;

    const countRows = await this.ds.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count
       FROM messages
       WHERE conversation_id = $1 AND deleted_at IS NULL`,
      [conversationId],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.ds.query<unknown[]>(
      `SELECT m.id, m.sender_id AS "senderId", u.username AS "senderName",
              m.content, m.sent_at AS "createdAt"
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.sent_at DESC
       LIMIT $2 OFFSET $3`,
      [conversationId, safeLimit, offset],
    );
    return { data, total, page: safePage, limit: safeLimit };
  }
}

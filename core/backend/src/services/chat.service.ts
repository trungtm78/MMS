import { queryOne, queryMany } from '../db/pool';

export interface Conversation {
  id: string;
  type: string;
  name: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  participants: ConversationParticipant[];
}

export interface ConversationParticipant {
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  messageType: string;
  metadata: Record<string, unknown> | null;
  sentAt: Date;
  editedAt: Date | null;
}

// ─── Conversations ─────────────────────────────────────────────────────────

export async function getConversations(userId: string): Promise<Conversation[]> {
  const rows = await queryMany<{
    id: string;
    type: string;
    name: string | null;
    last_content: string | null;
    last_sent_at: Date | null;
  }>(
    `SELECT DISTINCT c.id, c.type, c.name,
       (SELECT m.content FROM messages m
        WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
        ORDER BY m.sent_at DESC LIMIT 1) AS last_content,
       (SELECT m.sent_at FROM messages m
        WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
        ORDER BY m.sent_at DESC LIMIT 1) AS last_sent_at
     FROM conversations c
     JOIN conversation_participants cp ON c.id = cp.conversation_id
     WHERE cp.user_id = $1
     ORDER BY last_sent_at DESC NULLS LAST`,
    [userId]
  );

  const conversations: Conversation[] = [];

  for (const row of rows) {
    const participants = await queryMany<ConversationParticipant>(
      `SELECT u.id AS "userId", u.username, u.full_name AS "fullName", u.avatar_url AS "avatarUrl"
       FROM users u
       JOIN conversation_participants cp ON u.id = cp.user_id
       WHERE cp.conversation_id = $1`,
      [row.id]
    );

    const unreadRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
       WHERE m.conversation_id = $1
         AND m.sender_id != $2
         AND m.deleted_at IS NULL
         AND (cp.last_read_at IS NULL OR m.sent_at > cp.last_read_at)
         AND cp.user_id = $2`,
      [row.id, userId]
    );

    conversations.push({
      id: row.id,
      type: row.type,
      name: row.name,
      lastMessage: row.last_content,
      lastMessageAt: row.last_sent_at,
      unreadCount: parseInt(unreadRow?.count ?? '0', 10),
      participants,
    });
  }

  return conversations;
}

export async function getOrCreateDirectConversation(
  userIdA: string,
  userIdB: string
): Promise<string> {
  // Find existing direct conversation between these two users
  const existing = await queryOne<{ id: string }>(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = $1
     JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = $2
     WHERE c.type = 'direct'
     LIMIT 1`,
    [userIdA, userIdB]
  );
  if (existing) return existing.id;

  // Create new
  const newConv = await queryOne<{ id: string }>(
    `INSERT INTO conversations (type, created_by) VALUES ('direct', $1) RETURNING id`,
    [userIdA]
  );
  const convId = newConv!.id;

  await queryOne(
    `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
    [convId, userIdA, userIdB]
  );

  return convId;
}

// ─── Messages ──────────────────────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  userId: string,
  { page = 1, limit = 50 }: { page?: number; limit?: number }
): Promise<{ messages: Message[]; total: number }> {
  // Ensure user is a participant
  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  if (!participant) throw new Error('Không có quyền truy cập cuộc trò chuyện này');

  const offset = (page - 1) * limit;

  const totalRow = await queryOne<{ count: string }>(
    'SELECT COUNT(*) AS count FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL',
    [conversationId]
  );
  const total = parseInt(totalRow?.count ?? '0', 10);

  const rows = await queryMany<{
    id: string;
    conversation_id: string;
    sender_id: string;
    sender_name: string;
    sender_avatar: string | null;
    content: string;
    message_type: string;
    metadata: Record<string, unknown> | null;
    sent_at: Date;
    edited_at: Date | null;
  }>(
    `SELECT m.id, m.conversation_id, m.sender_id,
       u.full_name AS sender_name, u.avatar_url AS sender_avatar,
       m.content, m.message_type, m.metadata, m.sent_at, m.edited_at
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.sent_at DESC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );

  // Update last_read_at
  await queryOne(
    `UPDATE conversation_participants SET last_read_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );

  return {
    messages: rows.reverse().map(r => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderAvatar: r.sender_avatar,
      content: r.content,
      messageType: r.message_type,
      metadata: r.metadata,
      sentAt: r.sent_at,
      editedAt: r.edited_at,
    })),
    total,
  };
}

export async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
  messageType = 'text',
  metadata?: Record<string, unknown>
): Promise<Message> {
  // Ensure sender is a participant
  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, senderId]
  );
  if (!participant) throw new Error('Không có quyền gửi tin nhắn');

  const row = await queryOne<{
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type: string;
    metadata: Record<string, unknown> | null;
    sent_at: Date;
  }>(
    `INSERT INTO messages (conversation_id, sender_id, content, message_type, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, conversation_id, sender_id, content, message_type, metadata, sent_at`,
    [conversationId, senderId, content, messageType, metadata ? JSON.stringify(metadata) : null]
  );

  const user = await queryOne<{ full_name: string; avatar_url: string | null }>(
    'SELECT full_name, avatar_url FROM users WHERE id = $1',
    [senderId]
  );

  // Update conversation updated_at
  await queryOne(
    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
    [conversationId]
  );

  return {
    id: row!.id,
    conversationId: row!.conversation_id,
    senderId: row!.sender_id,
    senderName: user?.full_name ?? '',
    senderAvatar: user?.avatar_url ?? null,
    content: row!.content,
    messageType: row!.message_type,
    metadata: row!.metadata,
    sentAt: row!.sent_at,
    editedAt: null,
  };
}

export async function markConversationRead(
  conversationId: string,
  userId: string
): Promise<void> {
  await queryOne(
    `UPDATE conversation_participants SET last_read_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
}

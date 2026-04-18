import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryMany } from '../db/pool';

export type NotificationType = 'task' | 'attendance' | 'leave' | 'incident' | 'kpi' | 'system' | 'message';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  senderId: string | null;
  senderName: string | null;
  readAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

export async function getNotifications(
  userId: string,
  options?: { unreadOnly?: boolean; type?: NotificationType; page?: number; limit?: number }
): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
  const { unreadOnly, type, page = 1, limit = 20 } = options || {};
  const offset = (page - 1) * limit;

  const conditions = ['nr.user_id = $1'];
  const values: unknown[] = [userId];
  let paramCount = 2;

  if (unreadOnly) {
    conditions.push(`nr.read_at IS NULL`);
  }
  if (type) {
    conditions.push(`n.type = $${paramCount++}`);
    values.push(type);
  }

  // Get unread count
  const unreadResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count 
     FROM notification_receipts nr
     JOIN notifications n ON nr.notification_id = n.id
     WHERE nr.user_id = $1 AND nr.read_at IS NULL`,
    [userId]
  );
  const unreadCount = parseInt(unreadResult?.count || '0');

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count 
     FROM notification_receipts nr
     JOIN notifications n ON nr.notification_id = n.id
     WHERE ${conditions.join(' AND ')}`,
    values
  );
  const total = parseInt(countResult?.count || '0');

  // Get notifications
  const notifications = await queryMany<Notification>(
    `SELECT 
      n.id,
      n.type,
      n.title,
      n.body,
      n.payload_json as payload,
      n.sender_id,
      u.full_name as sender_name,
      nr.read_at,
      nr.delivered_at,
      n.created_at
    FROM notification_receipts nr
    JOIN notifications n ON nr.notification_id = n.id
    LEFT JOIN users u ON n.sender_id = u.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY n.created_at DESC
    LIMIT $${paramCount++} OFFSET $${paramCount++}`,
    [...values, limit, offset]
  );

  return {
    notifications: notifications.map(n => ({
      ...n,
      payload: n.payload as Record<string, unknown> | null,
    })),
    total,
    unreadCount,
  };
}

export async function markAsRead(userId: string, notificationId: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `UPDATE notification_receipts 
     SET read_at = NOW() 
     WHERE user_id = $1 AND notification_id = $2 AND read_at IS NULL
     RETURNING id`,
    [userId, notificationId]
  );

  return !!result;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await queryOne<{ count: string }>(
    `UPDATE notification_receipts 
     SET read_at = NOW() 
     WHERE user_id = $1 AND read_at IS NULL
     RETURNING COUNT(*)::text as count`,
    [userId]
  );

  return parseInt(result?.count || '0');
}

export async function createNotification(
  data: {
    type: NotificationType;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    senderId?: string;
    targetUserIds?: string[];
  }
): Promise<Notification> {
  const notificationId = uuidv4();

  const notification = await queryOne<Notification>(
    `INSERT INTO notifications (id, type, title, body, payload_json, sender_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      notificationId,
      data.type,
      data.title,
      data.body,
      JSON.stringify(data.payload || {}),
      data.senderId || null,
    ]
  );

  // Create receipts for target users
  if (data.targetUserIds && data.targetUserIds.length > 0) {
    for (const userId of data.targetUserIds) {
      await queryOne(
        `INSERT INTO notification_receipts (notification_id, user_id, delivered_at)
         VALUES ($1, $2, NOW())`,
        [notificationId, userId]
      );
    }
  }

  return notification!;
}

export async function createNotificationForRole(
  data: {
    type: NotificationType;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    senderId?: string;
    targetRoles: string[];
  }
): Promise<Notification> {
  const notificationId = uuidv4();

  const notification = await queryOne<Notification>(
    `INSERT INTO notifications (id, type, title, body, payload_json, sender_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      notificationId,
      data.type,
      data.title,
      data.body,
      JSON.stringify(data.payload || {}),
      data.senderId || null,
    ]
  );

  // Get users with target roles
  const users = await queryMany<{ user_id: string }>(
    `SELECT DISTINCT ur.user_id 
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE r.code = ANY($1)`,
    [data.targetRoles]
  );

  // Create receipts for users
  for (const user of users) {
    await queryOne(
      `INSERT INTO notification_receipts (notification_id, user_id, delivered_at)
       VALUES ($1, $2, NOW())`,
      [notificationId, user.user_id]
    );
  }

  return notification!;
}

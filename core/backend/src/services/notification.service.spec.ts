import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  createNotification,
  createNotificationForRole,
} from './notification.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('mock-notif-uuid') }));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

const baseNotification = {
  id: 'notif-1',
  type: 'task' as const,
  title: 'Task Assigned',
  body: 'You have a new task',
  payload: null,
  sender_id: 'user-2',
  sender_name: 'Manager A',
  read_at: null,
  delivered_at: new Date(),
  created_at: new Date('2026-01-15'),
};

describe('notification.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getNotifications ─────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('returns notifications with total and unreadCount', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '5' })  // unread count
        .mockResolvedValueOnce({ count: '10' }); // total count
      mockQueryMany.mockResolvedValueOnce([baseNotification]);

      const result = await getNotifications('user-1');

      expect(result.unreadCount).toBe(5);
      expect(result.total).toBe(10);
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].id).toBe('notif-1');
    });

    it('applies unreadOnly filter', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '3' })
        .mockResolvedValueOnce({ count: '3' });
      mockQueryMany.mockResolvedValueOnce([]);

      await getNotifications('user-1', { unreadOnly: true });

      const totalCountSql = mockQueryOne.mock.calls[1][0] as string;
      expect(totalCountSql).toContain('read_at IS NULL');
    });

    it('returns empty notifications when none exist', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' })
        .mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getNotifications('user-1');

      expect(result.notifications).toEqual([]);
      expect(result.unreadCount).toBe(0);
    });
  });

  // ─── markAsRead ───────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('returns true when notification is marked as read', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 'notif-1' });

      const result = await markAsRead('user-1', 'notif-1');

      expect(result).toBe(true);
    });

    it('returns false when notification not found or already read', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await markAsRead('user-1', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ─── markAllAsRead ────────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('returns count of marked notifications', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '7' });

      const count = await markAllAsRead('user-1');

      expect(count).toBe(7);
    });

    it('returns 0 when no unread notifications', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });

      const count = await markAllAsRead('user-1');

      expect(count).toBe(0);
    });
  });

  // ─── createNotification ───────────────────────────────────────────────────

  describe('createNotification', () => {
    it('creates notification and receipts for target users', async () => {
      mockQueryOne
        .mockResolvedValueOnce(baseNotification) // INSERT notifications
        .mockResolvedValueOnce(undefined)         // INSERT receipt for user-1
        .mockResolvedValueOnce(undefined);        // INSERT receipt for user-2

      const result = await createNotification({
        type: 'task',
        title: 'Task Assigned',
        body: 'You have a new task',
        targetUserIds: ['user-1', 'user-2'],
        senderId: 'manager-1',
      });

      expect(result.id).toBe('notif-1');
      expect(mockQueryOne).toHaveBeenCalledTimes(3);
    });

    it('creates notification without receipts when no target users', async () => {
      mockQueryOne.mockResolvedValueOnce(baseNotification);

      const result = await createNotification({
        type: 'system',
        title: 'System Notice',
        body: 'Maintenance scheduled',
      });

      expect(result.id).toBe('notif-1');
      expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });
  });

  // ─── createNotificationForRole ─────────────────────────────────────────────

  describe('createNotificationForRole', () => {
    it('creates notification and sends to all users in role', async () => {
      mockQueryOne.mockResolvedValueOnce(baseNotification); // INSERT notification
      mockQueryMany.mockResolvedValueOnce([
        { user_id: 'user-1' },
        { user_id: 'user-2' },
      ]);
      mockQueryOne
        .mockResolvedValueOnce(undefined) // receipt for user-1
        .mockResolvedValueOnce(undefined); // receipt for user-2

      const result = await createNotificationForRole({
        type: 'leave',
        title: 'Leave Request',
        body: 'A leave request needs approval',
        targetRoles: ['commander'],
      });

      expect(result.id).toBe('notif-1');
      expect(mockQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('user_roles'),
        [['commander']]
      );
    });

    it('creates notification even when no users have the target role', async () => {
      mockQueryOne.mockResolvedValueOnce(baseNotification);
      mockQueryMany.mockResolvedValueOnce([]); // no users with role

      const result = await createNotificationForRole({
        type: 'system',
        title: 'Notice',
        body: 'Body',
        targetRoles: ['nonexistent_role'],
      });

      expect(result.id).toBe('notif-1');
      // No receipt inserts should be called
      expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });
  });
});

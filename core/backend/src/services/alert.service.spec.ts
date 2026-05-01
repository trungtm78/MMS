import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAlerts, resolveAlert } from './alert.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

describe('alert.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getAlerts ─────────────────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('returns paginated alert list with total and unreadCount', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '5' })   // total count
        .mockResolvedValueOnce({ count: '2' });   // unread count
      mockQueryMany.mockResolvedValueOnce([
        {
          id: 'alert-1',
          category: 'security',
          severity: 'high',
          title: 'Test Alert',
          message: 'Something happened',
          target_user_id: 'user-1',
          target_user_name: 'Nguyen Van A',
          status: 'active',
          created_at: new Date('2026-01-01'),
          resolved_at: null,
          resolve_note: null,
        },
      ]);

      const result = await getAlerts({ page: 1, limit: 10 });

      expect(result.total).toBe(5);
      expect(result.unreadCount).toBe(2);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('alert-1');
      expect(result.data[0].targetUserName).toBe('Nguyen Van A');
    });

    it('applies status filter when status is not "all"', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '1' })
        .mockResolvedValueOnce({ count: '1' });
      mockQueryMany.mockResolvedValueOnce([]);

      await getAlerts({ status: 'active', page: 1, limit: 10 });

      const firstCallSql = mockQueryOne.mock.calls[0][0] as string;
      expect(firstCallSql).toContain('COUNT');
      expect(mockQueryOne.mock.calls[0][1]).toContain('active');
    });

    it('ignores status filter when status is "all"', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' })
        .mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      await getAlerts({ status: 'all', page: 1, limit: 10 });

      const firstCallSql = mockQueryOne.mock.calls[0][0] as string;
      // WHERE clause should not include status filter
      expect(firstCallSql).not.toMatch(/a\.status = \$1/);
    });

    it('returns empty data array when no rows', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' })
        .mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getAlerts({ page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.unreadCount).toBe(0);
    });
  });

  // ─── resolveAlert ──────────────────────────────────────────────────────────

  describe('resolveAlert', () => {
    it('resolves an existing alert and returns updated AlertItem', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'alert-1' })  // SELECT id check
        .mockResolvedValueOnce({                    // UPDATE RETURNING
          id: 'alert-1',
          category: 'security',
          severity: 'high',
          title: 'Test',
          message: 'msg',
          related_entity_id: 'user-1',
          status: 'resolved',
          created_at: new Date('2026-01-01'),
          resolved_at: new Date('2026-01-02'),
        })
        .mockResolvedValueOnce({ full_name: 'Nguyen Van A' }); // user lookup

      const result = await resolveAlert('alert-1', 'resolver-user', 'Fixed');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('resolved');
      expect(result!.targetUserName).toBe('Nguyen Van A');
      expect(result!.resolveNote).toBe('Fixed');
    });

    it('returns null when alert does not exist', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await resolveAlert('nonexistent-id', 'user-1');

      expect(result).toBeNull();
    });

    it('returns null when update returns no row', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'alert-1' }) // SELECT finds alert
        .mockResolvedValueOnce(null);              // UPDATE returns nothing

      const result = await resolveAlert('alert-1', 'user-1');

      expect(result).toBeNull();
    });

    it('resolves alert without target user when related_entity_id is null', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'alert-1' })
        .mockResolvedValueOnce({
          id: 'alert-1',
          category: 'system',
          severity: 'low',
          title: 'System Alert',
          message: 'system msg',
          related_entity_id: null,
          status: 'resolved',
          created_at: new Date('2026-01-01'),
          resolved_at: new Date('2026-01-02'),
        });
      // no third call since related_entity_id is null

      const result = await resolveAlert('alert-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result!.targetUserName).toBeNull();
      expect(mockQueryOne).toHaveBeenCalledTimes(2);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertGpsLatest, getTeamGps } from './gps.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

describe('gps.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── upsertGpsLatest ──────────────────────────────────────────────────────

  describe('upsertGpsLatest', () => {
    it('upserts GPS location for a user with a militia profile', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'militia-1' }) // militia profile lookup
        .mockResolvedValueOnce(undefined);           // INSERT ... ON CONFLICT DO UPDATE

      await upsertGpsLatest('user-1', { lat: 10.5, lng: 106.5, accuracy: 5, speed: 0, battery: 80 });

      expect(mockQueryOne).toHaveBeenCalledTimes(2);
      const upsertCall = mockQueryOne.mock.calls[1];
      expect(upsertCall[0]).toContain('ON CONFLICT');
      expect(upsertCall[1]).toContain('militia-1');
    });

    it('does nothing when user has no militia profile', async () => {
      mockQueryOne.mockResolvedValueOnce(null); // no profile

      await upsertGpsLatest('user-no-profile', { lat: 10.5, lng: 106.5 });

      expect(mockQueryOne).toHaveBeenCalledTimes(1);
      // Second call (upsert) should NOT have been made
    });

    it('stores null for optional fields when not provided', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'militia-1' })
        .mockResolvedValueOnce(undefined);

      await upsertGpsLatest('user-1', { lat: 10.5, lng: 106.5 });

      const params = mockQueryOne.mock.calls[1][1] as unknown[];
      // accuracy, speed, battery should be null
      expect(params).toContain(null);
    });
  });

  // ─── getTeamGps ───────────────────────────────────────────────────────────

  describe('getTeamGps', () => {
    const now = new Date();
    const recentTime = new Date(now.getTime() - 30000); // 30 seconds ago (online)
    const oldTime = new Date(now.getTime() - 300000);   // 5 minutes ago (offline)

    const baseRow = {
      user_id: 'user-1',
      full_name: 'Nguyen Van A',
      militia_code: 'M001',
      lat: 10.5,
      lng: 106.5,
      accuracy: 5,
      speed: 0,
      battery: 80,
      last_seen_at: recentTime,
      task_id: null,
      task_title: null,
      task_type: null,
    };

    it('returns team members with online status for recent GPS updates', async () => {
      mockQueryMany.mockResolvedValueOnce([baseRow]);

      const result = await getTeamGps();

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].status).toBe('online');
      expect(result[0].currentTask).toBeNull();
    });

    it('marks member as moving when speed > 0.5 and recently seen', async () => {
      mockQueryMany.mockResolvedValueOnce([{ ...baseRow, speed: 10, last_seen_at: recentTime }]);

      const result = await getTeamGps();

      expect(result[0].status).toBe('moving');
    });

    it('marks member as offline when last seen > 2 minutes ago', async () => {
      mockQueryMany.mockResolvedValueOnce([{ ...baseRow, last_seen_at: oldTime }]);

      const result = await getTeamGps();

      expect(result[0].status).toBe('offline');
    });

    it('includes current task when task_id is present', async () => {
      mockQueryMany.mockResolvedValueOnce([
        { ...baseRow, task_id: 'task-1', task_title: 'Patrol North', task_type: 'patrol' },
      ]);

      const result = await getTeamGps();

      expect(result[0].currentTask).toEqual({
        id: 'task-1',
        title: 'Patrol North',
        type: 'patrol',
      });
    });

    it('marks member as offline when last_seen_at is null', async () => {
      mockQueryMany.mockResolvedValueOnce([{ ...baseRow, last_seen_at: null }]);

      const result = await getTeamGps();

      expect(result[0].status).toBe('offline');
    });

    it('returns empty array when no team members', async () => {
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getTeamGps();

      expect(result).toEqual([]);
    });
  });
});

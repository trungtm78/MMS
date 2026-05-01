import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCurrentKPI,
  getKPIHistory,
  getKPIRanking,
} from './kpi.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

vi.mock('./user.service', () => ({
  getMilitiaProfileByUserId: vi.fn(),
}));

import { queryOne, queryMany } from '../db/pool';
import { getMilitiaProfileByUserId } from './user.service';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);
const mockGetProfile = vi.mocked(getMilitiaProfileByUserId);

const baseKPIScore = {
  id: 'kpi-1',
  periodId: 'period-1',
  periodYear: 2026,
  periodMonth: 1,
  militiaId: 'militia-1',
  attendanceScore: 90,
  taskScore: 85,
  disciplineScore: 100,
  attitudeScore: 95,
  supervisorScore: 90,
  totalScore: 91.75,
  rank: 3,
  rankInUnit: 2,
  comments: null,
};

describe('kpi.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getCurrentKPI ────────────────────────────────────────────────────────

  describe('getCurrentKPI', () => {
    it('returns existing KPI score for current period', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce(baseKPIScore);

      const result = await getCurrentKPI('user-1');

      expect(result).not.toBeNull();
      expect(result!.totalScore).toBe(91.75);
      expect(result!.rank).toBe(3);
    });

    it('returns null when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await getCurrentKPI('user-no-profile');

      expect(result).toBeNull();
      expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('calculates and returns KPI when no existing score', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      // First queryOne: no existing score
      mockQueryOne.mockResolvedValueOnce(null);
      // calculateKPIScore: get or create period
      mockQueryOne.mockResolvedValueOnce({ id: 'period-1' });
      // attendance stats
      mockQueryOne.mockResolvedValueOnce({ total_days: '20', late_days: '2' });
      // task stats
      mockQueryOne.mockResolvedValueOnce({ total: '10', completed: '8', on_time: '7' });
      // INSERT or UPDATE kpi_scores RETURNING
      mockQueryOne.mockResolvedValueOnce(baseKPIScore);

      const result = await getCurrentKPI('user-1');

      expect(result).not.toBeNull();
      expect(result!.totalScore).toBe(91.75);
    });
  });

  // ─── getKPIHistory ────────────────────────────────────────────────────────

  describe('getKPIHistory', () => {
    it('returns paginated KPI history', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce({ count: '3' });
      mockQueryMany.mockResolvedValueOnce([baseKPIScore, { ...baseKPIScore, id: 'kpi-2' }]);

      const result = await getKPIHistory('user-1', { page: 1, limit: 12 });

      expect(result.total).toBe(3);
      expect(result.scores).toHaveLength(2);
    });

    it('returns empty result when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await getKPIHistory('user-no-profile');

      expect(result.scores).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns empty scores when militia has no KPI records', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getKPIHistory('user-1');

      expect(result.total).toBe(0);
      expect(result.scores).toHaveLength(0);
    });
  });

  // ─── getKPIRanking ────────────────────────────────────────────────────────

  describe('getKPIRanking', () => {
    it('returns ranking data with myRank, total, and topUsers', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne
        .mockResolvedValueOnce({ id: 'period-1' })        // period lookup
        .mockResolvedValueOnce({ rank: 3 })               // my score
        .mockResolvedValueOnce({ count: '25' });           // total count
      mockQueryMany.mockResolvedValueOnce([
        { rank: 1, militia_id: 'militia-2', militia_name: 'Tran Van B', militia_code: 'M002', total_score: 98 },
        { rank: 2, militia_id: 'militia-3', militia_name: 'Le Van C', militia_code: 'M003', total_score: 95 },
        { rank: 3, militia_id: 'militia-1', militia_name: 'Nguyen Van A', militia_code: 'M001', total_score: 91 },
      ]);

      const result = await getKPIRanking('user-1', 2026, 1);

      expect(result.myRank).toBe(3);
      expect(result.total).toBe(25);
      expect(result.topUsers).toHaveLength(3);
      const me = result.topUsers.find(u => u.militiaId === 'militia-1');
      expect(me?.isMe).toBe(true);
    });

    it('returns zero ranking when period not found', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce(null); // no period

      const result = await getKPIRanking('user-1', 2020, 1);

      expect(result.myRank).toBe(0);
      expect(result.total).toBe(0);
      expect(result.topUsers).toHaveLength(0);
    });

    it('returns zero ranking when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await getKPIRanking('user-no-profile');

      expect(result.myRank).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});

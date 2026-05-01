import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReport,
  getMyReports,
  getTeamReport,
} from './report.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

const baseReportRow = {
  id: 'report-1',
  user_id: 'user-1',
  report_type: 'daily',
  content: 'Today patrol completed',
  location: 'Zone A',
  images: [],
  status: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  created_at: new Date('2026-01-15'),
  updated_at: new Date('2026-01-15'),
};

describe('report.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── createReport ─────────────────────────────────────────────────────────

  describe('createReport', () => {
    it('creates a work report and returns mapped WorkReport', async () => {
      mockQueryOne.mockResolvedValueOnce(baseReportRow);

      const result = await createReport('user-1', {
        reportType: 'daily',
        content: 'Today patrol completed',
        location: 'Zone A',
        images: [],
      });

      expect(result.id).toBe('report-1');
      expect(result.userId).toBe('user-1');
      expect(result.status).toBe('pending');
      expect(result.images).toEqual([]);
    });

    it('throws when DB insert fails', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await expect(
        createReport('user-1', { reportType: 'daily', content: 'Test' })
      ).rejects.toThrow('Failed to create report');
    });

    it('sets images to empty array when not provided', async () => {
      mockQueryOne.mockResolvedValueOnce(baseReportRow);

      const result = await createReport('user-1', {
        reportType: 'daily',
        content: 'No images',
      });

      expect(result.images).toEqual([]);
    });
  });

  // ─── getMyReports ─────────────────────────────────────────────────────────

  describe('getMyReports', () => {
    it('returns paginated reports for the user', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '2' });
      mockQueryMany.mockResolvedValueOnce([baseReportRow, { ...baseReportRow, id: 'report-2' }]);

      const result = await getMyReports('user-1', { page: 1, limit: 10 });

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('report-1');
    });

    it('applies reportType filter when provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '1' });
      mockQueryMany.mockResolvedValueOnce([baseReportRow]);

      await getMyReports('user-1', { reportType: 'daily', page: 1, limit: 10 });

      const sql = mockQueryMany.mock.calls[0][0] as string;
      expect(sql).toContain('report_type');
    });

    it('returns empty data when no reports', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getMyReports('user-1', { page: 1, limit: 10 });

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getTeamReport ────────────────────────────────────────────────────────

  describe('getTeamReport', () => {
    const weeklyRow = { assigned: '5', completed: '4', overdue: '0' };
    const attWeeklyRow = { on_time: '4', late: '1', absent: '0' };

    it('returns complete TeamReportStats with task, attendance and kpi stats', async () => {
      // Task aggregation
      mockQueryMany
        .mockResolvedValueOnce([{ total_assigned: '10', completed: '8', on_time: '7', overdue: '1' }])
        // 4 weekly task breakdowns
        .mockResolvedValueOnce([weeklyRow])
        .mockResolvedValueOnce([weeklyRow])
        .mockResolvedValueOnce([weeklyRow])
        .mockResolvedValueOnce([weeklyRow])
        // Attendance aggregation
        .mockResolvedValueOnce([{ present: '18', late: '2', early_leave: '1', total_days: '20' }])
        // 4 weekly attendance breakdowns
        .mockResolvedValueOnce([attWeeklyRow])
        .mockResolvedValueOnce([attWeeklyRow])
        .mockResolvedValueOnce([attWeeklyRow])
        .mockResolvedValueOnce([attWeeklyRow])
        // KPI scores
        .mockResolvedValueOnce([
          { full_name: 'Nguyen Van A', militia_code: 'M001', total_score: 95 },
          { full_name: 'Tran Van B', militia_code: 'M002', total_score: 88 },
          { full_name: 'Le Van C', militia_code: 'M003', total_score: 65 }, // needs attention
        ]);

      const result = await getTeamReport({ year: 2026, month: 1 });

      expect(result.period).toEqual({ year: 2026, month: 1 });
      expect(result.taskStats.totalAssigned).toBe(10);
      expect(result.taskStats.completed).toBe(8);
      expect(result.taskStats.completionRate).toBe(80);
      expect(result.taskStats.trend).toHaveLength(4);
      expect(result.attendanceStats.avgPresentRate).toBe(90);
      expect(result.attendanceStats.breakdown).toHaveLength(4);
      expect(result.kpiStats.avgScore).toBeGreaterThan(0);
      expect(result.kpiStats.top5).toHaveLength(3);
      expect(result.kpiStats.needsAttention).toHaveLength(1);
      expect(result.kpiStats.needsAttention[0].score).toBe(65);
    });

    it('handles empty data gracefully (no tasks, no attendance, no kpi)', async () => {
      const emptyRow = { assigned: '0', completed: '0', overdue: '0' };
      const emptyAttRow = { on_time: '0', late: '0', absent: '0' };

      mockQueryMany
        .mockResolvedValueOnce([{ total_assigned: '0', completed: '0', on_time: '0', overdue: '0' }])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([{ present: '0', late: '0', early_leave: '0', total_days: '0' }])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([]);

      const result = await getTeamReport({ year: 2026, month: 1 });

      expect(result.taskStats.completionRate).toBe(0);
      expect(result.attendanceStats.avgPresentRate).toBe(0);
      expect(result.kpiStats.avgScore).toBe(0);
      expect(result.kpiStats.top5).toHaveLength(0);
    });

    it('computes kpi distribution correctly', async () => {
      const emptyRow = { assigned: '0', completed: '0', overdue: '0' };
      const emptyAttRow = { on_time: '0', late: '0', absent: '0' };

      mockQueryMany
        .mockResolvedValueOnce([{ total_assigned: '0', completed: '0', on_time: '0', overdue: '0' }])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([emptyRow])
        .mockResolvedValueOnce([{ present: '0', late: '0', early_leave: '0', total_days: '0' }])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([emptyAttRow])
        .mockResolvedValueOnce([
          { full_name: 'A', militia_code: 'M001', total_score: 95 },
          { full_name: 'B', militia_code: 'M002', total_score: 85 },
          { full_name: 'C', militia_code: 'M003', total_score: 75 },
          { full_name: 'D', militia_code: 'M004', total_score: 60 },
        ]);

      const result = await getTeamReport({ year: 2026, month: 1 });
      const dist = result.kpiStats.distribution;

      expect(dist.find(d => d.range === '90-100')?.count).toBe(1);
      expect(dist.find(d => d.range === '80-89')?.count).toBe(1);
      expect(dist.find(d => d.range === '70-79')?.count).toBe(1);
      expect(dist.find(d => d.range === '0-69')?.count).toBe(1);
    });
  });
});

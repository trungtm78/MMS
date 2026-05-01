import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getAttendanceStats,
} from './attendance.service';

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

describe('attendance.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── checkIn ───────────────────────────────────────────────────────────────

  describe('checkIn', () => {
    it('creates a check-in record and returns it', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne
        .mockResolvedValueOnce(null) // no existing record today
        .mockResolvedValueOnce({    // INSERT RETURNING
          id: 'att-1',
          militia_id: 'militia-1',
          task_id: null,
          work_date: new Date(),
          checkin_at: new Date(),
          checkin_lat: 10.5,
          checkin_lng: 106.5,
          checkin_accuracy: 10,
          checkin_location_name: null,
          checkout_at: null,
          checkout_lat: null,
          checkout_lng: null,
          checkout_accuracy: null,
          checkout_location_name: null,
          source: 'mobile',
          status: 'checked_in',
          work_hours: null,
          note: null,
        });

      const result = await checkIn('user-1', {
        location: { lat: 10.5, lng: 106.5, accuracy: 10 },
        source: 'mobile',
      });

      expect(result).not.toBeNull();
      expect(mockQueryOne).toHaveBeenCalledTimes(2);
    });

    it('returns null when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await checkIn('user-no-profile', {
        location: { lat: 10.5, lng: 106.5 },
      });

      expect(result).toBeNull();
      expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('throws when already checked in today', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce({ id: 'existing-att' }); // existing record

      await expect(
        checkIn('user-1', { location: { lat: 10.5, lng: 106.5 } })
      ).rejects.toThrow('Bạn đã điểm danh hôm nay rồi');
    });
  });

  // ─── checkOut ──────────────────────────────────────────────────────────────

  describe('checkOut', () => {
    it('updates check-out and returns record', async () => {
      const checkinTime = new Date();
      checkinTime.setHours(8, 0, 0, 0);

      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne
        .mockResolvedValueOnce({ id: 'att-1', checkin_at: checkinTime }) // find record
        .mockResolvedValueOnce({                                           // UPDATE RETURNING
          id: 'att-1',
          militia_id: 'militia-1',
          task_id: null,
          work_date: new Date(),
          checkin_at: checkinTime,
          checkin_lat: 10.5,
          checkin_lng: 106.5,
          checkin_accuracy: null,
          checkin_location_name: null,
          checkout_at: new Date(),
          checkout_lat: null,
          checkout_lng: null,
          checkout_accuracy: null,
          checkout_location_name: null,
          source: 'mobile',
          status: 'checked_out',
          work_hours: 8,
          note: null,
        });

      const result = await checkOut('user-1');

      expect(result).not.toBeNull();
      expect(mockQueryOne).toHaveBeenCalledTimes(2);
    });

    it('returns null when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await checkOut('user-no-profile');

      expect(result).toBeNull();
    });

    it('throws when no check-in record found for today', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce(null); // no record

      await expect(checkOut('user-1')).rejects.toThrow(
        'Không tìm thấy bản ghi điểm danh'
      );
    });
  });

  // ─── getTodayAttendance ────────────────────────────────────────────────────

  describe('getTodayAttendance', () => {
    it('returns the attendance record for today', async () => {
      const record = { id: 'att-1', militia_id: 'militia-1' };
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce(record);

      const result = await getTodayAttendance('user-1');

      expect(result).toEqual(record);
    });

    it('returns null when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await getTodayAttendance('user-no-profile');

      expect(result).toBeNull();
    });

    it('returns null when no record exists for today', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getTodayAttendance('user-1');

      expect(result).toBeNull();
    });
  });

  // ─── getAttendanceHistory ──────────────────────────────────────────────────

  describe('getAttendanceHistory', () => {
    it('returns paginated attendance history', async () => {
      const fakeRecords = [{ id: 'att-1' }, { id: 'att-2' }];
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce({ count: '2' });
      mockQueryMany.mockResolvedValueOnce(fakeRecords);

      const result = await getAttendanceHistory('user-1', { page: 1, limit: 10 });

      expect(result.total).toBe(2);
      expect(result.records).toHaveLength(2);
    });

    it('returns empty result when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await getAttendanceHistory('user-no-profile');

      expect(result.records).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ─── getAttendanceStats ────────────────────────────────────────────────────

  describe('getAttendanceStats', () => {
    it('returns calculated attendance stats', async () => {
      mockGetProfile.mockResolvedValueOnce({ id: 'militia-1' });
      mockQueryOne.mockResolvedValueOnce({
        total_days: '20',
        present_days: '18',
        late_days: '2',
        early_leave_days: '1',
        work_hours: '144',
      });

      const result = await getAttendanceStats('user-1', 2026, 1);

      expect(result.totalDays).toBe(20);
      expect(result.presentDays).toBe(18);
      expect(result.lateDays).toBe(2);
      expect(result.workHours).toBeCloseTo(144);
      expect(result.onTimeRate).toBeGreaterThan(0);
    });

    it('returns empty stats when user has no militia profile', async () => {
      mockGetProfile.mockResolvedValueOnce(null);

      const result = await getAttendanceStats('user-no-profile');

      expect(result.totalDays).toBe(0);
      expect(result.presentDays).toBe(0);
      expect(result.workHours).toBe(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as attendanceService from '../../src/services/attendance.service';
import * as pool from '../../src/db/pool';
import * as userService from '../../src/services/user.service';

vi.mock('../../src/db/pool');
vi.mock('../../src/services/user.service');

describe('Attendance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkIn', () => {
    it('should return null if user has no militia profile', async () => {
      vi.mocked(userService.getMilitiaProfileByUserId).mockResolvedValueOnce(null);
      
      const result = await attendanceService.checkIn('user-1', {
        location: { lat: 10.0, lng: 106.0 }
      });
      
      expect(result).toBeNull();
    });

    it('should throw error if already checked in today', async () => {
      vi.mocked(userService.getMilitiaProfileByUserId).mockResolvedValueOnce({ id: 'mp-1' });
      vi.mocked(pool.queryOne).mockResolvedValueOnce({ id: 'existing-record' });
      
      await expect(
        attendanceService.checkIn('user-1', { location: { lat: 10.0, lng: 106.0 } })
      ).rejects.toThrow('Bạn đã điểm danh hôm nay rồi');
    });

    it('should create check-in record successfully', async () => {
      const mockRecord = {
        id: 'record-1',
        militia_id: 'mp-1',
        task_id: null,
        work_date: '2026-03-04',
        checkin_at: new Date(),
        checkin_lat: 10.0,
        checkin_lng: 106.0,
        checkin_accuracy: 10,
        source: 'mobile',
        status: 'checked_in'
      };
      
      vi.mocked(userService.getMilitiaProfileByUserId).mockResolvedValueOnce({ id: 'mp-1' });
      vi.mocked(pool.queryOne)
        .mockResolvedValueOnce(null)  // no existing record
        .mockResolvedValueOnce(mockRecord);  // insert result
        
      const result = await attendanceService.checkIn('user-1', {
        location: { lat: 10.0, lng: 106.0, accuracy: 10 }
      });
      
      expect(result).not.toBeNull();
    });
  });

  describe('checkOut', () => {
    it('should throw error if no check-in record found', async () => {
      vi.mocked(userService.getMilitiaProfileByUserId).mockResolvedValueOnce({ id: 'mp-1' });
      vi.mocked(pool.queryOne).mockResolvedValueOnce(null);
      
      await expect(
        attendanceService.checkOut('user-1')
      ).rejects.toThrow('Không tìm thấy bản ghi điểm danh');
    });
  });

  describe('getAttendanceStats', () => {
    it('should return zeros when no profile found', async () => {
      vi.mocked(userService.getMilitiaProfileByUserId).mockResolvedValueOnce(null);
      
      const result = await attendanceService.getAttendanceStats('user-1', 2026, 3);
      
      expect(result.totalDays).toBe(0);
      expect(result.presentDays).toBe(0);
      expect(result.workHours).toBe(0);
    });
  });
});

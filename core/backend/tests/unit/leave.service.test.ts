import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as leaveService from '../../src/services/leave.service';
import * as pool from '../../src/db/pool';

vi.mock('../../src/db/pool');

describe('Leave Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateLeaveCode', () => {
    it('should generate code with correct format', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce({ count: '3' });
      
      const code = await leaveService.generateLeaveCode();
      
      expect(code).toMatch(/^NP-\d{4}\d{2}-\d{4}$/);
    });
  });

  describe('createLeaveRequest', () => {
    it('should create full-day leave request', async () => {
      const mockRequest = {
        id: 'leave-1',
        code: 'NP-202403-0001',
        requester_id: 'user-1',
        requester_name: 'Test User',
        leave_type_id: 'type-1',
        leave_type_name: 'Paid Leave',
        from_date: new Date('2026-03-10'),
        to_date: new Date('2026-03-11'),
        is_half_day: false,
        half_day_period: null,
        reason: 'Family matters',
        replacement_id: null,
        replacement_name: null,
        status: 'pending',
        total_days: 2,
        created_at: new Date()
      };
      
      vi.mocked(pool.queryOne)
        .mockResolvedValueOnce({ count: '0' })  // count for code
        .mockResolvedValueOnce(mockRequest);  // insert
        
      vi.mocked(pool.queryMany).mockResolvedValueOnce([]);
      
      const result = await leaveService.createLeaveRequest('user-1', {
        leaveTypeId: 'type-1',
        fromDate: new Date('2026-03-10'),
        toDate: new Date('2026-03-11'),
        reason: 'Family matters'
      });
      
      expect(result).not.toBeNull();
      expect(result.totalDays).toBe(2);
    });

    it('should create half-day leave request', async () => {
      const mockRequest = {
        id: 'leave-1',
        code: 'NP-202403-0001',
        requester_id: 'user-1',
        requester_name: 'Test User',
        leave_type_id: 'type-1',
        leave_type_name: 'Paid Leave',
        from_date: new Date('2026-03-10'),
        to_date: new Date('2026-03-10'),
        is_half_day: true,
        half_day_period: 'morning',
        reason: 'Medical appointment',
        replacement_id: null,
        replacement_name: null,
        status: 'pending',
        total_days: 0.5,
        created_at: new Date()
      };
      
      vi.mocked(pool.queryOne)
        .mockResolvedValueOnce({ count: '0' })
        .mockResolvedValueOnce(mockRequest);
        
      vi.mocked(pool.queryMany).mockResolvedValueOnce([]);
      
      const result = await leaveService.createLeaveRequest('user-1', {
        leaveTypeId: 'type-1',
        fromDate: new Date('2026-03-10'),
        toDate: new Date('2026-03-10'),
        isHalfDay: true,
        halfDayPeriod: 'morning',
        reason: 'Medical appointment'
      });
      
      expect(result.totalDays).toBe(0.5);
    });
  });

  describe('approveLeaveRequest', () => {
    it('should return null if request not found or not pending', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce(null);
      
      const result = await leaveService.approveLeaveRequest('leave-1', 'approver-1', 'approved');
      
      expect(result).toBeNull();
    });
  });
});

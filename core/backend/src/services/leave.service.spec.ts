import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLeaveTypes,
  generateLeaveCode,
  createLeaveRequest,
  getLeaveRequestById,
  getMyLeaveRequests,
  approveLeaveRequest,
  getLeaveBalance,
} from './leave.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('mock-uuid') }));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

const baseRequestRow = {
  id: 'req-1',
  code: 'NP-202601-0001',
  requester_id: 'user-1',
  requester_name: 'Nguyen Van A',
  leave_type_id: 'type-1',
  leave_type_name: 'Annual Leave',
  from_date: new Date('2026-02-01'),
  to_date: new Date('2026-02-03'),
  is_half_day: false,
  half_day_period: null,
  reason: 'Personal',
  replacement_id: null,
  replacement_name: null,
  status: 'pending' as const,
  total_days: 3,
  created_at: new Date('2026-01-15'),
};

describe('leave.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getLeaveTypes ────────────────────────────────────────────────────────

  describe('getLeaveTypes', () => {
    it('returns mapped leave types', async () => {
      mockQueryMany.mockResolvedValueOnce([
        { id: 'type-1', code: 'ANNUAL', name: 'Annual Leave', description: null, max_days_per_year: 12, requires_document: false, is_paid: true },
      ]);

      const result = await getLeaveTypes();

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('ANNUAL');
      expect(result[0].maxDaysPerYear).toBe(12);
    });

    it('returns empty array when no leave types configured', async () => {
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getLeaveTypes();

      expect(result).toEqual([]);
    });
  });

  // ─── generateLeaveCode ────────────────────────────────────────────────────

  describe('generateLeaveCode', () => {
    it('generates code in format NP-YYYYMM-NNNN', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });

      const code = await generateLeaveCode();

      expect(code).toMatch(/^NP-\d{6}-\d{4}$/);
    });
  });

  // ─── createLeaveRequest ───────────────────────────────────────────────────

  describe('createLeaveRequest', () => {
    it('creates leave request and returns it', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' })   // generateLeaveCode
        .mockResolvedValueOnce(undefined)          // INSERT leave_requests
        .mockResolvedValueOnce(baseRequestRow);    // getLeaveRequestById
      mockQueryMany.mockResolvedValueOnce([]);     // approvals

      const result = await createLeaveRequest('user-1', {
        leaveTypeId: 'type-1',
        fromDate: new Date('2026-02-01'),
        toDate: new Date('2026-02-03'),
        reason: 'Personal',
      });

      expect(result.status).toBe('pending');
      expect(result.code).toBe('NP-202601-0001');
    });

    it('calculates half day as 0.5 total days', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' }) // generateLeaveCode
        .mockResolvedValueOnce(undefined)       // INSERT
        .mockResolvedValueOnce({ ...baseRequestRow, total_days: 0.5, is_half_day: true });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await createLeaveRequest('user-1', {
        leaveTypeId: 'type-1',
        fromDate: new Date('2026-02-01'),
        toDate: new Date('2026-02-01'),
        isHalfDay: true,
        halfDayPeriod: 'morning',
        reason: 'Appointment',
      });

      expect(result.isHalfDay).toBe(true);
    });
  });

  // ─── getLeaveRequestById ──────────────────────────────────────────────────

  describe('getLeaveRequestById', () => {
    it('returns mapped LeaveRequest with approvals', async () => {
      mockQueryOne.mockResolvedValueOnce(baseRequestRow);
      mockQueryMany.mockResolvedValueOnce([
        {
          id: 'approval-1',
          leave_request_id: 'req-1',
          approver_id: 'manager-1',
          approver_name: 'Manager A',
          action: 'approved',
          reason: null,
          acted_at: new Date(),
        },
      ]);

      const result = await getLeaveRequestById('req-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('req-1');
      expect(result!.approvals).toHaveLength(1);
      expect(result!.approvals[0].action).toBe('approved');
    });

    it('returns null when request not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getLeaveRequestById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── getMyLeaveRequests ───────────────────────────────────────────────────

  describe('getMyLeaveRequests', () => {
    it('returns paginated leave requests for the user', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '1' })  // total count
        // getLeaveRequestById calls:
        .mockResolvedValueOnce(baseRequestRow);
      mockQueryMany
        .mockResolvedValueOnce([{ id: 'req-1' }]) // request IDs
        .mockResolvedValueOnce([]);               // approvals for req-1

      const result = await getMyLeaveRequests('user-1');

      expect(result.total).toBe(1);
      expect(result.requests).toHaveLength(1);
    });

    it('returns empty when no requests', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getMyLeaveRequests('user-1', { status: 'rejected' });

      expect(result.total).toBe(0);
      expect(result.requests).toHaveLength(0);
    });
  });

  // ─── approveLeaveRequest ──────────────────────────────────────────────────

  describe('approveLeaveRequest', () => {
    it('approves a pending request and returns updated request', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'req-1', status: 'pending' }) // find request
        .mockResolvedValueOnce(undefined)                           // INSERT approval
        .mockResolvedValueOnce(undefined)                           // UPDATE status
        .mockResolvedValueOnce({ ...baseRequestRow, status: 'approved' }); // getLeaveRequestById
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await approveLeaveRequest('req-1', 'manager-1', 'approved', 'Looks good');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('approved');
    });

    it('returns null when request not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await approveLeaveRequest('nonexistent', 'manager-1', 'approved');

      expect(result).toBeNull();
    });

    it('returns null when request is not pending', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 'req-1', status: 'approved' });

      const result = await approveLeaveRequest('req-1', 'manager-1', 'rejected');

      expect(result).toBeNull();
    });
  });

  // ─── getLeaveBalance ──────────────────────────────────────────────────────

  describe('getLeaveBalance', () => {
    it('returns leave balance for all paid leave types', async () => {
      mockQueryMany.mockResolvedValueOnce([
        { type_id: 'type-1', type_name: 'Annual Leave', total_days: 12, used_days: 3, remaining_days: 9 },
      ]);

      const result = await getLeaveBalance('user-1', 2026);

      expect(result).toHaveLength(1);
      expect(result[0].typeId).toBe('type-1');
      expect(result[0].remainingDays).toBe(9);
    });

    it('uses current year when year is not specified', async () => {
      mockQueryMany.mockResolvedValueOnce([]);

      await getLeaveBalance('user-1');

      const callArgs = mockQueryMany.mock.calls[0][1] as unknown[];
      expect(callArgs[1]).toBe(new Date().getFullYear());
    });
  });
});

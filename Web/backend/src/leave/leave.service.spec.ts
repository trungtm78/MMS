import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import type { JwtPayload } from '../auth/auth.service';

const mockDataSource = { query: jest.fn() };

const regularUser: JwtPayload = {
  sub: 'user-001',
  username: 'nguyen.van.a',
  role: 'militia',
  unitScope: null,
};

const reviewerUser: JwtPayload = {
  sub: 'reviewer-001',
  username: 'chief.ward',
  role: 'police_ward',
  unitScope: 'W01',
};

const adminUser: JwtPayload = {
  sub: 'admin-001',
  username: 'sysadmin',
  role: 'system_admin',
  unitScope: null,
};

const baseDto = {
  leaveTypeId: 'lt-001',
  fromDate: '2026-04-28', // Monday
  toDate: '2026-05-01',   // Friday — 4 weekdays
  reason: 'Personal matter',
  isHalfDay: false,
  halfDayPeriod: undefined,
  replacementId: undefined,
};

describe('LeaveService', () => {
  let service: LeaveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<LeaveService>(LeaveService);
    jest.clearAllMocks();
  });

  // ── createLeaveRequest ──────────────────────────────────────────────────

  describe('createLeaveRequest', () => {
    it('calculates total_days as weekdays only (Mon–Fri)', async () => {
      // leave type exists, balance sufficient, insert succeeds, getLeaveRequest fetch
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'lt-001', name: 'Annual Leave' }]) // leave type check
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 10 }])    // balance check
        .mockResolvedValueOnce([{ id: 'lr-001' }])                         // INSERT
        // getLeaveRequest SELECT
        .mockResolvedValueOnce([
          {
            id: 'lr-001',
            code: 'LEAVE-20260428-ABC123',
            requesterId: 'user-001',
            requesterName: 'Nguyen Van A',
            leaveTypeId: 'lt-001',
            leaveTypeName: 'Annual Leave',
            fromDate: '2026-04-28',
            toDate: '2026-05-01',
            isHalfDay: false,
            halfDayPeriod: null,
            reason: 'Personal matter',
            replacementId: null,
            status: 'pending',
            totalDays: 4,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

      const result = await service.createLeaveRequest(regularUser, baseDto);
      // Verify the INSERT was called with totalDays=4 (Mon 28 Apr, Tue 29, Wed 30, Fri 1 May —
      // note: 2026-04-30 is Thursday, 2026-05-01 is Friday → 4 weekdays total)
      const insertCall = mockDataSource.query.mock.calls[2];
      const insertParams = insertCall[1] as unknown[];
      expect(insertParams[9]).toBe(4); // totalDays param index 9
      expect(result.status).toBe('pending');
    });

    it('calculates total_days as 0.5 for half-day request', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'lt-001', name: 'Annual Leave' }])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 5 }])
        .mockResolvedValueOnce([{ id: 'lr-002' }])
        .mockResolvedValueOnce([
          {
            id: 'lr-002', code: 'LEAVE-20260428-XYZ', requesterId: 'user-001',
            requesterName: 'Nguyen Van A', leaveTypeId: 'lt-001', leaveTypeName: 'Annual Leave',
            fromDate: '2026-04-28', toDate: '2026-04-28', isHalfDay: true,
            halfDayPeriod: 'morning', reason: 'Doctor', replacementId: null,
            status: 'pending', totalDays: 0.5, createdAt: new Date(), updatedAt: new Date(),
          },
        ]);

      const dto = { ...baseDto, toDate: '2026-04-28', isHalfDay: true, halfDayPeriod: 'morning' };
      await service.createLeaveRequest(regularUser, dto);
      const insertParams = mockDataSource.query.mock.calls[2][1] as unknown[];
      expect(insertParams[9]).toBe(0.5);
    });

    it('throws NotFoundException when leave_type not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // leave type not found
      await expect(service.createLeaveRequest(regularUser, baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when no leave balance record exists', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'lt-001', name: 'Annual Leave' }]) // type exists
        .mockResolvedValueOnce([]);  // no balance record
      await expect(service.createLeaveRequest(regularUser, baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when insufficient leave balance', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'lt-001', name: 'Annual Leave' }])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 1 }]); // only 1 day left, need 4
      await expect(service.createLeaveRequest(regularUser, baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with message insufficient_leave_balance', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'lt-001', name: 'Annual Leave' }])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 2 }]);
      await expect(service.createLeaveRequest(regularUser, baseDto)).rejects.toThrow(
        'insufficient_leave_balance',
      );
    });
  });

  // ── reviewLeaveRequest ──────────────────────────────────────────────────

  describe('reviewLeaveRequest', () => {
    const pendingRequest = {
      id: 'lr-001',
      status: 'pending',
      requesterId: 'user-001',
      leaveTypeId: 'lt-001',
      totalDays: 4,
    };

    it('updates status to approved and decrements balance on approve', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest]) // fetch request
        .mockResolvedValueOnce([])               // insert approval
        .mockResolvedValueOnce([])               // update status
        .mockResolvedValueOnce([]);              // update balance

      await service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve', 'Approved');

      // insert into leave_approvals
      const approvalInsertCall = mockDataSource.query.mock.calls[1];
      expect(approvalInsertCall[0]).toContain('INSERT INTO leave_approvals');
      expect(approvalInsertCall[1]).toContain('approve');

      // update leave_requests status
      const updateStatusCall = mockDataSource.query.mock.calls[2];
      expect(updateStatusCall[0]).toContain('UPDATE leave_requests');
      expect(updateStatusCall[1][0]).toBe('approved');

      // update leave_balances
      const updateBalanceCall = mockDataSource.query.mock.calls[3];
      expect(updateBalanceCall[0]).toContain('UPDATE leave_balances');
      expect(updateBalanceCall[1][0]).toBe(4); // totalDays
    });

    it('updates status to rejected and does NOT decrement balance on reject', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.reviewLeaveRequest(reviewerUser, 'lr-001', 'reject', 'Not approved');

      expect(mockDataSource.query).toHaveBeenCalledTimes(3); // no balance update
      const updateStatusCall = mockDataSource.query.mock.calls[2];
      expect(updateStatusCall[1][0]).toBe('rejected');
    });

    it('throws ForbiddenException when caller does not have reviewer role', async () => {
      await expect(
        service.reviewLeaveRequest(regularUser, 'lr-001', 'approve'),
      ).rejects.toThrow(ForbiddenException);
      // no DB calls should be made
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when militia role tries to review', async () => {
      const militiaUser: JwtPayload = {
        sub: 'u-militia',
        username: 'militia.user',
        role: 'militia',
        unitScope: null,
      };
      await expect(
        service.reviewLeaveRequest(militiaUser, 'lr-001', 'approve'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when request not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // no request
      await expect(
        service.reviewLeaveRequest(reviewerUser, 'nonexistent-id', 'approve'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when request is not pending', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ ...pendingRequest, status: 'approved' }]);
      await expect(
        service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve'),
      ).rejects.toThrow(BadRequestException);
    });

    it('system_admin can also review requests', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await expect(
        service.reviewLeaveRequest(adminUser, 'lr-001', 'approve'),
      ).resolves.toBeUndefined();
    });
  });

  // ── listApprovals ───────────────────────────────────────────────────────

  describe('listApprovals', () => {
    const rawRow = {
      id: 'lr-001',
      requesterName: 'Nguyen Van A',
      leaveTypeName: 'Annual Leave',
      fromDate: '2026-04-28',
      toDate: '2026-05-01',
      totalDays: 4,
      reason: 'Personal matter',
      status: 'pending',
      createdAt: new Date('2026-04-01T08:00:00Z'),
    };

    it('returns correctly shaped Approval objects', async () => {
      mockDataSource.query.mockResolvedValueOnce([rawRow]);

      const result = await service.listApprovals(reviewerUser);
      expect(result).toHaveLength(1);

      const approval = result[0];
      expect(approval.id).toBe('lr-001');
      expect(approval.type).toBe('leave');
      expect(approval.submittedBy).toBe('Nguyen Van A');
      expect(approval.status).toBe('pending');
      expect(typeof approval.title).toBe('string');
      expect(approval.title).toContain('Annual Leave');
      expect(approval.description).toBe('Personal matter');
      expect(typeof approval.submittedAt).toBe('string');
      // ISO string check
      expect(new Date(approval.submittedAt).toISOString()).toBe('2026-04-01T08:00:00.000Z');
    });

    it('throws ForbiddenException for non-reviewer role', async () => {
      await expect(service.listApprovals(regularUser)).rejects.toThrow(ForbiddenException);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('passes status filter to query when provided', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.listApprovals(reviewerUser, 'approved');
      const queryParams = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(queryParams[0]).toBe('approved');
    });

    it('passes null status when not filtered', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.listApprovals(reviewerUser);
      const queryParams = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(queryParams[0]).toBeNull();
    });

    it('returns empty array when no matching requests', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.listApprovals(reviewerUser, 'pending');
      expect(result).toEqual([]);
    });
  });

  // ── getLeaveBalances ────────────────────────────────────────────────────

  describe('getLeaveBalances', () => {
    it('returns balances for the given userId', async () => {
      const mockBalances = [
        {
          leaveTypeId: 'lt-001',
          leaveTypeName: 'Annual Leave',
          totalDays: 12,
          usedDays: 3,
          remainingDays: 9,
          year: 2026,
        },
      ];
      mockDataSource.query.mockResolvedValueOnce(mockBalances);

      const result = await service.getLeaveBalances('user-001');
      expect(result).toEqual(mockBalances);
      const queryParams = mockDataSource.query.mock.calls[0][1] as unknown[];
      expect(queryParams[0]).toBe('user-001');
    });
  });
});

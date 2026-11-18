import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { AssignmentsService } from '../assignments/assignments.service';
import type { JwtPayload } from '../auth/auth.service';
import { useUtcServerClock, VN_NEW_YEAR_0030 } from '../../test/support/clock';

const mockDataSource = { query: jest.fn(), transaction: jest.fn() };
const mockAssignments = { getAssignedDqtvIds: jest.fn() };
// The SQL and parameters of the query made `index`-th
const queryCall = (index: number) =>
  mockDataSource.query.mock.calls[index] as [string, unknown[]];
// The transaction's manager shares the query mock, so call order stays observable
mockDataSource.transaction.mockImplementation(
  (work: (manager: typeof mockDataSource) => Promise<unknown>) =>
    work(mockDataSource),
);

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

// The leave type row createLeaveRequest reads: 12 days a year
const annualType = {
  id: 'lt-001',
  name: 'Annual Leave',
  isActive: true,
  maxDaysPerYear: 12,
};

const baseDto = {
  leaveTypeId: 'lt-001',
  fromDate: '2026-04-28', // Monday
  toDate: '2026-05-01', // Friday — 4 weekdays
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
        { provide: AssignmentsService, useValue: mockAssignments },
      ],
    }).compile();
    service = module.get<LeaveService>(LeaveService);
    jest.clearAllMocks();
    // Queued answers a failing test did not use must not reach the next test
    mockDataSource.query.mockReset();
  });

  // ── createLeaveRequest ──────────────────────────────────────────────────

  describe('createLeaveRequest', () => {
    it('calculates total_days as weekdays only (Mon–Fri)', async () => {
      // leave type exists, balance sufficient, insert succeeds, getLeaveRequest fetch
      mockDataSource.query
        .mockResolvedValueOnce([annualType]) // leave type check
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 10 }]) // balance check
        .mockResolvedValueOnce([{ id: 'lr-001' }]) // INSERT
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
      const insertParams = queryCall(2)[1];
      expect(insertParams[9]).toBe(4); // totalDays param index 9
      expect(result.status).toBe('pending');
    });

    it('calculates total_days as 0.5 for half-day request', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([annualType])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 5 }])
        .mockResolvedValueOnce([{ id: 'lr-002' }])
        .mockResolvedValueOnce([
          {
            id: 'lr-002',
            code: 'LEAVE-20260428-XYZ',
            requesterId: 'user-001',
            requesterName: 'Nguyen Van A',
            leaveTypeId: 'lt-001',
            leaveTypeName: 'Annual Leave',
            fromDate: '2026-04-28',
            toDate: '2026-04-28',
            isHalfDay: true,
            halfDayPeriod: 'morning',
            reason: 'Doctor',
            replacementId: null,
            status: 'pending',
            totalDays: 0.5,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

      const dto = {
        ...baseDto,
        toDate: '2026-04-28',
        isHalfDay: true,
        halfDayPeriod: 'morning',
      };
      await service.createLeaveRequest(regularUser, dto);
      const insertParams = queryCall(2)[1];
      expect(insertParams[9]).toBe(0.5);
    });

    it('throws NotFoundException when leave_type not found', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // leave type not found
      await expect(
        service.createLeaveRequest(regularUser, baseDto),
      ).rejects.toThrow(NotFoundException);
    });

    // Nothing else allocates balances: the first request of a year creates that year's
    // balance from the type's yearly limit, and a concurrent first request reuses it
    it('provisions the balance of the year from the yearly limit of the type', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([annualType])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: '12.0' }])
        .mockResolvedValueOnce([{ id: 'lr-001' }])
        .mockResolvedValueOnce([{ id: 'lr-001', status: 'pending' }]);

      await service.createLeaveRequest(regularUser, baseDto);

      const [sql, params] = queryCall(1);
      expect(sql).toMatch(
        /INSERT INTO leave_balances \(user_id, leave_type_id, year, total_days, used_days, remaining_days\)\s+VALUES \(\$1::uuid, \$2::uuid, \$3, \$4, 0, \$4\)\s+ON CONFLICT \(user_id, leave_type_id, year\) DO UPDATE SET year = EXCLUDED\.year\s+RETURNING id, remaining_days AS "remainingDays"/,
      );
      expect(params).toEqual(['user-001', 'lt-001', 2026, 12]);
      expect(queryCall(0)[0]).toMatch(/max_days_per_year AS "maxDaysPerYear"/);
    });

    // Sick, maternity and unpaid leave have no yearly limit (migration 033): nobody is
    // limited unless an operator allocated them a balance for the year
    it('files leave of a type without a yearly limit and no allocated balance as unlimited', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ ...annualType, maxDaysPerYear: null }])
        .mockResolvedValueOnce([]) // no balance allocated for the year
        .mockResolvedValueOnce([{ id: 'lr-001' }])
        .mockResolvedValueOnce([{ id: 'lr-001', status: 'pending' }]);

      await service.createLeaveRequest(regularUser, baseDto);

      const calls = mockDataSource.query.mock.calls as [string, unknown[]][];
      expect(calls).toHaveLength(4);
      expect(calls[1][0]).toMatch(
        /SELECT remaining_days AS "remainingDays"\s+FROM leave_balances\s+WHERE user_id = \$1::uuid AND leave_type_id = \$2::uuid AND year = \$3/,
      );
      expect(calls[1][1]).toEqual(['user-001', 'lt-001', 2026]);
      expect(
        calls.some(([sql]) => sql.includes('INSERT INTO leave_balances')),
      ).toBe(false);
      expect(calls[2][0]).toContain('INSERT INTO leave_requests');
      expect(calls[2][1][9]).toBe(4);
    });

    // Catalogues made before migration 033: a type without a yearly limit whose balances
    // an operator allocated by hand keeps drawing on them
    it('refuses leave of a type without a yearly limit beyond the balance allocated by hand', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ ...annualType, maxDaysPerYear: null }])
        .mockResolvedValueOnce([{ remainingDays: 1 }]);

      await expect(
        service.createLeaveRequest(regularUser, baseDto),
      ).rejects.toThrow(new ConflictException('insufficient_leave_balance'));
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });

    // The same state conflict answers 409 whether it is found on create or on review
    it('answers 409 when the balance does not cover the leave', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([annualType])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 1 }]); // only 1 day left, need 4
      await expect(
        service.createLeaveRequest(regularUser, baseDto),
      ).rejects.toThrow(new ConflictException('insufficient_leave_balance'));
    });

    it('refuses before inserting anything when the balance falls short', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([annualType])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 2 }]);
      await expect(
        service.createLeaveRequest(regularUser, baseDto),
      ).rejects.toThrow('insufficient_leave_balance');
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });
  });

  // ── cancelLeaveRequest ──────────────────────────────────────────────────

  describe('cancelLeaveRequest', () => {
    const sqlOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][0] as string;

    it('cancels the caller’s own pending request', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          { requester_id: 'user-001', status: 'pending' },
        ])
        .mockResolvedValueOnce([{ id: 'lr-001' }]);

      await expect(
        service.cancelLeaveRequest(regularUser, 'lr-001'),
      ).resolves.toBeUndefined();
      expect(sqlOf(0)).toMatch(/FOR UPDATE/);
      expect(sqlOf(1)).toMatch(/AND status = 'pending'/);
    });

    it("refuses someone else's request", async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { requester_id: 'other', status: 'pending' },
      ]);

      await expect(
        service.cancelLeaveRequest(regularUser, 'lr-001'),
      ).rejects.toThrow(new ForbiddenException('not_your_leave_request'));
    });

    // Same answer as reviewing a decided request: the state changed, not the input
    it('answers 409 when the request was already decided', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { requester_id: 'user-001', status: 'approved' },
      ]);

      await expect(
        service.cancelLeaveRequest(regularUser, 'lr-001'),
      ).rejects.toThrow(new ConflictException('leave_request_not_pending'));
    });

    it('answers 409 when it was decided while cancelling', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          { requester_id: 'user-001', status: 'pending' },
        ])
        .mockResolvedValueOnce([]);

      await expect(
        service.cancelLeaveRequest(regularUser, 'lr-001'),
      ).rejects.toThrow(new ConflictException('leave_request_not_pending'));
    });
  });

  // ── calendar dates ──────────────────────────────────────────────────────

  describe('calendar dates', () => {
    useUtcServerClock(VN_NEW_YEAR_0030);

    const storedRequest = (id: string) => [
      {
        id,
        code: 'LEAVE-X',
        requesterId: 'user-001',
        requesterName: 'A',
        leaveTypeId: 'lt-001',
        leaveTypeName: 'Annual Leave',
        fromDate: '2028-01-03',
        toDate: '2028-01-04',
        isHalfDay: false,
        halfDayPeriod: null,
        reason: 'r',
        replacementId: null,
        status: 'pending',
        totalDays: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const paramsOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][1] as unknown[];

    it('stamps the request code with the Vietnamese date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([annualType])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 10 }])
        .mockResolvedValueOnce([{ id: 'lr-009' }])
        .mockResolvedValueOnce(storedRequest('lr-009'));

      await service.createLeaveRequest(regularUser, {
        ...baseDto,
        fromDate: '2028-01-03',
        toDate: '2028-01-04',
      });

      expect(paramsOf(2)[0]).toMatch(/^LEAVE-20270101-[A-Z0-9]{6}$/);
    });

    it('checks the balance of the year the leave is taken', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([annualType])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 10 }])
        .mockResolvedValueOnce([{ id: 'lr-009' }])
        .mockResolvedValueOnce(storedRequest('lr-009'));

      await service.createLeaveRequest(regularUser, {
        ...baseDto,
        fromDate: '2028-01-03',
        toDate: '2028-01-04',
      });

      expect(paramsOf(1)).toEqual(['user-001', 'lt-001', 2028, 12]);
    });

    it('deducts approved days from the balance of the year the leave is taken', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            id: 'lr-009',
            status: 'pending',
            requesterId: 'user-001',
            leaveTypeId: 'lt-001',
            totalDays: 2,
            fromDate: '2028-01-03',
            maxDaysPerYear: 12,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'lr-009' }])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 12 }])
        .mockResolvedValueOnce([{ id: 'bal-001' }]);

      await service.reviewLeaveRequest(reviewerUser, 'lr-009', 'approve');

      expect(paramsOf(3)).toEqual(['user-001', 'lt-001', 2028, 12]);
      expect(paramsOf(4)).toEqual([2, 'user-001', 'lt-001', 2028]);
    });

    it('counts weekdays by calendar date', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([annualType])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 10 }])
        .mockResolvedValueOnce([{ id: 'lr-010' }])
        .mockResolvedValueOnce(storedRequest('lr-010'));

      // Sunday 3 January to Monday 4 January 2027: one working day
      await service.createLeaveRequest(regularUser, {
        ...baseDto,
        fromDate: '2027-01-03',
        toDate: '2027-01-04',
      });

      expect(paramsOf(2)[9]).toBe(1);
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
      fromDate: '2026-04-28',
      maxDaysPerYear: 12,
    };

    const callsOf = () =>
      mockDataSource.query.mock.calls as [string, unknown[]][];

    it('approves in one transaction: locks the request, records the decision, deducts the balance', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest]) // SELECT ... FOR UPDATE
        .mockResolvedValueOnce([]) // INSERT leave_approvals
        .mockResolvedValueOnce([{ id: 'lr-001' }]) // UPDATE leave_requests
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 12 }]) // balance of the year
        .mockResolvedValueOnce([{ id: 'bal-001' }]); // UPDATE leave_balances

      await service.reviewLeaveRequest(
        reviewerUser,
        'lr-001',
        'approve',
        'Approved',
      );

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      const calls = callsOf();
      expect(calls[0][0]).toMatch(/FOR UPDATE/);
      // leave_approvals.action only accepts 'approved' | 'rejected'
      expect(calls[1][0]).toContain('INSERT INTO leave_approvals');
      expect(calls[1][1]).toEqual([
        'lr-001',
        'reviewer-001',
        'approved',
        'Approved',
      ]);
      expect(calls[2][0]).toMatch(
        /UPDATE leave_requests[\s\S]*AND status = 'pending'/,
      );
      expect(calls[2][1]).toEqual(['approved', 'lr-001']);
      // A type given a yearly limit after the request was filed still gets its balance
      expect(calls[3][0]).toContain('INSERT INTO leave_balances');
      expect(calls[3][1]).toEqual(['user-001', 'lt-001', 2026, 12]);
      expect(calls[4][0]).toMatch(
        /UPDATE leave_balances[\s\S]*AND remaining_days >= \$1/,
      );
      expect(calls[4][1]).toEqual([4, 'user-001', 'lt-001', 2026]);
      expect(calls[0][0]).toMatch(
        /\(SELECT lt\.max_days_per_year FROM leave_types lt WHERE lt\.id = leave_type_id\) AS "maxDaysPerYear"/,
      );
    });

    describe('a type without a yearly limit', () => {
      const unlimited = { ...pendingRequest, maxDaysPerYear: null };
      const decided = () =>
        mockDataSource.query
          .mockResolvedValueOnce([unlimited])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'lr-001' }]);

      it('deducts the approved days from a balance allocated by hand, creating none', async () => {
        decided().mockResolvedValueOnce([{ id: 'bal-001' }]);

        await service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve');

        expect(callsOf()).toHaveLength(4);
        expect(callsOf()[3][0]).toMatch(
          /UPDATE leave_balances[\s\S]*AND remaining_days >= \$1/,
        );
        expect(callsOf()[3][1]).toEqual([4, 'user-001', 'lt-001', 2026]);
        expect(
          callsOf().some(([sql]) => sql.includes('INSERT INTO leave_balances')),
        ).toBe(false);
      });

      it('approves without a balance when none was allocated for the year', async () => {
        decided()
          .mockResolvedValueOnce([]) // guarded deduction matched nothing
          .mockResolvedValueOnce([]); // and no balance exists

        await expect(
          service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve'),
        ).resolves.toBeUndefined();

        expect(callsOf()[4][0]).toMatch(
          /SELECT 1 AS present FROM leave_balances\s+WHERE user_id = \$1::uuid AND leave_type_id = \$2::uuid AND year = \$3/,
        );
        expect(callsOf()[4][1]).toEqual(['user-001', 'lt-001', 2026]);
      });

      it('answers 409 when the allocated balance no longer covers the leave', async () => {
        decided()
          .mockResolvedValueOnce([]) // guarded deduction matched nothing
          .mockResolvedValueOnce([{ '?column?': 1 }]); // the balance exists

        await expect(
          service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve'),
        ).rejects.toThrow(new ConflictException('insufficient_leave_balance'));
      });
    });

    it('rejects without touching the balance', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'lr-001' }]);

      await service.reviewLeaveRequest(
        reviewerUser,
        'lr-001',
        'reject',
        'Not approved',
      );

      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
      const calls = callsOf();
      expect(calls[1][1]).toEqual([
        'lr-001',
        'reviewer-001',
        'rejected',
        'Not approved',
      ]);
      expect(calls[2][1]).toEqual(['rejected', 'lr-001']);
    });

    it('answers 409 when another reviewer decided first', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]); // conditional status update matched nothing

      await expect(
        service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve'),
      ).rejects.toThrow(new ConflictException('leave_request_not_pending'));
      expect(mockDataSource.query).toHaveBeenCalledTimes(3);
    });

    // The balance may have been used by another approval since the request was created
    it('answers 409 and rolls back when the balance no longer covers the leave', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'lr-001' }])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 1 }])
        .mockResolvedValueOnce([]) // guarded balance update matched nothing
        .mockResolvedValueOnce([{ '?column?': 1 }]); // the balance exists: it is short

      await expect(
        service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve'),
      ).rejects.toThrow(new ConflictException('insufficient_leave_balance'));
    });

    it('does not let reviewers decide their own request', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { ...pendingRequest, requesterId: reviewerUser.sub },
      ]);

      await expect(
        service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve'),
      ).rejects.toThrow(new ForbiddenException('cannot_review_own_request'));
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
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

    it('answers 409 when the request was already decided', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { ...pendingRequest, status: 'approved' },
      ]);
      await expect(
        service.reviewLeaveRequest(reviewerUser, 'lr-001', 'approve'),
      ).rejects.toThrow(new ConflictException('leave_request_not_pending'));
    });

    it('system_admin can also review requests', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([pendingRequest])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'lr-001' }])
        .mockResolvedValueOnce([{ id: 'bal-001', remainingDays: 12 }])
        .mockResolvedValueOnce([{ id: 'bal-001' }]);

      await expect(
        service.reviewLeaveRequest(adminUser, 'lr-001', 'approve'),
      ).resolves.toBeUndefined();
    });
  });

  // ── listApprovals ───────────────────────────────────────────────────────

  // Reviewers act on the requests of people in their unit scope; everyone else on their own
  describe('unit scope', () => {
    const areaOfficer: JwtPayload = {
      sub: 'area-001',
      username: 'area',
      role: 'police_area',
      unitScope: 'KV1',
    };
    const areaWithoutScope: JwtPayload = { ...areaOfficer, unitScope: null };
    const sqlOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][0] as string;
    const paramsOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][1] as unknown[];

    it("lists the requests of people in the reviewer's unit", async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listLeaveRequests(areaOfficer, {});

      for (const call of [0, 1]) {
        expect(sqlOf(call)).toMatch(/militia_profiles[\s\S]*user_unit_scopes/);
        expect(paramsOf(call).slice(0, 4)).toEqual([null, null, 'KV1', null]);
      }
    });

    it('lists only their own requests for non-reviewers', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listLeaveRequests(regularUser, { status: 'pending' });

      expect(paramsOf(0)).toEqual(['user-001', 'pending', null, null]);
    });

    // Reviewers also request leave: "my requests" must not mean their whole unit
    it("lists only the reviewer's own requests when asked for mine", async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listLeaveRequests(areaOfficer, { mine: true });

      expect(paramsOf(0)).toEqual(['area-001', null, null, null]);
      expect(mockAssignments.getAssignedDqtvIds).not.toHaveBeenCalled();
    });

    it('refuses lists to an area reviewer without a unit scope', async () => {
      await expect(
        service.listLeaveRequests(areaWithoutScope, {}),
      ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
      await expect(service.listApprovals(areaWithoutScope)).rejects.toThrow(
        new ForbiddenException('no_unit_scope'),
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it("limits approvals to the reviewer's unit", async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listApprovals(areaOfficer, 'pending');

      expect(paramsOf(0)).toEqual(['pending', 'KV1', null]);
      expect(sqlOf(0)).toMatch(/user_unit_scopes/);
    });

    it('reviews only requests inside the unit scope', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // outside the scope the locked read finds nothing

      await expect(
        service.reviewLeaveRequest(areaOfficer, 'lr-001', 'approve'),
      ).rejects.toThrow(new NotFoundException('leave_request_not_found'));
      expect(paramsOf(0)).toEqual(['lr-001', 'KV1', null]);
    });

    it("hides other people's requests from non-reviewers", async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.getLeaveRequest(regularUser, 'lr-001'),
      ).rejects.toThrow(new NotFoundException('leave_request_not_found'));
      expect(paramsOf(0)).toEqual(['lr-001', 'user-001', null, null]);
    });

    it('lets reviewers read requests in their unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ id: 'lr-001' }]);

      await service.getLeaveRequest(areaOfficer, 'lr-001');

      expect(paramsOf(0)).toEqual(['lr-001', null, 'KV1', null]);
    });

    // PoliceApp US-007: CA officers approve the leave of the militia members they supervise
    const caWard: JwtPayload = {
      sub: 'ca-ward-1',
      username: 'caw',
      role: 'ca_ward',
      unitScope: 'KV1',
    };
    const caOfficer: JwtPayload = {
      sub: 'ca-1',
      username: 'ca',
      role: 'ca_officer',
      unitScope: 'KV1',
    };

    it('lets CA ward officers review the requests of their unit', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.listApprovals(caWard, 'pending');

      expect(paramsOf(0)).toEqual(['pending', 'KV1', null]);
    });

    it('limits CA officers to the DQTV assigned to them', async () => {
      mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce([
        'dq-1',
        'dq-2',
      ]);
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listLeaveRequests(caOfficer, {});

      expect(mockAssignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
      expect(paramsOf(0)).toEqual([null, null, null, ['dq-1', 'dq-2']]);
      expect(sqlOf(0)).toMatch(/lr\.requester_id = ANY\(\$4::uuid\[\]\)/);
    });

    it('reviews for a CA officer only requests by assigned DQTV', async () => {
      mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-1']);
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.reviewLeaveRequest(caOfficer, 'lr-001', 'approve'),
      ).rejects.toThrow(new NotFoundException('leave_request_not_found'));
      expect(paramsOf(0)).toEqual(['lr-001', null, ['dq-1']]);
    });

    it('shows a CA officer without assignments nothing, without querying', async () => {
      for (let i = 0; i < 4; i++) {
        mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce([]);
      }

      await expect(service.listLeaveRequests(caOfficer, {})).resolves.toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      await expect(service.listApprovals(caOfficer)).resolves.toEqual([]);
      await expect(
        service.getLeaveRequest(caOfficer, 'lr-001'),
      ).rejects.toThrow(new NotFoundException('leave_request_not_found'));
      await expect(
        service.reviewLeaveRequest(caOfficer, 'lr-001', 'approve'),
      ).rejects.toThrow(new NotFoundException('leave_request_not_found'));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  // ── leave types ─────────────────────────────────────────────────────────
  // CreateLeaveDto requires a leaveTypeId: GET /leave/types lets every client offer them
  describe('leave types', () => {
    const sqlOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][0] as string;

    it('lists the active leave types in name order', async () => {
      const types = [
        {
          id: 'lt-1',
          code: 'annual',
          name: 'Nghỉ phép năm',
          description: null,
          maxDaysPerYear: 12,
          requiresDocument: false,
          isPaid: true,
        },
      ];
      mockDataSource.query.mockResolvedValueOnce(types);

      await expect(service.listLeaveTypes()).resolves.toEqual(types);

      const sql = sqlOf(0);
      expect(sql).toMatch(/FROM leave_types lt/);
      expect(sql).toMatch(/WHERE lt\.is_active/);
      expect(sql).toMatch(/ORDER BY lt\.name, lt\.code/);
      for (const column of [
        'lt.max_days_per_year AS "maxDaysPerYear"',
        'lt.requires_document AS "requiresDocument"',
        'lt.is_paid AS "isPaid"',
      ]) {
        expect(sql).toContain(column);
      }
    });

    // A retired type stays on old requests but no new request may use it
    it('refuses a new request of an inactive leave type before checking balances', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 'lt-001', name: 'Nghỉ cũ', isActive: false },
      ]);

      await expect(
        service.createLeaveRequest(regularUser, baseDto),
      ).rejects.toThrow(new BadRequestException('leave_type_inactive'));
      expect(sqlOf(0)).toMatch(/is_active AS "isActive"/);
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });
  });

  // ── reviewer of a request ───────────────────────────────────────────────
  // Lists and details say who decided a request and when, from its latest leave_approvals row
  describe('reviewer of a request', () => {
    const sqlOf = (call: number) =>
      (mockDataSource.query.mock.calls as unknown[][])[call][0] as string;
    const expectReviewerColumns = (sql: string) => {
      expect(sql).toMatch(
        /LEFT JOIN LATERAL \([\s\S]*FROM leave_approvals la[\s\S]*JOIN users ru ON ru\.id = la\.approver_id[\s\S]*WHERE la\.leave_request_id = lr\.id[\s\S]*ORDER BY la\.acted_at DESC[\s\S]*LIMIT 1\s*\) rv ON true/,
      );
      expect(sql).toMatch(
        /CASE WHEN rv\.approver_id IS NULL THEN NULL\s+ELSE json_build_object\('id', rv\.approver_id, 'fullName', rv\.full_name\) END AS "reviewedBy"/,
      );
      expect(sql).toMatch(/rv\.acted_at AS "reviewedAt"/);
      expect(sql).toMatch(/rv\.reason AS "reviewNote"/);
      // Fields clients already read stay
      expect(sql).toMatch(/lt\.name\s+AS "leaveTypeName"/);
      expect(sql).toMatch(/u\.full_name\s+AS "requesterName"/);
    };

    it('lists requests with their reviewer and review time', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.listLeaveRequests(adminUser, {});

      expectReviewerColumns(sqlOf(1));
      // The count needs no reviewer
      expect(sqlOf(0)).not.toMatch(/leave_approvals/);
    });

    it('reads one request with its reviewer and review time', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'lr-001',
          reviewedBy: { id: 'rev-1', fullName: 'Trần Văn B' },
          reviewedAt: new Date('2027-03-01T02:00:00Z'),
        },
      ]);

      await expect(
        service.getLeaveRequest(adminUser, 'lr-001'),
      ).resolves.toMatchObject({
        reviewedBy: { id: 'rev-1', fullName: 'Trần Văn B' },
      });
      expectReviewerColumns(sqlOf(0));
    });
  });

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
      expect(new Date(approval.submittedAt).toISOString()).toBe(
        '2026-04-01T08:00:00.000Z',
      );
    });

    it('throws ForbiddenException for non-reviewer role', async () => {
      await expect(service.listApprovals(regularUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('passes status filter to query when provided', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.listApprovals(reviewerUser, 'approved');
      const queryParams = queryCall(0)[1];
      expect(queryParams[0]).toBe('approved');
    });

    it('passes null status when not filtered', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await service.listApprovals(reviewerUser);
      const queryParams = queryCall(0)[1];
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
      const queryParams = queryCall(0)[1];
      expect(queryParams[0]).toBe('user-001');
    });
  });
});

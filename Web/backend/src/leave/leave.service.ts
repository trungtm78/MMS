import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { queryRows } from '../database/query-rows';
import type { JwtPayload } from '../auth/auth.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { businessDate, isIsoDate } from '../common/time/business-date';
import { holdsAnyRole } from '../common/access/unit-scope';
import {
  resolveMemberReach,
  type MemberReach,
} from '../common/access/member-scope';
import { userInUnit } from '../common/sql/user-access.sql';
import { AssignmentsService } from '../assignments/assignments.service';

export interface LeaveRequest {
  id: string;
  code: string;
  requesterId: string;
  requesterName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  fromDate: string;
  toDate: string;
  isHalfDay: boolean;
  halfDayPeriod: string | null;
  reason: string;
  replacementId: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  totalDays: number;
  createdAt: Date;
  updatedAt: Date;
  // The latest decision (leave_approvals); null while nobody decided the request
  reviewedBy: { id: string; fullName: string } | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

// GET /leave/types: what a new request may be filed as
export interface LeaveType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxDaysPerYear: number | null;
  requiresDocument: boolean | null;
  isPaid: boolean | null;
}

// Every column a leave request reaches clients with, list and detail alike. The lateral
// join reads the latest decision: the reviewer (id, name), when, and the reason given.
const LEAVE_REQUEST_COLUMNS = `lr.id,
              lr.code,
              lr.requester_id     AS "requesterId",
              u.full_name         AS "requesterName",
              lr.leave_type_id    AS "leaveTypeId",
              lt.name             AS "leaveTypeName",
              lr.from_date        AS "fromDate",
              lr.to_date          AS "toDate",
              lr.is_half_day      AS "isHalfDay",
              lr.half_day_period  AS "halfDayPeriod",
              lr.reason,
              lr.replacement_id   AS "replacementId",
              lr.status,
              lr.total_days       AS "totalDays",
              lr.created_at       AS "createdAt",
              lr.updated_at       AS "updatedAt",
              CASE WHEN rv.approver_id IS NULL THEN NULL
                   ELSE json_build_object('id', rv.approver_id, 'fullName', rv.full_name) END AS "reviewedBy",
              rv.acted_at AS "reviewedAt",
              rv.reason AS "reviewNote"`;

const LEAVE_REQUEST_JOINS = `JOIN users u ON u.id = lr.requester_id
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN LATERAL (
         SELECT la.approver_id, la.acted_at, la.reason, ru.full_name
         FROM leave_approvals la
         JOIN users ru ON ru.id = la.approver_id
         WHERE la.leave_request_id = lr.id
         ORDER BY la.acted_at DESC
         LIMIT 1
       ) rv ON true`;

export interface LeaveBalance {
  leaveTypeId: string;
  leaveTypeName: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  year: number;
}

export interface Approval {
  id: string;
  type: 'leave';
  submittedBy: string;
  title: string;
  description: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

// Ward and area police and CA officers decide leave (PoliceApp US-007)
const REVIEWER_ROLES = new Set([
  'police_ward',
  'police_area',
  'ca_ward',
  'ca_area',
  'ca_officer',
  'system_admin',
]);

// Whose requests a caller reaches: the union of every requester (everyone), the people of
// a unit (unit, null: none through a unit) and a list of requesters (requesterIds)
interface RequesterScope {
  everyone: boolean;
  unit: string | null;
  requesterIds: string[];
}

const UNRESTRICTED: RequesterScope = {
  everyone: true,
  unit: null,
  requesterIds: [],
};

const ownRequests = (userId: string): RequesterScope => ({
  everyone: false,
  unit: null,
  requesterIds: [userId],
});

const reachesNobody = (scope: RequesterScope) =>
  !scope.everyone && scope.unit === null && scope.requesterIds.length === 0;

/**
 * SQL condition limiting `column` (a requester id) to a RequesterScope passed as three
 * parameters from $first: everyone (boolean), unit (text), requesterIds (uuid[]).
 */
function requesterScopeSql(column: string, first: number): string {
  const everyone = `$${first}`;
  const unit = `$${first + 1}`;
  const requesterIds = `$${first + 2}`;
  return `(${everyone}::boolean OR (${unit}::text IS NOT NULL AND ${userInUnit(column, unit)}) OR ${column} = ANY(${requesterIds}::uuid[]))`;
}

const requesterScopeParams = (scope: RequesterScope) => [
  scope.everyone,
  scope.unit,
  scope.requesterIds,
];

const DAY_MS = 86_400_000;

/**
 * Count weekdays (Mon–Fri) between two inclusive YYYY-MM-DD dates. Calendar arithmetic in
 * UTC, so the host timezone cannot shift a day, and constant time for any range.
 */
function countWeekdays(fromDate: string, toDate: string): number {
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T00:00:00Z`);
  if (end < start) return 0;
  const days = Math.round((end - start) / DAY_MS) + 1;
  let count = Math.floor(days / 7) * 5;
  const startDay = new Date(start).getUTCDay();
  for (let i = 0; i < days % 7; i++) {
    const day = (startDay + i) % 7;
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function generateCode(): string {
  const yyyymmdd = businessDate().isoDate.replace(/-/g, '');
  const random = Math.random()
    .toString(36)
    .toUpperCase()
    .slice(2, 8)
    .padEnd(6, '0');
  return `LEAVE-${yyyymmdd}-${random}`;
}

@Injectable()
export class LeaveService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly assignments: AssignmentsService,
  ) {}

  /**
   * Whose requests the caller reaches. Every role held counts, whatever its priority
   * (resolveMemberReach): unit reviewers reach the people of their effective unit, CA
   * officers the DQTV assigned to them, and a user holding both reaches both.
   * - review: the requests the caller may decide; refused (403) when no reviewer role
   *   grants anything, e.g. an area reviewer without a unit scope
   * - read: those, and always the caller's own requests (a reviewer requests leave too)
   */
  private async requesterScope(
    user: JwtPayload,
    purpose: 'read' | 'review',
  ): Promise<RequesterScope> {
    const own = purpose === 'read' ? [user.sub] : [];
    const scope: RequesterScope = {
      everyone: false,
      unit: null,
      requesterIds: own,
    };
    if (!holdsAnyRole(user, REVIEWER_ROLES)) return scope;

    let reach: MemberReach;
    try {
      reach = await resolveMemberReach(user, {
        staffRoles: REVIEWER_ROLES,
        assignments: this.assignments,
      });
    } catch (error) {
      if (purpose === 'read' && error instanceof ForbiddenException) {
        return scope;
      }
      throw error;
    }
    return {
      everyone: reach.everyone,
      unit: reach.unit,
      requesterIds: [...new Set([...own, ...(reach.userIds ?? [])])],
    };
  }

  async listLeaveRequests(
    user: JwtPayload,
    // mine: only the caller's own requests, whatever their role lets them review
    params: { status?: string; page?: number; limit?: number; mine?: boolean },
  ): Promise<{
    data: LeaveRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    const scope = params.mine
      ? ownRequests(user.sub)
      : await this.requesterScope(user, 'read');
    const statusFilter: string | null = params.status ?? null;
    const filters = `WHERE ${requesterScopeSql('lr.requester_id', 1)}
         AND ($4::text IS NULL OR lr.status = $4::text)`;
    const filterParams = [...requesterScopeParams(scope), statusFilter];

    const countRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
       FROM leave_requests lr
       JOIN users u ON u.id = lr.requester_id
       ${filters}`,
      filterParams,
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.dataSource.query<LeaveRequest[]>(
      `SELECT ${LEAVE_REQUEST_COLUMNS}
       FROM leave_requests lr
       ${LEAVE_REQUEST_JOINS}
       ${filters}
       ORDER BY lr.created_at DESC
       LIMIT $5 OFFSET $6`,
      [...filterParams, limit, offset],
    );

    return { data, total, page, limit };
  }

  // Types a new request may use; retired types (is_active = false, migration 028) stay on
  // the requests filed with them but are no longer offered
  async listLeaveTypes(): Promise<LeaveType[]> {
    return this.dataSource.query<LeaveType[]>(
      `SELECT lt.id,
              lt.code,
              lt.name,
              lt.description,
              lt.max_days_per_year AS "maxDaysPerYear",
              lt.requires_document AS "requiresDocument",
              lt.is_paid AS "isPaid"
       FROM leave_types lt
       WHERE lt.is_active
       ORDER BY lt.name, lt.code`,
    );
  }

  // A request outside the caller's scope answers 404; their own is always in it
  async getLeaveRequest(user: JwtPayload, id: string): Promise<LeaveRequest> {
    return this.readLeaveRequest(id, await this.requesterScope(user, 'read'));
  }

  private async readLeaveRequest(
    id: string,
    scope: RequesterScope,
  ): Promise<LeaveRequest> {
    const rows = await this.dataSource.query<LeaveRequest[]>(
      `SELECT ${LEAVE_REQUEST_COLUMNS}
       FROM leave_requests lr
       ${LEAVE_REQUEST_JOINS}
       WHERE lr.id = $1::uuid
         AND ${requesterScopeSql('lr.requester_id', 2)}
       LIMIT 1`,
      [id, ...requesterScopeParams(scope)],
    );
    if (!rows.length) throw new NotFoundException('leave_request_not_found');
    return rows[0];
  }

  async createLeaveRequest(
    user: JwtPayload,
    dto: CreateLeaveDto,
  ): Promise<LeaveRequest> {
    // The leave type must exist and still be offered (GET /leave/types)
    const typeRows = await this.dataSource.query<
      {
        id: string;
        name: string;
        isActive: boolean;
        maxDaysPerYear: number | null;
      }[]
    >(
      `SELECT id, name, is_active AS "isActive", max_days_per_year AS "maxDaysPerYear"
       FROM leave_types WHERE id = $1::uuid LIMIT 1`,
      [dto.leaveTypeId],
    );
    if (!typeRows.length) throw new NotFoundException('leave_type_not_found');
    if (typeRows[0].isActive === false) {
      throw new BadRequestException('leave_type_inactive');
    }

    // Leave is taken on calendar days; an ISO timestamp keeps only its date part
    const fromDate = dto.fromDate.slice(0, 10);
    const toDate = dto.toDate.slice(0, 10);
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
      throw new BadRequestException('invalid_date');
    }

    // Leave counts working days (Mon–Fri). A half day is half of a single working day: one
    // date, and that date a working day, as a full-day request must contain one.
    if (dto.isHalfDay && fromDate !== toDate) {
      throw new BadRequestException('half_day_requires_single_date');
    }
    const weekdays = countWeekdays(fromDate, toDate);
    if (weekdays <= 0) {
      throw new BadRequestException('invalid_date_range_no_working_days');
    }
    const totalDays = dto.isHalfDay ? 0.5 : weekdays;

    // Balances are yearly: the leave draws on the year it starts in. A type with a yearly
    // limit gets its balance at the limit; a type without one (sick, maternity, unpaid
    // leave) is limited only by a balance an operator allocated for the year, if any.
    const { maxDaysPerYear } = typeRows[0];
    const leaveYear = Number(fromDate.slice(0, 4));
    const remainingDays =
      maxDaysPerYear !== null
        ? await this.yearBalance(
            this.dataSource,
            user.sub,
            dto.leaveTypeId,
            leaveYear,
            maxDaysPerYear,
          )
        : await this.allocatedBalance(user.sub, dto.leaveTypeId, leaveYear);
    if (remainingDays !== null && remainingDays < totalDays) {
      // A state conflict, answered the same as when an approval finds the balance used up
      throw new ConflictException('insufficient_leave_balance');
    }

    const code = generateCode();

    const inserted = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO leave_requests
         (code, requester_id, leave_type_id, from_date, to_date, is_half_day,
          half_day_period, reason, replacement_id, status, total_days)
       VALUES ($1, $2::uuid, $3::uuid, $4::date, $5::date, $6,
               $7, $8, $9::uuid, 'pending', $10)
       RETURNING id`,
      [
        code,
        user.sub,
        dto.leaveTypeId,
        fromDate,
        toDate,
        dto.isHalfDay ?? false,
        dto.halfDayPeriod ?? null,
        dto.reason,
        dto.replacementId ?? null,
        totalDays,
      ],
    );

    // The requester reads back what they just created
    return this.readLeaveRequest(inserted[0].id, UNRESTRICTED);
  }

  /**
   * Days left on a member's balance of a leave type for a year. Nothing allocates balances
   * ahead of time: the first request or approval of the year creates the balance at the
   * type's yearly limit. The no-op update on conflict answers an existing balance as well,
   * and a concurrent first request waits for the other's row instead of failing on it.
   */
  private async yearBalance(
    runner: Pick<EntityManager, 'query'>,
    userId: string,
    leaveTypeId: string,
    year: number,
    maxDaysPerYear: number,
  ): Promise<number> {
    const rows = await queryRows<{
      id: string;
      remainingDays: string | number;
    }>(
      runner,
      `INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, remaining_days)
       VALUES ($1::uuid, $2::uuid, $3, $4, 0, $4)
       ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET year = EXCLUDED.year
       RETURNING id, remaining_days AS "remainingDays"`,
      [userId, leaveTypeId, year, maxDaysPerYear],
    );
    return Number(rows[0].remainingDays);
  }

  /** Days left on a balance allocated for the year, or null when none was allocated. */
  private async allocatedBalance(
    userId: string,
    leaveTypeId: string,
    year: number,
  ): Promise<number | null> {
    const [balance] = await this.dataSource.query<{ remainingDays: number }[]>(
      `SELECT remaining_days AS "remainingDays"
       FROM leave_balances
       WHERE user_id = $1::uuid AND leave_type_id = $2::uuid AND year = $3`,
      [userId, leaveTypeId, year],
    );
    return balance ? Number(balance.remainingDays) : null;
  }

  private async hasBalance(
    runner: Pick<EntityManager, 'query'>,
    userId: string,
    leaveTypeId: string,
    year: number,
  ): Promise<boolean> {
    const rows = await queryRows<{ present: number }>(
      runner,
      `SELECT 1 AS present FROM leave_balances
       WHERE user_id = $1::uuid AND leave_type_id = $2::uuid AND year = $3`,
      [userId, leaveTypeId, year],
    );
    return rows.length > 0;
  }

  async reviewLeaveRequest(
    reviewer: JwtPayload,
    id: string,
    action: 'approve' | 'reject',
    reason?: string,
  ): Promise<void> {
    if (!holdsAnyRole(reviewer, REVIEWER_ROLES)) {
      throw new ForbiddenException('insufficient_role_to_review');
    }
    const decision = action === 'approve' ? 'approved' : 'rejected';
    const scope = await this.requesterScope(reviewer, 'review');
    if (reachesNobody(scope)) {
      throw new NotFoundException('leave_request_not_found');
    }

    // One transaction: concurrent reviewers serialise on the request row, and a balance
    // that no longer covers the leave undoes the whole decision
    await this.dataSource.transaction(async (mgr) => {
      const rows = await mgr.query<
        {
          id: string;
          status: string;
          requesterId: string;
          leaveTypeId: string;
          totalDays: number;
          fromDate: string;
          maxDaysPerYear: number | null;
        }[]
      >(
        `SELECT id, status, requester_id AS "requesterId",
                leave_type_id AS "leaveTypeId",
                total_days AS "totalDays",
                from_date::text AS "fromDate",
                (SELECT lt.max_days_per_year FROM leave_types lt WHERE lt.id = leave_type_id) AS "maxDaysPerYear"
         FROM leave_requests
         WHERE id = $1::uuid
           AND ${requesterScopeSql('requester_id', 2)}
         FOR UPDATE`,
        // Outside the reviewer's scope the request is not found
        [id, ...requesterScopeParams(scope)],
      );
      if (!rows.length) throw new NotFoundException('leave_request_not_found');
      const request = rows[0];
      if (request.requesterId === reviewer.sub) {
        throw new ForbiddenException('cannot_review_own_request');
      }
      if (request.status !== 'pending') {
        throw new ConflictException('leave_request_not_pending');
      }

      // leave_approvals.action records the outcome: 'approved' | 'rejected'
      await mgr.query(
        `INSERT INTO leave_approvals (leave_request_id, approver_id, action, reason, acted_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, NOW())`,
        [id, reviewer.sub, decision, reason ?? null],
      );

      const decided = await queryRows<{ id: string }>(
        mgr,
        `UPDATE leave_requests SET status = $1, updated_at = NOW()
         WHERE id = $2::uuid AND status = 'pending'
         RETURNING id`,
        [decision, id],
      );
      if (!decided.length)
        throw new ConflictException('leave_request_not_pending');

      if (action === 'approve') {
        // The same year the request was checked against when it was created
        const leaveYear = Number(request.fromDate.slice(0, 4));
        // A type with a yearly limit always has the year's balance, even when the limit was
        // set after the request was filed; a type without one draws on a balance only when
        // one was allocated
        if (request.maxDaysPerYear !== null) {
          await this.yearBalance(
            mgr,
            request.requesterId,
            request.leaveTypeId,
            leaveYear,
            request.maxDaysPerYear,
          );
        }
        const deducted = await queryRows<{ id: string }>(
          mgr,
          `UPDATE leave_balances
           SET used_days = used_days + $1,
               remaining_days = remaining_days - $1,
               updated_at = NOW()
           WHERE user_id = $2::uuid AND leave_type_id = $3::uuid AND year = $4
             AND remaining_days >= $1
           RETURNING id`,
          [
            request.totalDays,
            request.requesterId,
            request.leaveTypeId,
            leaveYear,
          ],
        );
        // Nothing deducted: a balance that exists is short; no balance means no limit
        if (
          !deducted.length &&
          (await this.hasBalance(
            mgr,
            request.requesterId,
            request.leaveTypeId,
            leaveYear,
          ))
        ) {
          throw new ConflictException('insufficient_leave_balance');
        }
      }
    });
  }

  async getLeaveBalances(userId: string): Promise<LeaveBalance[]> {
    return this.dataSource.query<LeaveBalance[]>(
      `SELECT lb.leave_type_id  AS "leaveTypeId",
              lt.name           AS "leaveTypeName",
              lb.total_days     AS "totalDays",
              lb.used_days      AS "usedDays",
              lb.remaining_days AS "remainingDays",
              lb.year
       FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.user_id = $1::uuid
       ORDER BY lb.year DESC, lt.name`,
      [userId],
    );
  }

  async cancelLeaveRequest(user: JwtPayload, requestId: string): Promise<void> {
    return this.dataSource.transaction(async (mgr) => {
      const rows = await mgr.query<{ requester_id: string; status: string }[]>(
        `SELECT requester_id, status FROM leave_requests WHERE id = $1::uuid FOR UPDATE`,
        [requestId],
      );
      if (!rows.length) throw new NotFoundException('leave_request_not_found');
      const req = rows[0];
      if (req.requester_id !== user.sub)
        throw new ForbiddenException('not_your_leave_request');
      if (req.status !== 'pending')
        throw new ConflictException('leave_request_not_pending');

      const result = await queryRows<{ id: string }>(
        mgr,
        `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1::uuid AND status = 'pending' RETURNING id`,
        [requestId],
      );
      if (!result.length)
        throw new ConflictException('leave_request_not_pending');
    });
  }

  async listApprovals(
    reviewer: JwtPayload,
    status?: string,
  ): Promise<Approval[]> {
    if (!holdsAnyRole(reviewer, REVIEWER_ROLES)) {
      throw new ForbiddenException('insufficient_role_to_view_approvals');
    }

    const statusFilter: string | null = status ?? null;
    const scope = await this.requesterScope(reviewer, 'review');
    if (reachesNobody(scope)) return [];

    const rows = await this.dataSource.query<
      {
        id: string;
        requesterName: string;
        leaveTypeName: string;
        fromDate: string;
        toDate: string;
        totalDays: number;
        reason: string;
        status: string;
        createdAt: Date;
      }[]
    >(
      `SELECT lr.id,
              u.full_name        AS "requesterName",
              lt.name            AS "leaveTypeName",
              lr.from_date       AS "fromDate",
              lr.to_date         AS "toDate",
              lr.total_days      AS "totalDays",
              lr.reason,
              lr.status,
              lr.created_at      AS "createdAt"
       FROM leave_requests lr
       JOIN users u ON u.id = lr.requester_id
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE ($1::text IS NULL OR lr.status = $1::text)
         AND ${requesterScopeSql('lr.requester_id', 2)}
       ORDER BY lr.created_at DESC`,
      [statusFilter, ...requesterScopeParams(scope)],
    );

    return rows.map((r) => ({
      id: r.id,
      type: 'leave' as const,
      submittedBy: r.requesterName,
      title: `${r.leaveTypeName}: ${r.fromDate} – ${r.toDate} (${r.totalDays} ngày)`,
      description: r.reason,
      submittedAt: new Date(r.createdAt).toISOString(),
      status: r.status as 'pending' | 'approved' | 'rejected',
    }));
  }
}

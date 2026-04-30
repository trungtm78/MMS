import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/auth.service';
import { CreateLeaveDto } from './dto/create-leave.dto';

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
}

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

const REVIEWER_ROLES = new Set(['police_ward', 'police_area', 'system_admin']);

/** Count weekdays (Mon–Fri) between two inclusive date strings YYYY-MM-DD */
function countWeekdays(fromDate: string, toDate: string): number {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function generateCode(): string {
  const today = new Date();
  const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).toUpperCase().slice(2, 8).padEnd(6, '0');
  return `LEAVE-${yyyymmdd}-${random}`;
}

@Injectable()
export class LeaveService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listLeaveRequests(
    user: JwtPayload,
    params: { status?: string; page?: number; limit?: number },
  ): Promise<{ data: LeaveRequest[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    const isReviewer = REVIEWER_ROLES.has(user.role);
    // Reviewers with unitScope see all in their unit; system_admin sees all
    const scopedRequesterId: string | null = isReviewer ? null : user.sub;
    const statusFilter: string | null = params.status ?? null;

    const countRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
       FROM leave_requests lr
       JOIN users u ON u.id = lr.requester_id
       WHERE ($1::uuid IS NULL OR lr.requester_id = $1::uuid)
         AND ($2::text IS NULL OR lr.status = $2::text)`,
      [scopedRequesterId, statusFilter],
    );
    const total = parseInt(countRows[0]?.count ?? '0', 10);

    const data = await this.dataSource.query<LeaveRequest[]>(
      `SELECT lr.id,
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
              lr.updated_at       AS "updatedAt"
       FROM leave_requests lr
       JOIN users u ON u.id = lr.requester_id
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE ($1::uuid IS NULL OR lr.requester_id = $1::uuid)
         AND ($2::text IS NULL OR lr.status = $2::text)
       ORDER BY lr.created_at DESC
       LIMIT $3 OFFSET $4`,
      [scopedRequesterId, statusFilter, limit, offset],
    );

    return { data, total, page, limit };
  }

  async getLeaveRequest(id: string): Promise<LeaveRequest> {
    const rows = await this.dataSource.query<LeaveRequest[]>(
      `SELECT lr.id,
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
              lr.updated_at       AS "updatedAt"
       FROM leave_requests lr
       JOIN users u ON u.id = lr.requester_id
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.id = $1::uuid
       LIMIT 1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('leave_request_not_found');
    return rows[0];
  }

  async createLeaveRequest(user: JwtPayload, dto: CreateLeaveDto): Promise<LeaveRequest> {
    // Validate leave type exists
    const typeRows = await this.dataSource.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM leave_types WHERE id = $1::uuid LIMIT 1`,
      [dto.leaveTypeId],
    );
    if (!typeRows.length) throw new NotFoundException('leave_type_not_found');

    // Calculate total days
    const weekdays = countWeekdays(dto.fromDate, dto.toDate);
    const totalDays = dto.isHalfDay ? 0.5 : weekdays;

    if (totalDays <= 0) {
      throw new BadRequestException('invalid_date_range_no_working_days');
    }

    // Check leave balance for current year
    const currentYear = new Date().getFullYear();
    const balanceRows = await this.dataSource.query<
      { id: string; remainingDays: number }[]
    >(
      `SELECT id, remaining_days AS "remainingDays"
       FROM leave_balances
       WHERE user_id = $1::uuid AND leave_type_id = $2::uuid AND year = $3
       LIMIT 1`,
      [user.sub, dto.leaveTypeId, currentYear],
    );

    if (!balanceRows.length) {
      throw new BadRequestException('no_leave_balance_for_this_year');
    }
    if (balanceRows[0].remainingDays < totalDays) {
      throw new BadRequestException('insufficient_leave_balance');
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
        dto.fromDate,
        dto.toDate,
        dto.isHalfDay ?? false,
        dto.halfDayPeriod ?? null,
        dto.reason,
        dto.replacementId ?? null,
        totalDays,
      ],
    );

    return this.getLeaveRequest(inserted[0].id);
  }

  async reviewLeaveRequest(
    reviewer: JwtPayload,
    id: string,
    action: 'approve' | 'reject',
    reason?: string,
  ): Promise<void> {
    if (!REVIEWER_ROLES.has(reviewer.role)) {
      throw new ForbiddenException('insufficient_role_to_review');
    }

    // Fetch existing request — must be pending
    const rows = await this.dataSource.query<
      { id: string; status: string; requesterId: string; leaveTypeId: string; totalDays: number }[]
    >(
      `SELECT id, status, requester_id AS "requesterId",
              leave_type_id AS "leaveTypeId",
              total_days AS "totalDays"
       FROM leave_requests WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    if (!rows.length) throw new NotFoundException('leave_request_not_found');
    if (rows[0].status !== 'pending') {
      throw new BadRequestException('leave_request_not_pending');
    }
    const request = rows[0];

    // Insert approval record
    await this.dataSource.query(
      `INSERT INTO leave_approvals (leave_request_id, approver_id, action, reason, acted_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, NOW())`,
      [id, reviewer.sub, action, reason ?? null],
    );

    // Update request status
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await this.dataSource.query(
      `UPDATE leave_requests SET status = $1, updated_at = NOW() WHERE id = $2::uuid`,
      [newStatus, id],
    );

    // If approved: deduct balance
    if (action === 'approve') {
      const currentYear = new Date().getFullYear();
      await this.dataSource.query(
        `UPDATE leave_balances
         SET used_days = used_days + $1,
             remaining_days = remaining_days - $1
         WHERE user_id = $2::uuid AND leave_type_id = $3::uuid AND year = $4`,
        [request.totalDays, request.requesterId, request.leaveTypeId, currentYear],
      );
    }
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
    const rows = await this.dataSource.query<{ requester_id: string; status: string }[]>(
      `SELECT requester_id, status FROM leave_requests WHERE id = $1::uuid`,
      [requestId],
    );
    if (!rows.length) throw new NotFoundException('leave_request_not_found');
    const req = rows[0];
    if (req.requester_id !== user.sub) throw new ForbiddenException('not_your_leave_request');
    if (req.status !== 'pending') throw new BadRequestException('leave_request_not_pending');

    await this.dataSource.query(
      `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1::uuid`,
      [requestId],
    );
  }

  async listApprovals(reviewer: JwtPayload, status?: string): Promise<Approval[]> {
    if (!REVIEWER_ROLES.has(reviewer.role)) {
      throw new ForbiddenException('insufficient_role_to_view_approvals');
    }

    const statusFilter: string | null = status ?? null;

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
       ORDER BY lr.created_at DESC`,
      [statusFilter],
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

import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryMany } from '../db/pool';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  code: string;
  requesterId: string;
  requesterName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  fromDate: Date;
  toDate: Date;
  isHalfDay: boolean;
  halfDayPeriod: string | null;
  reason: string;
  replacementId: string | null;
  replacementName: string | null;
  status: LeaveStatus;
  totalDays: number;
  createdAt: Date;
  approvals: LeaveApproval[];
}

export interface LeaveApproval {
  id: string;
  leaveRequestId: string;
  approverId: string;
  approverName: string;
  action: 'approved' | 'rejected';
  reason: string | null;
  actedAt: Date;
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxDaysPerYear: number | null;
  requiresDocument: boolean;
  isPaid: boolean;
}

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const types = await queryMany<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    max_days_per_year: number | null;
    requires_document: boolean;
    is_paid: boolean;
  }>('SELECT * FROM leave_types ORDER BY name');

  return types.map(t => ({
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    maxDaysPerYear: t.max_days_per_year,
    requiresDocument: t.requires_document,
    isPaid: t.is_paid,
  }));
}

export async function generateLeaveCode(): Promise<string> {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');

  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM leave_requests 
     WHERE EXTRACT(YEAR FROM created_at) = $1 
     AND EXTRACT(MONTH FROM created_at) = $2`,
    [year, month]
  );

  const count = parseInt(result?.count || '0') + 1;
  return `NP-${year}${month}-${String(count).padStart(4, '0')}`;
}

// US-007: Leave request and approval workflow
// BR-007: Leave approval is traceable - Create request with approver tracking
export async function createLeaveRequest(
  userId: string,
  data: {
    leaveTypeId: string;
    fromDate: Date;
    toDate: Date;
    isHalfDay?: boolean;
    halfDayPeriod?: 'morning' | 'afternoon';
    reason: string;
    replacementId?: string;
  }
): Promise<LeaveRequest> {
  const code = await generateLeaveCode();
  const requestId = uuidv4();

  // Calculate total days
  let totalDays = 1;
  if (!data.isHalfDay) {
    const diffTime = Math.abs(new Date(data.toDate).getTime() - new Date(data.fromDate).getTime());
    totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  } else {
    totalDays = 0.5;
  }

  await queryOne(
    `INSERT INTO leave_requests (
      id, code, requester_id, leave_type_id, from_date, to_date, 
      is_half_day, half_day_period, reason, replacement_id, total_days, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')`,
    [
      requestId, code, userId, data.leaveTypeId, data.fromDate, data.toDate,
      data.isHalfDay || false, data.halfDayPeriod || null, data.reason,
      data.replacementId || null, totalDays
    ]
  );

  return getLeaveRequestById(requestId) as Promise<LeaveRequest>;
}

export async function getLeaveRequestById(requestId: string): Promise<LeaveRequest | null> {
  const request = await queryOne<{
    id: string;
    code: string;
    requester_id: string;
    requester_name: string;
    leave_type_id: string;
    leave_type_name: string;
    from_date: Date;
    to_date: Date;
    is_half_day: boolean;
    half_day_period: string | null;
    reason: string;
    replacement_id: string | null;
    replacement_name: string | null;
    status: LeaveStatus;
    total_days: number;
    created_at: Date;
  }>(
    `SELECT 
      lr.*, 
      u1.full_name as requester_name,
      lt.name as leave_type_name,
      u2.full_name as replacement_name
    FROM leave_requests lr
    JOIN users u1 ON lr.requester_id = u1.id
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    LEFT JOIN users u2 ON lr.replacement_id = u2.id
    WHERE lr.id = $1`,
    [requestId]
  );

  if (!request) return null;

  const approvals = await queryMany<{
    id: string;
    leave_request_id: string;
    approver_id: string;
    approver_name: string;
    action: 'approved' | 'rejected';
    reason: string | null;
    acted_at: Date;
  }>(
    `SELECT la.*, u.full_name as approver_name
     FROM leave_approvals la
     JOIN users u ON la.approver_id = u.id
     WHERE la.leave_request_id = $1
     ORDER BY la.acted_at DESC`,
    [requestId]
  );

  return {
    id: request.id,
    code: request.code,
    requesterId: request.requester_id,
    requesterName: request.requester_name,
    leaveTypeId: request.leave_type_id,
    leaveTypeName: request.leave_type_name,
    fromDate: request.from_date,
    toDate: request.to_date,
    isHalfDay: request.is_half_day,
    halfDayPeriod: request.half_day_period,
    reason: request.reason,
    replacementId: request.replacement_id,
    replacementName: request.replacement_name,
    status: request.status,
    totalDays: request.total_days,
    createdAt: request.created_at,
    approvals: approvals.map(a => ({
      id: a.id,
      leaveRequestId: a.leave_request_id,
      approverId: a.approver_id,
      approverName: a.approver_name,
      action: a.action,
      reason: a.reason,
      actedAt: a.acted_at,
    })),
  };
}

export async function getMyLeaveRequests(
  userId: string,
  options?: { status?: LeaveStatus; page?: number; limit?: number }
): Promise<{ requests: LeaveRequest[]; total: number }> {
  const { status, page = 1, limit = 20 } = options || {};
  const offset = (page - 1) * limit;

  const conditions = ['lr.requester_id = $1'];
  const values: unknown[] = [userId];
  let paramCount = 2;

  if (status) {
    conditions.push(`lr.status = $${paramCount++}`);
    values.push(status);
  }

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM leave_requests lr WHERE ${conditions.join(' AND ')}`,
    values
  );
  const total = parseInt(countResult?.count || '0');

  const requests = await queryMany<{ id: string }>(
    `SELECT lr.id FROM leave_requests lr
     WHERE ${conditions.join(' AND ')}
     ORDER BY lr.created_at DESC
     LIMIT $${paramCount++} OFFSET $${paramCount++}`,
    [...values, limit, offset]
  );

  const requestDetails = await Promise.all(
    requests.map(r => getLeaveRequestById(r.id))
  );

  return {
    requests: requestDetails.filter((r): r is LeaveRequest => r !== null),
    total,
  };
}

// US-007: Leave request and approval workflow
// BR-007: Leave approval is traceable - Record approver, action, reason, timestamp
export async function approveLeaveRequest(
  requestId: string,
  approverId: string,
  action: 'approved' | 'rejected',
  reason?: string
): Promise<LeaveRequest | null> {
  const request = await queryOne<{ id: string; status: string }>(
    'SELECT id, status FROM leave_requests WHERE id = $1',
    [requestId]
  );

  if (!request || request.status !== 'pending') {
    return null;
  }

  await queryOne(
    `INSERT INTO leave_approvals (leave_request_id, approver_id, action, reason)
     VALUES ($1, $2, $3, $4)`,
    [requestId, approverId, action, reason || null]
  );

  await queryOne(
    `UPDATE leave_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
    [action, requestId]
  );

  return getLeaveRequestById(requestId);
}

export async function getLeaveBalance(userId: string, year?: number): Promise<{
  typeId: string;
  typeName: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
}[]> {
  const targetYear = year || new Date().getFullYear();

  const balances = await queryMany<{
    type_id: string;
    type_name: string;
    total_days: number;
    used_days: number;
    remaining_days: number;
  }>(
    `SELECT 
      lt.id as type_id,
      lt.name as type_name,
      COALESCE(lb.total_days, lt.max_days_per_year, 0) as total_days,
      COALESCE(lb.used_days, 0) as used_days,
      COALESCE(lb.remaining_days, lt.max_days_per_year, 0) as remaining_days
    FROM leave_types lt
    LEFT JOIN leave_balances lb ON lt.id = lb.leave_type_id AND lb.user_id = $1 AND lb.year = $2
    WHERE lt.is_paid = true
    ORDER BY lt.name`,
    [userId, targetYear]
  );

  return balances.map(b => ({
    typeId: b.type_id,
    typeName: b.type_name,
    totalDays: b.total_days,
    usedDays: b.used_days,
    remainingDays: b.remaining_days,
  }));
}

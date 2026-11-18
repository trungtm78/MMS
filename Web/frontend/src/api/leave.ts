// US-W007: Leave request API — Web/backend/src/leave/leave.controller.ts, leave.service.ts
import client from './client'
import type { LeaveBalance, LeaveRequest, LeaveStatus } from '@/types'

/** Row of GET /leave and GET /leave/:id: the request with its latest decision (leave.service.ts LeaveRequest) */
export interface LeaveRequestRow extends LeaveRequest {
  /** Who decided; null while nobody decided the request */
  reviewedBy: { id: string; fullName: string } | null
  /** ISO timestamp of the decision */
  reviewedAt: string | null
  reviewNote: string | null
}

/** Row of GET /leave/types: an active type a new request may use (leave.service.ts LeaveType) */
export interface LeaveType {
  id: string
  code: string
  name: string
  description: string | null
  maxDaysPerYear: number | null
  requiresDocument: boolean | null
  isPaid: boolean | null
}

export interface LeaveList {
  data: LeaveRequestRow[]
  total: number
  page: number
  limit: number
}

export type HalfDayPeriod = 'morning' | 'afternoon'

/** Body of POST /leave — CreateLeaveDto; the API rejects any other property */
export interface CreateLeaveBody {
  leaveTypeId: string
  fromDate: string // YYYY-MM-DD
  toDate: string // YYYY-MM-DD
  reason: string
  isHalfDay?: boolean
  halfDayPeriod?: HalfDayPeriod
  /** users.id of the person covering the requester */
  replacementId?: string
}

/** CreateLeaveDto property names as they appear in validation messages, per form field */
export const LEAVE_FORM_FIELDS = {
  leaveTypeId: ['leaveTypeId'],
  fromDate: ['fromDate', 'from_date'],
  toDate: ['toDate', 'to_date'],
  isHalfDay: ['isHalfDay'],
  halfDayPeriod: ['halfDayPeriod'],
  reason: ['reason'],
  replacementId: ['replacementId'],
} as const

export type LeaveFormField = keyof typeof LEAVE_FORM_FIELDS

export type LeaveReviewAction = 'approve' | 'reject'

/** Row of GET /approvals (LeaveService.listApprovals) */
export interface Approval {
  id: string
  type: 'leave' | string
  submittedBy: string
  title: string
  description: string
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected'
}

/** Largest page the server returns */
export const LEAVE_MAX_LIMIT = 100

export const leaveKeys = {
  all: ['leave'] as const,
  mine: ['leave', 'mine'] as const,
  pending: ['leave', 'pending'] as const,
  balances: ['leave', 'balances'] as const,
  types: ['leave', 'types'] as const,
  approvals: ['approvals'] as const,
}

// Backend error codes of these endpoints are translated by the error table
// (src/i18n/locales/vi/errors.json): POST /leave → scope 'leave.create';
// PATCH /leave/:id/review and PUT /approvals/:id/approve|reject → 'leave.review';
// PATCH /leave/:id/cancel → 'leave.cancel'; GET /approvals → 'leave.approvals'.

export const leaveApi = {
  // GET /leave — the caller's scope (own for requesters, unit/assigned for reviewers);
  // mine=true narrows it to the caller's own requests
  list: async (
    query: { status?: LeaveStatus; mine?: boolean; page?: number; limit?: number } = {},
  ): Promise<LeaveList> => {
    const params: Record<string, string | number | boolean> = { page: query.page ?? 1, limit: query.limit ?? 20 }
    if (query.status) params.status = query.status
    if (query.mine) params.mine = true
    const response = await client.get<LeaveList>('/leave', { params })
    return response.data
  },

  // GET /leave-balances — the caller's balances, newest year first
  balances: async (): Promise<LeaveBalance[]> => {
    const response = await client.get<LeaveBalance[]>('/leave-balances')
    return response.data
  },

  // GET /leave/types — active types only (a retired one answers 400 leave_type_inactive on create)
  types: async (): Promise<LeaveType[]> => {
    const response = await client.get<LeaveType[]>('/leave/types')
    return response.data
  },

  // US-W007 AC-1: POST /leave
  create: async (body: CreateLeaveBody): Promise<LeaveRequestRow> => {
    const response = await client.post<LeaveRequestRow>('/leave', body)
    return response.data
  },

  // US-W007 AC-2: PATCH /leave/:id/review { action, reason? } → 204
  review: async (id: string, action: LeaveReviewAction, reason?: string): Promise<void> => {
    await client.patch(`/leave/${id}/review`, reason ? { action, reason } : { action })
  },

  // PATCH /leave/:id/cancel → 204 (own pending requests only)
  cancel: async (id: string): Promise<void> => {
    await client.patch(`/leave/${id}/cancel`)
  },

  // GET /approvals?status=
  listApprovals: async (status?: Approval['status']): Promise<Approval[]> => {
    const response = await client.get<Approval[]>('/approvals', { params: status ? { status } : {} })
    return response.data
  },

  // PUT /approvals/:id/approve | /approvals/:id/reject → 204
  decideApproval: async (id: string, action: LeaveReviewAction): Promise<void> => {
    await client.put(`/approvals/${id}/${action}`)
  },
}

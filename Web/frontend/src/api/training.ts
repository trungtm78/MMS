// Huấn luyện — Web/backend/src/training. Training records (GET /training), annual training
// plans, training sessions and session attendance (training-plans.controller.ts). The code lists
// and limits copy training-plan-codes.ts and dto/training-plan.dto.ts; records carry the backend
// label of their type, and forms label the codes from the locale file (training.codes.*).
import { calendarDaysBetween } from '@/lib/dates'
import client from './client'

export interface TrainingRecord {
  id: string
  militiaId: string
  trainingType: 'military' | 'political' | 'fire' | 'first_aid' | 'other'
  fromDate: string
  toDate: string
  totalDays: number
  location: string | null
  instructor: string | null
  result: 'pass' | 'fail' | 'not_evaluated'
  certificateNo: string | null
  notes: string | null
  createdAt: string
}

export interface PaginatedTraining {
  data: TrainingRecord[]
  total: number
  page: number
  limit: number
}

// dto/create-training.dto.ts TRAINING_TYPES
export const TRAINING_TYPES = ['military', 'political', 'fire', 'first_aid', 'other'] as const
export type TrainingType = (typeof TRAINING_TYPES)[number]

// training-plan-codes.ts
export const TRAINING_PLAN_STATUSES = ['draft', 'active', 'completed'] as const
export type TrainingPlanStatus = (typeof TRAINING_PLAN_STATUSES)[number]

/** A plan moves forward only: the status each target requires the plan to be in */
export const TRAINING_PLAN_TRANSITIONS = {
  active: 'draft',
  completed: 'active',
} as const satisfies Record<string, TrainingPlanStatus>
export type TrainingPlanTarget = keyof typeof TRAINING_PLAN_TRANSITIONS

// A session's status follows from its dates and the Vietnamese calendar day
export const TRAINING_SESSION_STATUSES = ['upcoming', 'ongoing', 'completed'] as const
export type TrainingSessionStatus = (typeof TRAINING_SESSION_STATUSES)[number]

// dto/training-plan.dto.ts limits
export const PLAN_YEAR_RANGE = { min: 2000, max: 2100 } as const
export const PLAN_REQUIRED_DAYS_RANGE = { min: 0.5, max: 365 } as const
export const SESSION_DAYS_RANGE = { min: 0.5, max: 366 } as const
export const PLAN_TITLE_MAX_LENGTH = 200
export const UNIT_CODE_MAX_LENGTH = 50
export const SESSION_TEXT_MAX_LENGTH = 200

// training-plans.service.ts TrainingPlanRecord
export interface TrainingPlanRecord {
  id: string
  year: number
  type: TrainingType
  typeLabel: string
  title: string | null
  requiredDays: number
  /** Days of the plan's sessions that ended before today in Vietnam */
  completedDays: number
  scheduledDays: number
  sessionCount: number
  status: TrainingPlanStatus
  /** null: a ward-wide plan */
  unitCode: string | null
  unitName: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  activatedAt: string | null
  completedAt: string | null
}

// training-plans.service.ts TrainingSessionRecord
export interface TrainingSessionRecord {
  id: string
  planId: string
  name: string
  type: TrainingType
  typeLabel: string
  startDate: string
  endDate: string
  location: string
  daysCount: number
  status: TrainingSessionStatus
  planYear: number
  planStatus: TrainingPlanStatus
  unitCode: string | null
  unitName: string | null
  /** Attendance rows of members in the caller's scope */
  recordedCount: number
  attendedCount: number
  /** Present only once attendance has been recorded */
  attendancePercent?: number
  createdBy: string
  createdAt: string
}

// training-plans.service.ts SessionMember
export interface SessionMember {
  id: string
  name: string
  militiaCode: string
  unitCode: string
  /** null until attendance is recorded for the member */
  attended: boolean | null
}

export interface AttendanceEntry {
  memberId: string
  attended: boolean
}

// dto/training-plan.dto.ts CreateTrainingPlanDto — without a unit code the plan belongs to the
// caller's unit, or to the whole ward for ward-level roles
export interface CreateTrainingPlanBody {
  year: number
  type: TrainingType
  requiredDays: number
  title?: string
  unitCode?: string
}

// dto/training-plan.dto.ts CreateTrainingSessionDto
export interface CreateTrainingSessionBody {
  planId: string
  name: string
  startDate: string
  endDate: string
  location: string
  daysCount: number
}

// dto/training-plan.dto.ts TrainingPlanQueryDto
export interface TrainingPlanFilters {
  year?: number
  status?: TrainingPlanStatus
  unitCode?: string
}

// dto/training-plan.dto.ts TrainingSessionQueryDto
export interface TrainingSessionFilters {
  planId?: string
  year?: number
  unitCode?: string
}

/**
 * A number of training days the backend accepts (dto DAYS rule): finite, within [min, max] and
 * written with at most one decimal — whole or half days as training_records.total_days counts them.
 */
export function isDayAmount(value: number, min: number, max: number): boolean {
  if (!Number.isFinite(value) || value < min || value > max) return false
  const decimals = String(value).split('.')[1] ?? ''
  return decimals.length <= 1
}

/** Calendar days from start to end inclusive, for YYYY-MM-DD dates (training-plans.service.ts spanDays) */
export function sessionSpanDays(startDate: string, endDate: string): number {
  return calendarDaysBetween(startDate, endDate) + 1
}

export type AttendanceBlocker = 'training_plan_not_active' | 'training_session_not_started'

/**
 * Why the backend would refuse attendance for a session (recordAttendance checks the plan first,
 * then the start date), or null when it can be recorded.
 */
export function attendanceBlocker(session: Pick<TrainingSessionRecord, 'planStatus' | 'status'>): AttendanceBlocker | null {
  if (session.planStatus !== 'active') return 'training_plan_not_active'
  if (session.status === 'upcoming') return 'training_session_not_started'
  return null
}

/** The status a plan may move to next, or null once it is completed */
export function nextPlanStatus(status: TrainingPlanStatus): TrainingPlanTarget | null {
  const targets = Object.keys(TRAINING_PLAN_TRANSITIONS) as TrainingPlanTarget[]
  return targets.find((target) => TRAINING_PLAN_TRANSITIONS[target] === status) ?? null
}

export const trainingKeys = {
  plans: ['training-plans'] as const,
  sessions: ['training-sessions'] as const,
  members: (sessionId: string) => ['training-session-members', sessionId] as const,
}

export const trainingApi = {
  // Use militiaId + year to avoid fetching all-member data (NĐ 13/2023 data minimization)
  listRecords: (params: { militiaId: string; year?: number; limit?: number }) =>
    client.get<PaginatedTraining>('/training', { params }).then((r) => r.data),

  // GET /training/plans — the caller's unit and ward-wide plans
  listPlans: async (filters: TrainingPlanFilters = {}): Promise<TrainingPlanRecord[]> =>
    (await client.get<TrainingPlanRecord[]>('/training/plans', { params: filters })).data,

  // POST /training/plans — a new draft plan
  createPlan: async (body: CreateTrainingPlanBody): Promise<TrainingPlanRecord> =>
    (await client.post<TrainingPlanRecord>('/training/plans', body)).data,

  // PATCH /training/plans/:id/status — draft → active → completed
  updatePlanStatus: async (id: string, status: TrainingPlanTarget): Promise<TrainingPlanRecord> =>
    (await client.patch<TrainingPlanRecord>(`/training/plans/${id}/status`, { status })).data,

  // GET /training/sessions
  listSessions: async (filters: TrainingSessionFilters = {}): Promise<TrainingSessionRecord[]> =>
    (await client.get<TrainingSessionRecord[]>('/training/sessions', { params: filters })).data,

  // POST /training/sessions — in a draft or active plan, within the plan year
  createSession: async (body: CreateTrainingSessionBody): Promise<TrainingSessionRecord> =>
    (await client.post<TrainingSessionRecord>('/training/sessions', body)).data,

  // GET /training/sessions/:id/members — the attendance roster
  sessionMembers: async (sessionId: string): Promise<SessionMember[]> =>
    (await client.get<SessionMember[]>(`/training/sessions/${sessionId}/members`)).data,

  // POST /training/sessions/:id/attendance — replaces earlier answers of the listed members
  recordAttendance: async (sessionId: string, attendance: AttendanceEntry[]): Promise<TrainingSessionRecord> =>
    (await client.post<TrainingSessionRecord>(`/training/sessions/${sessionId}/attendance`, { attendance })).data,
}

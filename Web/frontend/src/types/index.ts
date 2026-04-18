// US-W001: Auth & RBAC types
export type UserRole =
  | 'system_admin'
  | 'ubnd_leader'
  | 'police_ward'
  | 'police_area'
  | 'office_staff'
  | 'dqtv'

export interface User {
  id: number
  username: string
  fullName: string
  role: UserRole
  unitScope: string | null // null = full ward access; 'KP1'...'KP6' = area scope
  email: string
  phone: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginRequest {
  username: string
  password: string
  rememberMe?: boolean
}

export interface LoginResponse {
  user: User
  tokens: AuthTokens
}

// US-W003: Militia profile types
export interface MilitiaProfile {
  id: string
  userId: number | null
  fullName: string
  dateOfBirth: string
  idCard: string
  phone: string
  address: string
  unitScope: string // KP1..KP6
  rank: string
  joinDate: string
  status: 'active' | 'inactive' | 'leave'
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

// US-W004/W005: Task types
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  title: string
  description: string
  assigneeId: string // militia profile id
  assigneeName: string
  assignedBy: number // user id
  assignedByName: string
  unitScope: string
  status: TaskStatus
  priority: TaskPriority
  deadline: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

// US-W006: Attendance types
export type AttendancePeriodStatus = 'open' | 'locked'

export interface AttendanceRecord {
  id: string
  militiaId: string
  militiaName: string
  unitScope: string
  date: string
  checkIn: string | null
  checkOut: string | null
  hoursWorked: number
  status: 'present' | 'absent' | 'late' | 'half_day'
  periodId: string
  enteredBy: number
  editedBy: number | null
  editedAt: string | null
  createdAt: string
}

export interface AttendancePeriod {
  id: string
  month: number
  year: number
  status: AttendancePeriodStatus
  closedBy: number | null
  closedAt: string | null
  createdAt: string
}

// US-W007: Leave request types
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveRequest {
  id: string
  militiaId: string
  militiaName: string
  startDate: string
  endDate: string
  reason: string
  status: LeaveStatus
  reviewedBy: number | null
  reviewedByName: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
}

// US-W008: SOS alert types
export type SosStatus = 'active' | 'acknowledged' | 'resolved'

export interface SosAlert {
  id: string
  militiaId: string
  militiaName: string
  unitScope: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  status: SosStatus
  acknowledgedBy: number | null
  acknowledgedByName: string | null
  resolvedBy: number | null
  resolvedAt: string | null
  createdAt: string
}

// US-W009: Device/session types
export interface DeviceEnrollment {
  id: string
  userId: number
  deviceId: string
  deviceName: string
  platform: string
  enrolledAt: string
  lastSeenAt: string | null
  isActive: boolean
}

export interface UserSession {
  id: string
  userId: number
  deviceId: string | null
  ipAddress: string
  userAgent: string
  createdAt: string
  expiresAt: string
  isActive: boolean
}

// US-W010: KPI / Payroll types
export type PayrollPeriodStatus = 'draft' | 'review' | 'locked'

export interface KpiScore {
  id: string
  militiaId: string
  militiaName: string
  periodId: string
  attendanceDays: number
  taskCompleted: number
  taskTotal: number
  score: number
  adjustedScore: number | null
  adjustmentNote: string | null
  adjustedBy: number | null
}

export interface PayrollPeriod {
  id: string
  month: number
  year: number
  status: PayrollPeriodStatus
  lockedBy: number | null
  lockedAt: string | null
  createdAt: string
}

// US-W012: Audit log types
export interface AuditLog {
  id: string
  actor: string // username
  actorId: number
  action: string
  resource: string
  resourceId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  ipAddress: string
  userAgent: string
  createdAt: string
}

// US-W013: GPS types
export interface GpsLog {
  id: string
  militiaId: string
  militiaName: string
  latitude: number
  longitude: number
  accuracy: number
  battery: number | null
  createdAt: string
}

// ─────────────────────────────────────────────────────
// US-SS-01: SmartSelect types
// ─────────────────────────────────────────────────────

export interface SmartSelectOption {
  id: string
  label: string       // e.g. "HCM-PHD-T12-0001 — Nguyễn Văn An"
  sublabel?: string   // e.g. "0909123456 | KP1 - Phú Định"
  disabled?: boolean
  meta?: Record<string, unknown>
}

// US-SS-01: Militia search result from BE /militia/search
export interface MilitiaSearchItem {
  id: string
  militiaCode: string
  fullName: string
  phone: string | null
  rank: string | null
  status: string
  unitCode: string
  unitName: string
}

// US-SS-08: User search result from BE /users/search
export interface UserSearchItem {
  id: string
  username: string
  fullName: string
  role: string | null
  status: string
}

// US-SS-08: Unit search result from BE /units/search
export interface UnitSearchItem {
  id: string
  code: string
  name: string
  type: string
  parentCode: string | null
}

// ─────────────────────────────────────────────────────
// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// API error
export interface ApiError {
  code: string
  message: string
  field?: string
}

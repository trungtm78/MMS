// US-SS-07: Attendance API
import client from './client'

export interface CreateAttendancePayload {
  militiaId: string
  workDate: string
  status: 'present' | 'absent' | 'late' | 'half_day'
  checkinAt?: string
  checkoutAt?: string
  note?: string
}

export interface AttendanceResult {
  id: string
  militiaId: string
  militiaName: string
  militiaCode: string
  workDate: string
  status: string
  checkinAt: string | null
  checkoutAt: string | null
  workHours: number | null
  source: string
  createdAt: string
}

// GET /attendance/timesheet (Web/backend/src/attendance/timesheet.ts, attendance.service.ts)

/** Status of a day: attendance recorded that day, else approved leave, else null */
export type TimesheetDayStatus = 'present' | 'late' | 'early_leave' | 'absent' | 'leave' | null

export interface TimesheetDay {
  date: string // YYYY-MM-DD
  status: TimesheetDayStatus
  /** HH:MM, already Vietnam time: shown as it is */
  checkIn: string | null
  checkOut: string | null
  workHours: number | null
  /** Approved leave covers the day, whatever was recorded */
  onLeave: boolean
}

export interface TimesheetTotals {
  present: number
  late: number
  earlyLeave: number
  absent: number
  leave: number
  /** Days up to today with neither a record nor approved leave */
  unrecorded: number
}

/** One member of the grid; a militia member's answer holds only their own row */
export interface TimesheetRow {
  militiaId: string
  userId: string | null
  fullName: string
  militiaCode: string
  unitCode: string
  unitName: string
  days: TimesheetDay[]
  totals: TimesheetTotals
}

export interface TimesheetResult {
  from: string
  to: string
  /** The unit the grid is limited to; null when not limited by unit */
  unitCode: string | null
  dates: string[]
  data: TimesheetRow[]
  total: number
  page: number
  limit: number
}

/** A month (YYYY-MM) or a from/to range of at most 62 days */
export type TimesheetRange = { month: string } | { from: string; to: string }

export type TimesheetQuery = TimesheetRange & { unitCode?: string; page?: number; limit?: number }

export const attendanceApi = {
  record: async (dto: CreateAttendancePayload): Promise<AttendanceResult> => {
    const response = await client.post<AttendanceResult>('/attendance', dto)
    return response.data
  },

  list: async (params?: { militiaId?: string; workDate?: string; page?: number; limit?: number }): Promise<AttendanceResult[]> => {
    const response = await client.get<AttendanceResult[]>('/attendance', { params })
    return response.data
  },

  // GET /attendance/timesheet?month=YYYY-MM | from=&to= &unitCode=&page=&limit= (a blank unit is left out)
  timesheet: async ({ unitCode, ...query }: TimesheetQuery): Promise<TimesheetResult> => {
    const params = unitCode ? { ...query, unitCode } : query
    const response = await client.get<TimesheetResult>('/attendance/timesheet', { params })
    return response.data
  },
}

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

export const attendanceApi = {
  record: async (dto: CreateAttendancePayload): Promise<AttendanceResult> => {
    const response = await client.post<AttendanceResult>('/attendance', dto)
    return response.data
  },

  list: async (params?: { militiaId?: string; workDate?: string; page?: number; limit?: number }): Promise<AttendanceResult[]> => {
    const response = await client.get<AttendanceResult[]>('/attendance', { params })
    return response.data
  },
}

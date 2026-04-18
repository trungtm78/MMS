// US-W007: Leave request API
import client from './client'
import type { LeaveRequest, PaginatedResponse } from '@/types'

export interface CreateLeaveDto {
  startDate: string
  endDate: string
  reason: string
}

export interface ReviewLeaveDto {
  status: 'approved' | 'rejected'
  reviewNote?: string
}

export const leaveApi = {
  list: async (params?: { status?: string; militiaId?: string; page?: number; limit?: number }): Promise<PaginatedResponse<LeaveRequest>> => {
    const response = await client.get<PaginatedResponse<LeaveRequest>>('/leave', { params })
    return response.data
  },

  // US-W007 AC-1: DQTV submit leave request
  create: async (dto: CreateLeaveDto): Promise<LeaveRequest> => {
    const response = await client.post<LeaveRequest>('/leave', dto)
    return response.data
  },

  // US-W007 AC-2: CA KV / CA Phường approve/reject
  review: async (id: string, dto: ReviewLeaveDto): Promise<LeaveRequest> => {
    const response = await client.patch<LeaveRequest>(`/leave/${id}/review`, dto)
    return response.data
  },
}

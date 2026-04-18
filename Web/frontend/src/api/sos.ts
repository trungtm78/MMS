// US-W008: SOS alert API
import client from './client'
import type { SosAlert, PaginatedResponse } from '@/types'

export interface CreateSosDto {
  latitude?: number | null
  longitude?: number | null
  accuracy?: number | null
}

export const sosApi = {
  list: async (params?: { status?: string; unitScope?: string; page?: number; limit?: number }): Promise<PaginatedResponse<SosAlert>> => {
    const response = await client.get<PaginatedResponse<SosAlert>>('/sos', { params })
    return response.data
  },

  // US-W008 AC-1: DQTV submit SOS
  create: async (dto: CreateSosDto): Promise<SosAlert> => {
    const response = await client.post<SosAlert>('/sos', dto)
    return response.data
  },

  // US-W008 AC-3: CA acknowledge
  acknowledge: async (id: string): Promise<SosAlert> => {
    const response = await client.patch<SosAlert>(`/sos/${id}/acknowledge`)
    return response.data
  },

  // US-W008 AC-3: CA resolve
  resolve: async (id: string): Promise<SosAlert> => {
    const response = await client.patch<SosAlert>(`/sos/${id}/resolve`)
    return response.data
  },
}

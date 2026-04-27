// US-W003 + US-SS-01: Militia profile API
import client from './client'
import type { MilitiaProfile, MilitiaSearchItem, PaginatedResponse } from '@/types'

// ─── Phase-2 list types (used by MilitiaList component) ─────────────────────

export interface MilitiaListItem {
  id: string
  userId: string | null
  militiaCode: string
  fullName: string
  unitCode: string
  unitName: string
  status: string
  phone: string | null
  email: string | null
  rank: string | null
  avatarUrl: string | null
  // NĐ 72/2020 Điều 15-18 compliance fields:
  occupation: string | null
  educationLevel: string | null
  healthStatus: string | null
  bloodType: string | null
  permanentAddress: string | null
  judicialClearanceStatus: string | null
}

export interface MilitiaSearchResult {
  id: string
  fullName: string
  militiaCode: string
  unitCode: string
  unitName: string | null
  status: string
  phone: string | null
  rank: string | null
  avatarUrl: string | null
}

export interface MilitiaPaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export async function searchMilitia(params: {
  q?: string
  unitCode?: string
  status?: string
  page?: number
  limit?: number
}): Promise<MilitiaPaginatedResponse<MilitiaSearchResult>> {
  const response = await client.get('/militia', { params: { limit: 20, page: 1, ...params } })
  const body = response.data
  // Backend returns paginated envelope { data, total, page, limit }
  // Guard: if backend returns a raw array (legacy), wrap it
  if (Array.isArray(body)) {
    return { data: body, total: body.length, page: params.page ?? 1, limit: params.limit ?? 20 }
  }
  return body
}

export async function getMilitiaById(id: string): Promise<MilitiaListItem> {
  const response = await client.get(`/militia/${id}`)
  return response.data
}

// ────────────────────────────────────────────────────────────────────────────

export interface QuickCreateMilitiaDto {
  militiaCode: string
  fullName: string
  phone?: string
  rank?: string
  unitCode: string
  gender?: 'male' | 'female'
  dob?: string
  position?: string
  joinDate?: string
}

export interface UpdateMilitiaDto {
  phone?: string
  address?: string
  rank?: string
  status?: MilitiaProfile['status']
  avatarUrl?: string | null
}

export const militiaApi = {
  // US-W003 AC-1: List with optional search — backend applies unit scope
  list: async (params?: { search?: string; unitScope?: string; page?: number; limit?: number }): Promise<PaginatedResponse<MilitiaProfile>> => {
    const response = await client.get<PaginatedResponse<MilitiaProfile>>('/militia', { params })
    return response.data
  },

  // US-W003 AC-2: Get single profile — backend enforces scope
  getById: async (id: string): Promise<MilitiaProfile> => {
    const response = await client.get<MilitiaProfile>(`/militia/${id}`)
    return response.data
  },

  // US-W003: Update profile (admin/CA only)
  update: async (id: string, dto: UpdateMilitiaDto): Promise<MilitiaProfile> => {
    const response = await client.patch<MilitiaProfile>(`/militia/${id}`, dto)
    return response.data
  },

  // US-SS-01 AC-1: Search militia for SmartSelect
  search: async (params?: { q?: string; unitCode?: string; limit?: number }): Promise<MilitiaSearchItem[]> => {
    const response = await client.get<MilitiaSearchItem[]>('/militia/search', { params })
    return response.data
  },

  // US-SS-05: Quick-create militia inline
  quickCreate: async (dto: QuickCreateMilitiaDto): Promise<MilitiaSearchItem> => {
    const response = await client.post<MilitiaSearchItem>('/militia/quick-create', dto)
    return response.data
  },
}

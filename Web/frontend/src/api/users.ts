// US-W002 + US-SS-08: User management API
import client from './client'
import type { User, UserSearchItem, UnitSearchItem, PaginatedResponse } from '@/types'

export interface CreateUserDto {
  username: string
  password: string
  fullName: string
  role: User['role']
  unitScope: string | null
  email: string
  phone: string
}

export interface UpdateUserDto {
  fullName?: string
  role?: User['role']
  unitScope?: string | null
  email?: string
  phone?: string
  isActive?: boolean
}

export const usersApi = {
  list: async (params?: { role?: string; page?: number; limit?: number }): Promise<PaginatedResponse<User>> => {
    const response = await client.get<PaginatedResponse<User>>('/users', { params })
    return response.data
  },

  getById: async (id: number): Promise<User> => {
    const response = await client.get<User>(`/users/${id}`)
    return response.data
  },

  // US-W002 AC-1: Create user
  create: async (dto: CreateUserDto): Promise<User> => {
    const response = await client.post<User>('/users', dto)
    return response.data
  },

  // US-W002 AC-2: Edit role/scope
  update: async (id: number, dto: UpdateUserDto): Promise<User> => {
    const response = await client.patch<User>(`/users/${id}`, dto)
    return response.data
  },

  // US-W002 AC-3: Disable — kicks active sessions
  disable: async (id: number): Promise<void> => {
    await client.patch(`/users/${id}`, { isActive: false })
  },

  // US-W002: Reset password
  resetPassword: async (id: number): Promise<{ tempPassword: string }> => {
    const response = await client.post<{ tempPassword: string }>(`/users/${id}/reset-password`)
    return response.data
  },

  // US-SS-08: Search users for SmartSelect
  search: async (params?: { q?: string; limit?: number }): Promise<UserSearchItem[]> => {
    const response = await client.get<UserSearchItem[]>('/users/search', { params })
    return response.data
  },
}

// US-SS-08: Units API
export const unitsApi = {
  search: async (params?: { q?: string; limit?: number }): Promise<UnitSearchItem[]> => {
    const response = await client.get<UnitSearchItem[]>('/units/search', { params })
    return response.data
  },
}

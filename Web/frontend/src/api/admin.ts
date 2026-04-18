import client from './client'

export interface AdminUser {
  id: string
  username: string
  fullName: string
  email: string | null
  phone: string | null
  status: string
  role: string | null
  unitScope: string | null
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface CreateUserDto {
  username: string
  fullName: string
  email?: string
  phone?: string
  role: string
  unitCode?: string
}

export async function listUsers(params: { page?: number; limit?: number; unitCode?: string } = {}): Promise<PaginatedResponse<AdminUser>> {
  const res = await client.get('/admin/users', { params: { page: 1, limit: 20, ...params } })
  return res.data
}

export async function createUser(dto: CreateUserDto): Promise<AdminUser> {
  const res = await client.post('/admin/users', dto)
  return res.data
}

export async function updateUserStatus(id: string, status: string): Promise<void> {
  await client.patch(`/admin/users/${id}/status`, { status })
}

export async function updateUserRole(id: string, role: string): Promise<void> {
  await client.patch(`/admin/users/${id}/role`, { role })
}

export async function resetPassword(id: string): Promise<{ temporaryPassword: string }> {
  const res = await client.post(`/admin/users/${id}/reset-password`)
  return res.data
}

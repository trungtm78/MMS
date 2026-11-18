// User administration API — Web/backend/src/admin/admin.controller.ts, admin.dto.ts, admin.service.ts
import client from './client'
import type { UserRole } from '@/types'

export type UserStatus = 'active' | 'inactive' | 'suspended'

/** Row of GET /admin/users (AdminService UserListItem) */
export interface AdminUser {
  id: string
  username: string
  fullName: string
  email: string | null
  phone: string | null
  status: UserStatus | string
  role: string | null // primary role, as in the auth token
  roles: string[] // every assigned role, primary first
  unitScope: string | null
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

/**
 * Body of POST /admin/users — exactly CreateUserBodyDto. The global ValidationPipe uses
 * forbidNonWhitelisted, so any other property is rejected with 400.
 */
export interface CreateUserBody {
  username: string
  fullName: string
  email?: string
  phone?: string
  role: UserRole
  unitCode?: string
}

// Validation rules of CreateUserBodyDto
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/
export const PHONE_PATTERN = /^[0-9+() .-]{6,20}$/

/** AdminService.OFFICE_STAFF_ASSIGNABLE_ROLES — everything else is system_admin only */
export const OFFICE_STAFF_ASSIGNABLE_ROLES: readonly UserRole[] = ['ca_officer', 'office_staff', 'dqtv_member', 'dqtv']

// Backend error codes of these endpoints are translated by the error table: errors.admin.<code>

export interface CreateUserInput {
  username: string
  fullName: string
  email: string
  phone: string
  role: UserRole
  unitCode: string
}

export type CreateUserField = keyof CreateUserInput

/** POST /admin/users codes that concern one form field (text: errors.admin.<code>) */
export const CREATE_USER_ERROR_FIELDS: Readonly<Record<string, CreateUserField>> = {
  unknown_role: 'role',
  role_not_assignable: 'role',
  unknown_unit: 'unitCode',
  username_taken: 'username',
  email_taken: 'email',
}

/** CreateUserBodyDto property names that validation_failed messages start with, per form field */
export const CREATE_USER_VALIDATION_FIELDS: Readonly<Record<CreateUserField, readonly string[]>> = {
  username: ['username'],
  fullName: ['fullName'],
  email: ['email'],
  phone: ['phone'],
  role: ['role'],
  unitCode: ['unitCode'],
}

/** Trimmed CreateUserBodyDto; optional fields only when filled in */
export function buildCreateUserBody(input: CreateUserInput): CreateUserBody {
  const body: CreateUserBody = {
    username: input.username.trim(),
    fullName: input.fullName.trim(),
    role: input.role,
  }
  const email = input.email.trim()
  const phone = input.phone.trim()
  const unitCode = input.unitCode.trim()
  if (email) body.email = email
  if (phone) body.phone = phone
  if (unitCode) body.unitCode = unitCode
  return body
}

export async function listUsers(
  params: { page?: number; limit?: number; unitCode?: string; role?: UserRole } = {},
): Promise<PaginatedResponse<AdminUser>> {
  const query: Record<string, string | number> = { page: params.page ?? 1, limit: params.limit ?? 20 }
  if (params.unitCode) query.unitCode = params.unitCode
  if (params.role) query.role = params.role
  const res = await client.get<PaginatedResponse<AdminUser>>('/admin/users', { params: query })
  return res.data
}

export async function createUser(body: CreateUserBody): Promise<AdminUser & { temporaryPassword: string }> {
  const res = await client.post<AdminUser & { temporaryPassword: string }>('/admin/users', body)
  return res.data
}

export async function updateUserStatus(id: string, status: UserStatus): Promise<void> {
  await client.patch(`/admin/users/${id}/status`, { status })
}

export async function updateUserRole(id: string, role: UserRole): Promise<void> {
  await client.patch(`/admin/users/${id}/role`, { role })
}

/**
 * POST /admin/users/:id/mfa/reset → 204 (MfaAdminController, system_admin only). Removes the
 * authenticator and recovery codes and ends every session of that user.
 */
export async function resetUserMfa(id: string): Promise<void> {
  await client.post(`/admin/users/${id}/mfa/reset`)
}

export async function resetPassword(id: string): Promise<{ temporaryPassword: string }> {
  const res = await client.post<{ temporaryPassword: string }>(`/admin/users/${id}/reset-password`)
  return res.data
}

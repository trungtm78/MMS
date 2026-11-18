// CA → DQTV assignments — Web/backend/src/assignments/assignments.controller.ts, assignments.service.ts
import apiClient from './client'
import type { UserRole } from '@/types'

export interface AssignmentRow {
  id: string
  caUserId: string
  dqtvUserId: string
  dqtvFullName: string
  dqtvUnitCode: string
  assignedBy: string
  assignedAt: string
}

export interface UserRow {
  id: string
  fullName: string
  role: string
  unitScope: string | null
}

/** Row of GET /militia (militia.service.ts searchMilitia) */
export interface MilitiaUserRow {
  id: string
  /** null when the member has no system account yet: such a member cannot be assigned */
  userId: string | null
  fullName: string
  unitCode: string
}

/**
 * Web/backend/src/common/constants/roles.ts CA_ROLES — the officers GET /assignments serves;
 * GET /admin/users?role= matches any role a user holds.
 */
export const CA_OFFICER_ROLES = ['police_ward', 'police_area', 'ca_officer', 'ca_ward', 'ca_area'] as const satisfies readonly UserRole[]

// admin.service.ts listUsers never answers more than 100 rows per page
const ADMIN_USERS_PAGE_LIMIT = 100

export async function getAssignments(caUserId: string): Promise<AssignmentRow[]> {
  const { data } = await apiClient.get<AssignmentRow[]>('/assignments', {
    params: { caUserId },
  })
  return data
}

export async function createAssignment(caUserId: string, dqtvUserId: string): Promise<AssignmentRow> {
  const { data } = await apiClient.post<AssignmentRow>('/assignments', { caUserId, dqtvUserId })
  return data
}

export async function removeAssignment(id: string): Promise<void> {
  await apiClient.delete(`/assignments/${id}`)
}

// Every user holding `role`, page by page (stops at the total or at an empty page)
async function listUsersWithRole(role: string): Promise<UserRow[]> {
  const rows: UserRow[] = []
  let page = 1
  let more = true
  while (more) {
    const { data } = await apiClient.get<{ data: UserRow[]; total: number }>('/admin/users', {
      params: { role, page, limit: ADMIN_USERS_PAGE_LIMIT },
    })
    const batch = data.data ?? []
    rows.push(...batch)
    more = batch.length > 0 && rows.length < data.total
    page += 1
  }
  return rows
}

/** Every CA officer, once each (GET /admin/users: system_admin and office_staff only) */
export async function getCaOfficers(): Promise<UserRow[]> {
  const perRole = await Promise.all(CA_OFFICER_ROLES.map((role) => listUsersWithRole(role)))
  const seen = new Set<string>()
  return perRole.flat().filter((u) => {
    if (seen.has(u.id)) return false
    seen.add(u.id)
    return true
  })
}

export async function getAvailableDqtv(caUserId: string, q?: string): Promise<MilitiaUserRow[]> {
  const { data } = await apiClient.get<{ data: MilitiaUserRow[] }>('/militia', {
    params: { q: q ?? '', limit: 50, excludeAssignedTo: caUserId },
  })
  return data.data
}

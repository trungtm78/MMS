import apiClient from './client'

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

export interface MilitiaUserRow {
  id: string
  userId: string
  fullName: string
  unitCode: string
}

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

export async function getCaOfficers(): Promise<UserRow[]> {
  const { data } = await apiClient.get<{ data: UserRow[] }>('/users', {
    params: { role: 'ca_officer', limit: 100 },
  })
  return data.data
}

export async function getAvailableDqtv(caUserId: string, q?: string): Promise<MilitiaUserRow[]> {
  const { data } = await apiClient.get<{ data: MilitiaUserRow[] }>('/militia', {
    params: { q: q ?? '', limit: 50, excludeAssignedTo: caUserId },
  })
  return data.data
}

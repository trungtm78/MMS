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
  const [ward, area] = await Promise.all([
    apiClient.get<{ data: UserRow[] }>('/admin/users', { params: { role: 'police_ward', limit: 100 } }),
    apiClient.get<{ data: UserRow[] }>('/admin/users', { params: { role: 'police_area', limit: 100 } }),
  ])
  const combined = [...(ward.data.data ?? []), ...(area.data.data ?? [])]
  const seen = new Set<string>()
  return combined.filter((u) => {
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

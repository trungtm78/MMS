// US-SS-06: Tasks API
import client from './client'

export interface TaskItem {
  id: string
  code: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  deadline: string | null
  createdAt: string
  assigneeId: string | null
  assigneeName: string | null
  militiaId: string | null
  militiaCode: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export async function listTasks(params: { page?: number; limit?: number; status?: string } = {}): Promise<PaginatedResponse<TaskItem>> {
  const res = await client.get('/tasks', { params: { page: 1, limit: 20, ...params } })
  return res.data
}

export interface CreateTaskPayload {
  title: string
  description?: string
  type?: string
  priority?: string
  deadline?: string
  unitId?: string
  assigneeMilitiaId: string
}

export interface TaskResult {
  id: string
  code: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  deadline: Date | null
  createdAt: Date
  assigneeId: string
  assigneeName: string
  militiaId: string
  militiaCode: string
}

export const tasksApi = {
  create: async (dto: CreateTaskPayload): Promise<TaskResult> => {
    const response = await client.post<TaskResult>('/tasks', dto)
    return response.data
  },

  list: async (params?: { status?: string; page?: number; limit?: number }): Promise<TaskResult[]> => {
    const response = await client.get<TaskResult[]>('/tasks', { params })
    return response.data
  },
}

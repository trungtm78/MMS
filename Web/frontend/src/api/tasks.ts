// US-SS-06: Tasks API — Web/backend/src/tasks/tasks.controller.ts. Every route acts as the
// caller's scope (unit staff their unit, CA officers the tasks of their assigned DQTV and the ones
// they created, DQTV their own): a task outside it answers 404 task_not_found.
import client from './client'
import type { StoredFile } from './files'

/**
 * Files attached to a task when it is created (tasks.controller.ts TASK_ATTACHMENTS_PER_REQUEST):
 * distinct uploads of the creator, with purpose task or general
 */
export const TASK_ATTACHMENTS_MAX = 10

/** tasks.status (task-sql.ts TASK_STATUSES); as a list filter, overdue means open past the deadline */
export const TASK_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PAGE_SIZE = 20
/** CancelTaskDto: the reason is required, 1–500 characters, and kept with the cancellation */
export const CANCEL_REASON_MAX_LENGTH = 500

/** A row of GET /tasks and the answer of GET /tasks/:id (task-sql.ts taskRowSelect) */
export interface TaskItem {
  id: string
  /** TASK-YYYYMMDD-XXXXXX, given by the server */
  code: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  deadline: string | null
  createdAt: string
  updatedAt: string
  /** Open past its deadline, whatever the stored status says (derived by the server) */
  overdue: boolean
  /** The task's own unit, else the unit of its first assignee */
  unitCode: string | null
  assigneeId: string | null
  assigneeName: string | null
  militiaId: string | null
  militiaCode: string | null
  locationName: string | null
  locationLat: number | null
  locationLng: number | null
}

/** GET /tasks/:id answer: the row plus the files its creator attached (list rows have none) */
export interface TaskDetail extends TaskItem {
  attachments: StoredFile[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface TaskListQuery {
  status?: TaskStatus
  unitCode?: string
  page?: number
  limit?: number
}

// GET /tasks?status=&unitCode=&page=&limit= — one row per task, total counts tasks; an unknown
// status answers 400 invalid_status
export async function listTasks(query: TaskListQuery = {}): Promise<PaginatedResponse<TaskItem>> {
  const unitCode = query.unitCode?.trim()
  const res = await client.get<PaginatedResponse<TaskItem>>('/tasks', {
    params: {
      page: query.page ?? 1,
      limit: query.limit ?? TASK_PAGE_SIZE,
      ...(query.status ? { status: query.status } : {}),
      ...(unitCode ? { unitCode } : {}),
    },
  })
  return res.data
}

/** PATCH /tasks/:id edits only a task not yet under way (tasks.service.ts EDITABLE_STATUSES); else 409 */
export function canEditTask(status: string): boolean {
  return status === 'pending' || status === 'assigned'
}

/** DELETE /tasks/:id cancels any task not closed (CLOSED_STATUSES); else 409 task_cannot_be_cancelled */
export function canCancelTask(status: string): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

/** Body of POST /tasks — CreateTaskDto; the API rejects any other property */
export interface CreateTaskPayload {
  title: string
  description?: string
  type?: string
  priority?: string
  deadline?: string
  unitId?: string
  /** Where the task takes place (1–500 characters) */
  locationName?: string
  /** −90..90 */
  locationLat?: number
  /** −180..180 */
  locationLng?: number
  /** A member of the creator's scope, else 404 militia_not_found */
  assigneeMilitiaId: string
  /**
   * Ids from POST /files/upload (at most TASK_ATTACHMENTS_MAX); a refused file creates no task
   * (400 file_not_found, duplicate_file_ids, file_purpose_mismatch, file_type_not_allowed; 409
   * file_already_attached)
   */
  attachmentIds?: string[]
}

/** POST /tasks answer (tasks.service.ts createTask) */
export interface TaskResult {
  id: string
  /** TASK-YYYYMMDD-XXXXXX, given by the server */
  code: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  deadline: string | null
  createdAt: string
  assigneeId: string
  assigneeName: string
  militiaId: string
  militiaCode: string
  locationName?: string | null
  locationLat?: number | null
  locationLng?: number | null
  /** The files attached with the task, in the order given */
  attachments: StoredFile[]
}

/** Body of PATCH /tasks/:id — UpdateTaskDto */
export interface UpdateTaskPayload {
  title?: string
  description?: string
  type?: string
  priority?: string
  deadline?: string
}

/** PATCH /tasks/:id answer */
export interface UpdatedTask {
  id: string
  title: string
  status: string
  priority: string
  deadline: string | null
  updatedAt: string
}

export interface CancelTaskPayload {
  reason: string
}

export const tasksApi = {
  // POST /tasks — a task for a member of the creator's scope
  create: async (dto: CreateTaskPayload): Promise<TaskResult> => {
    const response = await client.post<TaskResult>('/tasks', dto)
    return response.data
  },

  // GET /tasks/:id — includes locationName, locationLat, locationLng and attachments
  getById: async (id: string): Promise<TaskDetail> => {
    const response = await client.get<TaskDetail>(`/tasks/${id}`)
    return response.data
  },

  // PATCH /tasks/:id — pending or assigned tasks only, else 409 task_cannot_be_edited_in_current_status
  update: async (id: string, dto: UpdateTaskPayload): Promise<UpdatedTask> => {
    const response = await client.patch<UpdatedTask>(`/tasks/${id}`, dto)
    return response.data
  },

  // DELETE /tasks/:id { reason } — 204; a completed or cancelled task: 409 task_cannot_be_cancelled
  cancel: async (id: string, dto: CancelTaskPayload): Promise<void> => {
    await client.delete(`/tasks/${id}`, { data: dto })
  },
}

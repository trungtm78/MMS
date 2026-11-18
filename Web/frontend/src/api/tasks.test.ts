import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TASK_ATTACHMENTS_MAX, TASK_STATUSES, canCancelTask, canEditTask, listTasks, tasksApi, type TaskItem } from './tasks'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

// GET /tasks and GET /tasks/:id row (Web/backend/src/tasks/task-sql.ts taskRowSelect)
const task: TaskItem = {
  id: 'a1000000-0000-4000-8000-000000000001',
  code: 'TASK-20260914-K7Q2ZP',
  title: 'Tuần tra KP1',
  description: null,
  type: 'patrol',
  priority: 'high',
  status: 'assigned',
  deadline: '2026-09-20T00:00:00.000Z',
  createdAt: '2026-09-14T08:00:00.000Z',
  updatedAt: '2026-09-14T09:00:00.000Z',
  overdue: false,
  unitCode: 'KP1',
  assigneeId: 'u-1',
  assigneeName: 'Trần Văn Bình',
  militiaId: 'm-1',
  militiaCode: 'DQ-001',
  locationName: 'Chợ Phú Định',
  locationLat: 10.7512,
  locationLng: 106.6283,
}

beforeEach(() => {
  api.get.mockReset()
  api.post.mockReset()
  api.patch.mockReset()
  api.delete.mockReset()
})

describe('listTasks', () => {
  it('asks GET /tasks for a page and leaves out blank filters', async () => {
    const page = { data: [task], total: 1, page: 1, limit: 20 }
    api.get.mockResolvedValue({ data: page })

    await expect(listTasks()).resolves.toStrictEqual(page)
    expect(api.get).toHaveBeenLastCalledWith('/tasks', { params: { page: 1, limit: 20 } })

    await listTasks({ status: 'overdue', unitCode: '  KP2 ', page: 3, limit: 50 })
    expect(api.get).toHaveBeenLastCalledWith('/tasks', { params: { page: 3, limit: 50, status: 'overdue', unitCode: 'KP2' } })

    await listTasks({ unitCode: '   ' })
    expect(api.get).toHaveBeenLastCalledWith('/tasks', { params: { page: 1, limit: 20 } })
  })
})

// tasks.service.ts: EDITABLE_STATUSES pending/assigned (else 409), CLOSED_STATUSES
// completed/cancelled cannot be cancelled (409); GET /tasks takes exactly TASK_STATUSES
describe('task lifecycle rules', () => {
  it('lists the statuses GET /tasks filters by', () => {
    expect(TASK_STATUSES).toEqual(['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue'])
  })

  it.each([
    ['pending', true, true],
    ['assigned', true, true],
    ['in_progress', false, true],
    ['overdue', false, true],
    ['completed', false, false],
    ['cancelled', false, false],
  ])('%s: editable %s, cancellable %s', (status, editable, cancellable) => {
    expect(canEditTask(status)).toBe(editable)
    expect(canCancelTask(status)).toBe(cancellable)
  })
})

describe('tasksApi', () => {
  // A stored file as the task answers list it (files.service.ts FileView)
  const file = {
    id: 'c1000000-0000-4000-8000-000000000001',
    url: '/api/v1/mms_core/files/c1000000-0000-4000-8000-000000000001',
    name: 'ke-hoach.pdf',
    mimeType: 'application/pdf',
    size: 2048,
  }

  it('reads one task, with its location and attachments, from GET /tasks/:id', async () => {
    const detail = { ...task, attachments: [file] }
    api.get.mockResolvedValue({ data: detail })

    await expect(tasksApi.getById(task.id)).resolves.toStrictEqual(detail)
    expect(api.get).toHaveBeenCalledWith(`/tasks/${task.id}`)
  })

  // tasks.controller.ts TASK_ATTACHMENTS_PER_REQUEST
  it('attaches at most 10 files to a task and creates it with their ids', async () => {
    expect(TASK_ATTACHMENTS_MAX).toBe(10)
    const body = { title: 'Tuần tra KP1', assigneeMilitiaId: 'm-1', attachmentIds: [file.id] }
    const created = { id: task.id, code: task.code, attachments: [file] }
    api.post.mockResolvedValue({ status: 201, data: created })

    await expect(tasksApi.create(body)).resolves.toStrictEqual(created)
    expect(api.post).toHaveBeenCalledWith('/tasks', body)
  })

  it('edits with PATCH /tasks/:id and returns the updated fields', async () => {
    const updated = { id: task.id, title: 'Tuần tra KP2', status: 'assigned', priority: 'high', deadline: null, updatedAt: '2026-09-14T10:00:00.000Z' }
    api.patch.mockResolvedValue({ data: updated })

    await expect(tasksApi.update(task.id, { title: 'Tuần tra KP2' })).resolves.toStrictEqual(updated)
    expect(api.patch).toHaveBeenCalledWith(`/tasks/${task.id}`, { title: 'Tuần tra KP2' })
  })

  it('cancels with DELETE /tasks/:id and the reason in the body', async () => {
    api.delete.mockResolvedValue({ status: 204, data: '' })

    await expect(tasksApi.cancel(task.id, { reason: 'Trùng lịch' })).resolves.toBeUndefined()
    expect(api.delete).toHaveBeenCalledWith(`/tasks/${task.id}`, { data: { reason: 'Trùng lịch' } })
  })
})

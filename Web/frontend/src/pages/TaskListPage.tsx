import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckSquare, ChevronLeft, ChevronRight, Clock, Download, Paperclip, Pencil, Search, XCircle } from 'lucide-react'
import { saveFile, type StoredFile } from '@/api/files'
import {
  CANCEL_REASON_MAX_LENGTH,
  TASK_PAGE_SIZE,
  TASK_STATUSES,
  canCancelTask,
  canEditTask,
  listTasks,
  tasksApi,
  type TaskItem,
  type TaskStatus,
  type UpdateTaskPayload,
} from '@/api/tasks'
import { useRbac } from '@/hooks/useRbac'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError, parseApiError } from '@/lib/api-error'

type StatusTab = 'all' | TaskStatus

// Lifecycle order; "Quá hạn" asks the server for the open tasks past their deadline
const STATUS_TABS = [
  { id: 'all', label: 'common.filters.all' },
  { id: 'pending', label: 'tasks.status.pending' },
  { id: 'assigned', label: 'tasks.status.assigned' },
  { id: 'in_progress', label: 'tasks.status.in_progress' },
  { id: 'overdue', label: 'tasks.status.overdue' },
  { id: 'completed', label: 'tasks.status.completed' },
  { id: 'cancelled', label: 'tasks.status.cancelled' },
] as const satisfies readonly { id: StatusTab; label: TranslationKey }[]

const STATUS_LABEL = {
  pending: 'tasks.status.pending',
  assigned: 'tasks.status.assigned',
  in_progress: 'tasks.status.in_progress',
  completed: 'tasks.status.completed',
  cancelled: 'tasks.status.cancelled',
  overdue: 'tasks.status.overdue',
} as const satisfies Record<TaskStatus, TranslationKey>

const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
type TaskPriority = (typeof PRIORITIES)[number]

const PRIORITY_LABEL = {
  urgent: 'tasks.priority.urgent',
  high: 'tasks.priority.high',
  medium: 'tasks.priority.medium',
  low: 'tasks.priority.low',
} as const satisfies Record<TaskPriority, TranslationKey>

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#F5F5F5', text: '#757575' },
  assigned: { bg: '#EDE7F6', text: '#5E35B1' },
  in_progress: { bg: '#E3F2FD', text: '#1976D2' },
  completed: { bg: '#E8F5E9', text: '#2E7D32' },
  overdue: { bg: '#FFEBEE', text: '#C62828' },
  cancelled: { bg: '#FFF3E0', text: '#F57C00' },
}

const TASKS_KEY = ['tasks'] as const

function isTaskStatus(status: string): status is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(status)
}

function isTaskPriority(priority: string): priority is TaskPriority {
  return (PRIORITIES as readonly string[]).includes(priority)
}

// 404: the task left the caller's scope; 409: its status no longer allows the action. Either
// way the list on screen is out of date.
function isStaleTask(err: unknown): boolean {
  const { status } = parseApiError(err)
  return status === 404 || status === 409
}

function priorityClass(priority: string): string {
  if (priority === 'urgent') return 'bg-[#FFEBEE] text-[#C62828]'
  if (priority === 'high') return 'bg-[#FFF3E0] text-[#F57C00]'
  if (priority === 'medium') return 'bg-[#FFFDE7] text-[#FBC02D]'
  return 'bg-[#F5F5F5] text-[#757575]'
}

/** yyyy-mm-dd of a stored deadline, for <input type="date"> */
function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

const dialogClass = 'bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4'
const fieldClass =
  'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]'

// ─── Edit ────────────────────────────────────────────────────────────────────

function EditTaskDialog({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState(task.priority)
  const [deadline, setDeadline] = useState(dateInputValue(task.deadline))
  const [titleError, setTitleError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // GET /tasks/:id: the files the creator attached (list rows do not carry them)
  const detail = useQuery({
    queryKey: [...TASKS_KEY, 'detail', task.id],
    queryFn: () => tasksApi.getById(task.id),
  })

  // GET /files/:id needs the token: fetched through the api client, then saved under its name
  async function download(file: StoredFile) {
    try {
      await saveFile(file)
    } catch (err) {
      toast.error(describeApiError(err, { scope: 'files.download', fallback: 'tasks.list.edit.attachments.downloadError' }))
    }
  }

  const update = useMutation({
    mutationFn: (payload: UpdateTaskPayload) => tasksApi.update(task.id, payload),
    onSuccess: () => {
      toast.success(t('tasks.list.edit.success'))
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY })
      onClose()
    },
    onError: (err) => {
      const text = describeApiError(err, { scope: 'tasks.update', fallback: 'tasks.list.edit.error' })
      if (!isStaleTask(err)) {
        setFormError(text)
        return
      }
      toast.error(text)
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY })
      onClose()
    },
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setTitleError(t('tasks.create.title.required'))
      return
    }
    // Only the fields changed; a deadline can be moved but not removed through PATCH
    const payload: UpdateTaskPayload = {}
    if (trimmed !== task.title) payload.title = trimmed
    if (priority !== task.priority) payload.priority = priority
    if (deadline && deadline !== dateInputValue(task.deadline)) payload.deadline = deadline
    if (Object.keys(payload).length === 0) {
      onClose()
      return
    }
    setFormError(null)
    update.mutate(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-task-heading"
        onSubmit={handleSave}
        noValidate
        className={dialogClass}
        data-testid="edit-task-modal"
      >
        <h2 id="edit-task-heading" className="text-lg font-bold text-[#0F172A]">{t('tasks.list.edit.title')}</h2>
        {formError && (
          <p role="alert" className="text-sm text-[#C62828] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label htmlFor="edit-task-title" className="block text-sm font-medium text-[#374151] mb-1">
              {t('tasks.list.edit.fields.title')}
            </label>
            <input
              id="edit-task-title"
              type="text"
              value={title}
              maxLength={255}
              aria-invalid={titleError !== null}
              aria-describedby={titleError ? 'edit-task-title-error' : undefined}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleError(null)
              }}
              className={fieldClass}
            />
            {titleError && (
              <p id="edit-task-title-error" className="text-xs text-red-500 mt-1">
                {titleError}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="edit-task-priority" className="block text-sm font-medium text-[#374151] mb-1">
              {t('tasks.create.priority.label')}
            </label>
            <select id="edit-task-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={fieldClass}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {t(PRIORITY_LABEL[value])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-task-deadline" className="block text-sm font-medium text-[#374151] mb-1">
              {t('tasks.create.deadline.label')}
            </label>
            <input
              id="edit-task-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
        <section aria-labelledby="edit-task-attachments-heading" className="space-y-2">
          <h3 id="edit-task-attachments-heading" className="text-sm font-medium text-[#374151]">
            {t('tasks.list.edit.attachments.heading')}
          </h3>
          {detail.isPending ? (
            <p className="text-xs text-[#64748B]">{t('common.states.loading')}</p>
          ) : detail.isError ? (
            <p role="alert" data-testid="edit-task-attachments-error" className="text-xs text-[#C62828]">
              {describeApiError(detail.error, { scope: 'tasks.detail', fallback: 'tasks.list.edit.attachments.loadError' })}
            </p>
          ) : detail.data.attachments.length === 0 ? (
            <p className="text-xs text-[#64748B]">{t('tasks.list.edit.attachments.empty')}</p>
          ) : (
            <ul aria-label={t('tasks.list.edit.attachments.listLabel')} className="space-y-1">
              {detail.data.attachments.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2 text-sm text-[#0F172A]">
                  <span className="inline-flex items-center gap-1 min-w-0 truncate">
                    <Paperclip size={12} aria-hidden="true" />
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => void download(file)}
                    aria-label={t('tasks.list.edit.attachments.download', { name: file.name })}
                    className="p-1 rounded text-[#1976D2] hover:bg-[#E3F2FD]"
                  >
                    <Download size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]">
            {t('common.actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={update.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-[#C62828] text-white hover:bg-[#B71C1C] disabled:opacity-50"
          >
            {update.isPending ? t('common.actions.saving') : t('tasks.list.edit.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

function CancelTaskDialog({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const trimmed = reason.trim()

  const cancel = useMutation({
    mutationFn: (text: string) => tasksApi.cancel(task.id, { reason: text }),
    onSuccess: () => {
      toast.success(t('tasks.list.cancel.success'))
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY })
      onClose()
    },
    onError: (err) => {
      const text = describeApiError(err, { scope: 'tasks.cancel', fallback: 'tasks.list.cancel.error' })
      if (!isStaleTask(err)) {
        setFormError(text)
        return
      }
      toast.error(text)
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY })
      onClose()
    },
  })

  // The reason is stored with the cancellation: the confirm button waits for one
  function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    setFormError(null)
    cancel.mutate(trimmed)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-task-heading"
        onSubmit={handleConfirm}
        noValidate
        className={dialogClass}
        data-testid="cancel-task-modal"
      >
        <h2 id="cancel-task-heading" className="text-lg font-bold text-[#0F172A]">{t('tasks.list.cancel.title')}</h2>
        <p className="text-sm text-[#64748B]">{t('tasks.list.cancel.description', { title: task.title })}</p>
        {formError && (
          <p role="alert" className="text-sm text-[#C62828] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}
        <div>
          <label htmlFor="cancel-task-reason" className="block text-sm font-medium text-[#374151] mb-1">
            {t('tasks.list.cancel.reason.label')} <span aria-hidden="true" className="text-[#C62828]">*</span>
          </label>
          <textarea
            id="cancel-task-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            maxLength={CANCEL_REASON_MAX_LENGTH}
            placeholder={t('tasks.list.cancel.reason.placeholder')}
            className={`${fieldClass} resize-none`}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]">
            {t('common.actions.close')}
          </button>
          <button
            type="submit"
            disabled={cancel.isPending || !trimmed}
            className="px-4 py-2 text-sm rounded-lg bg-[#C62828] text-white hover:bg-[#B71C1C] disabled:opacity-50"
          >
            {cancel.isPending ? t('tasks.list.cancel.pending') : t('tasks.list.cancel.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function TaskListPage() {
  const { t } = useTranslation()
  const { can, hasRole } = useRbac()
  const [status, setStatus] = useState<StatusTab>('all')
  const [page, setPage] = useState(1)
  const [unitDraft, setUnitDraft] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<TaskItem | null>(null)
  const [cancelling, setCancelling] = useState<TaskItem | null>(null)

  // PATCH /tasks/:id allows the roles of POST /tasks; DELETE /tasks/:id system_admin and ca_officer
  const mayEdit = can.createTask
  const mayCancel = hasRole('system_admin', 'ca_officer')

  const filter = { status: status === 'all' ? undefined : status, unitCode, page }
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...TASKS_KEY, 'list', filter],
    queryFn: () => listTasks({ ...filter, limit: TASK_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const tasks = data?.data ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / TASK_PAGE_SIZE))

  // Narrows the rows already on this page; the server has no text search
  const term = searchTerm.trim().toLowerCase()
  const shown = term
    ? tasks.filter((task) => task.title.toLowerCase().includes(term) || task.code.toLowerCase().includes(term))
    : tasks

  function changeStatus(next: StatusTab) {
    setStatus(next)
    setPage(1)
  }

  function applyUnit(e: React.FormEvent) {
    e.preventDefault()
    setUnitCode(unitDraft.trim())
    setPage(1)
  }

  return (
    <div className="p-6 space-y-6" data-testid="task-list-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">{t('tasks.list.header.title')}</h1>
        <p className="text-sm text-[#64748B] mt-1">{t('tasks.list.header.subtitle')}</p>
      </div>

      {/* Status Tabs */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="status-tabs">
        <div role="tablist" aria-label={t('tasks.list.filters.status')} className="flex items-center overflow-x-auto border-b border-[#E2E8F0]">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={status === tab.id}
              onClick={() => changeStatus(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all relative ${
                status === tab.id
                  ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                  : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[16rem] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            aria-label={t('tasks.list.filters.search.label')}
            placeholder={t('tasks.list.filters.search.placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-10 pr-4 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            data-testid="task-search-input"
          />
        </div>
        <form onSubmit={applyUnit} className="flex items-center gap-2">
          <label htmlFor="task-unit-filter" className="text-sm text-[#64748B]">
            {t('common.filters.unitCode')}
          </label>
          <input
            id="task-unit-filter"
            type="text"
            value={unitDraft}
            onChange={(e) => setUnitDraft(e.target.value)}
            placeholder={t('tasks.list.filters.unit.placeholder')}
            className="h-10 w-32 px-3 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
          />
          <button type="submit" className="h-10 px-4 text-sm rounded-lg border border-[#E2E8F0] hover:border-[#C62828] hover:text-[#C62828]">
            {t('tasks.list.filters.unit.apply')}
          </button>
        </form>
      </div>

      {isError && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-[#C62828] bg-red-50 border border-red-200 rounded-lg">
          <span>{describeApiError(error, { scope: 'tasks.list', fallback: 'tasks.list.load.error' })}</span>
          <button type="button" onClick={() => void refetch()} className="font-medium underline">
            {t('common.actions.retry')}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="task-table">
        {isLoading ? (
          <div className="p-12 text-center" role="status" aria-label={t('common.states.loading')}>
            <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                  <tr>
                    {(
                      [
                        'tasks.list.table.code',
                        'tasks.list.table.title',
                        'tasks.list.table.assignee',
                        'tasks.list.table.unit',
                        'tasks.list.table.priority',
                        'tasks.list.table.deadline',
                        'tasks.list.table.status',
                        'tasks.list.table.updatedAt',
                        'tasks.list.table.actions',
                      ] as const
                    ).map((header) => (
                      <th key={header} scope="col" className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">
                        {t(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center">
                        <CheckSquare size={32} className="text-[#E2E8F0] mx-auto mb-2" />
                        <p className="text-sm text-[#94A3B8]">{t('tasks.list.table.empty')}</p>
                      </td>
                    </tr>
                  ) : (
                    shown.map((task) => {
                      const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending
                      return (
                        <tr
                          key={task.id}
                          className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors"
                          data-testid={`task-row-${task.id}`}
                        >
                          <td className="px-6 py-4">
                            <span className="text-sm font-mono text-[#C62828] font-medium">{task.code}</span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-[#0F172A] max-w-xs truncate">{task.title}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-[#0F172A]">{task.assigneeName ?? t('common.states.none')}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-[#0F172A]" data-testid={`task-unit-${task.id}`}>
                              {task.unitCode ?? t('common.states.none')}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${priorityClass(task.priority)}`}>
                              {isTaskPriority(task.priority) ? t(PRIORITY_LABEL[task.priority]) : task.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <Clock size={14} className={task.overdue ? 'text-[#C62828]' : 'text-[#64748B]'} />
                              <span className={`text-sm ${task.overdue ? 'text-[#C62828] font-semibold' : 'text-[#0F172A]'}`}>
                                {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : t('common.states.none')}
                              </span>
                              {/* The server's flag: open past the deadline, whatever the stored status */}
                              {task.overdue && task.status !== 'overdue' && (
                                <span
                                  className="px-2 py-0.5 text-xs font-semibold rounded-full bg-[#FFEBEE] text-[#C62828]"
                                  data-testid={`overdue-badge-${task.id}`}
                                >
                                  {t('tasks.status.overdue')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className="px-3 py-1.5 text-xs font-semibold rounded-full inline-flex items-center gap-1.5"
                              style={{ backgroundColor: statusColor.bg, color: statusColor.text }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor.text }}></span>
                              {isTaskStatus(task.status) ? t(STATUS_LABEL[task.status]) : task.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <time dateTime={task.updatedAt} className="text-sm text-[#64748B]" data-testid={`task-updated-${task.id}`}>
                              {new Date(task.updatedAt).toLocaleString('vi-VN')}
                            </time>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {mayEdit && canEditTask(task.status) && (
                                <button
                                  type="button"
                                  onClick={() => setEditing(task)}
                                  className="p-1.5 rounded-lg text-[#1976D2] hover:bg-[#E3F2FD] transition-colors"
                                  aria-label={t('tasks.list.actions.edit', { code: task.code })}
                                  title={t('tasks.list.actions.edit', { code: task.code })}
                                  data-testid={`edit-task-${task.id}`}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {mayCancel && canCancelTask(task.status) && (
                                <button
                                  type="button"
                                  onClick={() => setCancelling(task)}
                                  className="p-1.5 rounded-lg text-[#C62828] hover:bg-[#FFEBEE] transition-colors"
                                  aria-label={t('tasks.list.actions.cancel', { code: task.code })}
                                  title={t('tasks.list.actions.cancel', { code: task.code })}
                                  data-testid={`cancel-task-${task.id}`}
                                >
                                  <XCircle size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination: by the number of tasks the server counts */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]">{t('tasks.list.total', { count: total })}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label={t('common.pagination.previous')}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-white hover:border-[#C62828] transition-colors"
                  data-testid="prev-page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-[#0F172A] min-w-[80px] text-center" data-testid="task-page-indicator">
                  {page} / {pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  aria-label={t('common.pagination.next')}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-white hover:border-[#C62828] transition-colors"
                  data-testid="next-page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {editing && <EditTaskDialog key={editing.id} task={editing} onClose={() => setEditing(null)} />}
      {cancelling && <CancelTaskDialog key={cancelling.id} task={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  )
}

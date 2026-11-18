// US-SS-06: TaskCreateForm — create task with SmartSelect assignee
import { useState, useCallback, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ClipboardList, Paperclip, X } from 'lucide-react'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { UPLOAD_ACCEPT, filesApi, uploadProblem, type StoredFile, type UploadProblem } from '@/api/files'
import { militiaApi } from '@/api/militia'
import { TASK_ATTACHMENTS_MAX, tasksApi, type CreateTaskPayload } from '@/api/tasks'
import i18n from '@/i18n'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError, errorCodeText, parseApiError } from '@/lib/api-error'
import type { SmartSelectOption, MilitiaSearchItem } from '@/types'

// ─── Quick-create militia inline form ────────────────────────────────────────
type QuickCreateErrors = { code?: string; name?: string; unit?: string; server?: string }

// Backend codes of POST /militia/quick-create that are about one field of the form
const QUICK_CREATE_ERROR_FIELD: ReadonlyMap<string, 'code'> = new Map([['militia_code_duplicate', 'code']])

// Codes of POST /tasks about the chosen assignee (tasks.service.ts createTask): outside the
// creator's scope, or without an account; shown under the assignee field
const ASSIGNEE_ERROR_CODES: ReadonlySet<string> = new Set(['militia_not_found', 'militia_no_user_account'])

// Why a file is refused before it is sent (the server's own upload codes)
const UPLOAD_PROBLEM_TEXT = {
  file_empty: 'errors.files.upload.file_empty',
  file_too_large: 'errors.files.upload.file_too_large',
  file_type_not_allowed: 'errors.files.upload.file_type_not_allowed',
} as const satisfies Record<UploadProblem, TranslationKey>

// POST /tasks refused an attached file (FilesService.attach): the whole task was rolled back
function isAttachRefusal(code: string | null): boolean {
  return code !== null && errorCodeText('files.attach', code) !== null
}

// US-SS-03 AC-7: a code about a field shows under that field, anything else above the form
function quickCreateErrors(err: unknown): QuickCreateErrors {
  const { code } = parseApiError(err)
  const field = code === null ? undefined : QUICK_CREATE_ERROR_FIELD.get(code)
  const text = describeApiError(err, { scope: 'tasks.quickCreate', fallback: 'tasks.quickCreate.submit.error' })
  return field ? { [field]: text } : { server: text }
}

interface QuickCreateMilitiaFormProps {
  code: string
  name: string
  unit: string
  onCodeChange: (v: string) => void
  onNameChange: (v: string) => void
  onUnitChange: (v: string) => void
  // US-SS-03 AC-6: inline validation errors
  validationErrors?: QuickCreateErrors
}

function QuickCreateMilitiaForm({
  code,
  name,
  unit,
  onCodeChange,
  onNameChange,
  onUnitChange,
  validationErrors,
}: QuickCreateMilitiaFormProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      {/* Server error (e.g. duplicate code) */}
      {validationErrors?.server && (
        <p data-testid="quick-create-server-error" className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">
          {validationErrors.server}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold text-[#C62828]">
          {t('tasks.quickCreate.code.label')} <span className="text-red-500">*</span>
        </label>
        <input
          data-testid="quick-create-militia-code"
          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] ${validationErrors?.code ? 'border-red-400' : 'border-[#E2E8F0]'}`}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder={t('tasks.quickCreate.code.placeholder')}
        />
        {validationErrors?.code && (
          <p data-testid="quick-create-code-error" className="text-xs text-red-500">{validationErrors.code}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold text-[#C62828]">
          {t('tasks.quickCreate.name.label')} <span className="text-red-500">*</span>
        </label>
        <input
          data-testid="quick-create-militia-name"
          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] ${validationErrors?.name ? 'border-red-400' : 'border-[#E2E8F0]'}`}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('tasks.quickCreate.name.placeholder')}
        />
        {validationErrors?.name && (
          <p data-testid="quick-create-name-error" className="text-xs text-red-500">{validationErrors.name}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold text-[#C62828]">
          {t('tasks.quickCreate.unit.label')} <span className="text-red-500">*</span>
        </label>
        <input
          data-testid="quick-create-militia-unit"
          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] ${validationErrors?.unit ? 'border-red-400' : 'border-[#E2E8F0]'}`}
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          placeholder={t('tasks.quickCreate.unit.placeholder')}
        />
        {validationErrors?.unit && (
          <p data-testid="quick-create-unit-error" className="text-xs text-red-500">{validationErrors.unit}</p>
        )}
      </div>
    </div>
  )
}

// Built when the form mounts, so the validation texts are read from the resources
function createTaskSchema() {
  return z
    .object({
      title: z.string().min(1, i18n.t('tasks.create.title.required')).max(255),
      description: z.string().optional(),
      type: z.string(),
      priority: z.string(),
      deadline: z.string().optional(),
      // CreateTaskDto: locationName 1–500 characters, locationLat/locationLng decimal degrees
      locationName: z.string().max(500, i18n.t('tasks.create.location.tooLong')).optional(),
      locationLat: z.string().optional(),
      locationLng: z.string().optional(),
      assigneeMilitiaId: z.string().uuid(i18n.t('tasks.create.assignee.required')),
    })
    .superRefine((values, ctx) => {
      const lat = values.locationLat?.trim() ?? ''
      const lng = values.locationLng?.trim() ?? ''
      if (!lat && !lng) return
      if (!lat || !lng) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationLat'], message: i18n.t('tasks.create.coordinates.bothRequired') })
        return
      }
      const latitude = Number(lat)
      const longitude = Number(lng)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationLat'], message: i18n.t('tasks.create.latitude.outOfRange') })
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['locationLng'], message: i18n.t('tasks.create.longitude.outOfRange') })
      }
    })
}

type FormValues = z.infer<ReturnType<typeof createTaskSchema>>

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'tasks.priority.low' },
  { value: 'medium', label: 'tasks.priority.medium' },
  { value: 'high', label: 'tasks.priority.high' },
  { value: 'urgent', label: 'tasks.priority.urgent' },
] as const satisfies readonly { value: string; label: TranslationKey }[]

const TYPE_OPTIONS = [
  { value: 'patrol', label: 'tasks.type.patrol' },
  { value: 'guard', label: 'tasks.type.guard' },
  { value: 'inspection', label: 'tasks.type.inspection' },
  { value: 'support', label: 'tasks.type.support' },
  { value: 'training', label: 'tasks.type.training' },
  { value: 'admin', label: 'tasks.type.admin' },
  { value: 'other', label: 'tasks.type.other' },
] as const satisfies readonly { value: string; label: TranslationKey }[]

// Body of POST /tasks: empty optional fields are left out (an empty deadline fails @IsDateString)
function buildTaskPayload(values: FormValues, attachmentIds: readonly string[]): CreateTaskPayload {
  const body: CreateTaskPayload = {
    title: values.title.trim(),
    type: values.type,
    priority: values.priority,
    assigneeMilitiaId: values.assigneeMilitiaId,
  }
  const description = values.description?.trim()
  if (description) body.description = description
  if (values.deadline) body.deadline = values.deadline
  const locationName = values.locationName?.trim()
  if (locationName) body.locationName = locationName
  const lat = values.locationLat?.trim()
  const lng = values.locationLng?.trim()
  if (lat && lng) {
    body.locationLat = Number(lat)
    body.locationLng = Number(lng)
  }
  if (attachmentIds.length > 0) body.attachmentIds = [...attachmentIds]
  return body
}

function toSmartSelectOption(m: MilitiaSearchItem): SmartSelectOption {
  return {
    id: m.id,
    label: `${m.militiaCode} — ${m.fullName}`,
    sublabel: [m.phone, m.unitName].filter(Boolean).join(' | '),
    meta: m as unknown as Record<string, unknown>,
  }
}

interface TaskCreateFormProps {
  onSuccess?: () => void
}

export function TaskCreateForm({ onSuccess }: TaskCreateFormProps) {
  const { t } = useTranslation()
  const schema = useMemo(createTaskSchema, [])
  const queryClient = useQueryClient()
  const [assigneeId, setAssigneeId] = useState('')
  const [militiaQuery, setMilitiaQuery] = useState('')
  // F6: store latest militiaQuery in a ref so createModal.onSubmit can read it
  //     without being stale — avoids syncing qcName on every debounced keystroke
  const militiaQueryRef = useRef('')
  const [qcName, setQcName] = useState('')
  const [qcCode, setQcCode] = useState(() => 'QS-E2E-' + Date.now().toString().slice(-6))
  const [qcUnit, setQcUnit] = useState('PHU_DINH')
  // US-SS-03 AC-6: inline validation errors for quick-create modal
  const [qcErrors, setQcErrors] = useState<QuickCreateErrors>({})
  // Extra options from quick-create — ensures selected chip shows immediately
  const [extraOptions, setExtraOptions] = useState<SmartSelectOption[]>([])
  // Files uploaded for this task (POST /files/upload, purpose task), sent as attachmentIds
  const [attachments, setAttachments] = useState<StoredFile[]>([])
  const [uploading, setUploading] = useState(false)
  // The files of the last choice that were refused, one message each
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  // POST /tasks refused an attached file: no task was created
  const [attachSubmitError, setAttachSubmitError] = useState<string | null>(null)

  // F6: militiaQueryRef tracks the latest search query without extra setState.
  //     qcName (for modal pre-fill) is initialised from the ref — one state update
  //     per debounced search instead of two, since React 18 batches setState calls
  //     inside event handlers but NOT inside async/setTimeout callbacks (debounce).
  const handleSearch = useCallback((q: string) => {
    militiaQueryRef.current = q
    setMilitiaQuery(q)
    // Pre-fill the quick-create name field with whatever the user typed.
    // This is the only place qcName is synced from search — done here instead of
    // inside a separate useEffect to keep the update in the same batched cycle.
    if (q) setQcName(q)
  }, [])

  const { data: fetchedMilitiaOptions = [], isFetching: militiaLoading } = useQuery({
    queryKey: ['militia-search', militiaQuery],
    queryFn: () => militiaApi.search({ q: militiaQuery, limit: 20 }),
    enabled: true,
    select: (data) => data.map(toSmartSelectOption),
  })

  // Merge fetched options with any quick-created options (dedup by id)
  const militiaOptions = [
    ...fetchedMilitiaOptions,
    ...extraOptions.filter((eo) => !fetchedMilitiaOptions.some((fo) => fo.id === eo.id)),
  ]

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: 'other', priority: 'medium' } })

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      toast.success(t('tasks.create.submit.success'))
      reset()
      setAssigneeId('')
      setMilitiaQuery('')
      setAttachments([])
      setUploadErrors([])
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onSuccess?.()
    },
    onError: (err: unknown) => {
      const text = describeApiError(err, { scope: ['files.attach', 'tasks.create'], fallback: 'tasks.create.submit.error' })
      const { code } = parseApiError(err)
      // The form stays filled; the text asks to upload the refused file again
      if (isAttachRefusal(code)) {
        setAttachSubmitError(text)
        return
      }
      if (code !== null && ASSIGNEE_ERROR_CODES.has(code)) {
        setError('assigneeMilitiaId', { type: 'server', message: text })
        return
      }
      toast.error(text)
    },
  })

  const handleAssigneeChange = useCallback(
    (id: string) => {
      setAssigneeId(id)
      setValue('assigneeMilitiaId', id, { shouldValidate: true })
    },
    [setValue],
  )

  const handleAssigneeClear = useCallback(() => {
    setAssigneeId('')
    setValue('assigneeMilitiaId', '', { shouldValidate: true })
  }, [setValue])

  // Each file is checked, then uploaded in turn; files past the limit are left out and named
  async function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const chosen = Array.from(input.files ?? [])
    // The same file can be chosen again after it was refused or removed
    input.value = ''
    const room = TASK_ATTACHMENTS_MAX - attachments.length
    const leftOut = chosen.slice(room)
    const problems: string[] = []
    setUploadErrors([])
    setAttachSubmitError(null)
    setUploading(true)
    for (const file of chosen.slice(0, room)) {
      const problem = uploadProblem(file)
      if (problem) {
        problems.push(t('tasks.create.attachments.fileError', { name: file.name, message: t(UPLOAD_PROBLEM_TEXT[problem]) }))
        continue
      }
      try {
        const stored = await filesApi.upload(file, 'task')
        setAttachments((list) => [...list, stored])
      } catch (err) {
        const message = describeApiError(err, { scope: 'files.upload', fallback: 'tasks.create.attachments.uploadError' })
        problems.push(t('tasks.create.attachments.fileError', { name: file.name, message }))
      }
    }
    if (leftOut.length > 0) {
      problems.push(
        t('tasks.create.attachments.tooMany', { max: TASK_ATTACHMENTS_MAX, names: leftOut.map((file) => file.name).join(', ') }),
      )
    }
    setUploading(false)
    setUploadErrors(problems)
  }

  function removeAttachment(id: string) {
    setAttachments((list) => list.filter((file) => file.id !== id))
    setAttachSubmitError(null)
  }

  const onSubmit = handleSubmit((values) => {
    setAttachSubmitError(null)
    createMutation.mutate(buildTaskPayload(values, attachments.map((file) => file.id)))
  })

  const coordsError = errors.locationLat?.message ?? errors.locationLng?.message

  return (
    <form
      data-testid="task-create-form"
      onSubmit={onSubmit}
      className="space-y-6 max-w-xl"
      noValidate
    >
      {/* Form header */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#E2E8F0]">
        <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
          <ClipboardList size={20} className="text-[#C62828]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#0F172A]">{t('tasks.create.header.title')}</h2>
          <p className="text-xs text-[#64748B]">{t('tasks.create.header.subtitle')}</p>
        </div>
      </div>

      {/* Task Info Card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide">{t('tasks.create.info.heading')}</h3>

        {/* Title */}
        <div>
          <Input
            id="task-title"
            data-testid="task-title-input"
            label={t('tasks.create.title.label')}
            placeholder={t('tasks.create.title.placeholder')}
            error={!!errors.title}
            errorMessage={errors.title?.message}
            {...register('title')}
          />
          {errors.title && (
            <p data-testid="task-title-error" className="text-xs text-red-500 mt-1">
              {errors.title.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label htmlFor="task-description" className="text-sm font-bold text-[#C62828]">
            {t('tasks.create.description.label')}
          </label>
          <textarea
            id="task-description"
            data-testid="task-description-input"
            rows={3}
            placeholder={t('tasks.create.description.placeholder')}
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('description')}
          />
        </div>

        {/* Priority + Type row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="task-priority" className="text-sm font-bold text-[#C62828]">{t('tasks.create.priority.label')}</label>
            <select
              id="task-priority"
              data-testid="task-priority-select"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
              {...register('priority')}
            >
              {PRIORITY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="task-type" className="text-sm font-bold text-[#C62828]">{t('tasks.create.type.label')}</label>
            <select
              id="task-type"
              data-testid="task-type-select"
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
              {...register('type')}
            >
              {TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Deadline */}
        <div className="flex flex-col gap-1">
          <label htmlFor="task-due-date" className="text-sm font-bold text-[#C62828]">{t('tasks.create.deadline.label')}</label>
          <input
            id="task-due-date"
            type="date"
            data-testid="task-due-date-input"
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('deadline')}
          />
        </div>

        {/* Location */}
        <div className="flex flex-col gap-1">
          <label htmlFor="task-location" className="text-sm font-bold text-[#C62828]">{t('tasks.create.location.label')}</label>
          <input
            id="task-location"
            type="text"
            data-testid="task-location-input"
            placeholder={t('tasks.create.location.placeholder')}
            maxLength={500}
            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            {...register('locationName')}
          />
          {errors.locationName && (
            <p className="text-xs text-red-500">{errors.locationName.message}</p>
          )}
        </div>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="sr-only">{t('tasks.create.coordinates.legend')}</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="task-location-lat" className="text-sm font-bold text-[#C62828]">{t('tasks.create.latitude.label')}</label>
            <input
              id="task-location-lat"
              type="text"
              inputMode="decimal"
              data-testid="task-location-lat-input"
              placeholder={t('tasks.create.latitude.placeholder')}
              aria-invalid={!!errors.locationLat}
              aria-describedby={coordsError ? 'task-location-coords-error' : undefined}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
              {...register('locationLat')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="task-location-lng" className="text-sm font-bold text-[#C62828]">{t('tasks.create.longitude.label')}</label>
            <input
              id="task-location-lng"
              type="text"
              inputMode="decimal"
              data-testid="task-location-lng-input"
              placeholder={t('tasks.create.longitude.placeholder')}
              aria-invalid={!!errors.locationLng}
              aria-describedby={coordsError ? 'task-location-coords-error' : undefined}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
              {...register('locationLng')}
            />
          </div>
          {coordsError && (
            <p id="task-location-coords-error" data-testid="task-location-coords-error" className="col-span-2 text-xs text-red-500">
              {coordsError}
            </p>
          )}
        </fieldset>
      </div>

      {/* Attachments Card: the instructions the assignee reads with the task */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide">{t('tasks.create.attachments.heading')}</h3>
        <p className="text-xs text-[#64748B]">{t('tasks.create.attachments.hint', { max: TASK_ATTACHMENTS_MAX })}</p>
        <input
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          aria-label={t('tasks.create.attachments.choose')}
          data-testid="task-file-input"
          disabled={uploading || attachments.length >= TASK_ATTACHMENTS_MAX}
          onChange={(e) => void handleFilesChosen(e)}
          className="text-sm text-[#64748B] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#E2E8F0] file:text-sm file:bg-white file:text-[#64748B] hover:file:bg-[#F8FAFC] file:cursor-pointer disabled:opacity-50"
        />
        {uploading && (
          <p role="status" className="text-xs text-[#64748B]">
            {t('tasks.create.attachments.uploading')}
          </p>
        )}
        {uploadErrors.length > 0 && (
          <ul data-testid="task-attachment-errors" role="alert" className="text-xs text-red-500 space-y-1">
            {uploadErrors.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        )}
        {attachSubmitError && (
          <p data-testid="task-attachment-submit-error" role="alert" className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">
            {attachSubmitError}
          </p>
        )}
        {attachments.length > 0 && (
          <ul aria-label={t('tasks.create.attachments.listLabel')} className="flex flex-wrap gap-2">
            {attachments.map((file) => (
              <li
                key={file.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-[#FFEBEE] text-[#C62828] text-xs rounded-md border border-red-100"
              >
                <Paperclip size={12} aria-hidden="true" />
                {file.name}
                <button
                  type="button"
                  onClick={() => removeAttachment(file.id)}
                  aria-label={t('tasks.create.attachments.remove', { name: file.name })}
                  className="ml-1 hover:text-red-800"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Assignee Card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-3">
        <h3 className="text-sm font-bold text-[#C62828] uppercase tracking-wide">{t('tasks.create.assignee.heading')}</h3>
        {/* US-SS-06 AC-1: militia SmartSelect for task assignee */}
        <SmartSelect
          name="assignee"
          label={t('tasks.create.assignee.label')}
          placeholder={t('tasks.create.assignee.placeholder')}
          value={assigneeId}
          onChange={(id) => handleAssigneeChange(id)}
          onClear={handleAssigneeClear}
          options={militiaOptions}
          isLoading={militiaLoading}
          error={!!errors.assigneeMilitiaId}
          errorMessage={errors.assigneeMilitiaId?.message}
          required
          onSearch={handleSearch}
          createModal={{
            title: t('tasks.quickCreate.dialog.title'),
            content: (
              <QuickCreateMilitiaForm
                code={qcCode}
                name={qcName}
                unit={qcUnit}
                onCodeChange={(v) => { setQcCode(v); setQcErrors((e) => ({ ...e, code: undefined, server: undefined })) }}
                onNameChange={(v) => { setQcName(v); setQcErrors((e) => ({ ...e, name: undefined })) }}
                onUnitChange={(v) => { setQcUnit(v); setQcErrors((e) => ({ ...e, unit: undefined })) }}
                validationErrors={qcErrors}
              />
            ),
            onSubmit: async () => {
              const fullName = qcName.trim()
              const militiaCode = qcCode.trim()
              const unitCode = qcUnit.trim()
              // US-SS-03 AC-6: inline validation — do not close modal on missing fields
              const errs: QuickCreateErrors = {}
              if (!militiaCode) errs.code = t('tasks.quickCreate.code.required')
              if (!fullName) errs.name = t('tasks.quickCreate.name.required')
              if (!unitCode) errs.unit = t('tasks.quickCreate.unit.required')
              if (Object.keys(errs).length > 0) {
                setQcErrors(errs)
                return null
              }
              try {
                setQcErrors({})
                const item = await militiaApi.quickCreate({ militiaCode, fullName, unitCode })
                const opt: SmartSelectOption = {
                  id: item.id,
                  label: `${item.militiaCode} — ${item.fullName}`,
                  sublabel: [item.phone, item.unitName].filter(Boolean).join(' | '),
                  meta: item as unknown as Record<string, unknown>,
                }
                // Add to extraOptions so the selected chip renders immediately
                setExtraOptions((prev) => [...prev, opt])
                // Reset quick-create fields
                setQcName('')
                setQcCode('QS-E2E-' + Date.now().toString().slice(-6))
                setQcErrors({})
                return opt
              } catch (err: unknown) {
                setQcErrors(quickCreateErrors(err))
                return null
              }
            },
          }}
        />
      </div>

      {/* Success indicator */}
      {createMutation.isSuccess && (
        <div data-testid="task-create-success" className="text-sm text-[#2E7D32] font-medium bg-[#E8F5E9] px-4 py-3 rounded-lg border border-green-200">
          {t('tasks.create.submit.successNotice', { code: createMutation.data?.code })}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => { reset(); setAssigneeId('') }}
          className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {t('tasks.create.reset.label')}
        </button>
        <Button
          type="submit"
          data-testid="task-submit-btn"
          loading={createMutation.isPending}
          disabled={uploading}
        >
          {t('tasks.create.submit.label')}
        </Button>
      </div>
    </form>
  )
}

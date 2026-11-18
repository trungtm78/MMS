import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useRbac } from '@/hooks/useRbac'
import {
  LEAVE_FORM_FIELDS,
  LEAVE_MAX_LIMIT,
  leaveApi,
  leaveKeys,
  type CreateLeaveBody,
  type HalfDayPeriod,
  type LeaveFormField,
  type LeaveRequestRow,
  type LeaveReviewAction,
  type LeaveType,
} from '@/api/leave'
import { isUserSearchQuery, usersApi } from '@/api/users'
import { Dialog } from '@/components/ui/Dialog'
import { SmartSelect } from '@/components/ui/SmartSelect'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError, mapValidationErrors, validationFormMessage } from '@/lib/api-error'
import { formatCalendarDate, isCalendarDate, todayInVietnam } from '@/lib/dates'
import type { LeaveBalance, LeaveRequest, LeaveStatus, SmartSelectOption, UserSearchItem } from '@/types'
import { CalendarOff, Plus, CheckCircle, XCircle, X } from 'lucide-react'
import { toast } from 'sonner'

// A created, cancelled or decided request changes both the leave lists and GET /approvals
// (ApprovalsPage caches it under ['approvals', tab])
function refreshLeaveLists(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: leaveKeys.all })
  queryClient.invalidateQueries({ queryKey: leaveKeys.approvals })
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-[#2E7D32]',
  rejected: 'bg-red-100 text-[#C62828]',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Readonly<Partial<Record<string, TranslationKey>>> = {
  pending: 'leave.status.pending',
  approved: 'leave.status.approved',
  rejected: 'leave.status.rejected',
  cancelled: 'leave.status.cancelled',
} satisfies Record<LeaveStatus, TranslationKey>

const HALF_DAY_LABEL = {
  morning: 'leave.dates.halfDay.morning',
  afternoon: 'leave.dates.halfDay.afternoon',
} as const satisfies Record<HalfDayPeriod, TranslationKey>

const DECISION_LABEL = {
  approved: { withDay: 'leave.myRequests.decision.approvedOn', withoutDay: 'leave.myRequests.decision.approved' },
  rejected: { withDay: 'leave.myRequests.decision.rejectedOn', withoutDay: 'leave.myRequests.decision.rejected' },
} as const satisfies Record<'approved' | 'rejected', { withDay: TranslationKey; withoutDay: TranslationKey }>

// Who decided an approved or rejected request and on which Vietnamese day; null otherwise
function decisionText(t: TFunction, leave: Pick<LeaveRequestRow, 'status' | 'reviewedBy' | 'reviewedAt'>): string | null {
  if ((leave.status !== 'approved' && leave.status !== 'rejected') || !leave.reviewedBy) return null
  const label = DECISION_LABEL[leave.status]
  const name = leave.reviewedBy.fullName
  return leave.reviewedAt
    ? t(label.withDay, { name, date: formatCalendarDate(leave.reviewedAt) })
    : t(label.withoutDay, { name })
}

const INPUT_CLASS =
  'w-full border rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 focus:border-[#C62828] disabled:bg-slate-50 disabled:text-slate-500'

// Leave dates are calendar days (DATE columns): shown as they are, never timezone-shifted
function leaveDates(
  t: TFunction,
  leave: Pick<LeaveRequest, 'fromDate' | 'toDate' | 'isHalfDay' | 'halfDayPeriod'>,
): string {
  if (leave.isHalfDay) {
    const period = t(leave.halfDayPeriod ? HALF_DAY_LABEL[leave.halfDayPeriod] : 'leave.dates.halfDay.unspecified')
    return t('leave.dates.halfDay.label', { date: formatCalendarDate(leave.fromDate), period })
  }
  return t('leave.dates.range.label', { from: formatCalendarDate(leave.fromDate), to: formatCalendarDate(leave.toDate) })
}

type TypeAvailability = { unlimited: true } | { unlimited: false; remaining: number; total: number; year: number }

// Days a new request of a type may still take in a year. Any type draws on the member's balance of
// that year when there is one. Without one, a type with a yearly limit has the whole limit (the first
// request or approval of the year creates the balance at it) and a type without a limit has no bound.
// Null while the balances are not known.
function typeAvailability(type: LeaveType, balances: LeaveBalance[] | undefined, year: number): TypeAvailability | null {
  if (!balances) return null
  const balance = balances.find((b) => b.leaveTypeId === type.id && b.year === year)
  // The day counts are NUMERIC columns, which the API sends as JSON numbers
  if (balance) return { unlimited: false, remaining: balance.remainingDays, total: balance.totalDays, year }
  if (type.maxDaysPerYear === null) return { unlimited: true }
  return { unlimited: false, remaining: type.maxDaysPerYear, total: type.maxDaysPerYear, year }
}

function typeOptionText(t: TFunction, type: LeaveType, availability: TypeAvailability | null): string {
  if (!availability) return type.name
  return availability.unlimited
    ? t('leave.createForm.fields.typeOptionUnlimited', { name: type.name })
    : t('leave.createForm.fields.typeOption', { name: type.name, remaining: availability.remaining, year: availability.year })
}

interface LeaveFormState {
  leaveTypeId: string
  fromDate: string
  toDate: string
  reason: string
  isHalfDay: boolean
  halfDayPeriod: '' | HalfDayPeriod
  replacementId: string
}

const EMPTY_FORM: LeaveFormState = {
  leaveTypeId: '',
  fromDate: '',
  toDate: '',
  reason: '',
  isHalfDay: false,
  halfDayPeriod: '',
  replacementId: '',
}

type FieldErrors = Partial<Record<LeaveFormField, string>>

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} data-testid={id} className="mt-1 text-xs text-[#C62828]">
      {message}
    </p>
  )
}

// Body of POST /leave with only the CreateLeaveDto fields that apply
function buildLeaveBody(form: LeaveFormState): CreateLeaveBody {
  const body: CreateLeaveBody = {
    leaveTypeId: form.leaveTypeId,
    fromDate: form.fromDate,
    // A half day is a single day
    toDate: form.isHalfDay ? form.fromDate : form.toDate,
    reason: form.reason.trim(),
  }
  if (form.isHalfDay && form.halfDayPeriod) {
    body.isHalfDay = true
    body.halfDayPeriod = form.halfDayPeriod
  }
  if (form.replacementId) body.replacementId = form.replacementId
  return body
}

// The first client-side problem of the form, as a text key (null when it can be sent)
function leaveFormProblem(form: LeaveFormState, body: CreateLeaveBody): TranslationKey | null {
  if (!body.leaveTypeId) return 'leave.createForm.validation.typeRequired'
  if (!body.fromDate || !body.toDate) return 'leave.createForm.validation.datesRequired'
  // YYYY-MM-DD strings compare in calendar order
  if (body.fromDate > body.toDate) return 'leave.createForm.validation.dateOrder'
  if (form.isHalfDay && !form.halfDayPeriod) return 'leave.createForm.validation.halfDayPeriodRequired'
  if (!body.reason) return 'leave.createForm.validation.reasonRequired'
  return null
}

function LeaveFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<LeaveFormState>(EMPTY_FORM)
  const [replacementQuery, setReplacementQuery] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  // GET /leave/types: the types a new request may still be filed as
  const { data: leaveTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: leaveKeys.types,
    queryFn: leaveApi.types,
    enabled: open,
  })
  // Undefined until GET /leave-balances answers
  const { data: balances } = useQuery({
    queryKey: leaveKeys.balances,
    queryFn: leaveApi.balances,
    enabled: open,
  })
  // A request draws on the balance of the year it starts in; before a date is chosen, this year in Vietnam
  const requestYear = Number((isCalendarDate(form.fromDate) ? form.fromDate : todayInVietnam()).slice(0, 4))
  const chosenType = leaveTypes.find((type) => type.id === form.leaveTypeId)
  const chosenAvailability = chosenType ? typeAvailability(chosenType, balances, requestYear) : null

  // replacement_id references users(id). GET /users/search needs 2+ characters and never lists
  // the caller, so nobody can pick themselves.
  const replacementSearch = replacementQuery.trim()
  const canSearchReplacement = isUserSearchQuery(replacementSearch)
  const { data: replacementOptions = [], isFetching: replacementLoading } = useQuery({
    queryKey: ['users-search', replacementSearch],
    queryFn: () => usersApi.search({ q: replacementSearch, limit: 20 }),
    enabled: open && canSearchReplacement,
    select: (items: UserSearchItem[]): SmartSelectOption[] =>
      items.map((item) => ({ id: item.id, label: item.fullName, sublabel: item.username })),
  })

  const close = () => {
    setForm(EMPTY_FORM)
    setReplacementQuery('')
    setFieldErrors({})
    setFormError(null)
    onClose()
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateLeaveBody) => leaveApi.create(body),
    onSuccess: () => {
      toast.success(t('leave.createForm.submit.success'))
      refreshLeaveLists(queryClient)
      close()
    },
    onError: (err) => {
      const validation = mapValidationErrors(err, LEAVE_FORM_FIELDS)
      if (validation) {
        setFieldErrors(validation.fieldErrors)
        setFormError(validationFormMessage(validation.otherErrors))
        return
      }
      setFieldErrors({})
      setFormError(
        describeApiError(err, {
          scope: 'leave.create',
          statuses: { 400: 'leave.createForm.submit.invalid' },
          fallback: 'leave.createForm.submit.error',
        }),
      )
    },
  })

  const update = (patch: Partial<LeaveFormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    setFieldErrors((errors) => {
      const next = { ...errors }
      for (const key of Object.keys(patch) as (keyof LeaveFormState)[]) delete next[key]
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = buildLeaveBody(form)
    const problem = leaveFormProblem(form, body)
    setFieldErrors({})
    setFormError(problem ? t(problem) : null)
    if (problem) return
    createMutation.mutate(body)
  }

  const border = (field: LeaveFormField) => (fieldErrors[field] ? 'border-[#C62828]' : 'border-[#E2E8F0]')
  const a11y = (field: LeaveFormField, errorId: string) => ({
    'aria-invalid': !!fieldErrors[field],
    'aria-describedby': fieldErrors[field] ? errorId : undefined,
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) close() }}
      title={t('leave.createForm.dialog.title')}
      description={t('leave.createForm.dialog.description')}
      busy={createMutation.isPending}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="px-3 py-2 text-sm text-[#C62828] bg-red-50 border border-red-200 rounded-lg">
            {formError}
          </p>
        )}
        <div>
          <label htmlFor="leave-type" className="block text-sm font-medium text-[#0F172A] mb-1">
            {t('leave.createForm.fields.type')} <span className="text-[#C62828]" aria-hidden="true">*</span>
          </label>
          <select
            id="leave-type"
            required
            data-testid="leave-type-select"
            value={form.leaveTypeId}
            onChange={(e) => update({ leaveTypeId: e.target.value })}
            className={`${INPUT_CLASS} ${border('leaveTypeId')}`}
            {...a11y('leaveTypeId', 'leave-type-error')}
          >
            <option value="">{t(typesLoading ? 'common.states.loading' : 'leave.createForm.fields.typePlaceholder')}</option>
            {leaveTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {typeOptionText(t, type, typeAvailability(type, balances, requestYear))}
              </option>
            ))}
          </select>
          <FieldError id="leave-type-error" message={fieldErrors.leaveTypeId} />
          {chosenType?.description && (
            <p className="mt-1 text-xs text-[#64748B]">{chosenType.description}</p>
          )}
          {chosenAvailability && (
            <p data-testid="leave-type-availability" className="mt-1 text-xs text-[#64748B]">
              {chosenAvailability.unlimited
                ? t('leave.createForm.typeHint.unlimited')
                : t('leave.createForm.typeHint.remaining', {
                    remaining: chosenAvailability.remaining,
                    total: chosenAvailability.total,
                    year: chosenAvailability.year,
                  })}
            </p>
          )}
          {chosenType?.requiresDocument && (
            <p className="mt-1 text-xs text-[#64748B]">{t('leave.createForm.typeHint.requiresDocument')}</p>
          )}
          {!typesLoading && leaveTypes.length === 0 && (
            <p className="mt-1 text-xs text-[#64748B]">{t('leave.createForm.fields.noTypes')}</p>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <input
              id="leave-half-day"
              type="checkbox"
              checked={form.isHalfDay}
              onChange={(e) =>
                update({
                  isHalfDay: e.target.checked,
                  halfDayPeriod: e.target.checked ? form.halfDayPeriod : '',
                  toDate: e.target.checked ? form.fromDate : form.toDate,
                })
              }
              className="h-4 w-4 accent-[#C62828]"
              {...a11y('isHalfDay', 'leave-half-day-error')}
            />
            <label htmlFor="leave-half-day" className="text-sm font-medium text-[#0F172A]">{t('leave.createForm.fields.halfDay')}</label>
          </div>
          <FieldError id="leave-half-day-error" message={fieldErrors.isHalfDay} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="leave-from" className="block text-sm font-medium text-[#0F172A] mb-1">
              {t(form.isHalfDay ? 'leave.createForm.fields.day' : 'leave.createForm.fields.fromDate')} <span className="text-[#C62828]" aria-hidden="true">*</span>
            </label>
            <input
              id="leave-from"
              type="date"
              required
              data-testid="leave-start-date"
              value={form.fromDate}
              onChange={(e) => update(form.isHalfDay ? { fromDate: e.target.value, toDate: e.target.value } : { fromDate: e.target.value })}
              className={`${INPUT_CLASS} ${border('fromDate')}`}
              {...a11y('fromDate', 'leave-from-error')}
            />
            <FieldError id="leave-from-error" message={fieldErrors.fromDate} />
          </div>
          <div>
            <label htmlFor="leave-to" className="block text-sm font-medium text-[#0F172A] mb-1">
              {t('leave.createForm.fields.toDate')} <span className="text-[#C62828]" aria-hidden="true">*</span>
            </label>
            <input
              id="leave-to"
              type="date"
              required
              min={form.fromDate || undefined}
              disabled={form.isHalfDay}
              data-testid="leave-end-date"
              value={form.isHalfDay ? form.fromDate : form.toDate}
              onChange={(e) => update({ toDate: e.target.value })}
              className={`${INPUT_CLASS} ${border('toDate')}`}
              {...a11y('toDate', 'leave-to-error')}
            />
            <FieldError id="leave-to-error" message={fieldErrors.toDate} />
          </div>
        </div>
        {form.isHalfDay && (
          <div>
            <label htmlFor="leave-half-day-period" className="block text-sm font-medium text-[#0F172A] mb-1">
              {t('leave.createForm.fields.halfDayPeriod')} <span className="text-[#C62828]" aria-hidden="true">*</span>
            </label>
            <select
              id="leave-half-day-period"
              required
              data-testid="leave-half-day-period"
              value={form.halfDayPeriod}
              onChange={(e) => update({ halfDayPeriod: e.target.value as LeaveFormState['halfDayPeriod'] })}
              className={`${INPUT_CLASS} ${border('halfDayPeriod')}`}
              {...a11y('halfDayPeriod', 'leave-half-day-period-error')}
            >
              <option value="">{t('leave.createForm.fields.halfDayPeriodPlaceholder')}</option>
              <option value="morning">{t(HALF_DAY_LABEL.morning)}</option>
              <option value="afternoon">{t(HALF_DAY_LABEL.afternoon)}</option>
            </select>
            <FieldError id="leave-half-day-period-error" message={fieldErrors.halfDayPeriod} />
          </div>
        )}
        <div>
          <label htmlFor="leave-reason" className="block text-sm font-medium text-[#0F172A] mb-1">
            {t('leave.createForm.fields.reason')} <span className="text-[#C62828]" aria-hidden="true">*</span>
          </label>
          <textarea
            id="leave-reason"
            required
            data-testid="leave-reason"
            value={form.reason}
            onChange={(e) => update({ reason: e.target.value })}
            rows={3}
            placeholder={t('leave.createForm.fields.reasonPlaceholder')}
            className={`${INPUT_CLASS} ${border('reason')} resize-none`}
            {...a11y('reason', 'leave-reason-error')}
          />
          <FieldError id="leave-reason-error" message={fieldErrors.reason} />
        </div>
        <div>
          <SmartSelect
            name="leave-replacement"
            label={t('leave.createForm.fields.replacement')}
            placeholder={t('leave.createForm.fields.replacementPlaceholder')}
            value={form.replacementId}
            onChange={(id) => update({ replacementId: id })}
            onClear={() => update({ replacementId: '' })}
            options={replacementOptions}
            isLoading={replacementLoading}
            error={!!fieldErrors.replacementId}
            onSearch={setReplacementQuery}
          />
          {!form.replacementId && !canSearchReplacement && (
            <p className="mt-1 text-xs text-[#64748B]">{t('leave.createForm.fields.replacementHint')}</p>
          )}
          <FieldError id="leave-replacement-error" message={fieldErrors.replacementId} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={close}
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            data-testid="leave-submit-btn"
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {t(createMutation.isPending ? 'leave.createForm.submit.pending' : 'leave.createForm.submit.button')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-6 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      ))}
    </div>
  )
}

function MyLeavesTab() {
  const { t } = useTranslation()
  const [showModal, setShowModal] = useState(false)
  const queryClient = useQueryClient()

  // GET /leave?mine=true: only the caller's own requests, also for reviewers
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: leaveKeys.mine,
    queryFn: () => leaveApi.list({ mine: true, page: 1, limit: LEAVE_MAX_LIMIT }),
  })
  const leaves = data?.data ?? []

  const cancelMutation = useMutation({
    mutationFn: (id: string) => leaveApi.cancel(id),
    onSuccess: () => toast.success(t('leave.myRequests.cancel.success')),
    onError: (err) =>
      toast.error(describeApiError(err, { scope: 'leave.cancel', fallback: 'leave.myRequests.cancel.error' })),
    // A failed cancel usually means the request changed meanwhile: reload either way
    onSettled: () => refreshLeaveLists(queryClient),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          data-testid="create-leave-btn"
          className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          {t('leave.myRequests.create.button')}
        </button>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between text-sm text-[#C62828]">
          {t('leave.myRequests.list.loadError')}
          <button type="button" onClick={() => refetch()} className="font-medium underline">{t('common.actions.retry')}</button>
        </div>
      ) : leaves.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <CalendarOff size={40} className="mx-auto mb-3 text-[#64748B]" />
          <p className="text-[#64748B]">{t('leave.myRequests.list.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const statusLabel = STATUS_LABEL[leave.status]
            const decision = decisionText(t, leave)
            return (
              <div key={leave.id} data-testid={`leave-row-${leave.id}`} className="bg-white rounded-xl border border-[#E2E8F0] p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                    <CalendarOff size={20} className="text-[#C62828]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{leave.leaveTypeName}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">{leaveDates(t, leave)}</p>
                    {leave.reason && (
                      <p className="text-xs text-[#64748B] mt-0.5 max-w-md truncate">{leave.reason}</p>
                    )}
                    {decision && (
                      <p data-testid={`leave-review-${leave.id}`} className="text-xs text-[#64748B] mt-0.5">{decision}</p>
                    )}
                    {decision && leave.reviewNote && (
                      <p className="text-xs text-[#64748B] mt-0.5 max-w-md">{t('leave.myRequests.decision.note', { note: leave.reviewNote })}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {leave.status === 'pending' && (
                    <button
                      onClick={() => cancelMutation.mutate(leave.id)}
                      disabled={cancelMutation.isPending && cancelMutation.variables === leave.id}
                      data-testid={`cancel-leave-btn-${leave.id}`}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-red-50 hover:text-[#C62828] hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      <X size={12} />
                      {t('leave.myRequests.cancel.button')}
                    </button>
                  )}
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[leave.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {statusLabel ? t(statusLabel) : leave.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <LeaveFormModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  )
}

function ApproveTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useRbac()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: leaveKeys.pending,
    queryFn: () => leaveApi.list({ status: 'pending', page: 1, limit: LEAVE_MAX_LIMIT }),
  })
  const requests = data?.data ?? []

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: LeaveReviewAction }) => leaveApi.review(id, action),
    onSuccess: (_, vars) =>
      toast.success(t(vars.action === 'approve' ? 'leave.review.decide.approved' : 'leave.review.decide.rejected')),
    onError: (err) =>
      toast.error(describeApiError(err, { scope: 'leave.review', fallback: 'leave.review.decide.error' })),
    // Refresh either way: a conflict (already decided, balance changed) means the list is stale
    onSettled: () => refreshLeaveLists(queryClient),
  })

  return (
    <div className="space-y-3">
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between text-sm text-[#C62828]">
          {t('leave.review.list.loadError')}
          <button type="button" onClick={() => refetch()} className="font-medium underline">{t('common.actions.retry')}</button>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-[#2E7D32]" />
          <p className="text-[#64748B]">{t('leave.review.list.empty')}</p>
        </div>
      ) : (
        requests.map((req) => {
          const initials = req.requesterName
            ? req.requesterName.split(' ').filter(Boolean).slice(-1)[0]?.[0] ?? '?'
            : '?'
          const isOwn = !!user?.id && req.requesterId === String(user.id)
          const isBusy = reviewMutation.isPending && reviewMutation.variables?.id === req.id
          return (
            <div key={req.id} data-testid={`approve-row-${req.id}`} className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-yellow-50 rounded-full flex items-center justify-center text-[#0F172A] text-sm font-bold border border-yellow-200">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{req.requesterName || t('leave.review.row.unknownRequester')}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {t('leave.review.row.summary', { type: req.leaveTypeName, dates: leaveDates(t, req), days: req.totalDays })}
                    </p>
                    {req.reason && (
                      <p className="text-xs text-[#64748B] mt-1 max-w-lg">{req.reason}</p>
                    )}
                  </div>
                </div>
                {isOwn ? (
                  // The backend refuses to let anyone review their own request
                  <span className="shrink-0 text-xs text-[#64748B]">{t('leave.review.row.ownRequest')}</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => reviewMutation.mutate({ id: req.id, action: 'approve' })}
                      disabled={isBusy}
                      data-testid={`approve-btn-${req.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2E7D32] bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={14} />
                      {t('leave.review.actions.approve')}
                    </button>
                    <button
                      onClick={() => reviewMutation.mutate({ id: req.id, action: 'reject' })}
                      disabled={isBusy}
                      data-testid={`reject-btn-${req.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#C62828] bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      {t('leave.review.actions.reject')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

export function LeavePage() {
  const { t } = useTranslation()
  const { can } = useRbac()
  // Reviewing follows the backend REVIEWER_ROLES (leave.service.ts)
  const [activeTab, setActiveTab] = useState<'my' | 'approve'>(can.approveLeave ? 'approve' : 'my')

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="leave-page">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <CalendarOff size={24} className="text-[#C62828]" />
            {t('leave.page.header.title')}
          </h1>
          <p className="text-sm text-[#64748B] mt-1">{t('leave.page.header.subtitle')}</p>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
          <button
            onClick={() => setActiveTab('my')}
            data-testid="tab-my-leaves"
            aria-pressed={activeTab === 'my'}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'my' ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          >
            {t('leave.page.tabs.mine')}
          </button>
          {can.approveLeave && (
            <button
              onClick={() => setActiveTab('approve')}
              data-testid="tab-approve"
              aria-pressed={activeTab === 'approve'}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'approve' ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {t('leave.page.tabs.approve')}
            </button>
          )}
        </div>

        {activeTab === 'approve' && can.approveLeave ? <ApproveTab /> : <MyLeavesTab />}
      </div>
    </div>
  )
}

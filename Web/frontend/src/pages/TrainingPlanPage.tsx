// Huấn luyện DQTV (Web/backend/src/training/training-plans.controller.ts): annual training plans
// per unit and type (draft → active → completed), the sessions scheduled in them, attendance of
// each session, and the yearly completion of the plans. Training managers only (training.roles.ts).
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart2, BookOpen, CalendarPlus, CheckSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  PLAN_REQUIRED_DAYS_RANGE,
  PLAN_TITLE_MAX_LENGTH,
  PLAN_YEAR_RANGE,
  SESSION_DAYS_RANGE,
  SESSION_TEXT_MAX_LENGTH,
  TRAINING_TYPES,
  UNIT_CODE_MAX_LENGTH,
  attendanceBlocker,
  isDayAmount,
  nextPlanStatus,
  sessionSpanDays,
  trainingApi,
  trainingKeys,
  type AttendanceEntry,
  type CreateTrainingPlanBody,
  type CreateTrainingSessionBody,
  type SessionMember,
  type TrainingPlanRecord,
  type TrainingPlanStatus,
  type TrainingPlanTarget,
  type TrainingSessionRecord,
  type TrainingSessionStatus,
  type TrainingType,
} from '@/api/training'
import { FormAlert, FormField } from '@/components/forms/FormField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { useRbac } from '@/hooks/useRbac'
import { describeApiError, parseApiError } from '@/lib/api-error'
import { formatCalendarDate, todayInVietnam } from '@/lib/dates'
import { cn } from '@/lib/utils'

// Code → locale key (the type texts match TRAINING_TYPE_LABELS of training-plan-codes.ts)
const typeKey = (code: TrainingType) => `training.codes.types.${code}` as const
const planStatusKey = (code: TrainingPlanStatus) => `training.codes.planStatuses.${code}` as const
const sessionStatusKey = (code: TrainingSessionStatus) => `training.codes.sessionStatuses.${code}` as const

const PLAN_STATUS_BADGE: Readonly<Record<TrainingPlanStatus, string>> = {
  draft: 'bg-gray-100 text-[#64748B]',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-[#2E7D32]',
}

const SESSION_STATUS_BADGE: Readonly<Record<TrainingSessionStatus, string>> = {
  upcoming: 'bg-yellow-100 text-yellow-700',
  ongoing: 'bg-blue-100 text-blue-700',
  completed: 'bg-gray-100 text-[#64748B]',
}

// The status action each target offers
const STATUS_ACTION = {
  active: {
    button: 'training.plans.status.activate.button',
    title: 'training.plans.status.activate.title',
    description: 'training.plans.status.activate.description',
    success: 'training.plans.status.activate.success',
  },
  completed: {
    button: 'training.plans.status.complete.button',
    title: 'training.plans.status.complete.title',
    description: 'training.plans.status.complete.description',
    success: 'training.plans.status.complete.success',
  },
} as const

const PLAN_COLUMNS = ['year', 'type', 'title', 'unit', 'days', 'sessions', 'status', 'actions'] as const
const SESSION_COLUMNS = ['name', 'type', 'startDate', 'endDate', 'location', 'days', 'status', 'attendance', 'actions'] as const
const STATS_COLUMNS = ['plans', 'required', 'scheduled', 'completed', 'rate'] as const

const PRIMARY_BUTTON =
  'rounded-lg bg-[#C62828] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#A91D1D] disabled:opacity-50'
const SECONDARY_BUTTON =
  'rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50'
const HEADER_CELL = 'whitespace-nowrap px-4 py-4 text-left text-xs font-semibold uppercase text-[#64748B]'

type Errors<F extends string> = Partial<Record<F, string>>

// Days are whole or half (one decimal at most); Vietnamese writes the decimal with a comma
const dayFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })
const formatDays = (days: number) => dayFormat.format(days)

/** Share of the required days already completed, as a whole percentage */
function completionPercent(completedDays: number, requiredDays: number): number {
  return requiredDays > 0 ? Math.round((completedDays / requiredDays) * 100) : 0
}

/** A number typed into a form field, or null when the field is blank */
function parseNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value)
}

/** The unit a plan or session belongs to; no unit means the whole ward */
function useUnitLabel() {
  const { t } = useTranslation()
  return (record: Pick<TrainingPlanRecord, 'unitCode' | 'unitName'>) =>
    record.unitCode === null ? t('training.shared.unit.wardWide') : (record.unitName ?? record.unitCode)
}

/** Refreshes plans and sessions: a plan's status and days show on both */
function useRefreshTraining() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trainingKeys.plans }),
      queryClient.invalidateQueries({ queryKey: trainingKeys.sessions }),
    ])
}

function usePlans() {
  return useQuery({ queryKey: trainingKeys.plans, queryFn: () => trainingApi.listPlans() })
}

function DialogActions({ onCancel, pending, idleLabel, pendingLabel }: { onCancel: () => void; pending: boolean; idleLabel: string; pendingLabel: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} disabled={pending} className={SECONDARY_BUTTON}>
        {t('common.actions.cancel')}
      </button>
      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? pendingLabel : idleLabel}
      </button>
    </div>
  )
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-[#E2E8F0] bg-white" />
      ))}
    </div>
  )
}

function LoadError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
      {message}
    </p>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-12 text-center text-[#64748B]">
      <p>{message}</p>
    </div>
  )
}

function ProgressBar({ percent, label, className }: { percent: number; label: string; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn('w-full rounded-full bg-gray-100', className ?? 'h-2')}
    >
      <div
        className={cn('h-full rounded-full', percent >= 100 ? 'bg-[#2E7D32]' : 'bg-[#C62828]')}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  )
}

// ── Kế hoạch năm ────────────────────────────────────────────────────────────────

interface PlanDraft {
  year: string
  type: TrainingType | ''
  title: string
  requiredDays: string
  unitCode: string
}
type PlanField = 'year' | 'type' | 'requiredDays'

function CreatePlanDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshTraining()
  // The current year where the ward operates, not in the browser's timezone
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    year: todayInVietnam().slice(0, 4),
    type: '',
    title: '',
    requiredDays: '',
    unitCode: '',
  }))
  const [errors, setErrors] = useState<Errors<PlanField>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (body: CreateTrainingPlanBody) => trainingApi.createPlan(body),
    onSuccess: () => {
      toast.success(t('training.plans.create.submit.success'))
      void refresh()
      onClose()
    },
    onError: (err) => {
      // training_plan_exists: the plan may be missing from the list shown
      if (parseApiError(err).status === 409) void refresh()
      setFormError(describeApiError(err, { scope: 'training.plan', fallback: 'training.plans.create.submit.error' }))
    },
  })

  const update = (patch: Partial<PlanDraft>, field: PlanField | null) => {
    setDraft((current) => ({ ...current, ...patch }))
    if (field) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const year = parseNumber(draft.year)
    const requiredDays = parseNumber(draft.requiredDays)
    const found: Errors<PlanField> = {}
    if (year === null || !Number.isInteger(year) || year < PLAN_YEAR_RANGE.min || year > PLAN_YEAR_RANGE.max) {
      found.year = t('training.plans.create.validation.yearInvalid')
    }
    if (!draft.type) found.type = t('training.plans.create.validation.typeRequired')
    if (requiredDays === null) found.requiredDays = t('training.plans.create.validation.requiredDaysRequired')
    else if (!isDayAmount(requiredDays, PLAN_REQUIRED_DAYS_RANGE.min, PLAN_REQUIRED_DAYS_RANGE.max)) {
      found.requiredDays = t('training.plans.create.validation.requiredDaysInvalid')
    }
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0 || year === null || requiredDays === null || !draft.type) return

    const title = draft.title.trim()
    const unitCode = draft.unitCode.trim()
    create.mutate({
      year,
      type: draft.type,
      requiredDays,
      ...(title ? { title } : {}),
      ...(unitCode ? { unitCode } : {}),
    })
  }

  const pending = create.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }} title={t('training.plans.create.dialog.title')} busy={pending}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="plan-year" label={t('common.filters.year')} required error={errors.year}>
            {(control) => (
              <input
                {...control}
                type="number"
                min={PLAN_YEAR_RANGE.min}
                max={PLAN_YEAR_RANGE.max}
                step={1}
                value={draft.year}
                onChange={(e) => update({ year: e.target.value }, 'year')}
              />
            )}
          </FormField>
          <FormField id="plan-type" label={t('training.plans.create.fields.type')} required error={errors.type}>
            {(control) => (
              <select {...control} value={draft.type} onChange={(e) => update({ type: e.target.value as TrainingType | '' }, 'type')}>
                <option value="">{t('training.plans.create.fields.typePlaceholder')}</option>
                {TRAINING_TYPES.map((code) => (
                  <option key={code} value={code}>{t(typeKey(code))}</option>
                ))}
              </select>
            )}
          </FormField>
        </div>
        <FormField id="plan-title" label={t('training.plans.create.fields.title')}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={PLAN_TITLE_MAX_LENGTH}
              placeholder={t('training.plans.create.fields.titlePlaceholder')}
              value={draft.title}
              onChange={(e) => update({ title: e.target.value }, null)}
            />
          )}
        </FormField>
        <FormField
          id="plan-required-days"
          label={t('training.plans.create.fields.requiredDays')}
          required
          hint={t('training.plans.create.fields.requiredDaysHint')}
          error={errors.requiredDays}
        >
          {(control) => (
            <input
              {...control}
              type="number"
              min={PLAN_REQUIRED_DAYS_RANGE.min}
              max={PLAN_REQUIRED_DAYS_RANGE.max}
              step={0.5}
              placeholder={t('training.plans.create.fields.requiredDaysPlaceholder')}
              value={draft.requiredDays}
              onChange={(e) => update({ requiredDays: e.target.value }, 'requiredDays')}
            />
          )}
        </FormField>
        <FormField id="plan-unit-code" label={t('common.filters.unitCode')} hint={t('training.plans.create.fields.unitCodeHint')}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={UNIT_CODE_MAX_LENGTH}
              placeholder={t('training.plans.create.fields.unitCodePlaceholder')}
              value={draft.unitCode}
              onChange={(e) => update({ unitCode: e.target.value }, null)}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          idleLabel={t('training.plans.create.submit.idle')}
          pendingLabel={t('training.plans.create.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

function PlanStatusConfirm({ plan, target, onClose }: { plan: TrainingPlanRecord; target: TrainingPlanTarget; onClose: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshTraining()
  const unitLabel = useUnitLabel()
  const action = STATUS_ACTION[target]

  const change = useMutation({
    mutationFn: () => trainingApi.updatePlanStatus(plan.id, target),
    onSuccess: () => {
      toast.success(t(action.success))
      void refresh()
      onClose()
    },
    onError: (err) => {
      // invalid_status_transition: the plan changed meanwhile, show it as it is now
      if (parseApiError(err).status === 409) void refresh()
      toast.error(describeApiError(err, { scope: ['training.planStatus', 'training.plan'], fallback: 'training.plans.status.error' }))
      onClose()
    },
  })

  const summary = t('training.plans.list.row.summary', { type: plan.typeLabel, year: plan.year, unit: unitLabel(plan) })

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={t(action.title)}
      description={t(action.description, { plan: summary })}
      confirmLabel={t(action.button)}
      busy={change.isPending}
      onConfirm={() => change.mutate()}
    />
  )
}

function PlansTab() {
  const { t } = useTranslation()
  const unitLabel = useUnitLabel()
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState<{ plan: TrainingPlanRecord; target: TrainingPlanTarget } | null>(null)
  const plans = usePlans()
  const none = t('common.states.none')

  let content: ReactNode
  if (plans.isPending) content = <LoadingRows label={t('training.plans.list.load.loading')} />
  else if (plans.isError) {
    content = <LoadError message={describeApiError(plans.error, { scope: 'training.plan', fallback: 'training.plans.list.load.error' })} />
  } else if (plans.data.length === 0) {
    content = <EmptyState message={t('training.plans.list.load.empty')} />
  } else {
    content = (
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full">
          <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <tr>
              {PLAN_COLUMNS.map((column) => (
                <th key={column} scope="col" className={HEADER_CELL}>{t(`training.plans.list.table.${column}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.data.map((plan) => {
              const percent = completionPercent(plan.completedDays, plan.requiredDays)
              const target = nextPlanStatus(plan.status)
              return (
                <tr key={plan.id} data-testid={`plan-row-${plan.id}`} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="px-4 py-4 text-sm font-semibold text-[#0F172A]">{plan.year}</td>
                  <td className="px-4 py-4 text-sm text-[#0F172A]">{plan.typeLabel}</td>
                  <td className="max-w-xs px-4 py-4 text-sm text-[#64748B]">{plan.title ?? none}</td>
                  <td className="px-4 py-4 text-sm text-[#64748B]">{unitLabel(plan)}</td>
                  <td className="min-w-[180px] px-4 py-4">
                    <p className="text-sm text-[#0F172A]">{t('training.plans.list.row.required', { days: formatDays(plan.requiredDays) })}</p>
                    <ProgressBar percent={percent} label={t('training.plans.list.row.progressLabel')} className="my-1 h-2 max-w-[160px]" />
                    <p className="text-xs text-[#64748B]">
                      {t('training.plans.list.row.progress', {
                        scheduled: formatDays(plan.scheduledDays),
                        completed: formatDays(plan.completedDays),
                        percent,
                      })}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#0F172A]">{plan.sessionCount}</td>
                  <td className="px-4 py-4">
                    <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', PLAN_STATUS_BADGE[plan.status])}>
                      {t(planStatusKey(plan.status))}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {target && (
                      <button
                        type="button"
                        data-testid={`plan-status-btn-${plan.id}`}
                        onClick={() => setChanging({ plan, target })}
                        className="whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
                      >
                        {t(STATUS_ACTION[target].button)}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" data-testid="create-plan-btn" onClick={() => setCreating(true)} className={cn(PRIMARY_BUTTON, 'flex items-center gap-2')}>
          <Plus size={16} aria-hidden="true" />
          {t('training.plans.list.create.button')}
        </button>
      </div>
      {content}
      {creating && <CreatePlanDialog onClose={() => setCreating(false)} />}
      {changing && <PlanStatusConfirm plan={changing.plan} target={changing.target} onClose={() => setChanging(null)} />}
    </div>
  )
}

// ── Đợt huấn luyện ──────────────────────────────────────────────────────────────

interface SessionDraft {
  planId: string
  name: string
  startDate: string
  endDate: string
  location: string
  daysCount: string
}
type SessionField = keyof SessionDraft

const EMPTY_SESSION: SessionDraft = { planId: '', name: '', startDate: '', endDate: '', location: '', daysCount: '' }

// The texts a session form check can show: its own validation texts and the backend's codes
type SessionMessageKey =
  | `training.sessions.create.validation.${'planRequired' | 'nameRequired' | 'startDateRequired' | 'endDateRequired' | 'locationRequired' | 'daysCountRequired' | 'daysCountInvalid'}`
  | `errors.training.session.${'session_end_before_start' | 'session_days_exceed_span' | 'session_outside_plan_year'}`

/**
 * The checks training-plans.service.ts createSession makes, run before sending: required fields,
 * the day limits, end not before start, no more training days than the span, dates in the plan year.
 */
function validateSession(draft: SessionDraft, plan: TrainingPlanRecord | undefined, t: (key: SessionMessageKey) => string): Errors<SessionField> {
  const found: Errors<SessionField> = {}
  const { startDate, endDate } = draft
  const daysCount = parseNumber(draft.daysCount)
  if (!draft.planId) found.planId = t('training.sessions.create.validation.planRequired')
  if (!draft.name.trim()) found.name = t('training.sessions.create.validation.nameRequired')
  if (!startDate) found.startDate = t('training.sessions.create.validation.startDateRequired')
  if (!endDate) found.endDate = t('training.sessions.create.validation.endDateRequired')
  if (!draft.location.trim()) found.location = t('training.sessions.create.validation.locationRequired')
  if (daysCount === null) found.daysCount = t('training.sessions.create.validation.daysCountRequired')
  else if (!isDayAmount(daysCount, SESSION_DAYS_RANGE.min, SESSION_DAYS_RANGE.max)) {
    found.daysCount = t('training.sessions.create.validation.daysCountInvalid')
  }

  if (startDate && endDate) {
    // YYYY-MM-DD strings compare in calendar order
    if (endDate < startDate) found.endDate = t('errors.training.session.session_end_before_start')
    else if (daysCount !== null && !found.daysCount && daysCount > sessionSpanDays(startDate, endDate)) {
      found.daysCount = t('errors.training.session.session_days_exceed_span')
    }
  }
  if (plan) {
    const year = String(plan.year)
    const outside = t('errors.training.session.session_outside_plan_year')
    if (startDate && startDate.slice(0, 4) !== year) found.startDate = outside
    if (endDate && !found.endDate && endDate.slice(0, 4) !== year) found.endDate = outside
  }
  return found
}

function CreateSessionDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshTraining()
  const unitLabel = useUnitLabel()
  const plans = usePlans()
  const [draft, setDraft] = useState<SessionDraft>(EMPTY_SESSION)
  const [errors, setErrors] = useState<Errors<SessionField>>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Sessions are scheduled in draft or active plans
  const openPlans = (plans.data ?? []).filter((plan) => plan.status !== 'completed')
  const plan = openPlans.find((candidate) => candidate.id === draft.planId)

  const create = useMutation({
    mutationFn: (body: CreateTrainingSessionBody) => trainingApi.createSession(body),
    onSuccess: () => {
      toast.success(t('training.sessions.create.submit.success'))
      void refresh()
      onClose()
    },
    onError: (err) => {
      // training_plan_completed: the plan choices changed meanwhile
      if (parseApiError(err).status === 409) void refresh()
      setFormError(describeApiError(err, { scope: 'training.session', fallback: 'training.sessions.create.submit.error' }))
    },
  })

  const update = (patch: Partial<SessionDraft>, field: SessionField) => {
    setDraft((current) => ({ ...current, ...patch }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateSession(draft, plan, (key) => t(key))
    setErrors(found)
    setFormError(null)
    const daysCount = parseNumber(draft.daysCount)
    if (Object.keys(found).length > 0 || daysCount === null) return
    create.mutate({
      planId: draft.planId,
      name: draft.name.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      location: draft.location.trim(),
      daysCount,
    })
  }

  const planOption = (candidate: TrainingPlanRecord) => {
    const values = { year: candidate.year, type: candidate.typeLabel, unit: unitLabel(candidate) }
    return candidate.title
      ? t('training.sessions.create.fields.planOptionWithTitle', { ...values, title: candidate.title })
      : t('training.sessions.create.fields.planOption', values)
  }

  let planHint: string | undefined
  if (plans.isError) planHint = t('training.sessions.create.fields.plansError')
  else if (plans.isSuccess && openPlans.length === 0) planHint = t('training.sessions.create.fields.noPlans')

  const yearBounds = plan ? { min: `${plan.year}-01-01`, max: `${plan.year}-12-31` } : {}
  const datesHint = plan ? t('training.sessions.create.fields.datesHint', { year: plan.year }) : undefined
  const pending = create.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }} title={t('training.sessions.create.dialog.title')} busy={pending}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <FormField id="session-plan" label={t('training.sessions.create.fields.plan')} required hint={planHint} error={errors.planId}>
          {(control) => (
            <select {...control} value={draft.planId} onChange={(e) => update({ planId: e.target.value }, 'planId')}>
              <option value="">{t('training.sessions.create.fields.planPlaceholder')}</option>
              {openPlans.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{planOption(candidate)}</option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="session-name" label={t('training.sessions.create.fields.name')} required error={errors.name}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={SESSION_TEXT_MAX_LENGTH}
              placeholder={t('training.sessions.create.fields.namePlaceholder')}
              value={draft.name}
              onChange={(e) => update({ name: e.target.value }, 'name')}
            />
          )}
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="session-start-date" label={t('training.sessions.create.fields.startDate')} required hint={datesHint} error={errors.startDate}>
            {(control) => (
              <input {...control} type="date" {...yearBounds} value={draft.startDate} onChange={(e) => update({ startDate: e.target.value }, 'startDate')} />
            )}
          </FormField>
          <FormField id="session-end-date" label={t('training.sessions.create.fields.endDate')} required error={errors.endDate}>
            {(control) => (
              <input
                {...control}
                type="date"
                {...yearBounds}
                min={draft.startDate || yearBounds.min}
                value={draft.endDate}
                onChange={(e) => update({ endDate: e.target.value }, 'endDate')}
              />
            )}
          </FormField>
        </div>
        <FormField id="session-location" label={t('training.sessions.create.fields.location')} required error={errors.location}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={SESSION_TEXT_MAX_LENGTH}
              placeholder={t('training.sessions.create.fields.locationPlaceholder')}
              value={draft.location}
              onChange={(e) => update({ location: e.target.value }, 'location')}
            />
          )}
        </FormField>
        <FormField
          id="session-days-count"
          label={t('training.sessions.create.fields.daysCount')}
          required
          hint={t('training.sessions.create.fields.daysCountHint')}
          error={errors.daysCount}
        >
          {(control) => (
            <input
              {...control}
              type="number"
              min={SESSION_DAYS_RANGE.min}
              max={SESSION_DAYS_RANGE.max}
              step={0.5}
              placeholder={t('training.sessions.create.fields.daysCountPlaceholder')}
              value={draft.daysCount}
              onChange={(e) => update({ daysCount: e.target.value }, 'daysCount')}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          idleLabel={t('training.sessions.create.submit.idle')}
          pendingLabel={t('training.sessions.create.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

function memberStatusKey(attended: boolean | null) {
  if (attended === null) return 'training.attendance.member.notRecorded' as const
  return attended ? ('training.attendance.member.present' as const) : ('training.attendance.member.absent' as const)
}

function AttendanceDialog({ session, onClose }: { session: TrainingSessionRecord; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // Answers changed in this dialog, over those recorded on the server
  const [marks, setMarks] = useState<Record<string, boolean>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const membersKey = trainingKeys.members(session.id)
  const members = useQuery({ queryKey: membersKey, queryFn: () => trainingApi.sessionMembers(session.id) })
  const blocker = attendanceBlocker(session)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trainingKeys.sessions }),
      queryClient.invalidateQueries({ queryKey: membersKey }),
    ])

  const save = useMutation({
    mutationFn: (attendance: AttendanceEntry[]) => trainingApi.recordAttendance(session.id, attendance),
    onSuccess: () => {
      toast.success(t('training.attendance.submit.success'))
      void refresh()
      onClose()
    },
    onError: (err) => {
      // 409: the plan or the session changed meanwhile; 404 militia_not_found: the roster did
      const { status } = parseApiError(err)
      if (status === 409 || status === 404) void refresh()
      setFormError(describeApiError(err, { scope: 'training.attendance', fallback: 'training.attendance.submit.error' }))
    },
  })

  const roster: SessionMember[] = members.data ?? []
  const answerOf = (member: SessionMember): boolean | null => marks[member.id] ?? member.attended
  const attended = roster.filter((member) => answerOf(member) === true).length
  const notRecorded = roster.filter((member) => answerOf(member) === null).length
  const allPresent = roster.length > 0 && attended === roster.length
  const pending = save.isPending

  const markAll = (value: boolean) => setMarks(Object.fromEntries(roster.map((member) => [member.id, value])))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    // The full roster: a member left unmarked is saved as absent
    save.mutate(roster.map((member) => ({ memberId: member.id, attended: answerOf(member) === true })))
  }

  let body: ReactNode
  if (members.isPending) body = <LoadingRows label={t('training.attendance.members.loading')} />
  else if (members.isError) {
    body = <LoadError message={describeApiError(members.error, { scope: 'training.attendance', fallback: 'training.attendance.members.error' })} />
  } else if (roster.length === 0) {
    body = <p className="py-8 text-center text-sm text-[#64748B]">{t('training.attendance.members.empty')}</p>
  } else {
    body = (
      <ul aria-label={t('training.attendance.members.listLabel')} className="max-h-[50vh] space-y-1 overflow-y-auto">
        {roster.map((member) => {
          const answer = answerOf(member)
          const checkboxId = `attendance-member-${member.id}`
          return (
            <li key={member.id} data-testid={`member-row-${member.id}`} className="flex items-center gap-3 rounded-lg p-3 hover:bg-[#F8FAFC]">
              <input
                id={checkboxId}
                type="checkbox"
                checked={answer === true}
                disabled={blocker !== null || pending}
                aria-describedby={`${checkboxId}-status`}
                onChange={(e) => setMarks((current) => ({ ...current, [member.id]: e.target.checked }))}
                className="h-4 w-4 rounded text-[#C62828] focus:ring-[#C62828]/30"
              />
              <label htmlFor={checkboxId} className="text-sm text-[#0F172A]">{member.name}</label>
              <span className="font-mono text-xs text-[#64748B]">{member.militiaCode}</span>
              <span
                id={`${checkboxId}-status`}
                className={cn('ml-auto text-xs font-medium', answer === true ? 'text-[#2E7D32]' : answer === false ? 'text-[#C62828]' : 'text-[#64748B]')}
              >
                {t(memberStatusKey(answer))}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={t('training.attendance.dialog.title', { name: session.name })}
      description={t('training.attendance.dialog.description', {
        from: formatCalendarDate(session.startDate),
        to: formatCalendarDate(session.endDate),
        location: session.location,
      })}
      busy={pending}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        {blocker && (
          <p role="status" className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            {t(`errors.training.attendance.${blocker}`)}
          </p>
        )}
        {body}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E8F0] pt-4">
          <div className="text-sm text-[#64748B]">
            <p>{t('training.attendance.counter.summary', { attended, total: roster.length })}</p>
            {blocker === null && notRecorded > 0 && <p className="text-xs">{t('training.attendance.counter.notRecorded', { count: notRecorded })}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {blocker === null && roster.length > 0 && (
              <button type="button" onClick={() => markAll(!allPresent)} disabled={pending} className={SECONDARY_BUTTON}>
                {allPresent ? t('training.attendance.actions.clearAll') : t('training.attendance.actions.markAll')}
              </button>
            )}
            <button type="button" onClick={onClose} disabled={pending} className={SECONDARY_BUTTON}>
              {t(blocker === null ? 'common.actions.cancel' : 'common.actions.close')}
            </button>
            {blocker === null && (
              <button type="submit" disabled={pending || roster.length === 0} className={PRIMARY_BUTTON}>
                {pending ? t('training.attendance.submit.pending') : t('training.attendance.submit.idle')}
              </button>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  )
}

function SessionsTab() {
  const { t } = useTranslation()
  const unitLabel = useUnitLabel()
  const [creating, setCreating] = useState(false)
  const [attendanceId, setAttendanceId] = useState<string | null>(null)
  const sessions = useQuery({ queryKey: trainingKeys.sessions, queryFn: () => trainingApi.listSessions() })
  const none = t('common.states.none')
  // Read from the list, so a reload after a conflict shows the session as it is now
  const attendanceSession = sessions.data?.find((s) => s.id === attendanceId)

  let content: ReactNode
  if (sessions.isPending) content = <LoadingRows label={t('training.sessions.list.load.loading')} />
  else if (sessions.isError) {
    content = <LoadError message={describeApiError(sessions.error, { scope: 'training.session', fallback: 'training.sessions.list.load.error' })} />
  } else if (sessions.data.length === 0) {
    content = <EmptyState message={t('training.sessions.list.load.empty')} />
  } else {
    content = (
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full">
          <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <tr>
              {SESSION_COLUMNS.map((column) => (
                <th key={column} scope="col" className={HEADER_CELL}>{t(`training.sessions.list.table.${column}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.data.map((s) => (
              <tr key={s.id} data-testid={`session-row-${s.id}`} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                <td className="px-4 py-4">
                  <p className="text-sm font-medium text-[#0F172A]">{s.name}</p>
                  <p className="text-xs text-[#64748B]">{t('training.sessions.list.row.plan', { year: s.planYear, unit: unitLabel(s) })}</p>
                </td>
                <td className="px-4 py-4 text-sm text-[#64748B]">{s.typeLabel}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-[#64748B]">{formatCalendarDate(s.startDate)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-[#64748B]">{formatCalendarDate(s.endDate)}</td>
                <td className="px-4 py-4 text-sm text-[#0F172A]">{s.location}</td>
                <td className="px-4 py-4 text-sm text-[#0F172A]">{formatDays(s.daysCount)}</td>
                <td className="px-4 py-4">
                  <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', SESSION_STATUS_BADGE[s.status])}>
                    {t(sessionStatusKey(s.status))}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  {s.attendancePercent === undefined ? (
                    <span className="text-sm text-[#64748B]">{none}</span>
                  ) : (
                    <>
                      <p className="text-xs text-[#64748B]">{t('training.sessions.list.row.attendance', { attended: s.attendedCount, recorded: s.recordedCount })}</p>
                      <p className={cn('text-sm font-semibold', s.attendancePercent >= 80 ? 'text-[#2E7D32]' : 'text-[#C62828]')}>
                        {t('training.shared.value.percent', { percent: s.attendancePercent })}
                      </p>
                    </>
                  )}
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    onClick={() => setAttendanceId(s.id)}
                    data-testid={`attendance-btn-${s.id}`}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-[#2E7D32] transition-colors hover:bg-green-100"
                  >
                    <CheckSquare size={12} aria-hidden="true" />
                    {t('training.sessions.list.row.attendanceButton')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" data-testid="create-session-btn" onClick={() => setCreating(true)} className={cn(PRIMARY_BUTTON, 'flex items-center gap-2')}>
          <CalendarPlus size={16} aria-hidden="true" />
          {t('training.sessions.list.create.button')}
        </button>
      </div>
      {content}
      {creating && <CreateSessionDialog onClose={() => setCreating(false)} />}
      {attendanceSession && <AttendanceDialog session={attendanceSession} onClose={() => setAttendanceId(null)} />}
    </div>
  )
}

// ── Thống kê ────────────────────────────────────────────────────────────────────

interface PlanTotals {
  plans: number
  required: number
  scheduled: number
  completed: number
}

interface TotalsRow extends PlanTotals {
  key: string
  label: string
}

const EMPTY_TOTALS: PlanTotals = { plans: 0, required: 0, scheduled: 0, completed: 0 }

function addPlan(totals: PlanTotals, plan: TrainingPlanRecord): PlanTotals {
  return {
    plans: totals.plans + 1,
    required: totals.required + plan.requiredDays,
    scheduled: totals.scheduled + plan.scheduledDays,
    completed: totals.completed + plan.completedDays,
  }
}

/** Sums the plans per group, in the order the groups first appear in `plans` */
function groupTotals(plans: readonly TrainingPlanRecord[], keyOf: (plan: TrainingPlanRecord) => string, labelOf: (plan: TrainingPlanRecord) => string): TotalsRow[] {
  const rows = new Map<string, TotalsRow>()
  for (const plan of plans) {
    const key = keyOf(plan)
    const current = rows.get(key) ?? { key, label: labelOf(plan), ...EMPTY_TOTALS }
    rows.set(key, { ...current, ...addPlan(current, plan) })
  }
  return [...rows.values()]
}

function TotalsTable({ title, firstColumn, rows, testIdPrefix }: { title: string; firstColumn: string; rows: TotalsRow[]; testIdPrefix: string }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
      <h3 className="border-b border-[#E2E8F0] px-5 py-4 text-sm font-semibold text-[#0F172A]">{title}</h3>
      <table className="w-full">
        <thead className="bg-[#F8FAFC]">
          <tr>
            <th scope="col" className={HEADER_CELL}>{firstColumn}</th>
            {STATS_COLUMNS.map((column) => (
              <th key={column} scope="col" className={HEADER_CELL}>{t(`training.stats.table.${column}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const percent = completionPercent(row.completed, row.required)
            return (
              <tr key={row.key} data-testid={`${testIdPrefix}-${row.key}`} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC]">
                <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.label}</td>
                <td className="px-4 py-3 text-sm text-[#0F172A]">{row.plans}</td>
                <td className="px-4 py-3 text-sm text-[#0F172A]">{formatDays(row.required)}</td>
                <td className="px-4 py-3 text-sm text-[#0F172A]">{formatDays(row.scheduled)}</td>
                <td className="px-4 py-3 text-sm text-[#0F172A]">{formatDays(row.completed)}</td>
                <td className={cn('px-4 py-3 text-sm font-bold', percent >= 100 ? 'text-[#2E7D32]' : percent >= 50 ? 'text-yellow-600' : 'text-[#C62828]')}>
                  {t('training.shared.value.percent', { percent })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// The key of ward-wide plans in the unit breakdown
const WARD_KEY = 'ward'

function StatsTab() {
  const { t } = useTranslation()
  const unitLabel = useUnitLabel()
  const plans = usePlans()
  // The current year in Vietnam, where the ward operates, whatever the browser timezone
  const currentYear = Number(todayInVietnam().slice(0, 4))
  const [year, setYear] = useState(currentYear)

  const all = plans.data ?? []
  const years = [...new Set([currentYear, ...all.map((plan) => plan.year)])].sort((a, b) => b - a)
  const ofYear = all.filter((plan) => plan.year === year)
  const totals = ofYear.reduce(addPlan, EMPTY_TOTALS)
  const percent = completionPercent(totals.completed, totals.required)

  const byType = groupTotals(
    [...ofYear].sort((a, b) => TRAINING_TYPES.indexOf(a.type) - TRAINING_TYPES.indexOf(b.type)),
    (plan) => plan.type,
    (plan) => t(typeKey(plan.type)),
  )
  // Ward-wide plans first, then by unit code, as GET /training/plans orders them
  const byUnit = groupTotals(
    [...ofYear].sort((a, b) => (a.unitCode ?? '').localeCompare(b.unitCode ?? '')),
    (plan) => plan.unitCode ?? WARD_KEY,
    unitLabel,
  )

  const summaryItems: { key: string; label: string; value: string }[] = [
    { key: 'plans', label: t('training.stats.summary.plans'), value: String(totals.plans) },
    { key: 'required', label: t('training.stats.summary.required'), value: formatDays(totals.required) },
    { key: 'scheduled', label: t('training.stats.summary.scheduled'), value: formatDays(totals.scheduled) },
    { key: 'completed', label: t('training.stats.summary.completed'), value: formatDays(totals.completed) },
    { key: 'rate', label: t('training.stats.summary.rate'), value: t('training.shared.value.percent', { percent }) },
  ]

  let content: ReactNode
  if (plans.isPending) content = <LoadingRows label={t('training.plans.list.load.loading')} />
  else if (plans.isError) {
    content = <LoadError message={describeApiError(plans.error, { scope: 'training.plan', fallback: 'training.plans.list.load.error' })} />
  } else if (ofYear.length === 0) {
    content = <p className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">{t('training.stats.summary.empty', { year })}</p>
  } else {
    content = (
      <>
        <section data-testid="stats-summary" className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-[#0F172A]">{t('training.stats.summary.title', { year })}</h3>
          <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {summaryItems.map((item) => (
              <div key={item.key} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <dt className="text-xs text-[#64748B]">{item.label}</dt>
                <dd data-testid={`stats-total-${item.key}`} className="text-xl font-bold text-[#0F172A]">{item.value}</dd>
              </div>
            ))}
          </dl>
          <ProgressBar percent={percent} label={t('training.stats.summary.progressLabel', { year })} className="h-3" />
        </section>
        <TotalsTable title={t('training.stats.byType.title')} firstColumn={t('training.stats.table.type')} rows={byType} testIdPrefix="stats-type" />
        <TotalsTable title={t('training.stats.byUnit.title')} firstColumn={t('training.stats.table.unit')} rows={byUnit} testIdPrefix="stats-unit" />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
          <BarChart2 size={16} aria-hidden="true" className="text-[#C62828]" />
          {t('training.stats.rules.title')}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <p className="mb-1 text-xs text-[#64748B]">{t('training.stats.rules.firstYearLabel')}</p>
            <p className="text-2xl font-bold text-[#0F172A]">{t('training.stats.rules.firstYearDays')}</p>
            <p className="mt-1 text-xs text-[#64748B]">{t('training.stats.rules.firstYearNote')}</p>
          </div>
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <p className="mb-1 text-xs text-[#64748B]">{t('training.stats.rules.laterYearsLabel')}</p>
            <p className="text-2xl font-bold text-[#0F172A]">{t('training.stats.rules.laterYearsDays')}</p>
            <p className="mt-1 text-xs text-[#64748B]">{t('training.stats.rules.laterYearsNote')}</p>
          </div>
        </div>
      </section>

      <div className="w-full sm:w-48">
        <FormField id="stats-year" label={t('training.stats.year.label')}>
          {(control) => (
            <select {...control} value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((option) => (
                <option key={option} value={String(option)}>{option}</option>
              ))}
            </select>
          )}
        </FormField>
      </div>

      {content}
    </div>
  )
}

type TabId = 'plans' | 'sessions' | 'stats'
const TABS: readonly TabId[] = ['plans', 'sessions', 'stats']

export function TrainingPlanPage() {
  const { t } = useTranslation()
  const { can } = useRbac()
  const [activeTab, setActiveTab] = useState<TabId>('plans')

  // training.roles.ts TRAINING_MANAGER_ROLES guard every plan, session and attendance endpoint
  if (!can.manageTraining) return <Navigate to="/forbidden" replace />

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="training-page">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0F172A]">
            <BookOpen size={24} aria-hidden="true" className="text-[#C62828]" />
            {t('training.page.header.title')}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">{t('training.page.header.subtitle')}</p>
        </div>

        <div role="tablist" aria-label={t('training.page.tabs.label')} className="flex w-fit gap-1 rounded-xl border border-[#E2E8F0] bg-white p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              data-testid={`training-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]',
              )}
            >
              {t(`training.page.tabs.${tab}`)}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {activeTab === 'plans' && <PlansTab />}
          {activeTab === 'sessions' && <SessionsTab />}
          {activeTab === 'stats' && <StatsTab />}
        </div>
      </div>
    </div>
  )
}

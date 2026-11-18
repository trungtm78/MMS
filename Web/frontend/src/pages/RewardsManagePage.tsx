// Khen thưởng and kỷ luật decisions (Web/backend/src/rewards). Staff (manageRewards) record
// decisions and decide appeals; every reader (viewRewards), DQTV members included for the
// decisions issued against them, may appeal a discipline decision that is still in force.
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Award, Gavel, MessageSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { militiaApi } from '@/api/militia'
import {
  APPEAL_OUTCOMES,
  COMMAND_ONLY_DISCIPLINE_FORMS,
  DISCIPLINE_FORMS,
  MAX_APPEAL_ROUNDS,
  REWARD_BASES,
  REWARD_FORMS,
  authoritiesFor,
  canFileAppeal,
  openAppeal,
  rewardKeys,
  rewardsApi,
  type AppealOutcome,
  type CreateDisciplineBody,
  type CreateRewardBody,
  type DecideAppealBody,
  type DisciplineForm,
  type DisciplineRecord,
  type DisciplineStatus,
  type FileAppealBody,
  type RewardAuthority,
  type RewardBasis,
  type RewardForm,
} from '@/api/rewards'
import { FormAlert, FormField } from '@/components/forms/FormField'
import { Dialog } from '@/components/ui/Dialog'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { useRbac } from '@/hooks/useRbac'
import { describeApiError, parseApiError } from '@/lib/api-error'
import { formatCalendarDate, todayInVietnam } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { MilitiaSearchItem, SmartSelectOption } from '@/types'

// Code → locale key (the texts match the labels of reward-codes.ts)
const rewardFormKey = (code: RewardForm) => `rewards.codes.forms.${code}` as const
const authorityKey = (code: RewardAuthority) => `rewards.codes.authorities.${code}` as const
const basisKey = (code: RewardBasis) => `rewards.codes.bases.${code}` as const
const disciplineFormKey = (code: DisciplineForm) => `rewards.codes.disciplineForms.${code}` as const
const statusKey = (code: DisciplineStatus) => `rewards.codes.disciplineStatuses.${code}` as const
const outcomeKey = (code: AppealOutcome) => `rewards.codes.appealOutcomes.${code}` as const

const STATUS_BADGE: Readonly<Record<DisciplineStatus, string>> = {
  active: 'bg-red-100 text-[#C62828]',
  appealed: 'bg-blue-100 text-blue-700',
  overturned: 'bg-green-100 text-[#2E7D32]',
}

const REWARD_COLUMNS = ['militia', 'form', 'authority', 'decisionNumber', 'criteria', 'issuedDate'] as const

const PRIMARY_BUTTON =
  'rounded-lg bg-[#C62828] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#A91D1D] disabled:opacity-50'
const SECONDARY_BUTTON =
  'rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50'

type Errors<F extends string> = Partial<Record<F, string>>

/** Refreshes a decision list and the rewards report built from the same ledgers */
function useRefreshDecisions() {
  const queryClient = useQueryClient()
  return (queryKey: readonly string[]) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: rewardKeys.report }),
    ])
}

function toMemberOption(member: MilitiaSearchItem): SmartSelectOption {
  return { id: member.id, label: member.fullName, sublabel: `${member.militiaCode} - ${member.unitName}` }
}

/** The member a decision is issued for, looked up with GET /militia/search */
function MemberPicker({ name, value, error, onChange }: { name: string; value: string; error?: string; onChange: (id: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { data: options = [], isFetching } = useQuery({
    queryKey: ['militia-search', query],
    queryFn: () => militiaApi.search({ q: query, limit: 20 }),
    select: (items: MilitiaSearchItem[]) => items.map(toMemberOption),
  })

  return (
    <SmartSelect
      name={name}
      label={t('rewards.memberPicker.field.label')}
      placeholder={t('rewards.memberPicker.field.placeholder')}
      value={value}
      onChange={(id) => onChange(id)}
      onClear={() => onChange('')}
      options={options}
      isLoading={isFetching}
      required
      error={Boolean(error)}
      errorMessage={error}
      onSearch={setQuery}
    />
  )
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

function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-12 text-center text-[#64748B]">
      {icon}
      <p>{message}</p>
    </div>
  )
}

// ── Khen thưởng ─────────────────────────────────────────────────────────────────

interface RewardDraft {
  militiaId: string
  rewardType: RewardForm | ''
  issuingAuthority: RewardAuthority | ''
  basis: RewardBasis | ''
  criteria: string
  decisionNumber: string
  issuedDate: string
}
type RewardField = 'militiaId' | 'rewardType' | 'issuingAuthority' | 'issuedDate'

const EMPTY_REWARD: RewardDraft = {
  militiaId: '',
  rewardType: '',
  issuingAuthority: '',
  basis: '',
  criteria: '',
  decisionNumber: '',
  issuedDate: '',
}

/** The chosen authority stays only while it may still confer the form on the decision date */
function keepAuthority(draft: RewardDraft): RewardDraft {
  const allowed = draft.rewardType ? authoritiesFor(draft.rewardType, draft.issuedDate) : []
  return draft.issuingAuthority && allowed.includes(draft.issuingAuthority) ? draft : { ...draft, issuingAuthority: '' }
}

function CreateRewardDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshDecisions()
  const [draft, setDraft] = useState<RewardDraft>(EMPTY_REWARD)
  const [errors, setErrors] = useState<Errors<RewardField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const today = todayInVietnam()

  const create = useMutation({
    mutationFn: (body: CreateRewardBody) => rewardsApi.createReward(body),
    onSuccess: () => {
      toast.success(t('rewards.create.submit.success'))
      void refresh(rewardKeys.rewards)
      onClose()
    },
    onError: (err) => setFormError(describeApiError(err, { scope: 'rewards.create', fallback: 'rewards.create.submit.error' })),
  })

  const update = (patch: Partial<RewardDraft>, field: RewardField | null) => {
    setDraft((current) => keepAuthority({ ...current, ...patch }))
    if (field) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const found: Errors<RewardField> = {}
    if (!draft.militiaId) found.militiaId = t('rewards.create.validation.militiaRequired')
    if (!draft.rewardType) found.rewardType = t('rewards.create.validation.formRequired')
    if (!draft.issuingAuthority) found.issuingAuthority = t('rewards.create.validation.authorityRequired')
    if (!draft.issuedDate) found.issuedDate = t('rewards.create.validation.issuedDateRequired')
    else if (draft.issuedDate > today) found.issuedDate = t('errors.rewards.create.decision_date_in_future')
    setErrors(found)
    setFormError(null)

    const { militiaId, rewardType, issuingAuthority, basis, issuedDate } = draft
    if (Object.keys(found).length > 0 || !rewardType || !issuingAuthority) return
    const criteria = draft.criteria.trim()
    const decisionNumber = draft.decisionNumber.trim()
    create.mutate({
      militiaId,
      rewardType,
      issuingAuthority,
      issuedDate,
      ...(basis ? { basis } : {}),
      ...(criteria ? { criteria } : {}),
      ...(decisionNumber ? { decisionNumber } : {}),
    })
  }

  const authorities = draft.rewardType ? authoritiesFor(draft.rewardType, draft.issuedDate) : []
  const pending = create.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }} title={t('rewards.create.dialog.title')} busy={pending}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <MemberPicker name="reward-militia" value={draft.militiaId} error={errors.militiaId} onChange={(militiaId) => update({ militiaId }, 'militiaId')} />
        <FormField id="reward-form" label={t('rewards.create.fields.form')} required error={errors.rewardType}>
          {(control) => (
            <select {...control} value={draft.rewardType} onChange={(e) => update({ rewardType: e.target.value as RewardForm | '' }, 'rewardType')}>
              <option value="">{t('rewards.create.fields.formPlaceholder')}</option>
              {REWARD_FORMS.map((code) => (
                <option key={code} value={code}>{t(rewardFormKey(code))}</option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="reward-issued-date" label={t('rewards.create.fields.issuedDate')} required error={errors.issuedDate}>
          {(control) => (
            <input {...control} type="date" max={today} value={draft.issuedDate} onChange={(e) => update({ issuedDate: e.target.value }, 'issuedDate')} />
          )}
        </FormField>
        <FormField
          id="reward-authority"
          label={t('rewards.create.fields.authority')}
          required
          hint={t('rewards.create.fields.authorityHint')}
          error={errors.issuingAuthority}
        >
          {(control) => (
            <select
              {...control}
              value={draft.issuingAuthority}
              disabled={!draft.rewardType}
              onChange={(e) => update({ issuingAuthority: e.target.value as RewardAuthority | '' }, 'issuingAuthority')}
            >
              <option value="">{t('rewards.create.fields.authorityPlaceholder')}</option>
              {authorities.map((code) => (
                <option key={code} value={code}>{t(authorityKey(code))}</option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="reward-basis" label={t('rewards.create.fields.basis')}>
          {(control) => (
            <select {...control} value={draft.basis} onChange={(e) => update({ basis: e.target.value as RewardBasis | '' }, null)}>
              <option value="">{t('rewards.create.fields.basisPlaceholder')}</option>
              {REWARD_BASES.map((code) => (
                <option key={code} value={code}>{t(basisKey(code))}</option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="reward-decision-number" label={t('rewards.create.fields.decisionNumber')}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={50}
              placeholder={t('rewards.create.fields.decisionNumberPlaceholder')}
              value={draft.decisionNumber}
              onChange={(e) => update({ decisionNumber: e.target.value }, null)}
            />
          )}
        </FormField>
        <FormField id="reward-criteria" label={t('rewards.create.fields.criteria')}>
          {(control) => (
            <textarea
              {...control}
              className={cn(control.className, 'resize-none')}
              rows={3}
              maxLength={2000}
              placeholder={t('rewards.create.fields.criteriaPlaceholder')}
              value={draft.criteria}
              onChange={(e) => update({ criteria: e.target.value }, null)}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          idleLabel={t('rewards.create.submit.idle')}
          pendingLabel={t('rewards.create.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

function RewardsTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const rewards = useQuery({ queryKey: rewardKeys.rewards, queryFn: () => rewardsApi.listRewards() })
  const none = t('common.states.none')

  let content: ReactNode
  if (rewards.isPending) content = <LoadingRows label={t('rewards.list.load.loading')} />
  else if (rewards.isError) {
    content = <LoadError message={describeApiError(rewards.error, { scope: 'rewards.list', fallback: 'rewards.list.load.error' })} />
  } else if (rewards.data.length === 0) {
    content = <EmptyState icon={<Award size={40} aria-hidden="true" className="mx-auto mb-3" />} message={t('rewards.list.load.empty')} />
  } else {
    content = (
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full">
          <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <tr>
              {REWARD_COLUMNS.map((column) => (
                <th key={column} scope="col" className="px-5 py-4 text-left text-xs font-semibold uppercase text-[#64748B]">
                  {t(`rewards.list.table.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rewards.data.map((record) => (
              <tr key={record.id} data-testid={`reward-row-${record.id}`} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                <td className="px-5 py-4">
                  <p className="text-sm font-medium text-[#0F172A]">{record.militiaName}</p>
                  <p className="font-mono text-xs text-[#64748B]">{record.militiaCode}</p>
                </td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-700">{record.rewardTypeLabel}</span>
                </td>
                <td className="px-5 py-4 text-sm text-[#64748B]">{record.issuingAuthorityLabel}</td>
                <td className="px-5 py-4 text-sm text-[#64748B]">{record.decisionNumber ?? none}</td>
                <td className="max-w-xs truncate px-5 py-4 text-sm text-[#64748B]">{record.criteria ?? none}</td>
                <td className="px-5 py-4 text-sm text-[#64748B]">{formatCalendarDate(record.issuedDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button type="button" data-testid="create-reward-btn" onClick={() => setCreating(true)} className={cn(PRIMARY_BUTTON, 'flex items-center gap-2')}>
            <Plus size={16} aria-hidden="true" />
            {t('rewards.list.create.button')}
          </button>
        </div>
      )}
      {content}
      {creating && <CreateRewardDialog onClose={() => setCreating(false)} />}
    </div>
  )
}

// ── Kỷ luật ─────────────────────────────────────────────────────────────────────

interface DisciplineDraft {
  militiaId: string
  disciplineType: DisciplineForm | ''
  violation: string
  violationDate: string
  decisionDate: string
  decisionNumber: string
  issuedBy: string
}
type DisciplineField = 'militiaId' | 'disciplineType' | 'violation' | 'violationDate' | 'decisionDate'

const EMPTY_DISCIPLINE: DisciplineDraft = {
  militiaId: '',
  disciplineType: '',
  violation: '',
  violationDate: '',
  decisionDate: '',
  decisionNumber: '',
  issuedBy: '',
}

function CreateDisciplineDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshDecisions()
  const [draft, setDraft] = useState<DisciplineDraft>(EMPTY_DISCIPLINE)
  const [errors, setErrors] = useState<Errors<DisciplineField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const today = todayInVietnam()

  const create = useMutation({
    mutationFn: (body: CreateDisciplineBody) => rewardsApi.createDiscipline(body),
    onSuccess: () => {
      toast.success(t('rewards.discipline.create.submit.success'))
      void refresh(rewardKeys.discipline)
      onClose()
    },
    onError: (err) =>
      setFormError(describeApiError(err, { scope: 'discipline.create', fallback: 'rewards.discipline.create.submit.error' })),
  })

  const update = (patch: Partial<DisciplineDraft>, field: DisciplineField | null) => {
    setDraft((current) => ({ ...current, ...patch }))
    if (field) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const violation = draft.violation.trim()
    const found: Errors<DisciplineField> = {}
    if (!draft.militiaId) found.militiaId = t('rewards.discipline.create.validation.militiaRequired')
    if (!draft.disciplineType) found.disciplineType = t('rewards.discipline.create.validation.formRequired')
    if (!violation) found.violation = t('rewards.discipline.create.validation.violationRequired')
    if (!draft.decisionDate) found.decisionDate = t('rewards.discipline.create.validation.decisionDateRequired')
    else if (draft.decisionDate > today) found.decisionDate = t('errors.discipline.create.decision_date_in_future')
    // YYYY-MM-DD strings compare in calendar order
    if (draft.violationDate && draft.decisionDate && draft.violationDate > draft.decisionDate) {
      found.violationDate = t('errors.discipline.create.violation_after_decision')
    }
    setErrors(found)
    setFormError(null)

    const { militiaId, disciplineType, violationDate, decisionDate } = draft
    if (Object.keys(found).length > 0 || !disciplineType) return
    const decisionNumber = draft.decisionNumber.trim()
    const issuedBy = draft.issuedBy.trim()
    create.mutate({
      militiaId,
      disciplineType,
      violation,
      decisionDate,
      ...(violationDate ? { violationDate } : {}),
      ...(decisionNumber ? { decisionNumber } : {}),
      ...(issuedBy ? { issuedBy } : {}),
    })
  }

  const commandOnly = draft.disciplineType !== '' && COMMAND_ONLY_DISCIPLINE_FORMS.includes(draft.disciplineType)
  const pending = create.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }} title={t('rewards.discipline.create.dialog.title')} busy={pending}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <MemberPicker name="discipline-militia" value={draft.militiaId} error={errors.militiaId} onChange={(militiaId) => update({ militiaId }, 'militiaId')} />
        <FormField
          id="discipline-form"
          label={t('rewards.discipline.create.fields.form')}
          required
          hint={commandOnly ? t('rewards.discipline.create.fields.commandOnlyHint') : undefined}
          error={errors.disciplineType}
        >
          {(control) => (
            <select {...control} value={draft.disciplineType} onChange={(e) => update({ disciplineType: e.target.value as DisciplineForm | '' }, 'disciplineType')}>
              <option value="">{t('rewards.discipline.create.fields.formPlaceholder')}</option>
              {DISCIPLINE_FORMS.map((code) => (
                <option key={code} value={code}>{t(disciplineFormKey(code))}</option>
              ))}
            </select>
          )}
        </FormField>
        <FormField id="discipline-violation" label={t('rewards.discipline.create.fields.violation')} required error={errors.violation}>
          {(control) => (
            <textarea
              {...control}
              className={cn(control.className, 'resize-none')}
              rows={3}
              maxLength={2000}
              placeholder={t('rewards.discipline.create.fields.violationPlaceholder')}
              value={draft.violation}
              onChange={(e) => update({ violation: e.target.value }, 'violation')}
            />
          )}
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="discipline-violation-date" label={t('rewards.discipline.create.fields.violationDate')} error={errors.violationDate}>
            {(control) => (
              <input {...control} type="date" max={today} value={draft.violationDate} onChange={(e) => update({ violationDate: e.target.value }, 'violationDate')} />
            )}
          </FormField>
          <FormField id="discipline-decision-date" label={t('rewards.discipline.create.fields.decisionDate')} required error={errors.decisionDate}>
            {(control) => (
              <input {...control} type="date" max={today} value={draft.decisionDate} onChange={(e) => update({ decisionDate: e.target.value }, 'decisionDate')} />
            )}
          </FormField>
        </div>
        <FormField id="discipline-decision-number" label={t('rewards.discipline.create.fields.decisionNumber')}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={50}
              placeholder={t('rewards.discipline.create.fields.decisionNumberPlaceholder')}
              value={draft.decisionNumber}
              onChange={(e) => update({ decisionNumber: e.target.value }, null)}
            />
          )}
        </FormField>
        <FormField id="discipline-issued-by" label={t('rewards.discipline.create.fields.issuedBy')}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={200}
              placeholder={t('rewards.discipline.create.fields.issuedByPlaceholder')}
              value={draft.issuedBy}
              onChange={(e) => update({ issuedBy: e.target.value }, null)}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          idleLabel={t('rewards.discipline.create.submit.idle')}
          pendingLabel={t('rewards.discipline.create.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

/** Interpolation values describing the decision a dialog acts on */
function decisionSummary(record: DisciplineRecord) {
  return { name: record.militiaName, form: record.disciplineTypeLabel, date: formatCalendarDate(record.decisionDate) }
}

function AppealDialog({ record, onClose }: { record: DisciplineRecord; onClose: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshDecisions()
  const [reason, setReason] = useState('')
  const [filedDate, setFiledDate] = useState('')
  const [errors, setErrors] = useState<Errors<'reason' | 'filedDate'>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const today = todayInVietnam()

  const file = useMutation({
    mutationFn: (body: FileAppealBody) => rewardsApi.fileAppeal(record.id, body),
    onSuccess: () => {
      toast.success(t('rewards.discipline.appeal.submit.success'))
      void refresh(rewardKeys.discipline)
      onClose()
    },
    onError: (err) => {
      // The decision changed meanwhile (already appealed, overturned, rounds used): show it as it is now
      if (parseApiError(err).status === 409) void refresh(rewardKeys.discipline)
      setFormError(describeApiError(err, { scope: 'discipline.appeal', fallback: 'rewards.discipline.appeal.submit.error' }))
    },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = reason.trim()
    const found: Errors<'reason' | 'filedDate'> = {}
    if (!trimmed) found.reason = t('rewards.discipline.appeal.validation.reasonRequired')
    if (filedDate && filedDate > today) found.filedDate = t('errors.discipline.appeal.appeal_date_in_future')
    else if (filedDate && filedDate < record.decisionDate) found.filedDate = t('errors.discipline.appeal.appeal_before_decision')
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) return
    file.mutate({ reason: trimmed, ...(filedDate ? { filedDate } : {}) })
  }

  const pending = file.isPending

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={t('rewards.discipline.appeal.dialog.title')}
      description={t('rewards.discipline.appeal.dialog.description', decisionSummary(record))}
      busy={pending}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <FormField id="appeal-reason" label={t('rewards.discipline.appeal.fields.reason')} required error={errors.reason}>
          {(control) => (
            <textarea
              {...control}
              className={cn(control.className, 'resize-none')}
              rows={4}
              maxLength={2000}
              placeholder={t('rewards.discipline.appeal.fields.reasonPlaceholder')}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setErrors((current) => ({ ...current, reason: undefined }))
              }}
            />
          )}
        </FormField>
        <FormField
          id="appeal-filed-date"
          label={t('rewards.discipline.appeal.fields.filedDate')}
          hint={t('rewards.discipline.appeal.fields.filedDateHint')}
          error={errors.filedDate}
        >
          {(control) => (
            <input
              {...control}
              type="date"
              min={record.decisionDate}
              max={today}
              value={filedDate}
              onChange={(e) => {
                setFiledDate(e.target.value)
                setErrors((current) => ({ ...current, filedDate: undefined }))
              }}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          idleLabel={t('rewards.discipline.appeal.submit.idle')}
          pendingLabel={t('rewards.discipline.appeal.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

function DecideAppealDialog({ record, onClose }: { record: DisciplineRecord; onClose: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshDecisions()
  const [outcome, setOutcome] = useState<AppealOutcome>('upheld')
  const [resolution, setResolution] = useState('')
  const [decidedDate, setDecidedDate] = useState('')
  const [errors, setErrors] = useState<Errors<'resolution' | 'decidedDate'>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const today = todayInVietnam()

  // The appeal being decided: its grounds and filing date
  const detail = useQuery({
    queryKey: rewardKeys.disciplineDetail(record.id),
    queryFn: () => rewardsApi.getDiscipline(record.id),
  })
  const pendingAppeal = detail.data ? openAppeal(detail.data) : undefined

  const decide = useMutation({
    mutationFn: (body: DecideAppealBody) => rewardsApi.decideAppeal(record.id, body),
    onSuccess: () => {
      toast.success(t('rewards.discipline.decide.submit.success'))
      void refresh(rewardKeys.discipline)
      onClose()
    },
    onError: (err) => {
      if (parseApiError(err).status === 409) void refresh(rewardKeys.discipline)
      setFormError(describeApiError(err, { scope: 'discipline.appealDecision', fallback: 'rewards.discipline.decide.submit.error' }))
    },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = resolution.trim()
    const found: Errors<'resolution' | 'decidedDate'> = {}
    if (!trimmed) found.resolution = t('rewards.discipline.decide.validation.resolutionRequired')
    if (decidedDate && decidedDate > today) found.decidedDate = t('errors.discipline.appealDecision.decided_date_in_future')
    else if (decidedDate && pendingAppeal && decidedDate < pendingAppeal.filedDate) {
      found.decidedDate = t('errors.discipline.appealDecision.decided_before_filed')
    }
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) return
    decide.mutate({ outcome, resolution: trimmed, ...(decidedDate ? { decidedDate } : {}) })
  }

  let appealSummary: ReactNode = null
  if (detail.isPending) appealSummary = <p>{t('rewards.discipline.decide.openAppeal.loading')}</p>
  else if (detail.isError) appealSummary = <p className="text-[#C62828]">{t('rewards.discipline.decide.openAppeal.error')}</p>
  else if (pendingAppeal) {
    appealSummary = (
      <>
        <p className="font-medium text-[#0F172A]">
          {t('rewards.discipline.decide.openAppeal.heading', { round: pendingAppeal.round, date: formatCalendarDate(pendingAppeal.filedDate) })}
        </p>
        <p className="mt-1 whitespace-pre-line text-[#0F172A]">{pendingAppeal.reason}</p>
        <p className="mt-1 text-xs">{t('rewards.discipline.decide.openAppeal.filedBy', { name: pendingAppeal.filedByName })}</p>
      </>
    )
  }

  const pending = decide.isPending

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={t('rewards.discipline.decide.dialog.title')}
      description={t('rewards.discipline.decide.dialog.description', decisionSummary(record))}
      busy={pending}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <section aria-live="polite" data-testid="open-appeal" className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#64748B]">
          {appealSummary}
        </section>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-[#0F172A]">{t('rewards.discipline.decide.fields.outcome')}</legend>
          <div className="flex flex-wrap gap-4">
            {APPEAL_OUTCOMES.map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm text-[#0F172A]">
                <input type="radio" name="appeal-outcome" value={code} checked={outcome === code} onChange={() => setOutcome(code)} />
                {t(outcomeKey(code))}
              </label>
            ))}
          </div>
        </fieldset>
        <FormField id="appeal-resolution" label={t('rewards.discipline.decide.fields.resolution')} required error={errors.resolution}>
          {(control) => (
            <textarea
              {...control}
              className={cn(control.className, 'resize-none')}
              rows={4}
              maxLength={2000}
              placeholder={t('rewards.discipline.decide.fields.resolutionPlaceholder')}
              value={resolution}
              onChange={(e) => {
                setResolution(e.target.value)
                setErrors((current) => ({ ...current, resolution: undefined }))
              }}
            />
          )}
        </FormField>
        <FormField
          id="appeal-decided-date"
          label={t('rewards.discipline.decide.fields.decidedDate')}
          hint={t('rewards.discipline.decide.fields.decidedDateHint')}
          error={errors.decidedDate}
        >
          {(control) => (
            <input
              {...control}
              type="date"
              min={pendingAppeal?.filedDate}
              max={today}
              value={decidedDate}
              onChange={(e) => {
                setDecidedDate(e.target.value)
                setErrors((current) => ({ ...current, decidedDate: undefined }))
              }}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          idleLabel={t('rewards.discipline.decide.submit.idle')}
          pendingLabel={t('rewards.discipline.decide.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

function DisciplineTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [appealing, setAppealing] = useState<DisciplineRecord | null>(null)
  const [deciding, setDeciding] = useState<DisciplineRecord | null>(null)
  const records = useQuery({ queryKey: rewardKeys.discipline, queryFn: () => rewardsApi.listDiscipline() })

  let content: ReactNode
  if (records.isPending) content = <LoadingRows label={t('rewards.discipline.list.load.loading')} />
  else if (records.isError) {
    content = <LoadError message={describeApiError(records.error, { scope: 'discipline.list', fallback: 'rewards.discipline.list.load.error' })} />
  } else if (records.data.length === 0) {
    content = <EmptyState icon={<AlertCircle size={40} aria-hidden="true" className="mx-auto mb-3" />} message={t('rewards.discipline.list.load.empty')} />
  } else {
    content = (
      <ul className="space-y-3">
        {records.data.map((record) => (
          <li key={record.id} data-testid={`discipline-row-${record.id}`} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#0F172A]">{record.militiaName}</p>
                  <span className="font-mono text-xs text-[#64748B]">{record.militiaCode}</span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_BADGE[record.status])}>
                    {t(statusKey(record.status))}
                  </span>
                </div>
                <p className="flex flex-wrap gap-x-3 text-xs text-[#64748B]">
                  <span className="font-medium text-[#0F172A]">{record.disciplineTypeLabel}</span>
                  <span>{t('rewards.discipline.list.row.decisionDate', { date: formatCalendarDate(record.decisionDate) })}</span>
                  {record.decisionNumber && <span>{t('rewards.discipline.list.row.decisionNumber', { number: record.decisionNumber })}</span>}
                  {record.issuedBy && <span>{t('rewards.discipline.list.row.issuedBy', { name: record.issuedBy })}</span>}
                </p>
                <p className="max-w-lg text-xs text-[#64748B]">{record.violation}</p>
                {record.appealRounds > 0 && (
                  <p className="text-xs text-blue-700">
                    {t('rewards.discipline.list.row.appealRounds', { rounds: record.appealRounds, max: MAX_APPEAL_ROUNDS })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {canFileAppeal(record) && (
                  <button
                    type="button"
                    data-testid={`appeal-btn-${record.id}`}
                    onClick={() => setAppealing(record)}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    <MessageSquare size={12} aria-hidden="true" />
                    {t('rewards.discipline.list.actions.appeal')}
                  </button>
                )}
                {canManage && record.status === 'appealed' && (
                  <button
                    type="button"
                    data-testid={`decide-appeal-btn-${record.id}`}
                    onClick={() => setDeciding(record)}
                    className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#F8FAFC]"
                  >
                    <Gavel size={12} aria-hidden="true" />
                    {t('rewards.discipline.list.actions.decide')}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button type="button" data-testid="create-discipline-btn" onClick={() => setCreating(true)} className={cn(PRIMARY_BUTTON, 'flex items-center gap-2')}>
            <Plus size={16} aria-hidden="true" />
            {t('rewards.discipline.list.create.button')}
          </button>
        </div>
      )}
      {content}
      {creating && <CreateDisciplineDialog onClose={() => setCreating(false)} />}
      {appealing && <AppealDialog record={appealing} onClose={() => setAppealing(null)} />}
      {deciding && <DecideAppealDialog record={deciding} onClose={() => setDeciding(null)} />}
    </div>
  )
}

type MainTab = 'rewards' | 'discipline'
const TABS: readonly MainTab[] = ['rewards', 'discipline']

export function RewardsManagePage() {
  const { t } = useTranslation()
  const { can } = useRbac()
  const [activeTab, setActiveTab] = useState<MainTab>('rewards')

  // GET /rewards and GET /discipline admit REWARD_READER_ROLES (rewards.roles.ts)
  if (!can.viewRewards) return <Navigate to="/forbidden" replace />

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="rewards-page">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0F172A]">
            <Award size={24} aria-hidden="true" className="text-[#C62828]" />
            {t('rewards.page.header.title')}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">{t('rewards.page.header.subtitle')}</p>
        </div>

        <div role="tablist" aria-label={t('rewards.page.tabs.label')} className="flex w-fit gap-1 rounded-xl border border-[#E2E8F0] bg-white p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              data-testid={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]',
              )}
            >
              {t(`rewards.page.tabs.${tab}`)}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {activeTab === 'rewards' ? <RewardsTab canManage={can.manageRewards} /> : <DisciplineTab canManage={can.manageRewards} />}
        </div>
      </div>
    </div>
  )
}

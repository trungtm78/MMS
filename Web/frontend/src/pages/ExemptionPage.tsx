import { useState } from 'react'
import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import {
  EXEMPTION_ERROR_FIELDS,
  EXEMPTION_FORM_FIELDS,
  exemptionKeys,
  exemptionsApi,
  type CreateExemptionBody,
  type ExemptionField,
  type ExemptionRecord,
} from '@/api/exemptions'
import { militiaApi } from '@/api/militia'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { useRbac } from '@/hooks/useRbac'
import type { TranslationKey } from '@/i18n/types'
import {
  describeApiError,
  errorCodeText,
  mapValidationErrors,
  parseApiError,
  skipRetryOnClientError,
  validationFormMessage,
} from '@/lib/api-error'
import { calendarDaysBetween, formatCalendarDate, todayInVietnam } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { MilitiaSearchItem, SmartSelectOption } from '@/types'

const STATUS_BADGE: Record<ExemptionRecord['status'], string> = {
  active: 'bg-green-100 text-[#2E7D32]',
  expired: 'bg-gray-100 text-[#64748B]',
  revoked: 'bg-red-100 text-[#C62828]',
}

const STATUS_LABEL = {
  active: 'exemptions.labels.status.active',
  expired: 'exemptions.labels.status.expired',
  revoked: 'exemptions.labels.status.revoked',
} as const satisfies Record<ExemptionRecord['status'], TranslationKey>

const TYPE_LABEL = {
  exemption: 'exemptions.labels.type.exemption',
  deferral: 'exemptions.labels.type.deferral',
} as const satisfies Record<ExemptionRecord['type'], TranslationKey>

// The decision type inside a sentence ("quyết định hoãn của …")
const TYPE_KIND = {
  exemption: 'exemptions.labels.kind.exemption',
  deferral: 'exemptions.labels.kind.deferral',
} as const satisfies Record<ExemptionRecord['type'], TranslationKey>

// Texts for create/revoke failures whose code is not in the error table (errors.exemptions.<code>)
const ERROR_STATUSES = {
  400: 'exemptions.requests.status.badRequest',
  403: 'exemptions.requests.status.forbidden',
} as const satisfies Partial<Record<number, TranslationKey>>

// Visible keyboard focus and a 44×44px minimum touch target for interactive controls
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2'
const TOUCH_TARGET = 'min-h-11 min-w-11'

// Dates are calendar days (YYYY-MM-DD); format them without a timezone shift
const formatDate = formatCalendarDate

// Calendar days from today in Vietnam to the expiry day: 0 on the day itself, negative after it
function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null
  const days = calendarDaysBetween(todayInVietnam(), expiryDate)
  return Number.isNaN(days) ? null : days
}

function toMilitiaOption(m: MilitiaSearchItem): SmartSelectOption {
  return {
    id: m.id,
    label: `${m.militiaCode} — ${m.fullName}`,
    sublabel: [m.phone, m.unitName].filter(Boolean).join(' | '),
  }
}

interface CreateExemptionForm {
  type: ExemptionRecord['type']
  reason: string
  legalBasis: string
  effectiveDate: string
  expiryDate: string
}

type FieldErrors = Partial<Record<ExemptionField, string>>

const INPUT_CLASS =
  'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30'

function RequiredMark() {
  return <span className="text-[#C62828]" aria-hidden="true"> *</span>
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} data-testid={id} className="mt-1 text-xs text-[#C62828]">
      {message}
    </p>
  )
}

// Accessibility attributes for a native field and its inline error
function fieldA11y(errorId: string, message: string | undefined) {
  return {
    'aria-invalid': !!message,
    'aria-describedby': message ? errorId : undefined,
  }
}

function CreateExemptionDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [militiaId, setMilitiaId] = useState('')
  const [militiaQuery, setMilitiaQuery] = useState('')
  const [form, setForm] = useState<CreateExemptionForm>({
    type: 'deferral',
    reason: '',
    legalBasis: '',
    effectiveDate: '',
    expiryDate: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const { data: militiaOptions = [], isFetching: militiaLoading } = useQuery({
    queryKey: ['militia-search', militiaQuery],
    queryFn: () => militiaApi.search({ q: militiaQuery, limit: 20 }),
    select: (items: MilitiaSearchItem[]) => items.map(toMilitiaOption),
  })

  const createMutation = useMutation({
    mutationFn: (body: CreateExemptionBody) => exemptionsApi.create(body),
    onSuccess: () => {
      toast.success(t('exemptions.create.submit.success'))
      queryClient.invalidateQueries({ queryKey: exemptionKeys.all })
      onClose()
    },
    onError: (err) => {
      const { code } = parseApiError(err)
      const field = code ? EXEMPTION_ERROR_FIELDS[code] : undefined
      const fieldText = code && field ? errorCodeText('exemptions', code) : null
      if (field && fieldText) {
        setFieldErrors({ [field]: fieldText })
        return
      }
      const validation = mapValidationErrors(err, EXEMPTION_FORM_FIELDS)
      if (validation) {
        setFieldErrors(validation.fieldErrors)
        setFormError(validationFormMessage(validation.otherErrors))
        return
      }
      setFormError(
        describeApiError(err, {
          scope: 'exemptions',
          statuses: ERROR_STATUSES,
          fallback: 'exemptions.create.submit.error',
        }),
      )
    },
  })

  const setField = <K extends keyof CreateExemptionForm>(key: K, value: CreateExemptionForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setFieldErrors((errors) => ({ ...errors, [key]: undefined }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const reason = form.reason.trim()
    const legalBasis = form.legalBasis.trim()
    const errors: FieldErrors = {}
    if (!militiaId) errors.militiaId = t('exemptions.create.validation.militiaRequired')
    if (!reason) errors.reason = t('exemptions.create.validation.reasonRequired')
    if (!legalBasis) errors.legalBasis = t('exemptions.create.validation.legalBasisRequired')
    if (!form.effectiveDate) errors.effectiveDate = t('exemptions.create.validation.effectiveDateRequired')
    // YYYY-MM-DD strings compare in calendar order; same rule and text as the API's expiry_before_effective
    if (form.expiryDate && form.effectiveDate && form.expiryDate < form.effectiveDate) {
      errors.expiryDate = t('errors.exemptions.expiry_before_effective')
    }
    setFieldErrors(errors)
    setFormError(null)
    if (Object.keys(errors).length > 0) return

    createMutation.mutate({
      militiaId,
      type: form.type,
      reason,
      legalBasis,
      effectiveDate: form.effectiveDate,
      ...(form.expiryDate ? { expiryDate: form.expiryDate } : {}),
    })
  }

  const saving = createMutation.isPending
  const borderFor = (field: ExemptionField) => (fieldErrors[field] ? 'border-[#C62828]' : 'border-[#E2E8F0]')

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={t('exemptions.create.dialog.title')}
      description={t('exemptions.create.dialog.description')}
      busy={saving}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {formError && (
          <p
            role="alert"
            data-testid="exemption-form-error"
            className="px-3 py-2 text-sm text-[#C62828] bg-red-50 border border-red-200 rounded-lg"
          >
            {formError}
          </p>
        )}
        <SmartSelect
          name="exemption-militia"
          label={t('exemptions.create.fields.militia')}
          placeholder={t('exemptions.create.fields.militiaPlaceholder')}
          value={militiaId}
          onChange={(id) => {
            setMilitiaId(id)
            setFieldErrors((errors) => ({ ...errors, militiaId: undefined }))
          }}
          onClear={() => setMilitiaId('')}
          options={militiaOptions}
          isLoading={militiaLoading}
          required
          error={!!fieldErrors.militiaId}
          errorMessage={fieldErrors.militiaId}
          onSearch={setMilitiaQuery}
        />
        <div>
          <label htmlFor="exemption-type" className="block text-sm font-medium text-[#0F172A] mb-1">
            {t('exemptions.create.fields.type')}<RequiredMark />
          </label>
          <select
            id="exemption-type"
            required
            value={form.type}
            onChange={(e) => setField('type', e.target.value as ExemptionRecord['type'])}
            className={cn(INPUT_CLASS, borderFor('type'))}
          >
            <option value="deferral">{t('exemptions.create.fields.typeDeferral')}</option>
            <option value="exemption">{t('exemptions.create.fields.typeExemption')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="exemption-reason" className="block text-sm font-medium text-[#0F172A] mb-1">
            {t('exemptions.create.fields.reason')}<RequiredMark />
          </label>
          <textarea
            id="exemption-reason"
            required
            value={form.reason}
            onChange={(e) => setField('reason', e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t('exemptions.create.fields.reasonPlaceholder')}
            className={cn(INPUT_CLASS, borderFor('reason'), 'resize-none')}
            {...fieldA11y('exemption-reason-error', fieldErrors.reason)}
          />
          <FieldError id="exemption-reason-error" message={fieldErrors.reason} />
        </div>
        <div>
          <label htmlFor="exemption-legal-basis" className="block text-sm font-medium text-[#0F172A] mb-1">
            {t('exemptions.create.fields.legalBasis')}<RequiredMark />
          </label>
          <input
            id="exemption-legal-basis"
            type="text"
            required
            value={form.legalBasis}
            onChange={(e) => setField('legalBasis', e.target.value)}
            maxLength={500}
            placeholder={t('exemptions.create.fields.legalBasisPlaceholder')}
            className={cn(INPUT_CLASS, borderFor('legalBasis'))}
            {...fieldA11y('exemption-legal-basis-error', fieldErrors.legalBasis)}
          />
          <FieldError id="exemption-legal-basis-error" message={fieldErrors.legalBasis} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="exemption-effective-date" className="block text-sm font-medium text-[#0F172A] mb-1">
              {t('exemptions.create.fields.effectiveDate')}<RequiredMark />
            </label>
            <input
              id="exemption-effective-date"
              type="date"
              required
              value={form.effectiveDate}
              onChange={(e) => setField('effectiveDate', e.target.value)}
              className={cn(INPUT_CLASS, borderFor('effectiveDate'))}
              {...fieldA11y('exemption-effective-date-error', fieldErrors.effectiveDate)}
            />
            <FieldError id="exemption-effective-date-error" message={fieldErrors.effectiveDate} />
          </div>
          <div>
            <label htmlFor="exemption-expiry-date" className="block text-sm font-medium text-[#0F172A] mb-1">
              {t('exemptions.create.fields.expiryDate')}
            </label>
            <input
              id="exemption-expiry-date"
              type="date"
              value={form.expiryDate}
              min={form.effectiveDate || undefined}
              onChange={(e) => setField('expiryDate', e.target.value)}
              className={cn(INPUT_CLASS, borderFor('expiryDate'))}
              {...fieldA11y('exemption-expiry-date-error', fieldErrors.expiryDate)}
            />
            <FieldError id="exemption-expiry-date-error" message={fieldErrors.expiryDate} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={cn(
              TOUCH_TARGET,
              FOCUS_RING,
              'px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {t('common.actions.cancel')}
          </button>
          <button
            type="submit"
            data-testid="exemption-submit"
            disabled={saving}
            className={cn(
              TOUCH_TARGET,
              FOCUS_RING,
              'bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50',
            )}
          >
            {saving ? t('common.actions.saving') : t('exemptions.create.submit.idle')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function ExemptionPage() {
  const { can } = useRbac()
  // GET /exemptions @Roles; creating and revoking have their own, narrower @Roles
  if (!can.viewExemptions) return <Navigate to="/forbidden" replace />
  return <ExemptionList canDecide={can.decideExemption} />
}

interface RevokeTarget {
  record: ExemptionRecord
}

function ExemptionList({ canDecide }: { canDecide: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null)
  // The row button that opened the confirmation; kept after closing so focus can return to it
  const [revokeTrigger, setRevokeTrigger] = useState<HTMLElement | null>(null)

  const listQuery = useQuery({
    queryKey: exemptionKeys.list({}),
    queryFn: () => exemptionsApi.list(),
    retry: skipRetryOnClientError(queryClient.getDefaultOptions().queries?.retry),
  })
  const exemptions = listQuery.data ?? []

  const revokeMutation = useMutation({
    mutationKey: exemptionKeys.revoke,
    mutationFn: (id: string) => exemptionsApi.revoke(id),
    onSuccess: () => toast.success(t('exemptions.revoke.request.success')),
    onError: (err) =>
      toast.error(
        describeApiError(err, {
          scope: 'exemptions',
          statuses: ERROR_STATUSES,
          fallback: 'exemptions.revoke.request.error',
        }),
      ),
    // Refresh either way: a failed revoke usually means the list is stale
    onSettled: () => queryClient.invalidateQueries({ queryKey: exemptionKeys.all }),
  })

  // Every revoke in flight (several rows may be revoked at once)
  const revokingIds = useMutationState({
    filters: { mutationKey: exemptionKeys.revoke, status: 'pending' },
    select: (mutation) => mutation.state.variables as string,
  })

  const expiringCount = exemptions.filter((e) => {
    const days = daysUntilExpiry(e.expiryDate)
    return e.status === 'active' && days !== null && days <= 30 && days >= 0
  }).length

  const confirmRevoke = () => {
    if (!revokeTarget) return
    revokeMutation.mutate(revokeTarget.record.id)
    setRevokeTarget(null)
  }

  const target = revokeTarget?.record

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="exemption-page">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <FileText size={24} className="text-[#C62828]" aria-hidden="true" />
              {t('exemptions.header.page.title')}
            </h1>
            <p className="text-sm text-[#64748B] mt-1">{t('exemptions.header.page.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {expiringCount > 0 && (
              <div
                data-testid="expiring-notice"
                className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded-lg text-sm"
              >
                <AlertTriangle size={14} aria-hidden="true" />
                {t('exemptions.header.page.expiringNotice', { count: expiringCount })}
              </div>
            )}
            {canDecide && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                data-testid="create-exemption-btn"
                className={cn(
                  TOUCH_TARGET,
                  FOCUS_RING,
                  'bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors',
                )}
              >
                <Plus size={16} aria-hidden="true" />
                {t('exemptions.header.page.create')}
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">{t('exemptions.summary.cards.active')}</p>
            <p className="text-3xl font-bold text-[#2E7D32]">{exemptions.filter((e) => e.status === 'active').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">{t('exemptions.summary.cards.expiring')}</p>
            <p data-testid="expiring-count" className={`text-3xl font-bold ${expiringCount > 0 ? 'text-yellow-600' : 'text-[#0F172A]'}`}>{expiringCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">{t('exemptions.summary.cards.inactive')}</p>
            <p className="text-3xl font-bold text-[#64748B]">{exemptions.filter((e) => e.status !== 'active').length}</p>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {listQuery.isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))
          ) : listQuery.isError ? (
            <div
              role="alert"
              data-testid="exemption-list-error"
              className="bg-red-50 border border-red-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="text-sm text-[#C62828]">
                <p className="font-medium">{t('exemptions.list.loadError.title')}</p>
                <p className="mt-0.5">
                  {describeApiError(listQuery.error, {
                    scope: 'exemptions',
                    statuses: { 403: 'exemptions.list.loadError.forbidden' },
                    fallback: 'exemptions.list.loadError.fallback',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => listQuery.refetch()}
                className={cn(
                  TOUCH_TARGET,
                  FOCUS_RING,
                  'px-4 py-2 text-sm font-medium text-[#C62828] border border-[#C62828]/40 rounded-lg bg-white hover:bg-red-50',
                )}
              >
                {t('common.actions.retry')}
              </button>
            </div>
          ) : exemptions.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
              <FileText size={40} className="mx-auto mb-3 text-[#64748B]" aria-hidden="true" />
              <p className="text-[#0F172A] font-medium">{t('exemptions.list.empty.title')}</p>
              {canDecide ? (
                <>
                  <p className="text-sm text-[#64748B] mt-1">{t('exemptions.list.empty.hint')}</p>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className={cn(
                      TOUCH_TARGET,
                      FOCUS_RING,
                      'mt-4 inline-flex items-center gap-2 bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium',
                    )}
                  >
                    <Plus size={16} aria-hidden="true" />
                    {t('exemptions.list.empty.createFirst')}
                  </button>
                </>
              ) : (
                <p className="text-sm text-[#64748B] mt-1">{t('exemptions.list.empty.readOnlyHint')}</p>
              )}
            </div>
          ) : (
            exemptions.map((rec) => {
              const days = daysUntilExpiry(rec.expiryDate)
              const isExpiringSoon = rec.status === 'active' && days !== null && days <= 30 && days >= 0
              const isRevoking = revokingIds.includes(rec.id)
              return (
                <div
                  key={rec.id}
                  data-testid={`exemption-${rec.id}`}
                  aria-busy={isRevoking || undefined}
                  className={`bg-white rounded-xl border p-5 ${isExpiringSoon ? 'border-yellow-300' : 'border-[#E2E8F0]'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[#0F172A]">{rec.militiaName}</p>
                        <span className="text-xs text-[#64748B]">{rec.militiaCode} · {rec.unitCode}</span>
                        <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                          {t(TYPE_LABEL[rec.type])}
                        </span>
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[rec.status]}`}>
                          {t(STATUS_LABEL[rec.status])}
                        </span>
                        {isExpiringSoon && (
                          <span
                            data-testid="expiry-warning"
                            className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700"
                          >
                            <AlertTriangle size={10} aria-hidden="true" />
                            {t('exemptions.list.item.expiringSoon', { days })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748B] mt-1.5">{rec.reason}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {t('exemptions.list.item.legalBasis', { legalBasis: rec.legalBasis })}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5" data-testid={`exemption-period-${rec.id}`}>
                        {rec.expiryDate
                          ? t('exemptions.list.item.periodRange', {
                              from: formatDate(rec.effectiveDate),
                              to: formatDate(rec.expiryDate),
                            })
                          : t('exemptions.list.item.period', { from: formatDate(rec.effectiveDate) })}
                      </p>
                    </div>
                    {canDecide && rec.status === 'active' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          if (isRevoking) return
                          setRevokeTrigger(e.currentTarget)
                          setRevokeTarget({ record: rec })
                        }}
                        // aria-disabled (not disabled) keeps the button focusable while pending
                        aria-disabled={isRevoking || undefined}
                        aria-label={t('exemptions.revoke.action.label', {
                          kind: t(TYPE_KIND[rec.type]),
                          militiaName: rec.militiaName,
                          militiaCode: rec.militiaCode,
                        })}
                        className={cn(
                          TOUCH_TARGET,
                          FOCUS_RING,
                          'shrink-0 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-[#C62828] border border-[#C62828]/30 rounded-lg hover:bg-red-50',
                          'aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent',
                        )}
                      >
                        {isRevoking ? t('exemptions.revoke.action.pending') : t('exemptions.revoke.action.idle')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {showCreate && <CreateExemptionDialog onClose={() => setShowCreate(false)} />}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}
        title={t('exemptions.revoke.confirm.title')}
        description={
          target
            ? t('exemptions.revoke.confirm.description', {
                kind: t(TYPE_KIND[target.type]),
                militiaName: target.militiaName,
                militiaCode: target.militiaCode,
              })
            : ''
        }
        confirmLabel={t('exemptions.revoke.confirm.confirmLabel')}
        cancelLabel={t('common.actions.cancel')}
        tone="danger"
        returnFocusTo={revokeTrigger}
        onConfirm={confirmRevoke}
      />
    </div>
  )
}

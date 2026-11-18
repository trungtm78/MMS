// KPI targets: GET /settings/kpi-targets for everyone who is measured against them or reports on
// them; PUT (a new version effective today) for system_admin only, so other staff get a read-only view
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Target, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  EVALUATION_PERIODS,
  KPI_TARGET_RANGES,
  kpiTargetsBody,
  settingsApi,
  settingsKeys,
  type EvaluationPeriod,
  type KpiTargets,
  type NumericKpiTarget,
} from '@/api/settings'
import { useRbac } from '@/hooks/useRbac'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { formatCalendarDate } from '@/lib/dates'
import { formatVietnamDateTime } from '@/lib/vietnamDateTime'

const NUMBER_FIELDS = [
  {
    key: 'minAttendanceDays',
    label: 'settings.kpiTargets.fields.minAttendanceDays.label',
    description: 'settings.kpiTargets.fields.minAttendanceDays.description',
    range: 'settings.kpiTargets.validation.minAttendanceDays',
  },
  {
    key: 'minTasksCompleted',
    label: 'settings.kpiTargets.fields.minTasksCompleted.label',
    description: 'settings.kpiTargets.fields.minTasksCompleted.description',
    range: 'settings.kpiTargets.validation.minTasksCompleted',
  },
  {
    key: 'maxOverdueTasks',
    label: 'settings.kpiTargets.fields.maxOverdueTasks.label',
    description: 'settings.kpiTargets.fields.maxOverdueTasks.description',
    range: 'settings.kpiTargets.validation.maxOverdueTasks',
  },
  {
    key: 'minTrainingHours',
    label: 'settings.kpiTargets.fields.minTrainingHours.label',
    description: 'settings.kpiTargets.fields.minTrainingHours.description',
    range: 'settings.kpiTargets.validation.minTrainingHours',
  },
] as const satisfies readonly { key: NumericKpiTarget; label: TranslationKey; description: TranslationKey; range: TranslationKey }[]

const PERIOD_LABELS = {
  monthly: 'settings.kpiTargets.periods.monthly',
  quarterly: 'settings.kpiTargets.periods.quarterly',
  yearly: 'settings.kpiTargets.periods.yearly',
} as const satisfies Record<EvaluationPeriod, TranslationKey>

type FieldErrors = Partial<Record<NumericKpiTarget, TranslationKey>>

/** Whole numbers within KPI_TARGET_RANGES, as KpiTargetsDto checks them */
function validate(targets: KpiTargets): FieldErrors {
  const errors: FieldErrors = {}
  for (const { key, range } of NUMBER_FIELDS) {
    const value = targets[key]
    const { min, max } = KPI_TARGET_RANGES[key]
    if (!Number.isInteger(value)) errors[key] = 'settings.kpiTargets.validation.integer'
    else if (value < min || value > max) errors[key] = range
  }
  return errors
}

export function SettingsChiTieuPage() {
  const { t } = useTranslation()
  const { can } = useRbac()
  // PUT /settings/kpi-targets is @Roles('system_admin')
  const canEdit = can.manageSystemSettings
  const queryClient = useQueryClient()
  // Edits in progress; null while the form shows the stored version
  const [draft, setDraft] = useState<KpiTargets | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const { data: stored, isLoading, isError } = useQuery({
    queryKey: settingsKeys.kpiTargets,
    queryFn: settingsApi.kpiTargets,
  })

  const mutation = useMutation({
    mutationFn: settingsApi.updateKpiTargets,
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsKeys.kpiTargets, saved)
      setDraft(null)
      toast.success(t('settings.kpiTargets.save.success'))
    },
    onError: (err: unknown) =>
      toast.error(
        describeApiError(err, {
          // 400 invalid_kpi_targets and 403 insufficient_role are in errors.settings.kpiTargets;
          // a 403 without a known code still means only system_admin may save
          scope: 'settings.kpiTargets',
          statuses: { 403: 'settings.kpiTargets.page.readOnly' },
          fallback: 'settings.kpiTargets.save.error',
        }),
      ),
  })

  if (isLoading) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-full">
        <div className="text-center text-[#64748B] py-12 text-sm">{t('common.states.loading')}</div>
      </div>
    )
  }

  const targets = draft ?? (stored ? kpiTargetsBody(stored) : null)

  const update = (change: Partial<KpiTargets>) => {
    if (!targets) return
    setDraft({ ...targets, ...change })
  }

  const handleSave = () => {
    if (!targets) return
    const errors = validate(targets)
    setFieldErrors(errors)
    if (Object.keys(errors).length === 0) mutation.mutate(targets)
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="settings-chitieu-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('settings.kpiTargets.page.heading')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('settings.kpiTargets.page.description')}</p>
        </div>
        {canEdit && targets && (
          <button
            type="button"
            onClick={handleSave}
            disabled={mutation.isPending}
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60 transition-colors"
            data-testid="save-chitieu-btn"
          >
            <Save size={16} aria-hidden="true" />
            {mutation.isPending ? t('common.actions.saving') : t('settings.kpiTargets.save.idle')}
          </button>
        )}
      </div>

      {isError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
          {t('settings.kpiTargets.page.loadError')}
        </p>
      )}

      {stored && targets && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
              <Target size={18} className="text-[#C62828]" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-[#0F172A]">{t('settings.kpiTargets.page.sectionTitle')}</p>
              {stored.isDefault ? (
                <p className="text-xs text-[#64748B]">{t('settings.kpiTargets.version.defaults')}</p>
              ) : (
                <>
                  {stored.effectiveFrom && (
                    <p className="text-xs text-[#64748B]">
                      {t('settings.kpiTargets.version.effectiveFrom', { date: formatCalendarDate(stored.effectiveFrom) })}
                    </p>
                  )}
                  {stored.updatedAt && (
                    <p className="text-xs text-[#64748B]">
                      {stored.updatedBy?.fullName
                        ? t('settings.kpiTargets.version.updatedBy', {
                            time: formatVietnamDateTime(stored.updatedAt),
                            name: stored.updatedBy.fullName,
                          })
                        : t('settings.kpiTargets.version.updated', { time: formatVietnamDateTime(stored.updatedAt) })}
                    </p>
                  )}
                </>
              )}
              {!canEdit && <p className="text-xs font-medium text-[#475569]">{t('settings.kpiTargets.page.readOnly')}</p>}
            </div>
          </div>

          {NUMBER_FIELDS.map(({ key, label, description }) => (
            <NumberField
              key={key}
              id={`kpi-${key}`}
              label={t(label)}
              description={t(description)}
              value={targets[key]}
              min={KPI_TARGET_RANGES[key].min}
              max={KPI_TARGET_RANGES[key].max}
              disabled={!canEdit}
              onChange={(value) => {
                update({ [key]: value })
                setFieldErrors((errors) => ({ ...errors, [key]: undefined }))
              }}
              error={fieldErrors[key] ? t(fieldErrors[key]) : undefined}
            />
          ))}

          <div className="flex items-center justify-between gap-4 pt-4">
            <div>
              <label htmlFor="kpi-evaluationPeriod" className="text-sm font-medium text-[#0F172A]">
                {t('settings.kpiTargets.fields.evaluationPeriod.label')}
              </label>
              <p className="text-xs text-[#64748B] mt-0.5">{t('settings.kpiTargets.fields.evaluationPeriod.description')}</p>
            </div>
            <select
              id="kpi-evaluationPeriod"
              value={targets.evaluationPeriod}
              disabled={!canEdit}
              onChange={(e) => update({ evaluationPeriod: e.target.value as EvaluationPeriod })}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A] disabled:bg-[#F8FAFC]"
              data-testid="evaluation-period-select"
            >
              {EVALUATION_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {t(PERIOD_LABELS[period])}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

interface NumberFieldProps {
  id: string
  label: string
  description: string
  value: number
  min: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
  error?: string
}

function NumberField({ id, label, description, value, min, max, disabled, onChange, error }: NumberFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-[#E2E8F0] last:border-0">
      <div className="flex-1">
        <label htmlFor={id} className="text-sm font-medium text-[#0F172A]">
          {label}
        </label>
        <p className="text-xs text-[#64748B] mt-0.5">{description}</p>
        {error && (
          <p id={errorId} className="text-xs text-[#C62828] mt-1">
            {error}
          </p>
        )}
      </div>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        // An emptied field is NaN, which fails validation instead of silently becoming 0
        value={Number.isNaN(value) ? '' : value}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        className={`w-20 px-3 py-2 border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] disabled:bg-[#F8FAFC] ${
          error ? 'border-[#C62828] bg-red-50' : 'border-[#E2E8F0]'
        }`}
      />
    </div>
  )
}

// Cảnh báo SOS (Web/backend/src/sos). GET /sos/alerts lists the incidents the caller responds to —
// militia members their own, CA officers their assigned DQTV's, unit staff their unit's — active
// first, then the most severe, then the newest; the page keeps that order. Responders (resolveSos)
// move an alert with PATCH /sos/:id/status after a confirmation, offered only the moves its
// status allows (SOS_STATUS_TRANSITIONS).
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle, Clock, MapPin, Shield } from 'lucide-react'
import { toast } from 'sonner'
import {
  SOS_SEVERITIES,
  SOS_STATUS_FILTERS,
  SOS_STATUS_TRANSITIONS,
  sosApi,
  sosKeys,
  type SosAlertFilters,
  type SosIncident,
  type SosIncidentStatus,
  type SosSeverity,
  type SosStatusFilter,
  type SosStatusTarget,
} from '@/api/sos'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useRbac } from '@/hooks/useRbac'
import { describeApiError, parseApiError } from '@/lib/api-error'
import { formatCalendarDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20
const REFRESH_MS = 10_000
const MINUTES_PER_DAY = 24 * 60

const severityKey = (code: SosSeverity) => `sos.codes.severities.${code}` as const
const statusKey = (code: SosIncidentStatus) => `sos.codes.statuses.${code}` as const

const SEVERITY_BADGE: Readonly<Record<SosSeverity, string>> = {
  urgent: 'bg-[#C62828] text-white',
  high: 'bg-red-100 text-[#C62828]',
  medium: 'bg-orange-100 text-orange-700',
  low: 'bg-slate-100 text-[#64748B]',
}

const STATUS_BADGE: Readonly<Record<SosIncidentStatus, string>> = {
  open: 'bg-red-50 text-[#C62828]',
  acknowledged: 'bg-blue-100 text-blue-700',
  responding: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-[#2E7D32]',
  closed: 'bg-slate-100 text-[#64748B]',
}

const ACTION_BUTTON: Readonly<Record<SosStatusTarget, string>> = {
  acknowledged: 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  responding: 'border border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
  resolved: 'bg-[#2E7D32] text-white hover:bg-[#1B5E20]',
  closed: 'border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]',
}

const INPUT =
  'rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]'
const LABEL = 'mb-1 block text-xs font-medium text-[#64748B]'
const SECONDARY_BUTTON =
  'rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50'

interface StatusMove {
  alert: SosIncident
  target: SosStatusTarget
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function StatCard({ testId, label, value, tone }: { testId: string; label: string; value: string; tone: string }) {
  return (
    <div data-testid={testId} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <p className="mb-1 text-xs uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className={cn('text-3xl font-bold', tone)}>{value}</p>
    </div>
  )
}

/** A unit code applied on submit; blank means every unit of the caller's scope */
function UnitCodeFilter({ onApply }: { onApply: (unitCode: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onApply(draft.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div>
        <label htmlFor={id} className={LABEL}>
          {t('common.filters.unitCode')}
        </label>
        <input
          id={id}
          type="text"
          maxLength={50}
          value={draft}
          placeholder={t('sos.page.filters.unitPlaceholder')}
          onChange={(event) => setDraft(event.target.value)}
          className={INPUT}
        />
      </div>
      <button type="submit" className={SECONDARY_BUTTON}>
        {t('sos.page.filters.apply')}
      </button>
    </form>
  )
}

interface AlertCardProps {
  alert: SosIncident
  canMove: boolean
  onMove: (move: StatusMove) => void
}

function AlertCard({ alert, canMove, onMove }: AlertCardProps) {
  const { t } = useTranslation()
  const active = alert.statusGroup === 'active'
  const moves = canMove ? SOS_STATUS_TRANSITIONS[alert.status] : []

  const minutes = Math.floor((Date.now() - new Date(alert.createdAt).getTime()) / 60_000)
  let created: string
  if (minutes < 1) created = t('sos.list.time.justNow')
  else if (minutes < 60) created = t('sos.list.time.minutesAgo', { count: minutes })
  else if (minutes < MINUTES_PER_DAY) created = t('sos.list.time.hoursAgo', { count: Math.floor(minutes / 60) })
  else created = formatCalendarDate(alert.createdAt)

  // The place as reported, else its coordinates
  let location = t('sos.list.row.unknownLocation')
  if (alert.locationName) location = alert.locationName
  else if (alert.lat !== null && alert.lng !== null) {
    location = t('sos.list.row.coordinates', { lat: alert.lat.toFixed(5), lng: alert.lng.toFixed(5) })
  }

  return (
    <li
      data-testid={`sos-alert-${alert.id}`}
      data-status-group={alert.statusGroup}
      className={cn(
        'flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-white p-5 transition-all',
        active ? 'border-[#C62828]/30 shadow-sm shadow-red-50' : 'border-[#E2E8F0]',
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C62828] text-sm font-bold text-white"
        >
          {initials(alert.reporterName)}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', SEVERITY_BADGE[alert.severity])}>
              {t(severityKey(alert.severity))}
            </span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_BADGE[alert.status])}>
              {t(statusKey(alert.status))}
            </span>
            <span className="font-mono text-xs text-[#64748B]">{alert.code}</span>
            {active && <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-[#C62828]" />}
          </div>
          <p className="text-sm font-semibold text-[#0F172A]">{alert.title}</p>
          {alert.message && <p className="text-xs text-[#0F172A]">{alert.message}</p>}
          <p className="flex flex-wrap gap-x-2 text-xs text-[#64748B]">
            <span className="font-medium text-[#0F172A]">{alert.reporterName}</span>
            {alert.reporterUnitCode && <span>{t('sos.list.row.unit', { unit: alert.reporterUnitCode })}</span>}
          </p>
          <p className="flex items-center gap-1 text-xs text-[#64748B]">
            <MapPin size={12} aria-hidden="true" />
            <span>{location}</span>
          </p>
          <p className="flex items-center gap-1 text-xs text-[#64748B]">
            <Clock size={12} aria-hidden="true" />
            <time dateTime={alert.createdAt}>{created}</time>
          </p>
          {alert.assignedToName && <p className="text-xs text-[#64748B]">{t('sos.list.row.assignedTo', { name: alert.assignedToName })}</p>}
          {alert.resolvedAt && (
            <p className="text-xs text-[#2E7D32]">{t('sos.list.row.resolvedAt', { date: formatCalendarDate(alert.resolvedAt) })}</p>
          )}
          {alert.resolutionNote && <p className="text-xs text-[#64748B]">{t('sos.list.row.resolutionNote', { note: alert.resolutionNote })}</p>}
        </div>
      </div>
      {moves.length > 0 && (
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {moves.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onMove({ alert, target })}
              data-testid={`sos-action-${target}-${alert.id}`}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors', ACTION_BUTTON[target])}
            >
              {target === 'resolved' && <CheckCircle size={14} aria-hidden="true" />}
              {t(`sos.status.actions.${target}.button`)}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

function SosBoard({ canMove }: { canMove: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const severityId = useId()
  const listId = useId()
  const [status, setStatus] = useState<SosStatusFilter>('all')
  const [severity, setSeverity] = useState<SosSeverity | ''>('')
  const [unitCode, setUnitCode] = useState('')
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<StatusMove | null>(null)

  const filters: SosAlertFilters = {
    status,
    ...(severity ? { severity } : {}),
    ...(unitCode ? { unitCode } : {}),
    page,
    limit: PAGE_SIZE,
  }
  const alerts = useQuery({
    queryKey: sosKeys.alertList(filters),
    queryFn: () => sosApi.listAlerts(filters),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  })

  const refreshAlerts = () => queryClient.invalidateQueries({ queryKey: sosKeys.alerts })

  const move = useMutation({
    mutationFn: ({ alert, target }: StatusMove) => sosApi.updateStatus(alert.id, { status: target }),
    onSuccess: (_updated, { target }) => {
      toast.success(t(`sos.status.actions.${target}.success`))
      void refreshAlerts()
    },
    onError: (err, { target }) => {
      toast.error(describeApiError(err, { scope: 'sos.resolve', fallback: `sos.status.actions.${target}.error` as const }))
      // 404: the alert left the caller's scope; 409: its status changed meanwhile. Show the list as it is now
      const { status: httpStatus } = parseApiError(err)
      if (httpStatus === 404 || httpStatus === 409) void refreshAlerts()
    },
    onSettled: () => setPending(null),
  })

  /** Applies a filter change and goes back to the first page */
  const refilter = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const counts = alerts.data?.counts
  const tabCounts: Record<SosStatusFilter, number> | null = counts
    ? { all: counts.active + counts.resolved, active: counts.active, resolved: counts.resolved }
    : null
  const none = t('common.states.none')

  let list
  if (alerts.isPending) {
    list = (
      <div role="status" aria-label={t('sos.list.load.loading')} className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex animate-pulse gap-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
            <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    )
  } else if (alerts.isError) {
    list = (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
        <p>{describeApiError(alerts.error, { scope: 'sos.alerts', fallback: 'sos.list.load.error' })}</p>
        <button type="button" onClick={() => void alerts.refetch()} className={SECONDARY_BUTTON}>
          {t('common.actions.retry')}
        </button>
      </div>
    )
  } else if (alerts.data.data.length === 0) {
    list = (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-16 text-center">
        <Shield size={48} aria-hidden="true" className="mx-auto mb-4 text-[#2E7D32]" />
        <p className="font-semibold text-[#0F172A]">{t('sos.list.empty.title')}</p>
        <p className="mt-1 text-sm text-[#64748B]">
          {severity || unitCode ? t('sos.list.empty.filtered') : t('sos.list.empty.normal')}
        </p>
      </div>
    )
  } else {
    const { data, total, limit } = alerts.data
    const pages = Math.max(1, Math.ceil(total / limit))
    list = (
      <div className="space-y-4">
        <ul className="space-y-3">
          {data.map((alert) => (
            <AlertCard key={alert.id} alert={alert} canMove={canMove} onMove={setPending} />
          ))}
        </ul>
        <nav aria-label={t('sos.list.pagination.label')} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#64748B]">{t('sos.list.pagination.summary', { page: alerts.data.page, pages, total })}</p>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className={SECONDARY_BUTTON}>
              {t('common.pagination.previous')}
            </button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)} className={SECONDARY_BUTTON}>
              {t('common.pagination.next')}
            </button>
          </div>
        </nav>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="sos-page">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0F172A]">
              <AlertTriangle size={24} aria-hidden="true" className="text-[#C62828]" />
              {t('sos.page.header.title')}
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">{t('sos.page.header.subtitle')}</p>
          </div>
          {counts && counts.active > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-[#C62828] px-4 py-2 text-white">
              <AlertTriangle size={16} aria-hidden="true" />
              <span className="text-sm font-semibold">{t('sos.page.header.activeBadge', { count: counts.active })}</span>
            </div>
          )}
        </div>

        <div data-testid="sos-stats" className="grid grid-cols-3 gap-4">
          <StatCard testId="sos-stat-active" label={t('sos.page.stats.active')} value={tabCounts ? String(tabCounts.active) : none} tone="text-[#C62828]" />
          <StatCard testId="sos-stat-resolved" label={t('sos.page.stats.resolved')} value={tabCounts ? String(tabCounts.resolved) : none} tone="text-[#2E7D32]" />
          <StatCard testId="sos-stat-total" label={t('sos.page.stats.total')} value={tabCounts ? String(tabCounts.all) : none} tone="text-[#0F172A]" />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div role="tablist" aria-label={t('sos.page.tabs.label')} className="flex w-fit gap-1 rounded-xl border border-[#E2E8F0] bg-white p-1">
            {SOS_STATUS_FILTERS.map((tab) => {
              const label = t(`sos.page.tabs.${tab}`)
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={status === tab}
                  aria-controls={listId}
                  onClick={() => refilter(() => setStatus(tab))}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    status === tab ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]',
                  )}
                >
                  {tabCounts ? t('sos.page.tabs.withCount', { label, count: tabCounts[tab] }) : label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={severityId} className={LABEL}>
                {t('sos.page.filters.severity')}
              </label>
              <select
                id={severityId}
                value={severity}
                onChange={(event) => refilter(() => setSeverity(event.target.value as SosSeverity | ''))}
                className={INPUT}
              >
                <option value="">{t('sos.page.filters.severityAll')}</option>
                {SOS_SEVERITIES.map((code) => (
                  <option key={code} value={code}>
                    {t(severityKey(code))}
                  </option>
                ))}
              </select>
            </div>
            <UnitCodeFilter onApply={(code) => refilter(() => setUnitCode(code))} />
          </div>
        </div>

        <div role="tabpanel" id={listId}>
          {list}
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null)
          }}
          title={t(`sos.status.actions.${pending.target}.title`)}
          description={t(`sos.status.actions.${pending.target}.description`, {
            title: pending.alert.title,
            name: pending.alert.reporterName,
          })}
          confirmLabel={t('common.actions.confirm')}
          tone={pending.target === 'closed' ? 'danger' : 'primary'}
          busy={move.isPending}
          onConfirm={() => move.mutate(pending)}
        />
      )}
    </div>
  )
}

export function SOSPage() {
  const { can } = useRbac()
  // sos.controller.ts class-level @Roles
  if (!can.viewSos) return <Navigate to="/forbidden" replace />
  return <SosBoard canMove={can.resolveSos} />
}

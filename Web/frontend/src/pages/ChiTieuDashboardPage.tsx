// Bảng chỉ tiêu KPI (Web/backend/src/kpi). The "Chỉ tiêu" tab reads GET /kpi/dashboard, the KPI
// overview of a month for the caller's unit scope; the "Báo cáo KPI" tab lists GET
// /kpi/summary-report for a payroll period and downloads it with GET /kpi/export. Metric names and
// units, grade and recommendation labels arrive with the data, as the backend labels them.
import { useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  gradeOf,
  kpiApi,
  kpiKeys,
  type KpiDashboard,
  type KpiDashboardParams,
  type KpiGrade,
  type KpiGradeCount,
  type KpiMetric,
  type KpiRankedMember,
  type KpiRecommendationCount,
  type KpiReportParams,
  type KpiSummaryItem,
  type KpiTargets,
  type KpiTrendPoint,
  type KpiUnitScore,
} from '@/api/kpi'
import { payrollApi } from '@/api/payroll'
import { useRbac } from '@/hooks/useRbac'
import { describeApiError, withJsonErrorBody } from '@/lib/api-error'
import { formatCalendarDate, todayInVietnam } from '@/lib/dates'
import { cn } from '@/lib/utils'

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })
const formatNumber = (value: number) => numberFormat.format(value)
// Report scores keep the two decimals the backend rounds criteria and supervisor scores to
const scoreFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const pad2 = (value: number) => String(value).padStart(2, '0')

const YEARS_OFFERED = 5
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

const GRADE_BAR: Readonly<Record<KpiGrade, string>> = {
  excellent: 'bg-[#2E7D32]',
  good: 'bg-[#43A047]',
  fair: 'bg-[#F59E0B]',
  needs_improvement: 'bg-[#C62828]',
}

const GRADE_BADGE: Readonly<Record<KpiGrade, string>> = {
  excellent: 'bg-yellow-100 text-yellow-700',
  good: 'bg-green-100 text-[#2E7D32]',
  fair: 'bg-blue-100 text-blue-700',
  needs_improvement: 'bg-orange-100 text-orange-700',
}

type MetricState = 'met' | 'not-met' | 'no-data'

const STATE_TEXT: Readonly<Record<MetricState, string>> = {
  met: 'text-[#2E7D32]',
  'not-met': 'text-[#C62828]',
  'no-data': 'text-[#64748B]',
}

const STATE_BAR: Readonly<Record<MetricState, string>> = {
  met: 'bg-[#2E7D32]',
  'not-met': 'bg-[#C62828]',
  'no-data': 'bg-[#94A3B8]',
}

const REPORT_COLUMNS = ['name', 'code', 'unit', 'attendance', 'task', 'discipline', 'attitude', 'supervisor', 'total', 'grade'] as const
const SCORE_FIELDS = ['attendanceScore', 'taskScore', 'disciplineScore', 'attitudeScore', 'supervisorScore', 'total'] as const

const INPUT =
  'rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]'
const LABEL = 'mb-1 block text-xs font-medium text-[#64748B]'
const CARD = 'rounded-xl border border-[#E2E8F0] bg-white p-5'
const MUTED = 'text-sm text-[#64748B]'

/**
 * How far a metric's average goes towards its target, 0-100. A 'min' target is reached by getting
 * to it (current / target), a 'max' target by staying under it (target / current); a zero
 * denominator means the target already holds. Rounded down so a missed target never reads 100%.
 */
function achievement({ comparison, current, target }: KpiMetric): number {
  if (current === null) return 0
  const ratio = comparison === 'max' ? (current === 0 ? 1 : target / current) : target === 0 ? 1 : current / target
  // The epsilon keeps binary fractions (0.29 * 100 = 28.999…) on their whole percent
  return Math.min(100, Math.max(0, Math.floor(ratio * 100 + 1e-9)))
}

function ProgressBar({ value, label, barClass }: { value: number; label: string; barClass: string }) {
  const pct = Math.round(Math.min(100, Math.max(0, value)))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]"
    >
      <div className={cn('h-2 rounded-full transition-all', barClass)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn(CARD, 'p-6')}>
      <h2 id={id} className="mb-4 text-base font-semibold text-[#0F172A]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex justify-center p-12">
      <div aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-4 border-[#C62828] border-t-transparent" />
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
          placeholder={t('kpi.page.unitFilter.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          className={INPUT}
        />
      </div>
      <button
        type="submit"
        className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:border-[#C62828] hover:text-[#C62828]"
      >
        {t('kpi.page.unitFilter.apply')}
      </button>
    </form>
  )
}

// ── Chỉ tiêu ────────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={CARD}>
      <p className="mb-1 text-xs uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className="text-2xl font-bold text-[#0F172A]">{value}</p>
      <p className="mt-1 text-xs text-[#64748B]">{hint}</p>
    </div>
  )
}

function MetricCard({ metric }: { metric: KpiMetric }) {
  const { t } = useTranslation()
  const pct = achievement(metric)
  let state: MetricState = metric.met ? 'met' : 'not-met'
  if (metric.current === null) state = 'no-data'
  const targetKey = metric.comparison === 'max' ? 'kpi.dashboard.metric.maxTarget' : 'kpi.dashboard.metric.minTarget'

  return (
    <div data-testid={`kpi-metric-${metric.key}`} data-state={state} className={CARD}>
      <p className="mb-1 text-sm text-[#64748B]">{metric.name}</p>
      {metric.current === null ? (
        <p className="mb-3 text-base font-semibold text-[#64748B]">{t('kpi.dashboard.noData')}</p>
      ) : (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <span className="text-2xl font-bold text-[#0F172A]">{formatNumber(metric.current)}</span>
          <span className="pb-0.5 text-sm text-[#64748B]">
            {t(targetKey, { target: formatNumber(metric.target), unit: metric.unit })}
          </span>
        </div>
      )}
      {metric.comparison === 'max' && <p className="mb-2 text-xs text-[#64748B]">{t('kpi.dashboard.metric.lowerIsBetter')}</p>}
      <ProgressBar value={pct} label={metric.name} barClass={STATE_BAR[state]} />
      {metric.current !== null && (
        <p className={cn('mt-1.5 flex gap-1 text-xs font-medium', STATE_TEXT[state])}>
          <span>{t('kpi.dashboard.metric.progress', { pct })}</span>
          <span>{t(metric.met ? 'kpi.dashboard.metric.met' : 'kpi.dashboard.metric.notMet')}</span>
        </p>
      )}
      <p className="mt-1 text-xs text-[#64748B]">
        {t('kpi.dashboard.metric.membersMeeting', { meeting: metric.membersMeeting, members: metric.memberCount })}
      </p>
    </div>
  )
}

function TargetsInForce({ targets }: { targets: KpiTargets }) {
  const { t } = useTranslation()
  return (
    <Section title={t('kpi.dashboard.targets.title')}>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <p className={MUTED}>
          {t('kpi.dashboard.targets.evaluationPeriod', { period: t(`kpi.dashboard.targets.periods.${targets.evaluationPeriod}`) })}
        </p>
        <p className={MUTED}>
          {targets.isDefault || !targets.effectiveFrom
            ? t('kpi.dashboard.targets.default')
            : t('kpi.dashboard.targets.effectiveFrom', { date: formatCalendarDate(targets.effectiveFrom) })}
        </p>
      </div>
    </Section>
  )
}

function TrendSection({ trend }: { trend: KpiTrendPoint[] }) {
  const { t } = useTranslation()
  const title = t('kpi.dashboard.trend.title')
  const noData = t('kpi.dashboard.noData')
  // Months without evaluations stay null so the line breaks there instead of dropping to zero
  const points = trend.map((point) => ({
    label: `${pad2(point.month)}/${point.year}`,
    averageScore: point.averageScore,
    evaluatedCount: point.evaluatedCount,
  }))

  return (
    <Section title={title}>
      {points.some((point) => point.averageScore !== null) ? (
        <>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="averageScore"
                  name={t('kpi.dashboard.trend.series')}
                  stroke="#C62828"
                  strokeWidth={2}
                  dot={{ fill: '#C62828', r: 4 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{t('kpi.dashboard.trend.month')}</th>
                <th scope="col">{t('kpi.dashboard.trend.score')}</th>
                <th scope="col">{t('kpi.dashboard.trend.evaluated')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label}>
                  <td>{point.label}</td>
                  <td>{point.averageScore === null ? noData : formatNumber(point.averageScore)}</td>
                  <td>{formatNumber(point.evaluatedCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className={MUTED}>{t('kpi.dashboard.trend.empty')}</p>
      )}
    </Section>
  )
}

function UnitRanking({ units }: { units: KpiUnitScore[] }) {
  const { t } = useTranslation()
  return (
    <Section title={t('kpi.dashboard.units.title')}>
      {units.length === 0 ? (
        <p className={MUTED}>{t('kpi.dashboard.units.empty')}</p>
      ) : (
        <ol className="space-y-4">
          {units.map((unit, index) => {
            const grade = unit.averageScore === null ? null : gradeOf(unit.averageScore)
            return (
              <li key={unit.unitCode} data-testid={`kpi-unit-${unit.unitCode}`} data-grade={grade ?? undefined} className="flex items-center gap-3">
                <span className={cn('w-6 text-center text-sm font-bold', index === 0 ? 'text-[#C62828]' : 'text-[#64748B]')}>{index + 1}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-[#0F172A]">{unit.unitName}</p>
                    <span className="font-mono text-xs text-[#64748B]">{unit.unitCode}</span>
                  </div>
                  {unit.averageScore !== null && grade !== null && (
                    <ProgressBar value={unit.averageScore} label={unit.unitName} barClass={GRADE_BAR[grade]} />
                  )}
                  <p className="text-xs text-[#64748B]">
                    {t('kpi.dashboard.units.evaluated', { evaluated: unit.evaluatedCount, members: unit.memberCount })}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#0F172A]">
                  {unit.averageScore === null ? t('kpi.dashboard.noData') : formatNumber(unit.averageScore)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}

function MemberList({ title, members }: { title: string; members: KpiRankedMember[] }) {
  const { t } = useTranslation()
  return (
    <Section title={title}>
      {members.length === 0 ? (
        <p className={MUTED}>{t('kpi.dashboard.members.empty')}</p>
      ) : (
        <ol className="space-y-3">
          {members.map((member) => (
            <li key={member.militiaId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#0F172A]">{member.fullName}</p>
                <p className="font-mono text-xs text-[#64748B]">
                  {t('kpi.dashboard.members.identity', { code: member.militiaCode, unit: member.unitCode })}
                </p>
              </div>
              <span className="text-sm font-semibold text-[#0F172A]">{formatNumber(member.score)}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', GRADE_BADGE[member.grade])}>{member.gradeLabel}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

function Distribution({ bands }: { bands: KpiGradeCount[] }) {
  const { t } = useTranslation()
  return (
    <Section title={t('kpi.dashboard.distribution.title')}>
      <ul className="space-y-3">
        {bands.map((band) => (
          <li key={band.grade} data-testid={`kpi-grade-${band.grade}`} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-[#0F172A]">{band.label}</span>
              <span className="text-xs text-[#64748B]">{t('kpi.dashboard.distribution.minScore', { min: band.minScore })}</span>
            </div>
            <ProgressBar value={band.pct} label={band.label} barClass={GRADE_BAR[band.grade]} />
            <p className="text-xs text-[#64748B]">{t('kpi.dashboard.distribution.count', { count: band.count, pct: formatNumber(band.pct) })}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Recommendations({ items }: { items: KpiRecommendationCount[] }) {
  const { t } = useTranslation()
  return (
    <Section title={t('kpi.dashboard.recommendations.title')}>
      <ul className="divide-y divide-[#F1F5F9]">
        {items.map((item) => (
          <li key={item.recommendation} data-testid={`kpi-recommendation-${item.recommendation}`} className="flex justify-between py-2 text-sm">
            <span className="text-[#0F172A]">{item.label}</span>
            <span className="font-semibold text-[#0F172A]">{formatNumber(item.count)}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function DashboardOverview({ data }: { data: KpiDashboard }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div data-testid="kpi-summary" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t('kpi.dashboard.summary.members')}
          value={formatNumber(data.memberCount)}
          hint={t('kpi.dashboard.summary.notEvaluated', { count: data.notEvaluatedCount })}
        />
        <SummaryCard
          label={t('kpi.dashboard.summary.coverage')}
          value={t('kpi.dashboard.summary.coverageRate', { rate: formatNumber(data.coverageRate) })}
          hint={t('kpi.dashboard.summary.coverageDetail', { evaluated: data.evaluatedCount, members: data.memberCount })}
        />
        <SummaryCard
          label={t('kpi.dashboard.summary.average')}
          value={data.averageScore === null ? t('kpi.dashboard.noData') : formatNumber(data.averageScore)}
          hint={t('kpi.dashboard.summary.averageScale')}
        />
      </div>
      <TargetsInForce targets={data.targets} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>
      <TrendSection trend={data.trend} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <UnitRanking units={data.byUnit} />
        <MemberList title={t('kpi.dashboard.members.top')} members={data.top} />
        <MemberList title={t('kpi.dashboard.members.bottom')} members={data.bottom} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Distribution bands={data.distribution} />
        <Recommendations items={data.recommendations} />
      </div>
    </div>
  )
}

interface DashboardTabProps {
  year: number
  month: number
  currentYear: number
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  dashboard: UseQueryResult<KpiDashboard>
}

function DashboardTab({ year, month, currentYear, onYearChange, onMonthChange, dashboard }: DashboardTabProps) {
  const { t } = useTranslation()
  const yearId = useId()
  const monthId = useId()
  const years = Array.from({ length: YEARS_OFFERED }, (_, back) => currentYear - back)

  let content: ReactNode
  if (dashboard.isPending) content = <LoadingState label={t('kpi.dashboard.load.loading')} />
  else if (dashboard.isError) {
    content = <LoadError message={describeApiError(dashboard.error, { scope: 'kpi.dashboard', fallback: 'kpi.dashboard.load.error' })} />
  } else content = <DashboardOverview data={dashboard.data} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor={yearId} className={LABEL}>
            {t('common.filters.year')}
          </label>
          <select id={yearId} value={year} onChange={(event) => onYearChange(Number(event.target.value))} className={INPUT}>
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={monthId} className={LABEL}>
            {t('kpi.dashboard.filters.month')}
          </label>
          <select id={monthId} value={month} onChange={(event) => onMonthChange(Number(event.target.value))} className={INPUT}>
            {MONTHS.map((option) => (
              <option key={option} value={option}>
                {t('kpi.dashboard.filters.monthOption', { month: option })}
              </option>
            ))}
          </select>
        </div>
      </div>
      {content}
    </div>
  )
}

// ── Báo cáo KPI ─────────────────────────────────────────────────────────────────

function ReportRow({ item, none }: { item: KpiSummaryItem; none: string }) {
  const { t } = useTranslation()
  const grade = item.total === null ? null : gradeOf(item.total)
  return (
    <tr data-testid={`kpi-report-row-${item.militiaId}`} data-grade={grade ?? undefined} className="transition-colors hover:bg-[#F8FAFC]">
      <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{item.name}</td>
      <td className="px-4 py-3 font-mono text-sm text-[#64748B]">{item.code}</td>
      <td className="px-4 py-3 text-sm text-[#64748B]">{item.unit}</td>
      {SCORE_FIELDS.map((field) => {
        const value = item[field]
        return (
          <td key={field} className={cn('px-4 py-3 text-center text-sm', field === 'total' && 'font-bold text-[#0F172A]')}>
            {value === null ? none : scoreFormat.format(value)}
          </td>
        )
      })}
      <td className="px-4 py-3">
        {grade === null ? (
          <span className="text-xs text-[#94A3B8]">{t('kpi.report.table.notEvaluated')}</span>
        ) : (
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', GRADE_BADGE[grade])}>{item.xepLoai}</span>
        )}
      </td>
    </tr>
  )
}

function ReportTab({ unitCode }: { unitCode: string }) {
  const { t } = useTranslation()
  const periodSelectId = useId()
  const [periodId, setPeriodId] = useState('')
  const [exporting, setExporting] = useState(false)

  // GET /payroll/periods admits the same roles as the KPI report (payroll.controller.ts)
  const periods = useQuery({ queryKey: ['payroll-periods'], queryFn: () => payrollApi.listPeriods() })
  const params: KpiReportParams = { periodId, ...(unitCode ? { unitCode } : {}) }
  const report = useQuery({
    queryKey: kpiKeys.report(params),
    queryFn: () => kpiApi.getSummaryReport(params),
    enabled: periodId !== '',
  })

  const selected = periods.data?.find((period) => period.id === periodId)
  const fileName = selected ? `BaoCaoKPI_${selected.year}-${pad2(selected.month)}.xlsx` : ''
  const rows = report.data ?? []
  const none = t('common.states.none')

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await kpiApi.exportReport(params)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
      toast.success(t('kpi.report.export.success'))
    } catch (err) {
      toast.error(describeApiError(await withJsonErrorBody(err), { scope: 'kpi.report', fallback: 'kpi.report.export.error' }))
    } finally {
      setExporting(false)
    }
  }

  let periodsHint: ReactNode = null
  if (periods.isPending) periodsHint = <p className="mt-1 text-xs text-[#64748B]">{t('kpi.report.filters.periodsLoading')}</p>
  else if (periods.isError) {
    periodsHint = (
      <p role="alert" className="mt-1 text-xs text-[#C62828]">
        {describeApiError(periods.error, { fallback: 'kpi.report.filters.periodsError' })}
      </p>
    )
  } else if (periods.data.length === 0) periodsHint = <p className="mt-1 text-xs text-[#64748B]">{t('kpi.report.filters.periodsEmpty')}</p>

  let content: ReactNode
  if (periodId && report.isPending) content = <LoadingState label={t('kpi.report.load.loading')} />
  else if (report.isError) {
    content = <LoadError message={describeApiError(report.error, { scope: 'kpi.report', fallback: 'kpi.report.load.error' })} />
  } else {
    content = (
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
        <table className="w-full">
          <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <tr>
              {REPORT_COLUMNS.map((column) => (
                <th key={column} scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#64748B]">
                  {t(`kpi.report.table.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={REPORT_COLUMNS.length} className="px-6 py-12 text-center text-sm text-[#94A3B8]">
                  {periodId ? t('kpi.report.load.empty') : t('kpi.report.load.choosePeriod')}
                </td>
              </tr>
            ) : (
              rows.map((item) => <ReportRow key={item.militiaId} item={item} none={none} />)
            )}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={periodSelectId} className={LABEL}>
            {t('kpi.report.filters.period')}
          </label>
          <select id={periodSelectId} value={periodId} onChange={(event) => setPeriodId(event.target.value)} className={INPUT}>
            <option value="">{t('kpi.report.filters.periodPlaceholder')}</option>
            {(periods.data ?? []).map((period) => (
              <option key={period.id} value={period.id}>
                {t('kpi.report.filters.periodOption', { label: `${pad2(period.month)}/${period.year}` })}
              </option>
            ))}
          </select>
          {periodsHint}
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting || !selected || rows.length === 0}
          data-testid="kpi-report-export-btn"
          className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#64748B] transition-colors hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          {t(exporting ? 'common.actions.exporting' : 'common.actions.export')}
        </button>
      </div>
      {content}
    </div>
  )
}

// ── Trang ───────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'report'
const TABS: readonly Tab[] = ['dashboard', 'report']

function KpiBoard() {
  const { t } = useTranslation()
  const tabPanelId = useId()
  // The current month in Vietnam, where the backend draws its business months
  const [current] = useState(() => {
    const [year, month] = todayInVietnam().split('-').map(Number)
    return { year, month }
  })
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [year, setYear] = useState(current.year)
  const [month, setMonth] = useState(current.month)
  const [unitCode, setUnitCode] = useState('')

  const params: KpiDashboardParams = { year, month, ...(unitCode ? { unitCode } : {}) }
  const dashboard = useQuery({
    queryKey: kpiKeys.dashboard(params),
    queryFn: () => kpiApi.getDashboard(params),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })

  return (
    <div className="min-h-full space-y-6 bg-[#F8FAFC] p-6" data-testid="chitieu-dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('kpi.page.header.title')}</h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {dashboard.data
              ? t('kpi.page.header.subtitleWithPeriod', { period: dashboard.data.period.label })
              : t('kpi.page.header.subtitle')}
          </p>
        </div>
        <UnitCodeFilter onApply={setUnitCode} />
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div role="tablist" aria-label={t('kpi.page.tabs.label')} className="flex border-b border-[#E2E8F0]">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${tabPanelId}-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={tabPanelId}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'relative px-6 py-3.5 text-sm font-medium transition-all',
                activeTab === tab
                  ? '-mb-px border-b-2 border-[#C62828] text-[#C62828]'
                  : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]',
              )}
            >
              {t(`kpi.page.tabs.${tab}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={tabPanelId} aria-labelledby={`${tabPanelId}-${activeTab}`} className="p-6">
          {activeTab === 'dashboard' ? (
            <DashboardTab
              year={year}
              month={month}
              currentYear={current.year}
              onYearChange={setYear}
              onMonthChange={setMonth}
              dashboard={dashboard}
            />
          ) : (
            <ReportTab unitCode={unitCode} />
          )}
        </div>
      </div>
    </div>
  )
}

export function ChiTieuDashboardPage() {
  const { can } = useRbac()
  // GET /kpi/dashboard, /kpi/summary-report and /kpi/export admit the KPI report readers
  if (!can.viewKpiReport) return <Navigate to="/forbidden" replace />
  return <KpiBoard />
}

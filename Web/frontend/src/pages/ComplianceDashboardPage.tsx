import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import client from '@/api/client'
import { describeApiError } from '@/lib/api-error'
import { formatVietnamDateTime } from '@/lib/vietnamDateTime'
import type { TranslationKey } from '@/i18n/types'

/**
 * GET /dashboard/compliance (dashboard.service.ts getComplianceStats): the caller's scope in the
 * current Vietnamese month. totalActive, trainingCompliant and expiringExemptions are COUNTs the
 * service parses to integers; attendancePct and avgKpiScore are ROUND over NUMERIC and arrive as
 * JSON numbers (src/database/pg-types.ts); trainingCompliancePct is worked out by the service.
 */
interface ComplianceStats {
  totalActive: number
  /** Active members with at least 15 training days this year */
  trainingCompliant: number
  trainingCompliancePct: number
  attendancePct: number
  /** Average kpi_scores.total_score (DECIMAL(5,2)) of kpiPeriod; null before any period is scored */
  avgKpiScore: number | null
  /** The latest KPI period up to this month that has scores in scope */
  kpiPeriod: { year: number; month: number } | null
  /** Active exemptions that expire within the next 30 days */
  expiringExemptions: number
  lastUpdated: string
}

// Area units KP1…KP6 (Khu phố 1…6)
const AREA_NUMBERS = [1, 2, 3, 4, 5, 6] as const

// A 403 (insufficient_role, no_unit_scope) is a missing permission; other failures read as the fallback
const FORBIDDEN_STATUS = { 403: 'errors.common.forbidden' } as const satisfies Partial<Record<number, TranslationKey>>

async function fetchComplianceStats(unitCode: string): Promise<ComplianceStats> {
  const res = await client.get<ComplianceStats>('/dashboard/compliance', { params: { unitCode: unitCode || undefined } })
  return res.data
}

const formatNumber = (value: number) => value.toLocaleString('vi-VN')

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse">
      <div className="h-4 bg-[#E2E8F0] rounded w-2/3 mb-3" />
      <div className="h-8 bg-[#E2E8F0] rounded w-1/2 mb-3" />
      <div className="h-2 bg-[#E2E8F0] rounded-full w-full mb-1.5" />
      <div className="h-3 bg-[#E2E8F0] rounded w-1/3" />
    </div>
  )
}

interface StatCardProps {
  id: string
  label: string
  /** The figure as shown */
  value: string
  unit?: string
  detail?: string
  /** A percentage drawn as a bar */
  progress?: number
}

function StatCard({ id, label, value, unit, detail, progress }: StatCardProps) {
  return (
    <div data-testid={`compliance-stat-${id}`} className="bg-white rounded-xl border border-[#E2E8F0] p-5">
      <p className="text-sm text-[#64748B] mb-2">{label}</p>
      <div className="flex items-end gap-1.5 mb-3">
        <span className="text-3xl font-bold text-[#1F3A5F]">{value}</span>
        {unit && <span className="text-sm text-[#64748B] pb-0.5">{unit}</span>}
      </div>
      {progress !== undefined && (
        <div className="w-full h-2 bg-[#E2E8F0] rounded-full overflow-hidden mb-1.5">
          <div
            data-testid={`compliance-progress-${id}`}
            className="h-2 rounded-full bg-[#2E7D32] transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {detail && <p className="text-xs text-[#64748B]">{detail}</p>}
    </div>
  )
}

export function ComplianceDashboardPage() {
  const { t } = useTranslation()
  const [unitCode, setUnitCode] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['compliance-dashboard', unitCode],
    queryFn: () => fetchComplianceStats(unitCode),
    staleTime: 2 * 60_000,
  })

  const percent = (value: number) => t('dashboard.compliance.stats.percent', { value: formatNumber(value) })

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="compliance-dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('dashboard.compliance.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1 flex items-center gap-1.5">
            {t('dashboard.compliance.header.subtitle')}
            {data && (
              <>
                <span className="text-[#E2E8F0]">·</span>
                <Clock size={12} className="text-[#64748B]" />
                {t('dashboard.compliance.header.lastUpdated', { time: formatVietnamDateTime(data.lastUpdated) })}
              </>
            )}
          </p>
        </div>
        <select
          value={unitCode}
          onChange={e => setUnitCode(e.target.value)}
          className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
        >
          <option value="">{t('dashboard.compliance.filters.allUnits')}</option>
          {AREA_NUMBERS.map((number) => (
            <option key={number} value={`KP${number}`}>{t('dashboard.compliance.filters.area', { number })}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {describeApiError(error, { scope: 'dashboard.compliance', statuses: FORBIDDEN_STATUS, fallback: 'dashboard.compliance.load.error' })}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : data ? (
          <>
            <StatCard
              id="activePersonnel"
              label={t('dashboard.compliance.stats.activePersonnel')}
              value={formatNumber(data.totalActive)}
            />
            <StatCard
              id="trainingCompliance"
              label={t('dashboard.compliance.stats.trainingCompliance')}
              value={percent(data.trainingCompliancePct)}
              progress={data.trainingCompliancePct}
              detail={t('dashboard.compliance.stats.trainingCompliantOf', {
                compliant: formatNumber(data.trainingCompliant),
                total: formatNumber(data.totalActive),
              })}
            />
            <StatCard
              id="attendanceThisMonth"
              label={t('dashboard.compliance.stats.attendanceThisMonth')}
              value={percent(data.attendancePct)}
              progress={data.attendancePct}
            />
            <StatCard
              id="avgKpiScore"
              label={t('dashboard.compliance.stats.avgKpiScore')}
              value={data.avgKpiScore === null ? t('dashboard.compliance.stats.noScore') : formatNumber(data.avgKpiScore)}
              unit={data.avgKpiScore === null ? undefined : t('dashboard.compliance.stats.avgKpiScoreUnit')}
              detail={
                data.kpiPeriod
                  ? t('dashboard.compliance.stats.kpiPeriod', { month: data.kpiPeriod.month, year: data.kpiPeriod.year })
                  : t('dashboard.compliance.stats.kpiPeriodNone')
              }
            />
            <StatCard
              id="exemptionsExpiringSoon"
              label={t('dashboard.compliance.stats.exemptionsExpiringSoon')}
              value={formatNumber(data.expiringExemptions)}
              detail={t('dashboard.compliance.stats.expiringWindow')}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}

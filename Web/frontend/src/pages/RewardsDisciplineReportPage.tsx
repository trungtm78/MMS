// Khen thưởng & kỷ luật report (TT 57/2020/TT-BQP) over every ledger: free-form militia_rewards
// rows and the decisions recorded through /rewards and /discipline (GET /militia/rewards-report).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Award, Download, Filter } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'
import { DISCIPLINE_STATUSES, type DisciplineStatus } from '@/api/rewards'
import { describeApiError, withJsonErrorBody } from '@/lib/api-error'
import { firstDayOfYearInVietnam, formatCalendarDate, todayInVietnam } from '@/lib/dates'
import { cn } from '@/lib/utils'

// Row shape returned by GET /militia/rewards-report (militia.service.ts getRewardsReport)
export interface RewardItem {
  id: string
  fullName: string
  militiaCode: string
  unitName: string
  /** The ledger: 'reward' or 'discipline' */
  rewardType: string
  /** The form: the label of a decision's form, or the title of a free-form row */
  description: string
  /** The criteria of a reward or the violation of a discipline decision */
  content: string
  issuedBy: string | null
  decisionDate: string | null
  /** A discipline decision's status; null for rewards and free-form rows */
  status: string | null
  createdAt: string
}

type Kind = 'reward' | 'discipline'
type KindFilter = 'all' | Kind
const KIND_FILTERS: readonly KindFilter[] = ['all', 'reward', 'discipline']
const TABS: readonly Kind[] = ['reward', 'discipline']
const COLUMNS = ['index', 'fullName', 'militiaCode', 'unitName', 'form', 'content', 'issuedBy', 'decisionDate', 'status'] as const

const FILTER_INPUT =
  'w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]'

const isDisciplineStatus = (status: string): status is DisciplineStatus =>
  (DISCIPLINE_STATUSES as readonly string[]).includes(status)

export function RewardsDisciplineReportPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Kind>('reward')
  // The Vietnamese year so far
  const [from, setFrom] = useState(() => firstDayOfYearInVietnam())
  const [to, setTo] = useState(() => todayInVietnam())
  const [typeFilter, setTypeFilter] = useState<KindFilter>('all')
  const [unitCode, setUnitCode] = useState('')
  const [exporting, setExporting] = useState(false)
  const none = t('common.states.none')

  const params = {
    from: from || undefined,
    to: to || undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    unitCode: unitCode || undefined,
  }

  const { data = [], isLoading, isError, error } = useQuery<RewardItem[]>({
    queryKey: ['rewards-report', params],
    queryFn: () => client.get('/militia/rewards-report', { params }).then((r) => r.data),
    staleTime: 30_000,
  })

  const byKind: Record<Kind, RewardItem[]> = {
    reward: data.filter((r) => r.rewardType === 'reward'),
    discipline: data.filter((r) => r.rewardType !== 'reward'),
  }
  const activeItems = byKind[activeTab]

  const statusText = (status: string | null) => {
    if (status === null) return none
    return isDisciplineStatus(status) ? t(`rewards.codes.disciplineStatuses.${status}`) : status
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const resp = await client.get('/militia/rewards-export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `KhenThuong_KyLuat_${from || 'all'}_${to || 'all'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(describeApiError(await withJsonErrorBody(err), { fallback: 'rewards.report.export.error' }))
    } finally {
      setExporting(false)
    }
  }

  // Decisions per month (YYYY-MM), rows without a date left out
  const monthStats = (() => {
    const map = new Map<string, { reward: number; discipline: number }>()
    data.forEach((item) => {
      if (!item.decisionDate) return
      const key = item.decisionDate.slice(0, 7)
      const stats = map.get(key) ?? { reward: 0, discipline: 0 }
      if (item.rewardType === 'reward') stats.reward++
      else stats.discipline++
      map.set(key, stats)
    })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })()

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="rewards-discipline-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
          <Award size={20} aria-hidden="true" className="text-[#C62828]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('rewards.report.header.title')}</h1>
          <p className="text-sm text-[#64748B]">{t('rewards.report.header.subtitle')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
          <Filter size={16} aria-hidden="true" className="text-[#64748B]" />
          {t('rewards.report.filters.title')}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="report-from" className="block text-xs font-medium text-[#C62828] mb-1">{t('rewards.report.filters.from')}</label>
            <input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FILTER_INPUT} />
          </div>
          <div>
            <label htmlFor="report-to" className="block text-xs font-medium text-[#C62828] mb-1">{t('rewards.report.filters.to')}</label>
            <input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={FILTER_INPUT} />
          </div>
          <div>
            <label htmlFor="report-kind" className="block text-xs font-medium text-[#C62828] mb-1">{t('rewards.report.filters.kind')}</label>
            <select id="report-kind" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as KindFilter)} className={FILTER_INPUT}>
              {KIND_FILTERS.map((kind) => (
                <option key={kind} value={kind}>{t(`rewards.report.kinds.${kind}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="report-unit" className="block text-xs font-medium text-[#C62828] mb-1">{t('rewards.report.filters.unitCode')}</label>
            <input
              id="report-unit"
              type="text"
              placeholder={t('rewards.report.filters.unitCodePlaceholder')}
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              className={FILTER_INPUT}
            />
          </div>
        </div>
      </div>

      {/* Summary per month */}
      {monthStats.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm font-semibold text-[#0F172A] mb-3">{t('rewards.report.months.title')}</p>
          <div className="flex flex-wrap gap-3">
            {monthStats.map(([month, stats]) => (
              <div key={month} data-testid={`month-${month}`} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs">
                <p className="font-semibold text-[#64748B]">{t('rewards.report.months.label', { year: month.slice(0, 4), month: month.slice(5, 7) })}</p>
                <p className="text-[#2E7D32]">{t('rewards.report.months.rewards', { total: stats.reward })}</p>
                <p className="text-[#C62828]">{t('rewards.report.months.discipline', { total: stats.discipline })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar + table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="flex border-b border-[#E2E8F0] items-center justify-between pr-4">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-6 py-3.5 text-sm font-medium transition-all relative',
                  activeTab === tab
                    ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]',
                )}
              >
                {t(`rewards.report.tabs.${tab}`, { total: byKind[tab].length })}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || data.length === 0}
            className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 transition-colors"
            data-testid="rewards-export-btn"
          >
            <Download size={16} aria-hidden="true" />
            {t(exporting ? 'rewards.report.export.pending' : 'rewards.report.export.idle')}
          </button>
        </div>

        {isError && (
          <p role="alert" className="p-4 text-sm text-[#C62828] bg-red-50">
            {describeApiError(error, { fallback: 'rewards.report.load.error' })}
          </p>
        )}

        {isLoading ? (
          <div role="status" aria-label={t('rewards.report.load.loading')} className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column} scope="col" className="px-5 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">
                      {t(`rewards.report.table.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {activeItems.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-5 py-12 text-center text-[#94A3B8] text-sm">
                      {t('common.states.empty')}
                    </td>
                  </tr>
                ) : (
                  activeItems.map((item, idx) => (
                    <tr key={item.id} data-testid={`report-row-${item.id}`} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-5 py-4 text-sm text-[#64748B]">{idx + 1}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-[#0F172A]">{item.fullName}</td>
                      <td className="px-5 py-4 text-sm font-mono text-[#64748B]">{item.militiaCode}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{item.unitName}</td>
                      <td className="px-5 py-4 text-sm text-[#0F172A]">{item.description || none}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B] max-w-xs truncate">{item.content || none}</td>
                      <td className="px-5 py-4 text-sm text-[#0F172A]">{item.issuedBy || none}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{formatCalendarDate(item.decisionDate, none)}</td>
                      <td className="px-5 py-4 text-sm text-[#0F172A]" data-testid={`report-status-${item.id}`}>
                        {statusText(item.status)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

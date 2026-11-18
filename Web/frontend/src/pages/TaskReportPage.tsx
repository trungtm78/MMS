import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CheckSquare, ChevronLeft, ChevronRight, Clock, AlertTriangle, ListChecks, TrendingUp, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { reportsApi, type TaskReport, type TaskReportStatus } from '@/api/reports'
import { describeApiError } from '@/lib/api-error'
import { formatCalendarDate } from '@/lib/dates'
import type { TranslationKey } from '@/i18n/types'

const LIMIT = 20

// Area units KP1…KP6 (Khu phố 1…6)
const AREA_NUMBERS = [1, 2, 3, 4, 5, 6] as const

type CountKey = 'total' | 'completed' | 'inProgress' | 'overdue' | 'cancelled'

const STAT_CARDS = [
  { key: 'total',      label: 'reports.tasks.totals.total',      icon: ListChecks,    color: '#1F3A5F', bg: 'bg-slate-50' },
  { key: 'completed',  label: 'reports.tasks.totals.completed',  icon: CheckSquare,   color: '#2E7D32', bg: 'bg-green-50' },
  { key: 'inProgress', label: 'reports.tasks.totals.inProgress', icon: Clock,         color: '#1976D2', bg: 'bg-blue-50' },
  { key: 'overdue',    label: 'reports.tasks.totals.overdue',    icon: AlertTriangle, color: '#C62828', bg: 'bg-red-50' },
  { key: 'cancelled',  label: 'reports.tasks.totals.cancelled',  icon: XCircle,       color: '#F57C00', bg: 'bg-orange-50' },
] as const satisfies readonly { key: CountKey; label: TranslationKey; icon: LucideIcon; color: string; bg: string }[]

const STATUS_LABEL = {
  pending: 'reports.tasks.status.pending',
  assigned: 'reports.tasks.status.assigned',
  in_progress: 'reports.tasks.status.inProgress',
  completed: 'reports.tasks.status.completed',
  cancelled: 'reports.tasks.status.cancelled',
  overdue: 'reports.tasks.status.overdue',
} as const satisfies Record<TaskReportStatus, TranslationKey>

// tasks.type and tasks.priority codes (tasks.controller.ts CreateTaskDto); another code shows as itself
const TYPE_LABEL: Readonly<Partial<Record<string, TranslationKey>>> = {
  patrol: 'reports.tasks.type.patrol',
  guard: 'reports.tasks.type.guard',
  inspection: 'reports.tasks.type.inspection',
  support: 'reports.tasks.type.support',
  training: 'reports.tasks.type.training',
  admin: 'reports.tasks.type.admin',
  other: 'reports.tasks.type.other',
}

const PRIORITY_LABEL: Readonly<Partial<Record<string, TranslationKey>>> = {
  urgent: 'reports.tasks.priority.urgent',
  high: 'reports.tasks.priority.high',
  medium: 'reports.tasks.priority.medium',
  low: 'reports.tasks.priority.low',
}

const BAR_COLORS = ['#C62828', '#2E7D32', '#1F3A5F', '#F57C00']

const TH = 'px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap'
const TD = 'px-4 py-3 text-sm text-[#0F172A] whitespace-nowrap'
const FIELD_CLASS = 'px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="bg-white rounded-xl border border-[#E2E8F0] p-6">
      <h2 id={id} className="text-base font-semibold text-[#0F172A] mb-4">{title}</h2>
      {children}
    </section>
  )
}

function EmptyRow({ columns }: { columns: number }) {
  const { t } = useTranslation()
  return (
    <tr>
      <td colSpan={columns} className="px-6 py-10 text-center text-sm text-[#64748B]">{t('common.states.empty')}</td>
    </tr>
  )
}

function TaskReportBreakdowns({ report, page, onPageChange }: { report: TaskReport; page: number; onPageChange: (page: number) => void }) {
  const { t } = useTranslation()
  const percent = (value: number) => t('reports.tasks.values.percent', { value: value.toLocaleString('vi-VN') })
  const codeLabel = (labels: Readonly<Partial<Record<string, TranslationKey>>>, code: string | null) => {
    const key = code ? labels[code] : undefined
    return key ? t(key) : (code ?? t('common.states.none'))
  }
  const countColumns = [
    t('reports.tasks.columns.total'),
    t('reports.tasks.columns.completed'),
    t('reports.tasks.columns.cancelled'),
    t('reports.tasks.columns.overdue'),
    t('reports.tasks.columns.completionRate'),
  ]
  const assigneePages = Math.max(1, Math.ceil(report.byAssignee.total / LIMIT))

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, color, bg }) => (
          <div key={key} data-testid={`task-stat-${key}`} className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[#64748B]">{t(label)}</p>
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon size={16} style={{ color }} />
              </div>
            </div>
            <p className="text-3xl font-bold" style={{ color }}>{report.totals[key]}</p>
          </div>
        ))}
        <div data-testid="task-stat-completionRate" className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#64748B]">{t('reports.tasks.totals.completionRate')}</p>
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
              <TrendingUp size={16} className="text-[#2E7D32]" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#2E7D32]">{percent(report.totals.completionRate)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section id="task-report-by-status" title={t('reports.tasks.byStatus.title')}>
          <table className="w-full">
            <thead className="border-b border-[#E2E8F0]">
              <tr>
                <th className={TH}>{t('reports.tasks.columns.status')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.count')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {report.byStatus.map(({ status, count }) => (
                <tr key={status}>
                  <td className={TD}>{t(STATUS_LABEL[status])}</td>
                  <td className={`${TD} text-right`}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="task-report-by-priority" title={t('reports.tasks.byPriority.title')}>
          <table className="w-full">
            <thead className="border-b border-[#E2E8F0]">
              <tr>
                <th className={TH}>{t('reports.tasks.columns.priority')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.count')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {report.byPriority.length === 0 ? <EmptyRow columns={2} /> : report.byPriority.map(({ priority, count }) => (
                <tr key={priority ?? ''}>
                  <td className={TD}>{codeLabel(PRIORITY_LABEL, priority)}</td>
                  <td className={`${TD} text-right`}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      {report.byMonth.length > 0 && (
        <Section id="task-report-by-month" title={t('reports.tasks.byMonth.title')}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={report.byMonth.map((row) => ({
                ...row,
                month: t('reports.tasks.byMonth.month', { month: row.month.slice(5, 7), year: row.month.slice(0, 4) }),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Bar dataKey="completed" name={t('reports.tasks.columns.completed')} fill="#2E7D32" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total" name={t('reports.tasks.columns.total')} fill="#1F3A5F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="overdue" name={t('reports.tasks.columns.overdue')} fill="#C62828" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {report.byType.length > 0 && (
        <Section id="task-report-by-type" title={t('reports.tasks.byType.title')}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={report.byType.map(({ type, count }) => ({ type: codeLabel(TYPE_LABEL, type), count }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis dataKey="type" type="category" tick={{ fontSize: 12, fill: '#64748B' }} width={120} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
              <Bar dataKey="count" name={t('reports.tasks.columns.count')} radius={[0, 4, 4, 0]}>
                {report.byType.map((row, i) => (
                  <Cell key={row.type ?? i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      <Section id="task-report-by-unit" title={t('reports.tasks.byUnit.title')}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-[#E2E8F0]">
              <tr>
                <th className={TH}>{t('reports.tasks.columns.unit')}</th>
                {countColumns.map((column) => <th key={column} className={`${TH} text-right`}>{column}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {report.byUnit.length === 0 ? <EmptyRow columns={6} /> : report.byUnit.map((unit) => (
                <tr key={unit.unitCode ?? ''}>
                  <td className={TD}>{unit.unitName ?? unit.unitCode ?? t('reports.tasks.byUnit.unassigned')}</td>
                  <td className={`${TD} text-right`}>{unit.total}</td>
                  <td className={`${TD} text-right`}>{unit.completed}</td>
                  <td className={`${TD} text-right`}>{unit.cancelled}</td>
                  <td className={`${TD} text-right`}>{unit.overdue}</td>
                  <td className={`${TD} text-right`}>{percent(unit.completionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="task-report-by-assignee" title={t('reports.tasks.byAssignee.title')}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-[#E2E8F0]">
              <tr>
                <th className={TH}>{t('reports.tasks.columns.assignee')}</th>
                <th className={TH}>{t('reports.tasks.columns.militiaCode')}</th>
                <th className={TH}>{t('reports.tasks.columns.unit')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.total')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.completed')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.inProgress')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.cancelled')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.overdue')}</th>
                <th className={`${TH} text-right`}>{t('reports.tasks.columns.completionRate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {report.byAssignee.data.length === 0 ? <EmptyRow columns={9} /> : report.byAssignee.data.map((assignee) => (
                <tr key={assignee.userId}>
                  <td className={TD}>{assignee.fullName}</td>
                  <td className={`${TD} font-mono`}>{assignee.militiaCode ?? t('common.states.none')}</td>
                  <td className={TD}>{assignee.unitCode ?? t('common.states.none')}</td>
                  <td className={`${TD} text-right`}>{assignee.total}</td>
                  <td className={`${TD} text-right`}>{assignee.completed}</td>
                  <td className={`${TD} text-right`}>{assignee.inProgress}</td>
                  <td className={`${TD} text-right`}>{assignee.cancelled}</td>
                  <td className={`${TD} text-right`}>{assignee.overdue}</td>
                  <td className={`${TD} text-right`}>{percent(assignee.completionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-4 mt-2 border-t border-[#E2E8F0] flex items-center justify-between">
          <p className="text-sm text-[#64748B]">{t('reports.tasks.byAssignee.total', { total: report.byAssignee.total })}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label={t('common.pagination.previous')}
              className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-[#0F172A] font-medium">{page} / {assigneePages}</span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= assigneePages}
              aria-label={t('common.pagination.next')}
              className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Section>
    </>
  )
}

export function TaskReportPage() {
  const { t } = useTranslation()
  // Blank dates: the backend reports the twelve business months ending today
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [unitCode, setUnitCode] = useState('')
  const [page, setPage] = useState(1)

  const query = { from, to, unitCode, page, limit: LIMIT }
  const { data, isLoading, error } = useQuery({
    queryKey: ['task-report', query],
    queryFn: () => reportsApi.tasks(query),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  })

  /** A new filter starts again from the first assignee page */
  function filter(set: (value: string) => void) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      set(event.target.value)
      setPage(1)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-full">
        <div className="text-center text-[#64748B] py-12 text-sm">{t('reports.tasks.load.pending')}</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="task-report-page">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold text-[#0F172A]">{t('reports.tasks.header.title')}</h1>
        <p className="text-sm text-[#64748B] mt-1">{t('reports.tasks.header.subtitle')}</p>
        {data && (
          <p className="text-xs text-[#64748B] mt-1">
            {t('reports.tasks.header.period', { from: formatCalendarDate(data.from), to: formatCalendarDate(data.to) })}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="task-report-from" className="text-sm font-medium text-[#0F172A]">{t('common.filters.from')}</label>
          <input id="task-report-from" type="date" value={from} max={to || undefined} onChange={filter(setFrom)} className={FIELD_CLASS} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="task-report-to" className="text-sm font-medium text-[#0F172A]">{t('common.filters.to')}</label>
          <input id="task-report-to" type="date" value={to} min={from || undefined} onChange={filter(setTo)} className={FIELD_CLASS} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="task-report-unit" className="text-sm font-medium text-[#0F172A]">{t('reports.tasks.filters.unit')}</label>
          <select id="task-report-unit" value={unitCode} onChange={filter(setUnitCode)} className={FIELD_CLASS}>
            <option value="">{t('common.filters.all')}</option>
            {AREA_NUMBERS.map((number) => (
              <option key={number} value={`KP${number}`}>{t('reports.tasks.filters.area', { number })}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {describeApiError(error, { scope: 'tasks.report', statuses: { 403: 'errors.common.forbidden' }, fallback: 'reports.tasks.load.error' })}
        </div>
      )}

      {data && <TaskReportBreakdowns report={data} page={page} onPageChange={setPage} />}
    </div>
  )
}

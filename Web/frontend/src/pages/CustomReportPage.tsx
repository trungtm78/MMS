import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileDown, Filter, FileText, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'
import {
  CUSTOM_REPORT_CHOICES,
  reportsApi,
  type CustomReportDataset,
  type CustomReportGrouping,
  type CustomReportQuery,
  type CustomReportResult,
  type ReportColumnType,
} from '@/api/reports'
import { describeApiError, errorCodeText, parseApiError } from '@/lib/api-error'
import { VIETNAM_TIME_ZONE, firstDayOfMonthInVietnam, formatCalendarDate, todayInVietnam } from '@/lib/dates'
import { downloadExcelReport } from '@/utils/export-utils'
import type { TranslationKey } from '@/i18n/types'

const REPORT_TYPES = [
  { value: 'attendance', label: 'reports.custom.types.attendance' },
  { value: 'tasks',      label: 'reports.custom.types.tasks' },
  { value: 'kpi',        label: 'reports.custom.types.kpi' },
  { value: 'payroll',    label: 'reports.custom.types.payroll' },
] as const satisfies readonly { value: CustomReportDataset; label: TranslationKey }[]

const GROUPING_LABEL = {
  none: 'reports.custom.groupBy.none',
  unit: 'reports.custom.groupBy.unit',
  member: 'reports.custom.groupBy.member',
  day: 'reports.custom.groupBy.day',
  month: 'reports.custom.groupBy.month',
  status: 'reports.custom.groupBy.status',
  type: 'reports.custom.groupBy.type',
  priority: 'reports.custom.groupBy.priority',
  assignee: 'reports.custom.groupBy.assignee',
} as const satisfies Record<CustomReportGrouping, TranslationKey>

type StatusOf<D extends CustomReportDataset> = (typeof CUSTOM_REPORT_CHOICES)[D]['statuses'][number]

const STATUS_LABEL: { readonly [D in CustomReportDataset]: Readonly<Record<StatusOf<D>, TranslationKey>> } = {
  attendance: {
    present: 'reports.custom.statuses.attendance.present',
    late: 'reports.custom.statuses.attendance.late',
    early_leave: 'reports.custom.statuses.attendance.earlyLeave',
    absent: 'reports.custom.statuses.attendance.absent',
  },
  tasks: {
    pending: 'reports.custom.statuses.tasks.pending',
    assigned: 'reports.custom.statuses.tasks.assigned',
    in_progress: 'reports.custom.statuses.tasks.inProgress',
    completed: 'reports.custom.statuses.tasks.completed',
    cancelled: 'reports.custom.statuses.tasks.cancelled',
    overdue: 'reports.custom.statuses.tasks.overdue',
  },
  kpi: {
    reward: 'reports.custom.statuses.kpi.reward',
    maintain: 'reports.custom.statuses.kpi.maintain',
    training: 'reports.custom.statuses.kpi.training',
    warning: 'reports.custom.statuses.kpi.warning',
    discipline: 'reports.custom.statuses.kpi.discipline',
  },
  payroll: {
    pending: 'reports.custom.statuses.payroll.pending',
    approved: 'reports.custom.statuses.payroll.approved',
    rejected: 'reports.custom.statuses.payroll.rejected',
  },
}

const DATASET_TITLE = {
  attendance: 'reports.custom.titles.attendance',
  tasks: 'reports.custom.titles.tasks',
  kpi: 'reports.custom.titles.kpi',
  payroll: 'reports.custom.titles.payroll',
} as const satisfies Record<CustomReportDataset, TranslationKey>

const groupingsOf = (dataset: CustomReportDataset): readonly CustomReportGrouping[] => CUSTOM_REPORT_CHOICES[dataset].groupings
const statusesOf = (dataset: CustomReportDataset): readonly string[] => CUSTOM_REPORT_CHOICES[dataset].statuses

// Column and measure keys are camelCase words; anything else is never looked up as a text key
const COLUMN_KEY = /^[A-Za-z]+$/

// 403 is a missing permission; other statuses without a code in the table read as the fallback
const FORBIDDEN_STATUS = { 403: 'errors.common.forbidden' } as const satisfies Partial<Record<number, TranslationKey>>

/**
 * The text of a failed report request. The query's own checks (invalid_limit, invalid_unit_code…)
 * answer validation_failed with their codes as the messages: when the error table knows every one
 * of them, their texts are shown, each once. Anything else goes through describeApiError with the
 * report codes (group_by_not_supported, date_range_too_long…).
 */
function reportErrorText(err: unknown, fallback: TranslationKey): string {
  const { code, validationErrors } = parseApiError(err)
  if (code === 'validation_failed') {
    const texts = validationErrors.map((message) => errorCodeText('reports.custom', message))
    if (texts.length > 0 && texts.every((text): text is string => text !== null)) return [...new Set(texts)].join(' ')
  }
  return describeApiError(err, { scope: 'reports.custom', statuses: FORBIDDEN_STATUS, fallback })
}

interface Mau03BcData {
  year: number
  unitCode: string | null
  militia: { totalActive: number; totalInactive: number; totalFemale: number }
  training: { trainedCount: number; totalTrainingDays: number }
  discipline: { rewardCount: number; disciplineCount: number }
  budget: { totalSalary: number }
  generatedAt: string
}

const PHAP_DINH_BUTTONS = [
  { label: 'reports.custom.statutory.mau03bcLabel', icon: FileText, desc: 'reports.custom.statutory.mau03bcDescription', key: 'mau03bc' },
  { label: 'reports.custom.statutory.trainingLabel', icon: BookOpen, desc: 'reports.custom.statutory.trainingDescription', key: 'huan-luyen' },
  { label: 'reports.custom.statutory.rewardsLabel', icon: FileText, desc: 'reports.custom.statutory.rewardsDescription', key: 'khen-thuong' },
] as const satisfies readonly { label: TranslationKey; icon: LucideIcon; desc: TranslationKey; key: string }[]

const FIELD_CLASS = 'w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]'

function CustomReportResultView({
  report,
  isExporting,
  onExport,
}: {
  report: CustomReportResult
  isExporting: boolean
  onExport: () => void
}) {
  const { t, i18n } = useTranslation()

  // The page's own text for a column of this dataset, else the backend label
  const columnLabel = ({ key, label }: { key: string; label: string }): string => {
    const textKey = `reports.custom.columns.${report.dataset}.${key}`
    return COLUMN_KEY.test(key) && i18n.exists(textKey) ? t(textKey as TranslationKey) : label
  }

  const formatValue = (value: unknown, type: ReportColumnType): string => {
    if (value === null || value === undefined || value === '') return t('common.states.none')
    if (typeof value === 'number') {
      const number = value.toLocaleString('vi-VN')
      if (type === 'percent') return t('reports.custom.result.percent', { value: number })
      if (type === 'currency') return t('reports.custom.result.currency', { value: number })
      return number
    }
    return type === 'date' ? formatCalendarDate(String(value)) : String(value)
  }

  // Summary items are measures: their type is the one of the matching column
  const columnTypes = new Map(report.columns.map((column) => [column.key, column.type]))
  const generatedTime = new Date(report.generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: VIETNAM_TIME_ZONE })

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="custom-report-result">
      <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0F172A]">{t(DATASET_TITLE[report.dataset])}</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            {t('reports.custom.result.period', {
              from: formatCalendarDate(report.from),
              to: formatCalendarDate(report.to),
              scope: report.unitCode ? t('reports.custom.result.unit', { unitCode: report.unitCode }) : t('reports.custom.result.allUnits'),
            })}
          </p>
          <p className="text-xs text-[#64748B]">
            {t('reports.custom.result.generatedAt', { time: generatedTime, date: formatCalendarDate(report.generatedAt) })}
          </p>
        </div>
        <button
          onClick={onExport}
          disabled={isExporting}
          className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors bg-white disabled:opacity-50"
          data-testid="export-btn"
        >
          <FileDown size={15} />
          {isExporting ? t('common.actions.exporting') : t('common.actions.export')}
        </button>
      </div>

      {report.summary.length > 0 && (
        <section aria-labelledby="custom-report-summary" className="px-6 py-4 border-b border-[#E2E8F0]">
          <h3 id="custom-report-summary" className="text-xs font-semibold uppercase text-[#64748B] mb-3">
            {t('reports.custom.result.summary')}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {report.summary.map((item) => (
              <div key={item.key} data-testid={`summary-${item.key}`} className="rounded-lg border border-[#E2E8F0] p-3">
                <p className="text-xs text-[#64748B]">{columnLabel(item)}</p>
                <p className="text-lg font-semibold text-[#0F172A]">{formatValue(item.value, columnTypes.get(item.key) ?? 'number')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.truncated && (
        <p role="status" className="px-6 py-3 text-sm text-[#F57C00] bg-orange-50 border-b border-orange-100">
          {t('reports.custom.result.truncated', { rowCount: report.rowCount, rowLimit: report.rowLimit })}
        </p>
      )}

      {report.groupBy !== 'none' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                {report.columns.map((column) => (
                  <th key={column.key} className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap">
                    {columnLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={report.columns.length} className="px-6 py-10 text-center text-sm text-[#64748B]">
                    {t('common.states.empty')}
                  </td>
                </tr>
              ) : report.rows.map((row, index) => (
                <tr key={index} className="hover:bg-[#F8FAFC] transition-colors">
                  {report.columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-sm text-[#0F172A] whitespace-nowrap ${column.type === 'text' || column.type === 'date' ? '' : 'text-right'}`}
                    >
                      {formatValue(row[column.key], column.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function CustomReportPage() {
  const { t } = useTranslation()
  const [dataset, setDataset] = useState<CustomReportDataset>('attendance')
  const [groupBy, setGroupBy] = useState<CustomReportGrouping>('none')
  const [status, setStatus] = useState('')
  const [unitCode, setUnitCode] = useState('')
  // Report periods are calendar days in Vietnam: this month so far
  const [from, setFrom] = useState(() => firstDayOfMonthInVietnam())
  const [to, setTo]     = useState(() => todayInVietnam())
  const [enabled, setEnabled] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [activePhapdinhKey, setActivePhapdinhKey] = useState<string | null>(null)
  const [mau03BcYear, setMau03BcYear] = useState(() => todayInVietnam().slice(0, 4))
  const [mau03BcUnit, setMau03BcUnit] = useState('')
  const [mau03BcExporting, setMau03BcExporting] = useState(false)

  const { data: mau03BcData, isLoading: mau03BcLoading } = useQuery<Mau03BcData>({
    queryKey: ['mau-03-bc', mau03BcYear, mau03BcUnit],
    queryFn: () => client.get('/reports/mau-03-bc', { params: { year: mau03BcYear, unitCode: mau03BcUnit || undefined } }).then(r => r.data),
    enabled: activePhapdinhKey === 'mau03bc',
    staleTime: 60_000,
  })

  const handleMau03BcExport = async () => {
    setMau03BcExporting(true)
    try {
      const resp = await client.get('/reports/mau-03-bc/export', {
        params: { year: mau03BcYear, unitCode: mau03BcUnit || undefined },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Mau03BC_${mau03BcYear}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('reports.custom.mau03bc.exportError'))
    } finally {
      setMau03BcExporting(false)
    }
  }

  const query: CustomReportQuery = { dataset, from, to, groupBy, status, unitCode: unitCode.trim() }

  const { data, isFetching, error } = useQuery({
    queryKey: ['custom-report', query],
    queryFn: () => reportsApi.custom(query),
    enabled,
    staleTime: 0,
  })

  /** Any change of a parameter waits for "Tạo báo cáo" again */
  function edit<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value)
      setEnabled(false)
    }
  }

  // Keeps the breakdown and status when the new dataset accepts them, else clears them
  function handleDatasetChange(next: CustomReportDataset) {
    if (!groupingsOf(next).includes(groupBy)) setGroupBy('none')
    if (!statusesOf(next).includes(status)) setStatus('')
    setDataset(next)
    setEnabled(false)
  }

  async function handleExport(report: CustomReportResult) {
    try {
      await downloadExcelReport(
        () => reportsApi.exportCustom(query),
        `BaoCao_${report.dataset}_${report.from}_${report.to}.xlsx`,
        () => setIsExporting(true),
        () => setIsExporting(false),
      )
    } catch (err) {
      toast.error(reportErrorText(err, 'reports.custom.export.error'))
    }
  }

  const statusLabels: Readonly<Record<string, TranslationKey>> = STATUS_LABEL[dataset]

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="custom-report-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">{t('reports.custom.header.title')}</h1>
        <p className="text-sm text-[#64748B] mt-1">{t('reports.custom.header.subtitle')}</p>
      </div>

      {/* Báo cáo pháp định */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
            <FileText size={15} className="text-[#C62828]" />
          </div>
          <p className="text-sm font-semibold text-[#0F172A]">{t('reports.custom.statutory.title')}</p>
          <span className="ml-auto text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-2 py-0.5">
            {t('reports.custom.statutory.legalBasis')}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PHAP_DINH_BUTTONS.map(({ label, icon: Icon, desc, key }) => (
            <button
              key={key}
              onClick={() => setActivePhapdinhKey(prev => prev === key ? null : key)}
              className={`flex items-start gap-3 p-4 border rounded-xl transition-all text-left group ${
                activePhapdinhKey === key
                  ? 'border-[#C62828] bg-red-50'
                  : 'border-[#E2E8F0] hover:border-[#C62828] hover:bg-red-50'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                activePhapdinhKey === key ? 'bg-[#C62828]' : 'bg-red-50 group-hover:bg-[#C62828]'
              }`}>
                <Icon size={16} className={`transition-colors ${activePhapdinhKey === key ? 'text-white' : 'text-[#C62828] group-hover:text-white'}`} />
              </div>
              <div>
                <p className={`text-sm font-medium transition-colors ${activePhapdinhKey === key ? 'text-[#C62828]' : 'text-[#0F172A] group-hover:text-[#C62828]'}`}>{t(label)}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{t(desc)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Mẫu 03-BC inline panel */}
        {activePhapdinhKey === 'mau03bc' && (
          <div className="mt-4 border border-[#E2E8F0] rounded-xl p-5 space-y-4 bg-[#F8FAFC]">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label htmlFor="mau03bc-year" className="block text-xs font-medium text-[#C62828] mb-1">{t('common.filters.year')}</label>
                <input
                  id="mau03bc-year"
                  type="number"
                  value={mau03BcYear}
                  onChange={e => setMau03BcYear(e.target.value)}
                  min={2020}
                  max={2100}
                  className="w-24 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
                />
              </div>
              <div>
                <label htmlFor="mau03bc-unit" className="block text-xs font-medium text-[#C62828] mb-1">{t('reports.custom.mau03bc.unitLabel')}</label>
                <input
                  id="mau03bc-unit"
                  type="text"
                  value={mau03BcUnit}
                  onChange={e => setMau03BcUnit(e.target.value)}
                  placeholder={t('reports.custom.mau03bc.unitPlaceholder')}
                  className="w-32 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
                />
              </div>
              <div className="flex-1" />
              <button
                onClick={handleMau03BcExport}
                disabled={mau03BcExporting || !mau03BcData}
                className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#64748B] rounded-lg text-sm hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 transition-colors"
                data-testid="mau03bc-export-btn"
              >
                <FileDown size={15} />
                {mau03BcExporting ? t('common.actions.exporting') : t('common.actions.export')}
              </button>
            </div>

            {mau03BcLoading ? (
              <div className="py-6 text-center">
                <div className="inline-block w-6 h-6 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mau03BcData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">{t('reports.custom.mau03bc.militiaTitle')}</p>
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.militiaActive')}{' '}<strong className="text-[#0F172A]">{mau03BcData.militia.totalActive.toLocaleString('vi-VN')}</strong></p>
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.militiaReserve')}{' '}<strong className="text-[#0F172A]">{mau03BcData.militia.totalInactive.toLocaleString('vi-VN')}</strong></p>
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.militiaFemale')}{' '}<strong className="text-[#0F172A]">{mau03BcData.militia.totalFemale.toLocaleString('vi-VN')}</strong></p>
                </div>
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">{t('reports.custom.mau03bc.trainingTitle')}</p>
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.trainingCount')}{' '}<strong className="text-[#0F172A]">{mau03BcData.training.trainedCount.toLocaleString('vi-VN')}</strong></p>
                  {/* SUM over training_records.total_days (NUMERIC(5,1)): half days show as 12,5 */}
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.trainingDays')}{' '}<strong className="text-[#0F172A]">{mau03BcData.training.totalTrainingDays.toLocaleString('vi-VN')}</strong></p>
                </div>
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">{t('reports.custom.mau03bc.disciplineTitle')}</p>
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.disciplineRewards')}{' '}<strong className="text-[#2E7D32]">{mau03BcData.discipline.rewardCount.toLocaleString('vi-VN')}</strong></p>
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.disciplineCount')}{' '}<strong className="text-[#C62828]">{mau03BcData.discipline.disciplineCount.toLocaleString('vi-VN')}</strong></p>
                </div>
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">{t('reports.custom.mau03bc.budgetTitle')}</p>
                  <p className="text-sm text-[#64748B]">{t('reports.custom.mau03bc.budgetSalary')}{' '}<strong className="text-[#0F172A]">{t('reports.custom.mau03bc.budgetAmount', { amount: mau03BcData.budget.totalSalary.toLocaleString('vi-VN') })}</strong></p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Filter form */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-[#64748B]" />
          <p className="text-sm font-semibold text-[#0F172A]">{t('reports.custom.filters.title')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="custom-report-dataset" className="block text-sm font-medium text-[#C62828] mb-1">{t('reports.custom.filters.type')}</label>
            <select
              id="custom-report-dataset"
              value={dataset}
              onChange={(e) => handleDatasetChange(e.target.value as CustomReportDataset)}
              className={FIELD_CLASS}
              data-testid="report-type-select"
            >
              {REPORT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{t(type.label)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="custom-report-group-by" className="block text-sm font-medium text-[#C62828] mb-1">{t('reports.custom.filters.groupBy')}</label>
            <select
              id="custom-report-group-by"
              value={groupBy}
              onChange={(e) => edit(setGroupBy)(e.target.value as CustomReportGrouping)}
              className={FIELD_CLASS}
            >
              {groupingsOf(dataset).map((grouping) => (
                <option key={grouping} value={grouping}>{t(GROUPING_LABEL[grouping])}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="custom-report-status" className="block text-sm font-medium text-[#C62828] mb-1">{t('reports.custom.filters.status')}</label>
            <select
              id="custom-report-status"
              value={status}
              onChange={(e) => edit(setStatus)(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">{t('common.filters.all')}</option>
              {statusesOf(dataset).map((value) => (
                <option key={value} value={value}>{t(statusLabels[value])}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="custom-report-unit" className="block text-sm font-medium text-[#C62828] mb-1">{t('common.filters.unitCode')}</label>
            <input
              id="custom-report-unit"
              type="text"
              value={unitCode}
              onChange={(e) => edit(setUnitCode)(e.target.value)}
              placeholder={t('reports.custom.filters.unitPlaceholder')}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="custom-report-from" className="block text-sm font-medium text-[#C62828] mb-1">{t('common.filters.from')}</label>
            <input
              id="custom-report-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => edit(setFrom)(e.target.value)}
              className={FIELD_CLASS}
              data-testid="from-date-input"
            />
          </div>
          <div>
            <label htmlFor="custom-report-to" className="block text-sm font-medium text-[#C62828] mb-1">{t('common.filters.to')}</label>
            <input
              id="custom-report-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => edit(setTo)(e.target.value)}
              className={FIELD_CLASS}
              data-testid="to-date-input"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setEnabled(true)}
            disabled={isFetching}
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 transition-colors"
            data-testid="generate-btn"
          >
            {isFetching ? t('reports.custom.generate.pending') : t('reports.custom.generate.idle')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {reportErrorText(error, 'reports.custom.generate.error')}
        </div>
      )}

      {data && (
        <CustomReportResultView report={data} isExporting={isExporting} onExport={() => handleExport(data)} />
      )}
    </div>
  )
}

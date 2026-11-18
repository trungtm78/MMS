import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Users, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  reportsApi,
  trainingComplianceResult,
  type TrainingComplianceResult,
  type TrainingComplianceRow,
} from '@/api/reports'
import { describeApiError } from '@/lib/api-error'
import { todayInVietnam } from '@/lib/dates'
import { downloadExcelReport } from '@/utils/export-utils'
import type { TranslationKey } from '@/i18n/types'

// Area units KP1…KP6 (Khu phố 1…6)
const AREA_NUMBERS = [1, 2, 3, 4, 5, 6] as const

// The year filter offers this many years either side of the current Vietnamese year
const YEAR_SPAN = 2

const RESULT_LABEL = {
  pass: 'reports.trainingCompliance.status.pass',
  warning: 'reports.trainingCompliance.status.warning',
  fail: 'reports.trainingCompliance.status.fail',
} as const satisfies Record<TrainingComplianceResult, TranslationKey>

const RESULT_ROW = {
  pass: 'bg-green-50',
  warning: 'bg-yellow-50',
  fail: 'bg-red-50',
} as const satisfies Record<TrainingComplianceResult, string>

const RESULT_BADGE = {
  pass: 'bg-green-100 text-[#2E7D32]',
  warning: 'bg-yellow-100 text-yellow-700',
  fail: 'bg-red-100 text-[#C62828]',
} as const satisfies Record<TrainingComplianceResult, string>

// Training days per type, in the order of the table and of the summary
const TRAINING_TYPES = [
  { key: 'military', label: 'reports.trainingCompliance.columns.military' },
  { key: 'political', label: 'reports.trainingCompliance.columns.political' },
  { key: 'fire', label: 'reports.trainingCompliance.columns.fire' },
  { key: 'firstAid', label: 'reports.trainingCompliance.columns.firstAid' },
  { key: 'other', label: 'reports.trainingCompliance.columns.other' },
] as const satisfies readonly { key: keyof TrainingComplianceRow; label: TranslationKey }[]

// Backend codes (no_unit_scope, insufficient_role) read through the error table; a 403 without a
// known code is a missing permission; any other failure reads as the fallback of the request
const ERROR_SCOPE = 'training.compliance'
const FORBIDDEN_STATUS = { 403: 'errors.common.forbidden' } as const satisfies Partial<Record<number, TranslationKey>>

const TH = 'px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap'
const FIELD_CLASS = 'px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]'

const currentVietnamYear = () => Number(todayInVietnam().slice(0, 4))

// Training days are SUMs over training_records.total_days (NUMERIC(5,1)): half days show as 12,5
const formatDays = (days: number) => days.toLocaleString('vi-VN')

export function TrainingComplianceReportPage() {
  const { t } = useTranslation()
  // Training years are Vietnamese calendar years, as the backend defaults to
  const [year, setYear] = useState(currentVietnamYear)
  const [unitCode, setUnitCode] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const query = { year, unitCode }
  const { data, isLoading, error } = useQuery({
    queryKey: ['training-compliance', year, unitCode],
    queryFn: () => reportsApi.trainingCompliance(query),
    staleTime: 60_000,
  })

  const rows = data ?? []
  const results = rows.map((row) => trainingComplianceResult(row.status))
  const countOf = (result: TrainingComplianceResult) => results.filter((each) => each === result).length
  const passed = countOf('pass')
  const baseYear = currentVietnamYear()
  const yearOptions = Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, i) => baseYear - YEAR_SPAN + i)
  const columns = [
    t('reports.trainingCompliance.columns.index'),
    t('reports.trainingCompliance.columns.fullName'),
    t('reports.trainingCompliance.columns.militiaCode'),
    t('reports.trainingCompliance.columns.unit'),
    ...TRAINING_TYPES.map(({ label }) => t(label)),
    t('reports.trainingCompliance.columns.total'),
    t('reports.trainingCompliance.columns.result'),
  ]

  // The export button only shows once there are rows
  async function handleExport() {
    toast.info(t('reports.trainingCompliance.export.pending'))
    try {
      await downloadExcelReport(
        () => reportsApi.exportTrainingCompliance(query),
        `tuan-thu-huan-luyen-${year}.xlsx`,
        () => setIsExporting(true),
        () => setIsExporting(false),
      )
      toast.success(t('reports.trainingCompliance.export.success'))
    } catch (err) {
      toast.error(describeApiError(err, { scope: ERROR_SCOPE, statuses: FORBIDDEN_STATUS, fallback: 'reports.trainingCompliance.export.error' }))
    }
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="training-compliance-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('reports.trainingCompliance.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('reports.trainingCompliance.header.subtitle')}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || rows.length === 0}
          data-testid="export-btn"
          className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? t('common.actions.exporting') : t('reports.trainingCompliance.export.idle')}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="training-compliance-year" className="text-sm font-medium text-[#0F172A]">{t('reports.trainingCompliance.filters.year')}</label>
            <select
              id="training-compliance-year"
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className={FIELD_CLASS}
            >
              {yearOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="training-compliance-unit" className="text-sm font-medium text-[#0F172A]">{t('reports.trainingCompliance.filters.unit')}</label>
            <select
              id="training-compliance-unit"
              value={unitCode}
              onChange={e => setUnitCode(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">{t('common.filters.all')}</option>
              {AREA_NUMBERS.map((number) => (
                <option key={number} value={`KP${number}`}>{t('reports.trainingCompliance.filters.area', { number })}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards — computed client-side from rows */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div data-testid="compliance-summary-total" className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-[#1F3A5F]" />
              <p className="text-sm text-[#64748B]">{t('reports.trainingCompliance.summary.total')}</p>
            </div>
            <p className="text-3xl font-bold text-[#0F172A]">{rows.length}</p>
          </div>
          <div data-testid="compliance-summary-passed" className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-[#2E7D32]" />
              <p className="text-sm text-[#64748B]">{t('reports.trainingCompliance.summary.passed')}</p>
            </div>
            <p className="text-3xl font-bold text-[#2E7D32]">
              {t('reports.trainingCompliance.summary.percent', { value: Math.round((passed / rows.length) * 100) })}
            </p>
            <p className="text-xs text-[#64748B] mt-1">{t('reports.trainingCompliance.summary.passedCount', { count: passed })}</p>
          </div>
          <div data-testid="compliance-summary-warning" className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-yellow-600" />
              <p className="text-sm text-[#64748B]">{t('reports.trainingCompliance.summary.warning')}</p>
            </div>
            <p className="text-3xl font-bold text-yellow-600">{countOf('warning')}</p>
          </div>
          <div data-testid="compliance-summary-failed" className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={16} className="text-[#C62828]" />
              <p className="text-sm text-[#64748B]">{t('reports.trainingCompliance.summary.failed')}</p>
            </div>
            <p className="text-3xl font-bold text-[#C62828]">{countOf('fail')}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {describeApiError(error, { scope: ERROR_SCOPE, statuses: FORBIDDEN_STATUS, fallback: 'reports.trainingCompliance.load.error' })}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[#64748B] text-sm">{t('common.states.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  {columns.map(column => (
                    <th key={column} className={TH}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-sm text-[#64748B]">
                      {t('common.states.empty')}
                    </td>
                  </tr>
                ) : rows.map((row, idx) => {
                  const result = results[idx]
                  return (
                    <tr key={row.militiaId} className={`transition-colors ${result ? RESULT_ROW[result] : ''}`}>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.militiaName}</td>
                      <td className="px-4 py-3 text-sm font-mono text-[#1F3A5F]">{row.militiaCode}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.unitCode}</td>
                      {TRAINING_TYPES.map(({ key }) => (
                        <td key={key} className="px-4 py-3 text-sm text-[#64748B] text-center">{formatDays(row[key])}</td>
                      ))}
                      <td className="px-4 py-3 text-sm font-semibold text-[#0F172A] text-center">{formatDays(row.totalDays)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${result ? RESULT_BADGE[result] : 'bg-gray-100 text-[#64748B]'}`}>
                          {result ? t(RESULT_LABEL[result]) : row.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary stats by type — total days per training category */}
      {rows.length > 0 && (
        <section aria-labelledby="training-compliance-by-type" className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <h2 id="training-compliance-by-type" className="text-base font-semibold text-[#0F172A] mb-4">
            {t('reports.trainingCompliance.byType.title')}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {TRAINING_TYPES.map(({ key, label }) => (
              <div key={key} data-testid={`compliance-by-type-${key}`} className="text-center">
                <p className="text-2xl font-bold text-[#1F3A5F]">{formatDays(rows.reduce((sum, row) => sum + row[key], 0))}</p>
                <p className="text-xs text-[#64748B] mt-1">{t(label)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

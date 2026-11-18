import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Calendar } from 'lucide-react'
import client from '@/api/client'
import type { TranslationKey } from '@/i18n/types'
import { downloadExcelReport } from '@/utils/export-utils'
import { firstDayOfMonthInVietnam, lastDayOfMonthInVietnam } from '@/lib/dates'

interface AttendanceSummaryRow {
  militiaId: string
  militiaName: string
  militiaCode: string
  unitCode: string
  totalDays: number
  onTimeDays: number
  lateDays: number
  absentDays: number
  attendancePct: number // percentage 0-100
}

const COLUMNS = [
  'attendance.summary.columns.index',
  'attendance.summary.columns.name',
  'attendance.summary.columns.code',
  'attendance.summary.columns.unit',
  'attendance.summary.columns.totalDays',
  'attendance.summary.columns.onTimeDays',
  'attendance.summary.columns.lateDays',
  'attendance.summary.columns.absentDays',
  'attendance.summary.columns.attendancePct',
] as const satisfies readonly TranslationKey[]

// Unit filter: the wards KP1..KP6
const WARD_NUMBERS = [1, 2, 3, 4, 5, 6] as const

// The current month in Vietnam (a local Date turned into ISO would start a day early east of UTC)
function getMonthRange() {
  const now = new Date()
  return { from: firstDayOfMonthInVietnam(now), to: lastDayOfMonthInVietnam(now) }
}

async function fetchAttendanceSummary(params: {
  from: string
  to: string
  unitCode: string
}): Promise<AttendanceSummaryRow[]> {
  const res = await client.get('/attendance/summary', {
    params: {
      from: params.from,
      to: params.to,
      unitCode: params.unitCode || undefined,
    },
  })
  return res.data
}

function pctColor(rate: number): string {
  if (rate < 60) return 'text-[#C62828]'
  if (rate < 80) return 'text-yellow-600'
  return 'text-[#2E7D32]'
}

function pctBg(rate: number): string {
  if (rate < 60) return 'bg-[#C62828]'
  if (rate < 80) return 'bg-yellow-500'
  return 'bg-[#2E7D32]'
}

export function AttendanceSummaryReportPage() {
  const { t } = useTranslation()
  const defaultRange = getMonthRange()
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [unitCode, setUnitCode] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['attendance-summary', from, to, unitCode],
    queryFn: () => fetchAttendanceSummary({ from, to, unitCode }),
    staleTime: 60_000,
    enabled: !!from && !!to,
  })

  // Sort ascending by attendance rate — lowest first ("cần chú ý" at top)
  const rows = [...(data ?? [])].sort((a, b) => a.attendancePct - b.attendancePct)

  async function handleExport() {
    await downloadExcelReport(
      async () => {
        const res = await client.get('/attendance/export', {
          params: { from, to, unitCode: unitCode || undefined },
          responseType: 'blob',
        })
        return res.data as Blob
      },
      `tong-hop-diem-danh-${from}-${to}.xlsx`,
      () => setIsExporting(true),
      () => setIsExporting(false),
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="attendance-summary-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('attendance.summary.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('attendance.summary.header.subtitle')}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || rows.length === 0}
          data-testid="export-btn"
          className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
        >
          <Download size={16} />
          {t(isExporting ? 'common.actions.exporting' : 'attendance.summary.export.button')}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-[#64748B]" />
            <label className="text-sm font-medium text-[#0F172A]">{t('attendance.summary.filters.from')}</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              data-testid="date-from"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#0F172A]">{t('attendance.summary.filters.to')}</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              data-testid="date-to"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#0F172A]">{t('attendance.summary.filters.unit')}</label>
            <select
              value={unitCode}
              onChange={e => setUnitCode(e.target.value)}
              data-testid="unit-filter"
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            >
              <option value="">{t('common.filters.all')}</option>
              {WARD_NUMBERS.map((number) => (
                <option key={number} value={`KP${number}`}>{t('attendance.summary.filters.ward', { number })}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {t('attendance.summary.list.loadError')}
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
                  {COLUMNS.map(column => (
                    <th key={column} className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap">{t(column)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm text-[#64748B]">
                      {t('common.states.empty')}
                    </td>
                  </tr>
                ) : rows.map((row, idx) => (
                  <tr key={row.militiaId} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#64748B]">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.militiaName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-[#1F3A5F]">{row.militiaCode}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{row.unitCode}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] text-center">{row.totalDays}</td>
                    <td className="px-4 py-3 text-sm text-[#2E7D32] text-center">{row.onTimeDays}</td>
                    <td className="px-4 py-3 text-sm text-yellow-600 text-center">{row.lateDays}</td>
                    <td className="px-4 py-3 text-sm text-[#C62828] text-center">{row.absentDays}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${pctBg(row.attendancePct)}`}
                            style={{ width: `${Math.min(100, row.attendancePct)}%` }}
                          />
                        </div>
                        <span
                          className={`text-sm font-semibold ${pctColor(row.attendancePct)}`}
                          data-testid={`pct-${row.militiaCode}`}
                        >
                          {row.attendancePct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

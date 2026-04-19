import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Filter } from 'lucide-react'
import client from '@/api/client'

type ReportType = 'attendance' | 'tasks' | 'kpi' | 'payroll'

interface CustomReportRow {
  label: string
  value: string | number
}

interface CustomReportResult {
  title: string
  generatedAt: string
  rows: CustomReportRow[]
}

async function generateReport(params: {
  type: ReportType; from: string; to: string
}): Promise<CustomReportResult> {
  const res = await client.get('/reports/custom', { params })
  return res.data
}

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'attendance', label: 'Chấm công' },
  { value: 'tasks',      label: 'Nhiệm vụ' },
  { value: 'kpi',        label: 'KPI & Hiệu suất' },
  { value: 'payroll',    label: 'Lương & Phụ cấp' },
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function firstDayOfMonthStr() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export function CustomReportPage() {
  const [reportType, setReportType] = useState<ReportType>('attendance')
  const [from, setFrom] = useState(firstDayOfMonthStr())
  const [to, setTo]     = useState(todayStr())
  const [enabled, setEnabled] = useState(false)

  const { data, isFetching, isError } = useQuery({
    queryKey: ['custom-report', reportType, from, to],
    queryFn: () => generateReport({ type: reportType, from, to }),
    enabled,
    staleTime: 0,
  })

  function handleGenerate() {
    setEnabled(true)
  }

  function handleExport() {
    if (!data) return
    const csv = ['Tiêu chí,Giá trị', ...data.rows.map((r) => `"${r.label}","${r.value}"`)]
    const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bao-cao-${reportType}-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6" data-testid="custom-report-page">
      <div>
        <h1 className="text-2xl font-bold text-[#1F3A5F]">Báo Cáo Tùy Chỉnh</h1>
        <p className="text-sm text-gray-600 mt-1">Tạo báo cáo theo khoảng thời gian và loại dữ liệu</p>
      </div>

      {/* Filter form */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-gray-500" />
          <p className="text-sm font-semibold text-gray-700">Tham số báo cáo</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại báo cáo</label>
            <select
              value={reportType}
              onChange={(e) => { setReportType(e.target.value as ReportType); setEnabled(false) }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              data-testid="report-type-select"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => { setFrom(e.target.value); setEnabled(false) }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              data-testid="from-date-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => { setTo(e.target.value); setEnabled(false) }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              data-testid="to-date-input"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={isFetching}
            className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] text-sm font-medium disabled:opacity-60"
            data-testid="generate-btn"
          >
            {isFetching ? 'Đang tạo...' : 'Tạo báo cáo'}
          </button>
          {data && (
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2"
              data-testid="export-btn"
            >
              <FileDown size={15} />
              Xuất CSV
            </button>
          )}
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tạo báo cáo. Vui lòng thử lại.
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">{data.title}</p>
            <p className="text-xs text-gray-500">Tạo lúc {data.generatedAt}</p>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-gray-100">
              {data.rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-6 py-3 text-sm text-gray-600 w-1/2">{row.label}</td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

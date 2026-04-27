import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Filter, FileText, BookOpen } from 'lucide-react'
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

const PHAP_DINH_BUTTONS = [
  { label: 'Mẫu 03-BC', icon: FileText, desc: 'Báo cáo tháng dân quân tự vệ' },
  { label: 'Mẫu huấn luyện', icon: BookOpen, desc: 'Kết quả huấn luyện định kỳ' },
  { label: 'Mẫu khen thưởng-kỷ luật', icon: FileText, desc: 'Đề nghị khen thưởng / kỷ luật' },
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
    const blob = new Blob(['﻿' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bao-cao-${reportType}-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="custom-report-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Báo Cáo Tùy Chỉnh</h1>
        <p className="text-sm text-[#64748B] mt-1">Tạo báo cáo theo khoảng thời gian và loại dữ liệu</p>
      </div>

      {/* Báo cáo pháp định */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
            <FileText size={15} className="text-[#C62828]" />
          </div>
          <p className="text-sm font-semibold text-[#0F172A]">Báo cáo pháp định</p>
          <span className="ml-auto text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-full px-2 py-0.5">
            Theo TT 144/2014/TT-BQP
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PHAP_DINH_BUTTONS.map(({ label, icon: Icon, desc }) => (
            <button
              key={label}
              className="flex items-start gap-3 p-4 border border-[#E2E8F0] rounded-xl hover:border-[#C62828] hover:bg-red-50 transition-all text-left group"
            >
              <div className="w-9 h-9 bg-red-50 group-hover:bg-[#C62828] rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                <Icon size={16} className="text-[#C62828] group-hover:text-white transition-colors" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A] group-hover:text-[#C62828] transition-colors">{label}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Filter form */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-[#64748B]" />
          <p className="text-sm font-semibold text-[#0F172A]">Tham số báo cáo</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#C62828] mb-1">Loại báo cáo</label>
            <select
              value={reportType}
              onChange={(e) => { setReportType(e.target.value as ReportType); setEnabled(false) }}
              className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
              data-testid="report-type-select"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#C62828] mb-1">Từ ngày</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => { setFrom(e.target.value); setEnabled(false) }}
              className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
              data-testid="from-date-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#C62828] mb-1">Đến ngày</label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => { setTo(e.target.value); setEnabled(false) }}
              className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
              data-testid="to-date-input"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={isFetching}
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 transition-colors"
            data-testid="generate-btn"
          >
            {isFetching ? 'Đang tạo...' : 'Tạo báo cáo'}
          </button>
          {data && (
            <button
              onClick={handleExport}
              className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors bg-white"
              data-testid="export-btn"
            >
              <FileDown size={15} />
              Xuất CSV
            </button>
          )}
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tạo báo cáo. Vui lòng thử lại.
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
            <p className="text-sm font-semibold text-[#0F172A]">{data.title}</p>
            <p className="text-xs text-[#64748B]">Tạo lúc {data.generatedAt}</p>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-[#E2E8F0]">
              {data.rows.map((row, i) => (
                <tr key={i} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-6 py-3 text-sm text-[#64748B] w-1/2">{row.label}</td>
                  <td className="px-6 py-3 text-sm font-medium text-[#0F172A]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

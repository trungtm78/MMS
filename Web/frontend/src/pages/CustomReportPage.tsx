import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Filter, FileText, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
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
  { label: 'Mẫu 03-BC', icon: FileText, desc: 'Báo cáo tháng dân quân tự vệ', key: 'mau03bc' },
  { label: 'Mẫu huấn luyện', icon: BookOpen, desc: 'Kết quả huấn luyện định kỳ', key: 'huan-luyen' },
  { label: 'Mẫu khen thưởng-kỷ luật', icon: FileText, desc: 'Đề nghị khen thưởng / kỷ luật', key: 'khen-thuong' },
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
  const [activePhapdinhKey, setActivePhapdinhKey] = useState<string | null>(null)
  const [mau03BcYear, setMau03BcYear] = useState(String(new Date().getFullYear()))
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
      toast.error('Không thể xuất Mẫu 03-BC')
    } finally {
      setMau03BcExporting(false)
    }
  }

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
                <p className={`text-sm font-medium transition-colors ${activePhapdinhKey === key ? 'text-[#C62828]' : 'text-[#0F172A] group-hover:text-[#C62828]'}`}>{label}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Mẫu 03-BC inline panel */}
        {activePhapdinhKey === 'mau03bc' && (
          <div className="mt-4 border border-[#E2E8F0] rounded-xl p-5 space-y-4 bg-[#F8FAFC]">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-[#C62828] mb-1">Năm</label>
                <input
                  type="number"
                  value={mau03BcYear}
                  onChange={e => setMau03BcYear(e.target.value)}
                  min={2020}
                  max={2100}
                  className="w-24 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#C62828] mb-1">Mã đơn vị (tuỳ chọn)</label>
                <input
                  type="text"
                  value={mau03BcUnit}
                  onChange={e => setMau03BcUnit(e.target.value)}
                  placeholder="VD: DV01"
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
                {mau03BcExporting ? 'Đang xuất...' : 'Xuất Excel'}
              </button>
            </div>

            {mau03BcLoading ? (
              <div className="py-6 text-center">
                <div className="inline-block w-6 h-6 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mau03BcData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">I. Quân số</p>
                  <p className="text-sm text-[#64748B]">Hiện dịch: <strong className="text-[#0F172A]">{mau03BcData.militia.totalActive}</strong></p>
                  <p className="text-sm text-[#64748B]">Dự bị: <strong className="text-[#0F172A]">{mau03BcData.militia.totalInactive}</strong></p>
                  <p className="text-sm text-[#64748B]">Nữ: <strong className="text-[#0F172A]">{mau03BcData.militia.totalFemale}</strong></p>
                </div>
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">II. Huấn luyện</p>
                  <p className="text-sm text-[#64748B]">Lượt: <strong className="text-[#0F172A]">{mau03BcData.training.trainedCount}</strong></p>
                  <p className="text-sm text-[#64748B]">Ngày: <strong className="text-[#0F172A]">{mau03BcData.training.totalTrainingDays}</strong></p>
                </div>
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">III. Kỷ luật</p>
                  <p className="text-sm text-[#64748B]">Khen thưởng: <strong className="text-[#2E7D32]">{mau03BcData.discipline.rewardCount}</strong></p>
                  <p className="text-sm text-[#64748B]">Kỷ luật: <strong className="text-[#C62828]">{mau03BcData.discipline.disciplineCount}</strong></p>
                </div>
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
                  <p className="text-xs font-semibold text-[#C62828] uppercase mb-2">IV. Kinh phí</p>
                  <p className="text-sm text-[#64748B]">Lương: <strong className="text-[#0F172A]">{mau03BcData.budget.totalSalary.toLocaleString('vi-VN')} đ</strong></p>
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

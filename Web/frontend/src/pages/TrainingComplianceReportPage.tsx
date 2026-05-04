import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Users, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'
import { downloadExcelReport } from '@/utils/export-utils'

interface TrainingComplianceRow {
  militiaId: string
  militiaName: string
  militiaCode: string
  unitCode: string
  military: number | null
  political: number | null
  fire: number | null
  firstAid: number | null
  other: number | null
  totalDays: number | null
  status: 'ĐẠT' | 'KHÔNG ĐẠT' | 'CẢNH BÁO'
}

async function fetchTrainingCompliance(year: number, unitCode: string): Promise<TrainingComplianceRow[]> {
  const res = await client.get('/training/compliance-report', {
    params: { year, unitCode: unitCode || undefined },
  })
  return res.data
}

const STATUS_ROW_COLORS: Record<string, string> = {
  'ĐẠT': 'bg-green-50',
  'CẢNH BÁO': 'bg-yellow-50',
  'KHÔNG ĐẠT': 'bg-red-50',
}
const STATUS_BADGE_COLORS: Record<string, string> = {
  'ĐẠT': 'bg-green-100 text-[#2E7D32]',
  'CẢNH BÁO': 'bg-yellow-100 text-yellow-700',
  'KHÔNG ĐẠT': 'bg-red-100 text-[#C62828]',
}

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2]

function fmt(val: number | null): string {
  return val != null ? String(val) : '—'
}

export function TrainingComplianceReportPage() {
  const [year, setYear] = useState(currentYear)
  const [unitCode, setUnitCode] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['training-compliance', year, unitCode],
    queryFn: () => fetchTrainingCompliance(year, unitCode),
    staleTime: 60_000,
  })

  const rows = data ?? []

  async function handleExport() {
    if (rows.length === 0) {
      toast.warning('Không có dữ liệu để xuất')
      return
    }
    toast.info('Đang tạo báo cáo...')
    await downloadExcelReport(
      async () => {
        const res = await client.get('/training/export', {
          params: { year, unitCode: unitCode || undefined },
          responseType: 'blob',
        })
        return res.data as Blob
      },
      `tuan-thu-huan-luyen-${year}.xlsx`,
      () => setIsExporting(true),
      () => {
        setIsExporting(false)
        toast.success('File đã tải xuống. In và ký tay trước khi nộp.')
      },
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="training-compliance-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Báo Cáo Tuân Thủ Huấn Luyện</h1>
          <p className="text-sm text-[#64748B] mt-1">Kết quả huấn luyện và tuân thủ theo từng DQTV</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || rows.length === 0}
          data-testid="export-btn"
          className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? 'Đang xuất...' : 'Xuất báo cáo'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#0F172A]">Năm:</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#0F172A]">Đơn vị:</label>
            <select
              value={unitCode}
              onChange={e => setUnitCode(e.target.value)}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            >
              <option value="">Tất cả</option>
              <option value="KP1">Khu phố 1</option>
              <option value="KP2">Khu phố 2</option>
              <option value="KP3">Khu phố 3</option>
              <option value="KP4">Khu phố 4</option>
              <option value="KP5">Khu phố 5</option>
              <option value="KP6">Khu phố 6</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards — computed client-side from rows */}
      {rows.length > 0 && (() => {
        const total = rows.length
        const passed = rows.filter(r => r.status === 'ĐẠT').length
        const warning = rows.filter(r => r.status === 'CẢNH BÁO').length
        const failed = rows.filter(r => r.status === 'KHÔNG ĐẠT').length
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-[#1F3A5F]" />
                <p className="text-sm text-[#64748B]">Tổng DQTV</p>
              </div>
              <p className="text-3xl font-bold text-[#0F172A]">{total}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-[#2E7D32]" />
                <p className="text-sm text-[#64748B]">Đạt</p>
              </div>
              <p className="text-3xl font-bold text-[#2E7D32]">
                {total > 0 ? `${Math.round((passed / total) * 100)}%` : '—'}
              </p>
              <p className="text-xs text-[#64748B] mt-1">{passed} người</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-yellow-600" />
                <p className="text-sm text-[#64748B]">Cảnh báo</p>
              </div>
              <p className="text-3xl font-bold text-yellow-600">{warning}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={16} className="text-[#C62828]" />
                <p className="text-sm text-[#64748B]">Không đạt</p>
              </div>
              <p className="text-3xl font-bold text-[#C62828]">{failed}</p>
            </div>
          </div>
        )
      })()}

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải báo cáo huấn luyện.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[#64748B] text-sm">Đang tải...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  {['STT', 'Họ tên', 'Mã DQTV', 'Đơn vị', 'Quân sự', 'Chính trị', 'PCCC', 'Sơ cứu', 'Khác', 'Tổng', 'Kết quả'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-sm text-[#64748B]">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : rows.map((row, idx) => (
                  <tr key={row.militiaId} className={`transition-colors ${STATUS_ROW_COLORS[row.status] ?? ''}`}>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.militiaName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-[#1F3A5F]">{row.militiaCode}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{row.unitCode}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] text-center">{fmt(row.military)}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] text-center">{fmt(row.political)}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] text-center">{fmt(row.fire)}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] text-center">{fmt(row.firstAid)}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] text-center">{fmt(row.other)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#0F172A] text-center">{fmt(row.totalDays)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE_COLORS[row.status] ?? 'bg-gray-100 text-[#64748B]'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary stats by type — total days per training category */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <h2 className="text-base font-semibold text-[#0F172A] mb-4">Thống kê theo loại huấn luyện (tổng ngày)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Quân sự', value: rows.reduce((s, r) => s + (r.military ?? 0), 0) },
              { label: 'Chính trị', value: rows.reduce((s, r) => s + (r.political ?? 0), 0) },
              { label: 'PCCC', value: rows.reduce((s, r) => s + (r.fire ?? 0), 0) },
              { label: 'Sơ cứu', value: rows.reduce((s, r) => s + (r.firstAid ?? 0), 0) },
              { label: 'Khác', value: rows.reduce((s, r) => s + (r.other ?? 0), 0) },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className="text-2xl font-bold text-[#1F3A5F]">{item.value}</p>
                <p className="text-xs text-[#64748B] mt-1">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

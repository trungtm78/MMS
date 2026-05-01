import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Calendar } from 'lucide-react'
import client from '@/api/client'
import { downloadExcelReport } from '@/utils/export-utils'

interface AttendanceSummaryRow {
  id: string
  fullName: string
  militiaCode: string
  unitCode: string
  totalDays: number
  onTime: number
  late: number
  absent: number
  attendanceRate: number // percentage 0-100
}

interface AttendanceSummaryResponse {
  data: AttendanceSummaryRow[]
  total: number
}

function getMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

async function fetchAttendanceSummary(params: {
  from: string
  to: string
  unitCode: string
}): Promise<AttendanceSummaryResponse> {
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
  const rows = [...(data?.data ?? [])].sort((a, b) => a.attendanceRate - b.attendanceRate)

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
          <h1 className="text-2xl font-bold text-[#0F172A]">Tổng Hợp Điểm Danh</h1>
          <p className="text-sm text-[#64748B] mt-1">Thống kê tỷ lệ có mặt theo khoảng thời gian</p>
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
            <Calendar size={16} className="text-[#64748B]" />
            <label className="text-sm font-medium text-[#0F172A]">Từ:</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              data-testid="date-from"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#0F172A]">Đến:</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              data-testid="date-to"
            />
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

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải báo cáo điểm danh.
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
                  {['STT', 'Họ tên', 'Mã DQTV', 'Đơn vị', 'Tổng ngày', 'Đúng giờ', 'Trễ', 'Vắng', '% Có mặt'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-sm text-[#64748B]">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : rows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 text-sm text-[#64748B]">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.fullName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-[#1F3A5F]">{row.militiaCode}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B]">{row.unitCode}</td>
                    <td className="px-4 py-3 text-sm text-[#64748B] text-center">{row.totalDays}</td>
                    <td className="px-4 py-3 text-sm text-[#2E7D32] text-center">{row.onTime}</td>
                    <td className="px-4 py-3 text-sm text-yellow-600 text-center">{row.late}</td>
                    <td className="px-4 py-3 text-sm text-[#C62828] text-center">{row.absent}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${pctBg(row.attendanceRate)}`}
                            style={{ width: `${Math.min(100, row.attendanceRate)}%` }}
                          />
                        </div>
                        <span
                          className={`text-sm font-semibold ${pctColor(row.attendanceRate)}`}
                          data-testid={`pct-${row.militiaCode}`}
                        >
                          {row.attendanceRate}%
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

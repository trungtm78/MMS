import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronLeft, ChevronRight, Download, TrendingUp } from 'lucide-react'
import client from '@/api/client'
import { exportCsv } from '@/utils/csv-export'

interface AttendanceRecord {
  id: string
  militiaId: string
  militiaName: string
  militiaCode: string
  workDate: string
  status: string
  checkinAt: string | null
  checkoutAt: string | null
  workHours: number | null
  source: string
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

async function listAttendance(params: { date?: string; page?: number; limit?: number }): Promise<PaginatedResponse<AttendanceRecord>> {
  const res = await client.get('/attendance', { params: { page: 1, limit: 20, ...params } })
  return res.data
}

const STATUS_LABELS: Record<string, string> = {
  checked_in: 'Đã điểm danh', checked_out: 'Đã về', absent: 'Vắng mặt',
  late: 'Đi trễ', early_leave: 'Về sớm',
}
const STATUS_COLORS: Record<string, string> = {
  checked_in: 'bg-green-100 text-green-700',
  checked_out: 'bg-blue-100 text-blue-700',
  absent: 'bg-red-100 text-[#C62828]',
  late: 'bg-yellow-100 text-yellow-700',
  early_leave: 'bg-orange-100 text-orange-700',
}

export function AttendanceReportPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-report', date, page],
    queryFn: () => listAttendance({ date, page, limit: 20 }),
  })

  // Separate export query — fetch up to 1000 records, only triggered on demand
  const { refetch: fetchAllForExport, isFetching: isExporting } = useQuery({
    queryKey: ['attendance-export', date],
    queryFn: () => listAttendance({ date, page: 1, limit: 1000 }),
    enabled: false,
  })

  async function handleExportCsv() {
    const result = await fetchAllForExport()
    const rows = result.data?.data ?? []
    const headers = ['Mã DQTV', 'Họ và tên', 'Trạng thái', 'Giờ vào', 'Giờ ra', 'Số giờ']
    const csvRows = rows.map((r) => [
      r.militiaCode,
      r.militiaName,
      STATUS_LABELS[r.status] ?? r.status,
      r.checkinAt ? new Date(r.checkinAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—',
      r.checkoutAt ? new Date(r.checkoutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—',
      r.workHours != null ? `${r.workHours}h` : '—',
    ])
    exportCsv(headers, csvRows, `diem-danh-${date}.csv`)
  }

  const records = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const stats = {
    present: records.filter(r => ['checked_in', 'checked_out'].includes(r.status)).length,
    absent: records.filter(r => r.status === 'absent').length,
    late: records.filter(r => r.status === 'late').length,
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="attendance-report-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Báo Cáo Điểm Danh</h1>
          <p className="text-sm text-[#64748B] mt-1">Thống kê điểm danh theo ngày</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={isExporting}
          data-testid="export-btn"
          className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-[#C62828]" />
            <label className="text-sm font-medium text-[#0F172A]">Ngày:</label>
          </div>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setPage(1) }}
            className="px-4 py-2 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A]"
            data-testid="date-filter"
          />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#64748B]">Có mặt</p>
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
              <TrendingUp size={15} className="text-[#2E7D32]" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#2E7D32]">{stats.present}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#64748B]">Vắng mặt</p>
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
              <TrendingUp size={15} className="text-[#C62828]" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#C62828]">{stats.absent}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#64748B]">Đi trễ</p>
            <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center">
              <TrendingUp size={15} className="text-yellow-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-yellow-600">{stats.late}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[#64748B]">Tổng</p>
            <div className="w-8 h-8 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
              <TrendingUp size={15} className="text-[#1F3A5F]" />
            </div>
          </div>
          <p className="text-3xl font-bold text-[#0F172A]">{records.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[#64748B] text-sm">Đang tải...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Mã DQTV</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Họ và tên</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Trạng thái</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Giờ vào</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Giờ ra</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Số giờ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-[#64748B] text-sm">
                        Không có dữ liệu điểm danh cho ngày này
                      </td>
                    </tr>
                  ) : records.map(r => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-[#1F3A5F] font-medium">{r.militiaCode}</td>
                      <td className="px-6 py-4 text-sm font-medium text-[#0F172A]">{r.militiaName}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-[#64748B]'}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#64748B]">
                        {r.checkinAt ? new Date(r.checkinAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-[#64748B]">
                        {r.checkoutAt ? new Date(r.checkoutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-[#64748B]">
                        {r.workHours != null ? `${r.workHours}h` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]">Tổng <span className="font-medium text-[#0F172A]">{total}</span> bản ghi</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-[#0F172A] font-medium">{page} / {totalPages || 1}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

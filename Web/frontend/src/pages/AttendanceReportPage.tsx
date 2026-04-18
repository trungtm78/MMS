import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import client from '@/api/client'

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
  checked_in: 'bg-green-100 text-green-700', checked_out: 'bg-blue-100 text-blue-700',
  absent: 'bg-red-100 text-red-700', late: 'bg-yellow-100 text-yellow-700',
  early_leave: 'bg-orange-100 text-orange-700',
}

export function AttendanceReportPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-report', date, page],
    queryFn: () => listAttendance({ date, page, limit: 20 }),
  })

  const records = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const stats = {
    present: records.filter(r => ['checked_in', 'checked_out'].includes(r.status)).length,
    absent: records.filter(r => r.status === 'absent').length,
    late: records.filter(r => r.status === 'late').length,
  }

  return (
    <div className="p-6 space-y-6" data-testid="attendance-report-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Báo Cáo Điểm Danh</h1>
          <p className="text-sm text-gray-600 mt-1">Thống kê điểm danh theo ngày</p>
        </div>
        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm">
          <Download size={16} />
          Xuất Excel
        </button>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <label className="text-sm font-medium text-gray-700">Ngày:</label>
          </div>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setPage(1) }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
            data-testid="date-filter"
          />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Có mặt" value={stats.present} color="text-green-600 bg-green-50 border-green-200" />
        <StatCard label="Vắng mặt" value={stats.absent} color="text-red-600 bg-red-50 border-red-200" />
        <StatCard label="Đi trễ" value={stats.late} color="text-yellow-600 bg-yellow-50 border-yellow-200" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Đang tải...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Mã DQTV</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Họ và tên</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Trạng thái</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Giờ vào</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Giờ ra</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Số giờ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                        Không có dữ liệu điểm danh cho ngày này
                      </td>
                    </tr>
                  ) : records.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-[#1F3A5F] font-medium">{r.militiaCode}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.militiaName}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {r.checkinAt ? new Date(r.checkinAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {r.checkoutAt ? new Date(r.checkoutAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {r.workHours != null ? `${r.workHours}h` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">Tổng <span className="font-medium">{total}</span> bản ghi</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border disabled:opacity-40 hover:bg-gray-50">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm">{page} / {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border disabled:opacity-40 hover:bg-gray-50">
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`bg-white rounded-lg border shadow-sm p-4 ${color.includes('border') ? '' : 'border-gray-200'}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color.split(' ')[0]}`}>{value}</p>
    </div>
  )
}

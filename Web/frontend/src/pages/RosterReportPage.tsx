import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import client from '@/api/client'
import { downloadExcelReport } from '@/utils/export-utils'

interface MilitiaRosterRow {
  id: string
  militiaCode: string
  fullName: string
  dateOfBirth: string
  gender: string
  phone: string
  unitCode: string
  rank: string
  occupation: string
  education: string
  status: 'active' | 'reserve' | 'inactive'
}

interface PaginatedRoster {
  data: MilitiaRosterRow[]
  total: number
  page: number
  limit: number
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'reserve', label: 'Dự bị' },
  { value: 'inactive', label: 'Ngừng hoạt động' },
]

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-green-100 text-[#2E7D32]',
  reserve: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-[#64748B]',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Hoạt động',
  reserve: 'Dự bị',
  inactive: 'Ngừng',
}

const LIMIT = 20

async function fetchRoster(params: {
  page: number
  limit: number
  unitCode: string
  status: string
}): Promise<PaginatedRoster> {
  const res = await client.get('/militia', {
    params: {
      page: params.page,
      limit: params.limit,
      unitCode: params.unitCode || undefined,
      status: params.status === 'all' ? undefined : params.status,
    },
  })
  return res.data
}

export function RosterReportPage() {
  const [unitCode, setUnitCode] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['roster-report', unitCode, status, page],
    queryFn: () => fetchRoster({ page, limit: LIMIT, unitCode, status }),
    placeholderData: prev => prev,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function handleExport() {
    await downloadExcelReport(
      async () => {
        const res = await client.get('/militia/export', {
          params: {
            format: 'xlsx',
            unitCode: unitCode || undefined,
            status: status === 'all' ? undefined : status,
          },
          responseType: 'blob',
        })
        return res.data as Blob
      },
      `danh-sach-quan-nhan-${new Date().toISOString().slice(0, 10)}.xlsx`,
      () => setIsExporting(true),
      () => setIsExporting(false),
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="roster-report-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Danh Sách Quân Nhân (Mẫu 01-BC)</h1>
          <p className="text-sm text-[#64748B] mt-1">Danh sách dân quân tự vệ theo đơn vị và trạng thái</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || rows.length === 0}
          data-testid="export-btn"
          className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? 'Đang xuất...' : 'Xuất Excel (Mẫu 01-BC)'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#0F172A]">Đơn vị:</label>
            <select
              value={unitCode}
              onChange={e => { setUnitCode(e.target.value); setPage(1) }}
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
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#0F172A]">Trạng thái:</label>
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải danh sách quân nhân.
        </div>
      )}

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
                    {['STT', 'Mã DQTV', 'Họ tên', 'Ngày sinh', 'Giới tính', 'Điện thoại', 'Đơn vị', 'Cấp bậc', 'Nghề nghiệp', 'Học vấn', 'Trạng thái'].map(h => (
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
                    <tr key={row.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-4 py-3 text-sm text-[#64748B]">{(page - 1) * LIMIT + idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-mono text-[#1F3A5F] font-medium">{row.militiaCode}</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.fullName}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B] whitespace-nowrap">
                        {row.dateOfBirth ? new Date(row.dateOfBirth).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.gender}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B] font-mono">{row.phone}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.unitCode}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.rank}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.occupation}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.education}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGES[row.status] ?? 'bg-gray-100 text-[#64748B]'}`}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]">
                Tổng <span className="font-medium text-[#0F172A]">{total}</span> bản ghi
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-[#0F172A] font-medium">{page} / {totalPages}</span>
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

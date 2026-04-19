// US-W003: Militia personnel list — server-side pagination + filters + export
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, FileDown, Eye, Edit, Filter, ChevronDown } from 'lucide-react'
import { searchMilitia, type MilitiaSearchResult } from '@/api/militia'

// ─── Filter options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'reserve', label: 'Dự bị' },
  { value: 'inactive', label: 'Đã xuất ngũ' },
  { value: 'leave', label: 'Nghỉ phép' },
]

const UNIT_OPTIONS = [
  { value: '', label: 'Tất cả đơn vị' },
  { value: 'KP1', label: 'Khu phố 1' },
  { value: 'KP2', label: 'Khu phố 2' },
  { value: 'KP3', label: 'Khu phố 3' },
  { value: 'KP4', label: 'Khu phố 4' },
  { value: 'KP5', label: 'Khu phố 5' },
  { value: 'KP6', label: 'Khu phố 6' },
]

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  active:   { label: 'Đang hoạt động', className: 'bg-green-100 text-green-700' },
  reserve:  { label: 'Dự bị',          className: 'bg-yellow-100 text-yellow-700' },
  inactive: { label: 'Đã xuất ngũ',    className: 'bg-gray-100 text-gray-700' },
  leave:    { label: 'Nghỉ phép',       className: 'bg-blue-100 text-blue-700' },
}

function getStatusDisplay(status: string) {
  return STATUS_DISPLAY[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <tbody className="bg-white divide-y divide-gray-200">
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: 7 }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </td>
          ))}
          <td className="px-6 py-4">
            <div className="flex justify-center gap-2">
              <div className="h-8 w-8 bg-gray-200 rounded-lg" />
              <div className="h-8 w-8 bg-gray-200 rounded-lg" />
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full pl-3 pr-8 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] bg-white cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(items: MilitiaSearchResult[]) {
  const header = ['Mã DQTV', 'Họ và tên', 'Đơn vị', 'Cấp bậc', 'Điện thoại', 'Email', 'Trạng thái']
  const rows = items.map((m) => [
    m.militiaCode ?? m.id,
    m.fullName,
    m.unitCode,
    m.rank ?? '',
    m.phone ?? '',
    m.email ?? '',
    getStatusDisplay(m.status).label,
  ])
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `danh-sach-dqtv-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MilitiaListProps {
  onViewProfile?: (id: string) => void
}

const LIMIT = 10

export function MilitiaList({ onViewProfile }: MilitiaListProps) {
  const navigate = useNavigate()
  const [page, setPage]               = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [unitFilter, setUnitFilter]     = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(searchInput)
      setPage(1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [statusFilter, unitFilter])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['militia-list', debouncedQ, statusFilter, unitFilter, page],
    queryFn: () => searchMilitia({
      q: debouncedQ || undefined,
      status: statusFilter || undefined,
      unitCode: unitFilter || undefined,
      page,
      limit: LIMIT,
    }),
    placeholderData: (prev) => prev,
  })

  // Separate query for export — fetch all matching rows (max 1000)
  const { refetch: fetchAllForExport, isFetching: isExporting } = useQuery({
    queryKey: ['militia-export', debouncedQ, statusFilter, unitFilter],
    queryFn: () => searchMilitia({
      q: debouncedQ || undefined,
      status: statusFilter || undefined,
      unitCode: unitFilter || undefined,
      page: 1,
      limit: 1000,
    }),
    enabled: false,
  })

  async function handleExport() {
    const result = await fetchAllForExport()
    if (result.data?.data) exportCsv(result.data.data)
  }

  const items      = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const startIndex = (page - 1) * LIMIT

  const pageButtons = (() => {
    const pages: number[] = []
    const start = Math.max(1, page - 2)
    const end   = Math.min(totalPages, start + 4)
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  })()

  function handleViewProfile(id: string) {
    if (onViewProfile) {
      onViewProfile(id)
    } else {
      navigate(`/militia/${id}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Danh sách Dân Quân Tự Vệ</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý thông tin toàn bộ dân quân tự vệ</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
        >
          <FileDown size={16} />
          {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Bộ lọc tìm kiếm</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tìm kiếm</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Tên hoặc mã DQTV..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label>
            <FilterSelect value={unitFilter} onChange={setUnitFilter} options={UNIT_OPTIONS} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải danh sách. {(error as Error)?.message ?? 'Vui lòng thử lại.'}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">STT</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Mã DQTV</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Họ và tên</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Đơn vị</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Điện thoại</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Trạng thái</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Thao tác</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton />
            ) : items.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-sm text-gray-500">
                    {debouncedQ || statusFilter || unitFilter
                      ? 'Không tìm thấy kết quả phù hợp với bộ lọc'
                      : 'Chưa có dữ liệu dân quân'}
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((militia, index) => {
                  const statusInfo = getStatusDisplay(militia.status)
                  return (
                    <tr key={militia.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-700">{startIndex + index + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-[#1F3A5F]">{militia.militiaCode ?? militia.id}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{militia.fullName}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{militia.unitCode}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{militia.phone ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{militia.email ?? '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewProfile(militia.id)}
                            className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Edit size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            )}
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-sm text-gray-700">
            {total > 0 ? (
              <>
                Hiển thị{' '}
                <span className="font-medium">{startIndex + 1}</span> đến{' '}
                <span className="font-medium">{Math.min(startIndex + LIMIT, total)}</span> trong tổng số{' '}
                <span className="font-medium">{total}</span> bản ghi
              </>
            ) : (
              'Không có bản ghi'
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Trước
            </button>
            {pageButtons.map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  page === p
                    ? 'bg-[#1F3A5F] text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

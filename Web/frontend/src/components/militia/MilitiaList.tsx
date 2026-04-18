// US-W003: Militia personnel list — server-side pagination + debounced search
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, FileDown, Eye, Edit, Filter } from 'lucide-react'
import { searchMilitia, type MilitiaListItem } from '@/api/militia'

// ─── Status display helpers ──────────────────────────────────────────────────

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  active:   { label: 'Đang hoạt động', className: 'bg-green-100 text-green-700' },
  reserve:  { label: 'Dự bị',          className: 'bg-yellow-100 text-yellow-700' },
  inactive: { label: 'Đã xuất ngũ',   className: 'bg-gray-100 text-gray-700' },
  leave:    { label: 'Nghỉ phép',      className: 'bg-blue-100 text-blue-700' },
}

function getStatusDisplay(status: string) {
  return STATUS_DISPLAY[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

// ─── Main component ──────────────────────────────────────────────────────────

interface MilitiaListProps {
  onViewProfile?: (id: string) => void
}

const LIMIT = 10

export function MilitiaList({ onViewProfile }: MilitiaListProps) {
  const [page, setPage]             = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce: reset to page 1 on new search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(searchInput)
      setPage(1)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['militia-list', debouncedQ, page],
    queryFn: () => searchMilitia({ q: debouncedQ || undefined, page, limit: LIMIT }),
    placeholderData: (prev) => prev,
  })

  const items      = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const startIndex = (page - 1) * LIMIT

  // Visible page buttons: show at most 5 pages around current
  const pageButtons = (() => {
    const pages: number[] = []
    const start = Math.max(1, page - 2)
    const end   = Math.min(totalPages, start + 4)
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Danh sách Dân Quân Tự Vệ</h1>
          <p className="text-sm text-gray-500 mt-1">Quản lý thông tin toàn bộ dân quân tự vệ</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
            <FileDown size={16} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Bộ lọc tìm kiếm</h3>
        </div>
        <div className="max-w-xl">
          <label className="block text-sm font-medium text-gray-700 mb-2">Tìm kiếm</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Nhập tên hoặc mã DQTV..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
            />
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Tổ / Khu phố</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Số điện thoại</th>
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
                    {debouncedQ
                      ? `Không tìm thấy kết quả cho "${debouncedQ}"`
                      : 'Chưa có dữ liệu dân quân'}
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((militia: MilitiaListItem, index: number) => {
                  const statusInfo = getStatusDisplay(militia.status)
                  return (
                    <tr key={militia.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-700">{startIndex + index + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-[#1F3A5F]">{militia.id}</td>
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
                            onClick={() => onViewProfile?.(militia.id)}
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

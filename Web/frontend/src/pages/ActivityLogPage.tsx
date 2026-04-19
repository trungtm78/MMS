import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import client from '@/api/client'

interface AuditLogEntry {
  id: string
  userId: string
  userFullName: string
  action: string
  resourceType: string
  resourceId: string | null
  details: string | null
  ipAddress: string | null
  createdAt: string
}

interface AuditLogResponse {
  data: AuditLogEntry[]
  total: number
  page: number
  limit: number
}

async function getAuditLogs(params: { page: number; limit: number; search?: string }): Promise<AuditLogResponse> {
  const res = await client.get('/audit-logs', { params })
  return res.data
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN:  'bg-purple-100 text-purple-700',
  LOGOUT: 'bg-gray-100 text-gray-700',
}

export function ActivityLogPage() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const LIMIT = 20

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn: () => getAuditLogs({ page, limit: LIMIT, search: search || undefined }),
    placeholderData: (prev) => prev,
  })

  const entries    = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="p-6 space-y-6" data-testid="activity-log-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Nhật Ký Hoạt Động</h1>
          <p className="text-sm text-gray-600 mt-1">Lịch sử toàn bộ thao tác trong hệ thống</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Tìm theo tên người dùng hoặc hành động..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
          data-testid="audit-search"
        />
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải nhật ký.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Đang tải...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Thời gian</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Người dùng</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Hành động</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Đối tượng</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Chi tiết</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                        <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                        Chưa có nhật ký
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => {
                      const actionColor = ACTION_COLORS[entry.action] ?? 'bg-gray-100 text-gray-700'
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-6 py-3 text-sm font-medium text-gray-900">{entry.userFullName}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionColor}`}>
                              {entry.action}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-700">{entry.resourceType}</td>
                          <td className="px-6 py-3 text-sm text-gray-600 max-w-xs truncate">{entry.details ?? '—'}</td>
                          <td className="px-6 py-3 text-xs text-gray-400 font-mono">{entry.ipAddress ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
              <p className="text-sm text-gray-600">Tổng <span className="font-medium">{total}</span> bản ghi</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-white">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-700">{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-white">
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

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, Search, ChevronLeft, ChevronRight,
  PlusCircle, Edit3, Trash2, LogIn, LogOut, Eye, Download,
} from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { downloadExcelReport } from '@/utils/export-utils'

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

// Icon per log type
const ACTION_ICONS: Record<string, React.ElementType> = {
  CREATE: PlusCircle,
  UPDATE: Edit3,
  DELETE: Trash2,
  LOGIN:  LogIn,
  LOGOUT: LogOut,
  VIEW:   Eye,
}

const ACTION_COLORS: Record<string, { badge: string; icon: string }> = {
  CREATE: { badge: 'bg-green-100 text-[#2E7D32]', icon: 'text-[#2E7D32]' },
  UPDATE: { badge: 'bg-blue-100 text-blue-700',   icon: 'text-blue-600' },
  DELETE: { badge: 'bg-red-100 text-[#C62828]',   icon: 'text-[#C62828]' },
  LOGIN:  { badge: 'bg-purple-100 text-purple-700', icon: 'text-purple-600' },
  LOGOUT: { badge: 'bg-gray-100 text-[#64748B]',  icon: 'text-[#64748B]' },
  VIEW:   { badge: 'bg-yellow-100 text-yellow-700', icon: 'text-yellow-600' },
}

export function ActivityLogPage() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo]     = useState('')
  const [exportAction, setExportAction] = useState('')
  const [isExporting, setIsExporting]   = useState(false)
  const { user } = useAuth()
  const isAdmin = user?.role === 'system_admin'
  const LIMIT = 20

  async function handleExport() {
    if (!exportFrom || !exportTo) {
      toast.error('Vui lòng chọn khoảng thời gian trước khi xuất')
      return
    }
    toast.warning('Nhật ký kiểm toán chứa thông tin nhạy cảm. Chỉ xuất khi có yêu cầu chính thức.')
    await downloadExcelReport(
      async () => {
        const res = await client.get('/audit/export', {
          params: {
            from: exportFrom,
            to: exportTo,
            action: exportAction || undefined,
            format: 'xlsx',
          },
          responseType: 'blob',
        })
        return res.data as Blob
      },
      `nhat-ky-kiem-toan-${exportFrom}-${exportTo}.xlsx`,
      () => setIsExporting(true),
      () => setIsExporting(false),
    ).catch((err) => {
      if (err?.response?.status === 400) {
        toast.error('Khoảng thời gian tối đa là 90 ngày. Vui lòng chọn lại.')
      } else {
        toast.error('Xuất nhật ký thất bại.')
      }
    })
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn: () => getAuditLogs({ page, limit: LIMIT, search: search || undefined }),
    placeholderData: (prev) => prev,
  })

  const entries    = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="activity-log-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Nhật Ký Hoạt Động</h1>
          <p className="text-sm text-[#64748B] mt-1">Lịch sử toàn bộ thao tác trong hệ thống</p>
        </div>
        {isAdmin && (
          <button
            onClick={handleExport}
            disabled={isExporting}
            data-testid="export-audit-btn"
            className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            {isExporting ? 'Đang xuất...' : 'Xuất nhật ký'}
          </button>
        )}
      </div>

      {/* Export filter (admin only) */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm font-medium text-[#0F172A] mb-3">Bộ lọc xuất nhật ký</p>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#64748B]">Từ:</label>
              <input
                type="date"
                value={exportFrom}
                onChange={e => setExportFrom(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                data-testid="export-from"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#64748B]">Đến:</label>
              <input
                type="date"
                value={exportTo}
                onChange={e => setExportTo(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                data-testid="export-to"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#64748B]">Hành động:</label>
              <select
                value={exportAction}
                onChange={e => setExportAction(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              >
                <option value="">Tất cả</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="VIEW">VIEW</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" size={18} />
            <input
              type="text"
              placeholder="Tìm theo tên người dùng hoặc hành động..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-[#1F3A5F] text-sm text-[#0F172A]"
              data-testid="audit-search"
            />
          </div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải nhật ký.
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[#64748B] text-sm">Đang tải...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Thời gian</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Người dùng</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Hành động</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Đối tượng</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Chi tiết</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#64748B]">
                        <FileText size={32} className="mx-auto mb-2 text-[#E2E8F0]" />
                        Chưa có nhật ký
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => {
                      const actionStyle = ACTION_COLORS[entry.action] ?? { badge: 'bg-gray-100 text-[#64748B]', icon: 'text-[#64748B]' }
                      const ActionIcon = ACTION_ICONS[entry.action] ?? FileText
                      return (
                        <tr key={entry.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-6 py-3 text-sm text-[#64748B] whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-6 py-3 text-sm font-medium text-[#0F172A]">{entry.userFullName}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1.5">
                              <ActionIcon size={13} className={actionStyle.icon} />
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionStyle.badge}`}>
                                {entry.action}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm text-[#64748B]">{entry.resourceType}</td>
                          <td className="px-6 py-3 text-sm text-[#64748B] max-w-xs truncate">{entry.details ?? '—'}</td>
                          <td className="px-6 py-3 text-xs text-[#64748B] font-mono">{entry.ipAddress ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]">Tổng <span className="font-medium text-[#0F172A]">{total}</span> bản ghi</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-[#0F172A] font-medium">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, Clock, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { listTasks } from '@/api/tasks'

const STATUS_TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ tiếp nhận' },
  { id: 'in_progress', label: 'Đang thực hiện' },
  { id: 'completed', label: 'Đã hoàn thành' },
  { id: 'overdue', label: 'Quá hạn' },
  { id: 'cancelled', label: 'Đã hủy' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:     { bg: '#F5F5F5', text: '#757575' },
  in_progress: { bg: '#E3F2FD', text: '#1976D2' },
  completed:   { bg: '#E8F5E9', text: '#2E7D32' },
  overdue:     { bg: '#FFEBEE', text: '#C62828' },
  cancelled:   { bg: '#FFF3E0', text: '#F57C00' },
}

const STATUS_LABELS: Record<string, string> = {
  pending:     'Chờ tiếp nhận',
  in_progress: 'Đang thực hiện',
  completed:   'Đã hoàn thành',
  overdue:     'Quá hạn',
  cancelled:   'Đã hủy',
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: '#FFEBEE', text: '#C62828' },
  high:   { bg: '#FFF3E0', text: '#F57C00' },
  medium: { bg: '#FFFDE7', text: '#FBC02D' },
  low:    { bg: '#F5F5F5', text: '#757575' },
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp',
}

export function TaskListPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', selectedStatus, page],
    queryFn: () => listTasks({
      status: selectedStatus === 'all' ? undefined : selectedStatus,
      page,
      limit: 20,
    }),
  })

  const tasks = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const filtered = tasks.filter(t =>
    !searchTerm || t.title.toLowerCase().includes(searchTerm.toLowerCase()) || t.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status)
    setPage(1)
  }

  return (
    <div className="p-6 space-y-6" data-testid="task-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#0F172A]">Danh Sách Nhiệm Vụ</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý và theo dõi tất cả nhiệm vụ đã giao</p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-1 flex items-center gap-1 overflow-x-auto" data-testid="status-tabs">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleStatusChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              selectedStatus === tab.id ? 'bg-[#1F3A5F] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
            data-testid={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            placeholder="Tìm theo mã nhiệm vụ, tiêu đề..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-10 pr-4 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            data-testid="task-search-input"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="task-table">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-[#1F3A5F] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Mã NV</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Tiêu đề</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">DQTV</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Ưu tiên</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Deadline</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <CheckSquare size={32} className="text-[#E2E8F0] mx-auto mb-2" />
                        <p className="text-sm text-[#94A3B8]">Chưa có nhiệm vụ</p>
                      </td>
                    </tr>
                  ) : filtered.map(task => {
                    const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending
                    const priorityColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low
                    return (
                      <tr key={task.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors" data-testid={`task-row-${task.id}`}>
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono text-[#1F3A5F] font-medium">{task.code}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-[#0F172A] max-w-xs truncate">{task.title}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-[#0F172A]">{task.assigneeName ?? '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full" style={{ backgroundColor: priorityColor.bg, color: priorityColor.text }}>
                            {PRIORITY_LABELS[task.priority] ?? task.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Clock size={14} className={task.status === 'overdue' ? 'text-[#C62828]' : 'text-[#64748B]'} />
                            <span className={`text-sm ${task.status === 'overdue' ? 'text-[#C62828] font-semibold' : 'text-[#0F172A]'}`}>
                              {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1.5 text-xs font-semibold rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: statusColor.bg, color: statusColor.text }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor.text }}></span>
                            {STATUS_LABELS[task.status] ?? task.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0]">
              <p className="text-sm text-[#64748B]">
                Tổng <span className="font-semibold text-[#0F172A]">{total}</span> nhiệm vụ
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-[#F8FAFC]" data-testid="prev-page">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-700">{page} / {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-[#F8FAFC]" data-testid="next-page">
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

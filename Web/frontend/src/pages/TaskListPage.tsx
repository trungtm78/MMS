import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Clock, Search, ChevronLeft, ChevronRight, Pencil, XCircle } from 'lucide-react'
import { listTasks, tasksApi } from '@/api/tasks'
import type { TaskItem } from '@/api/tasks'

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

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp',
}

export function TaskListPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')

  // Edit modal state
  const [editTask, setEditTask] = useState<TaskItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editDeadline, setEditDeadline] = useState('')

  // Cancel modal state
  const [cancelTask, setCancelTask] = useState<TaskItem | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', selectedStatus, page],
    queryFn: () => listTasks({
      status: selectedStatus === 'all' ? undefined : selectedStatus,
      page,
      limit: 20,
    }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { title?: string; priority?: string; deadline?: string } }) =>
      tasksApi.update(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setEditTask(null)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      tasksApi.cancel(id, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setCancelTask(null)
      setCancelReason('')
    },
  })

  const openEdit = (task: TaskItem) => {
    setEditTask(task)
    setEditTitle(task.title)
    setEditPriority(task.priority)
    setEditDeadline(task.deadline ? task.deadline.slice(0, 10) : '')
  }

  const handleEdit = () => {
    if (!editTask) return
    const payload: { title?: string; priority?: string; deadline?: string } = {}
    if (editTitle !== editTask.title) payload.title = editTitle
    if (editPriority !== editTask.priority) payload.priority = editPriority
    if (editDeadline !== (editTask.deadline ? editTask.deadline.slice(0, 10) : '')) payload.deadline = editDeadline || undefined
    if (Object.keys(payload).length === 0) { setEditTask(null); return }
    updateMutation.mutate({ id: editTask.id, payload })
  }

  const handleCancel = () => {
    if (!cancelTask || !cancelReason.trim()) return
    cancelMutation.mutate({ id: cancelTask.id, reason: cancelReason.trim() })
  }

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

  const getPriorityClass = (priority: string) => {
    if (priority === 'urgent') return 'bg-[#FFEBEE] text-[#C62828]'
    if (priority === 'high')   return 'bg-[#FFF3E0] text-[#F57C00]'
    if (priority === 'medium') return 'bg-[#FFFDE7] text-[#FBC02D]'
    return 'bg-[#F5F5F5] text-[#757575]'
  }

  const canEdit = (status: string) => status === 'pending' || status === 'assigned'
  const canCancel = (status: string) => !['completed', 'cancelled'].includes(status)

  return (
    <div className="p-6 space-y-6" data-testid="task-list-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Danh Sách Nhiệm Vụ</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý và theo dõi tất cả nhiệm vụ đã giao</p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="status-tabs">
        <div className="flex items-center overflow-x-auto border-b border-[#E2E8F0]">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleStatusChange(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all relative ${
                selectedStatus === tab.id
                  ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                  : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
            className="w-full h-10 pl-10 pr-4 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]"
            data-testid="task-search-input"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="task-table">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Mã NV</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Tiêu đề</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">DQTV</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Ưu tiên</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Deadline</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Trạng thái</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <CheckSquare size={32} className="text-[#E2E8F0] mx-auto mb-2" />
                        <p className="text-sm text-[#94A3B8]">Chưa có nhiệm vụ</p>
                      </td>
                    </tr>
                  ) : filtered.map(task => {
                    const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending
                    return (
                      <tr key={task.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors" data-testid={`task-row-${task.id}`}>
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono text-[#C62828] font-medium">{task.code}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-[#0F172A] max-w-xs truncate">{task.title}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-[#0F172A]">{task.assigneeName ?? '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${getPriorityClass(task.priority)}`}>
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
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {canEdit(task.status) && (
                              <button
                                onClick={() => openEdit(task)}
                                className="p-1.5 rounded-lg text-[#1976D2] hover:bg-[#E3F2FD] transition-colors"
                                title="Chỉnh sửa"
                                data-testid={`edit-task-${task.id}`}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {canCancel(task.status) && (
                              <button
                                onClick={() => { setCancelTask(task); setCancelReason('') }}
                                className="p-1.5 rounded-lg text-[#C62828] hover:bg-[#FFEBEE] transition-colors"
                                title="Hủy nhiệm vụ"
                                data-testid={`cancel-task-${task.id}`}
                              >
                                <XCircle size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]">
                Tổng <span className="font-semibold text-[#0F172A]">{total}</span> nhiệm vụ
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-white hover:border-[#C62828] transition-colors"
                  data-testid="prev-page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-[#0F172A] min-w-[80px] text-center">
                  {page} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:bg-white hover:border-[#C62828] transition-colors"
                  data-testid="next-page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {/* Edit Task Modal */}
      {editTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" data-testid="edit-task-modal">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Chỉnh sửa nhiệm vụ</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">Tiêu đề</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">Ưu tiên</label>
                <select
                  value={editPriority}
                  onChange={e => setEditPriority(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
                >
                  <option value="urgent">Khẩn cấp</option>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">Deadline</label>
                <input
                  type="date"
                  value={editDeadline}
                  onChange={e => setEditDeadline(e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditTask(null)}
                className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]"
              >Hủy</button>
              <button
                onClick={handleEdit}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-[#C62828] text-white hover:bg-[#B71C1C] disabled:opacity-50"
              >{updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Task Modal */}
      {cancelTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" data-testid="cancel-task-modal">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0F172A]">Hủy nhiệm vụ</h2>
            <p className="text-sm text-[#64748B]">
              Bạn sắp hủy nhiệm vụ <span className="font-semibold text-[#0F172A]">{cancelTask.title}</span>. Hành động này không thể hoàn tác.
            </p>
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1">Lý do hủy <span className="text-[#C62828]">*</span></label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Nhập lý do hủy nhiệm vụ..."
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setCancelTask(null); setCancelReason('') }}
                className="px-4 py-2 text-sm rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]"
              >Đóng</button>
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending || !cancelReason.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-[#C62828] text-white hover:bg-[#B71C1C] disabled:opacity-50"
              >{cancelMutation.isPending ? 'Đang hủy...' : 'Xác nhận hủy'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

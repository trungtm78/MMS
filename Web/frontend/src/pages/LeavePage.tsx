import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { CalendarOff, Plus, CheckCircle, XCircle, X } from 'lucide-react'
import { toast } from 'sonner'

interface LeaveRequest {
  id: string
  type: string
  startDate: string
  endDate: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: string
  applicantName?: string
}

const LEAVE_TYPES = [
  { value: 'phep_nam', label: 'Phép năm' },
  { value: 'nghi_benh', label: 'Nghỉ bệnh' },
  { value: 'nghi_thai_san', label: 'Nghỉ thai sản' },
  { value: 'nghi_viec_rieng', label: 'Nghỉ việc riêng' },
  { value: 'nghi_khong_luong', label: 'Nghỉ không lương' },
  { value: 'nghi_phep_dac_biet', label: 'Phép đặc biệt' },
]

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-[#2E7D32]',
  rejected: 'bg-red-100 text-[#C62828]',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function LeaveFormModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ type: '', startDate: '', endDate: '', reason: '' })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => client.post('/leave/requests', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('Tạo đơn nghỉ phép thành công')
      queryClient.invalidateQueries({ queryKey: ['leave-my'] })
      onClose()
    },
    onError: () => toast.error('Không thể tạo đơn nghỉ phép'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.type) return toast.error('Vui lòng chọn loại nghỉ')
    if (!form.startDate || !form.endDate) return toast.error('Vui lòng chọn ngày')
    if (form.startDate > form.endDate) return toast.error('Ngày bắt đầu phải trước ngày kết thúc')
    if (!form.reason.trim()) return toast.error('Vui lòng nhập lý do')
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">Tạo đơn nghỉ phép</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">
              Loại nghỉ <span className="text-[#C62828]">*</span>
            </label>
            <select
              data-testid="leave-type-select"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 focus:border-[#C62828]"
            >
              <option value="">-- Chọn loại nghỉ --</option>
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">
                Ngày bắt đầu <span className="text-[#C62828]">*</span>
              </label>
              <input
                type="date"
                data-testid="leave-start-date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 focus:border-[#C62828]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">
                Ngày kết thúc <span className="text-[#C62828]">*</span>
              </label>
              <input
                type="date"
                data-testid="leave-end-date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 focus:border-[#C62828]"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">
              Lý do <span className="text-[#C62828]">*</span>
            </label>
            <textarea
              data-testid="leave-reason"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Nêu lý do nghỉ phép..."
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 focus:border-[#C62828] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="leave-submit-btn"
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? 'Đang gửi...' : 'Gửi đơn'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MyLeavesTab() {
  const [showModal, setShowModal] = useState(false)
  const queryClient = useQueryClient()

  const { data: leaves = [], isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ['leave-my'],
    queryFn: () => client.get('/leave/my').then((r) => r.data),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => client.patch(`/leave/${id}/cancel`),
    onSuccess: () => {
      toast.success('Đã hủy đơn xin nghỉ')
      queryClient.invalidateQueries({ queryKey: ['leave-my'] })
    },
    onError: () => toast.error('Không thể hủy đơn nghỉ phép'),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          data-testid="create-leave-btn"
          className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          Tạo đơn
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : leaves.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <CalendarOff size={40} className="mx-auto mb-3 text-[#64748B]" />
          <p className="text-[#64748B]">Bạn chưa có đơn nghỉ phép nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const typeLabel = LEAVE_TYPES.find((t) => t.value === leave.type)?.label ?? leave.type
            return (
              <div key={leave.id} className="bg-white rounded-xl border border-[#E2E8F0] p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                    <CalendarOff size={20} className="text-[#C62828]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{typeLabel}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                    </p>
                    {leave.reason && (
                      <p className="text-xs text-[#64748B] mt-0.5 max-w-md truncate">{leave.reason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {leave.status === 'pending' && (
                    <button
                      onClick={() => cancelMutation.mutate(leave.id)}
                      disabled={cancelMutation.isPending}
                      data-testid={`cancel-leave-btn-${leave.id}`}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-red-50 hover:text-[#C62828] hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      <X size={12} />
                      Hủy đơn
                    </button>
                  )}
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[leave.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {STATUS_LABEL[leave.status] ?? leave.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showModal && <LeaveFormModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

function ApproveTab() {
  const queryClient = useQueryClient()

  const { data: requests = [], isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ['leave-pending'],
    queryFn: () => client.get('/leave/requests', { params: { status: 'pending' } }).then((r) => r.data),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      client.patch(`/leave/requests/${id}/status`, { status }).then((r) => r.data),
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'approved' ? 'Đã duyệt đơn' : 'Đã từ chối đơn')
      queryClient.invalidateQueries({ queryKey: ['leave-pending'] })
    },
    onError: () => toast.error('Không thể cập nhật trạng thái'),
  })

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-[#2E7D32]" />
          <p className="text-[#64748B]">Không có đơn nào chờ duyệt</p>
        </div>
      ) : (
        requests.map((req) => {
          const typeLabel = LEAVE_TYPES.find((t) => t.value === req.type)?.label ?? req.type
          const initials = req.applicantName
            ? req.applicantName.split(' ').filter(Boolean).slice(-1)[0]?.[0] ?? '?'
            : '?'
          return (
            <div key={req.id} className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-yellow-50 rounded-full flex items-center justify-center text-[#0F172A] text-sm font-bold border border-yellow-200">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{req.applicantName ?? 'Không rõ'}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      {typeLabel} · {formatDate(req.startDate)} – {formatDate(req.endDate)}
                    </p>
                    {req.reason && (
                      <p className="text-xs text-[#64748B] mt-1 max-w-lg">{req.reason}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => statusMutation.mutate({ id: req.id, status: 'approved' })}
                    disabled={statusMutation.isPending}
                    data-testid={`approve-btn-${req.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2E7D32] bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={14} />
                    Duyệt
                  </button>
                  <button
                    onClick={() => statusMutation.mutate({ id: req.id, status: 'rejected' })}
                    disabled={statusMutation.isPending}
                    data-testid={`reject-btn-${req.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#C62828] bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    Từ chối
                  </button>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

export function LeavePage() {
  const { can } = useRbac()
  const [activeTab, setActiveTab] = useState<'my' | 'approve'>(can.manageAttendance ? 'approve' : 'my')

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="leave-page">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <CalendarOff size={24} className="text-[#C62828]" />
            Quản lý nghỉ phép
          </h1>
          <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Ban chỉ huy ANTT</p>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
          <button
            onClick={() => setActiveTab('my')}
            data-testid="tab-my-leaves"
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'my' ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          >
            Đơn của tôi
          </button>
          {can.manageAttendance && (
            <button
              onClick={() => setActiveTab('approve')}
              data-testid="tab-approve"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'approve' ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              Duyệt đơn
            </button>
          )}
        </div>

        {activeTab === 'my' ? <MyLeavesTab /> : <ApproveTab />}
      </div>
    </div>
  )
}

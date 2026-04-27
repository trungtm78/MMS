import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, Clock, FileText, Calendar, User } from 'lucide-react'
import { toast } from 'sonner'
import client from '@/api/client'

type ApprovalType = 'leave' | 'task'
type ApprovalStatus = 'pending' | 'approved' | 'rejected'

interface Approval {
  id: string
  type: ApprovalType
  submittedBy: string
  title: string
  description: string
  submittedAt: string
  status: ApprovalStatus
}

async function getApprovals(status: ApprovalStatus | 'all'): Promise<Approval[]> {
  const params = status !== 'all' ? { status } : {}
  const res = await client.get('/approvals', { params })
  return res.data
}
async function processApproval(id: string, action: 'approve' | 'reject'): Promise<void> {
  await client.put(`/approvals/${id}/${action}`)
}

const TABS: { id: ApprovalStatus | 'all'; label: string }[] = [
  { id: 'all',      label: 'Tất cả' },
  { id: 'pending',  label: 'Chờ duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'rejected', label: 'Từ chối' },
]

const STATUS_DISPLAY: Record<ApprovalStatus, { label: string; className: string; icon: React.ElementType }> = {
  pending:  { label: 'Chờ duyệt', className: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: 'Đã duyệt',  className: 'bg-green-100 text-[#2E7D32]',  icon: CheckCircle },
  rejected: { label: 'Từ chối',   className: 'bg-red-100 text-[#C62828]',     icon: XCircle },
}

export function ApprovalsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<ApprovalStatus | 'all'>('pending')

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['approvals', activeTab],
    queryFn: () => getApprovals(activeTab),
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      processApproval(id, action),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      toast.success(action === 'approve' ? 'Đã phê duyệt' : 'Đã từ chối')
    },
    onError: () => toast.error('Thao tác thất bại'),
  })

  return (
    <div className="p-6 space-y-6" data-testid="approvals-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Phê Duyệt</h1>
          <p className="text-sm text-[#64748B] mt-1">Xét duyệt đơn nghỉ phép và nhiệm vụ</p>
        </div>
        {data.filter(d => d.status === 'pending').length > 0 && (
          <span className="px-3 py-2 bg-[#FFEBEE] text-[#C62828] rounded-lg text-sm font-semibold border border-red-100">
            {data.filter(d => d.status === 'pending').length} đơn chờ duyệt
          </span>
        )}
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between" data-testid="error-banner">
          <div className="flex items-center gap-3">
            <XCircle size={18} className="text-[#C62828] flex-shrink-0" />
            <p className="text-sm text-[#C62828]">Không thể tải danh sách phê duyệt.</p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-sm text-[#C62828] font-medium underline ml-4 hover:no-underline"
            data-testid="retry-btn"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        <div className="flex border-b border-[#E2E8F0]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all relative ${
                activeTab === tab.id
                  ? 'text-[#C62828] border-b-2 border-[#C62828] -mb-px'
                  : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-[#64748B] mt-3">Đang tải...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] py-16 text-center">
          <FileText size={36} className="mx-auto mb-3 text-[#CBD5E1]" />
          <p className="text-sm text-[#64748B]">Không có yêu cầu nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item) => {
            const statusInfo = STATUS_DISPLAY[item.status]
            const StatusIcon = statusInfo.icon
            const typeIcon = item.type === 'leave'
              ? <Calendar size={20} className="text-[#1976D2]" />
              : <FileText size={20} className="text-[#2E7D32]" />

            return (
              <div
                key={item.id}
                data-testid={`approval-${item.id}`}
                className="bg-white rounded-xl border border-[#E2E8F0] p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Type icon */}
                    <div className="w-11 h-11 bg-[#F8FAFC] rounded-lg flex items-center justify-center flex-shrink-0 border border-[#E2E8F0]">
                      {typeIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusInfo.className}`}>
                          <StatusIcon size={12} />
                          {statusInfo.label}
                        </span>
                        <span className="text-xs text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-full font-medium">
                          {item.type === 'leave' ? 'Nghỉ phép' : 'Nhiệm vụ'}
                        </span>
                      </div>
                      {/* Title */}
                      <p className="text-sm font-semibold text-[#0F172A] mb-1">{item.title}</p>
                      {/* Meta */}
                      <div className="flex items-center gap-4 text-xs text-[#64748B]">
                        <div className="flex items-center gap-1.5">
                          <User size={13} />
                          <span className="font-medium text-[#0F172A]">{item.submittedBy}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} />
                          <span>{new Date(item.submittedAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                      {/* Description */}
                      {item.description && (
                        <p className="text-sm text-[#64748B] mt-2 line-clamp-2">{item.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {item.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => mutation.mutate({ id: item.id, action: 'approve' })}
                        disabled={mutation.isPending}
                        className="px-4 py-2 bg-[#2E7D32] text-white text-xs font-semibold rounded-lg hover:bg-[#1B5E20] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                        data-testid={`approve-${item.id}`}
                      >
                        <CheckCircle size={14} />
                        Duyệt
                      </button>
                      <button
                        onClick={() => mutation.mutate({ id: item.id, action: 'reject' })}
                        disabled={mutation.isPending}
                        className="px-4 py-2 bg-[#C62828] text-white text-xs font-semibold rounded-lg hover:bg-[#A91D1D] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                        data-testid={`reject-${item.id}`}
                      >
                        <XCircle size={14} />
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

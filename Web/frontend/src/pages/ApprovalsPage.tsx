import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
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
  approved: { label: 'Đã duyệt',  className: 'bg-green-100 text-green-700',  icon: CheckCircle },
  rejected: { label: 'Từ chối',   className: 'bg-red-100 text-red-700',     icon: XCircle },
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
      <div>
        <h1 className="text-2xl font-bold text-[#1F3A5F]">Phê Duyệt</h1>
        <p className="text-sm text-gray-600 mt-1">Xét duyệt đơn nghỉ phép và nhiệm vụ</p>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between" data-testid="error-banner">
          <p className="text-sm text-red-700">Không thể tải danh sách phê duyệt. Thử lại</p>
          <button
            onClick={() => refetch()}
            className="text-sm text-red-700 underline ml-4 hover:no-underline"
            data-testid="retry-btn"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200 p-1 flex gap-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id ? 'bg-[#1F3A5F] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Đang tải...</div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 text-center text-sm text-gray-500">
          <FileText size={32} className="mx-auto mb-2 text-gray-300" />
          Không có yêu cầu nào
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item) => {
            const statusInfo = STATUS_DISPLAY[item.status]
            const StatusIcon = statusInfo.icon
            return (
              <div
                key={item.id}
                data-testid={`approval-${item.id}`}
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                        <StatusIcon size={12} />
                        {statusInfo.label}
                      </span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        {item.type === 'leave' ? 'Nghỉ phép' : 'Nhiệm vụ'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Từ: <span className="font-medium">{item.submittedBy}</span> &bull;{' '}
                      {new Date(item.submittedAt).toLocaleDateString('vi-VN')}
                    </p>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  {item.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => mutation.mutate({ id: item.id, action: 'approve' })}
                        disabled={mutation.isPending}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                        data-testid={`approve-${item.id}`}
                      >
                        <CheckCircle size={13} />
                        Duyệt
                      </button>
                      <button
                        onClick={() => mutation.mutate({ id: item.id, action: 'reject' })}
                        disabled={mutation.isPending}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                        data-testid={`reject-${item.id}`}
                      >
                        <XCircle size={13} />
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

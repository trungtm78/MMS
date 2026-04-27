import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '@/api/client'
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface SosAlert {
  id: string
  reportedBy: string
  reportedByName: string
  location: string
  description?: string
  createdAt: string
  resolvedAt?: string | null
  status: 'active' | 'resolved'
}

function formatTimestamp(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} giờ trước`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function SOSPage() {
  const queryClient = useQueryClient()

  const { data: alerts = [], isLoading } = useQuery<SosAlert[]>({
    queryKey: ['sos-alerts'],
    queryFn: () => client.get('/sos/alerts').then((r) => r.data),
    refetchInterval: 10000,
  })

  const resolveMutation = useMutation({
    mutationFn: (id: string) => client.patch(`/sos/${id}/resolve`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã xử lý cảnh báo SOS')
      queryClient.invalidateQueries({ queryKey: ['sos-alerts'] })
    },
    onError: () => toast.error('Không thể xử lý cảnh báo'),
  })

  const activeAlerts = alerts.filter((a) => a.status === 'active')

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="sos-page">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <AlertTriangle size={24} className="text-[#C62828]" />
              Cảnh báo SOS
            </h1>
            <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Hệ thống cảnh báo khẩn cấp</p>
          </div>
          {activeAlerts.length > 0 && (
            <div className="flex items-center gap-2 bg-[#C62828] text-white px-4 py-2 rounded-xl">
              <AlertTriangle size={16} />
              <span className="text-sm font-semibold">{activeAlerts.length} cảnh báo đang hoạt động</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Đang hoạt động</p>
            <p className="text-3xl font-bold text-[#C62828]">{activeAlerts.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Đã xử lý</p>
            <p className="text-3xl font-bold text-[#2E7D32]">{alerts.filter((a) => a.status === 'resolved').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Tổng</p>
            <p className="text-3xl font-bold text-[#0F172A]">{alerts.length}</p>
          </div>
        </div>

        {/* Alert List */}
        <div className="space-y-3">
          {isLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-6 animate-pulse flex gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </>
          ) : alerts.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-16 text-center">
              <Shield size={48} className="mx-auto mb-4 text-[#2E7D32]" />
              <p className="text-[#0F172A] font-semibold">Không có cảnh báo nào</p>
              <p className="text-sm text-[#64748B] mt-1">Hệ thống đang hoạt động bình thường</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`bg-white rounded-xl border p-5 flex items-center justify-between gap-4 transition-all ${
                  alert.status === 'active'
                    ? 'border-[#C62828]/30 shadow-sm shadow-red-50'
                    : 'border-[#E2E8F0]'
                }`}
                data-testid={`sos-alert-${alert.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#C62828] rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {initials(alert.reportedByName)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#0F172A]">{alert.reportedByName}</p>
                      {alert.status === 'active' && (
                        <span className="w-2 h-2 bg-[#C62828] rounded-full animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5">{alert.location}</p>
                    {alert.description && (
                      <p className="text-xs text-[#0F172A] mt-1">{alert.description}</p>
                    )}
                    <p className="text-xs text-[#64748B] mt-1">{formatTimestamp(alert.createdAt)}</p>
                  </div>
                </div>
                {alert.status === 'active' ? (
                  <button
                    onClick={() => resolveMutation.mutate(alert.id)}
                    disabled={resolveMutation.isPending}
                    data-testid={`resolve-sos-${alert.id}`}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1B5E20] rounded-lg transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={14} />
                    Đã xử lý
                  </button>
                ) : (
                  <span className="shrink-0 px-3 py-1 text-xs font-semibold text-[#2E7D32] bg-green-100 rounded-full">
                    Đã xử lý
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { Monitor, Smartphone, Tablet, X, Shield } from 'lucide-react'
import { toast } from 'sonner'

interface DeviceSession {
  id: string
  userId: string
  userName: string
  deviceName: string
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  lastActive: string
  ip: string
  status: 'active' | 'expired'
  isCurrent: boolean
}

function formatDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} giờ trước`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function DeviceIcon({ type }: { type: DeviceSession['deviceType'] }) {
  if (type === 'mobile') return <Smartphone size={16} className="text-[#64748B]" />
  if (type === 'tablet') return <Tablet size={16} className="text-[#64748B]" />
  return <Monitor size={16} className="text-[#64748B]" />
}

function SkeletonRow() {
  return (
    <tr className="border-b border-[#F1F5F9]">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-4 bg-gray-200 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

interface RevokeDialogProps {
  session: DeviceSession
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function RevokeDialog({ session, onConfirm, onCancel, isLoading }: RevokeDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-md shadow-xl p-6">
        <h2 className="text-lg font-semibold text-[#0F172A] mb-2">Xác nhận thu hồi?</h2>
        <p className="text-sm text-[#64748B] mb-1">
          Thiết bị: <span className="font-medium text-[#0F172A]">{session.deviceName}</span>
        </p>
        <p className="text-sm text-[#64748B] mb-6">
          Người dùng: <span className="font-medium text-[#0F172A]">{session.userName}</span>
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="confirm-revoke-btn"
            className="px-4 py-2 text-sm font-medium text-white bg-[#C62828] hover:bg-[#A91D1D] rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Đang thu hồi...' : 'Xác nhận thu hồi'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeviceSessionsPage() {
  const { can } = useRbac()
  const queryClient = useQueryClient()
  const [confirmSession, setConfirmSession] = useState<DeviceSession | null>(null)

  if (!can.manageDevices) return <Navigate to="/forbidden" replace />

  const { data: sessions = [], isLoading } = useQuery<DeviceSession[]>({
    queryKey: ['device-sessions'],
    queryFn: () => client.get('/devices/sessions').then((r) => r.data),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/devices/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã thu hồi phiên thiết bị')
      queryClient.invalidateQueries({ queryKey: ['device-sessions'] })
      setConfirmSession(null)
    },
    onError: () => toast.error('Không thể thu hồi phiên'),
  })

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="device-sessions-page">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <Shield size={24} className="text-[#C62828]" />
            Quản lý thiết bị & Phiên đăng nhập
          </h1>
          <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Kiểm soát truy cập thiết bị</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">Người dùng</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">Thiết bị</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">Hoạt động gần nhất</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">IP</th>
                  <th className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide">Trạng thái</th>
                  <th className="px-5 py-4 text-center text-xs font-semibold text-[#64748B] uppercase tracking-wide">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-[#64748B] text-sm">
                      Không có phiên nào
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr
                      key={session.id}
                      data-testid={`session-row-${session.id}`}
                      className={`border-b border-[#F1F5F9] transition-colors ${
                        session.isCurrent ? 'bg-blue-50/30' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-[#0F172A]">{session.userName}</p>
                        <p className="text-xs text-[#64748B]">{session.userId}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <DeviceIcon type={session.deviceType} />
                          <span className="text-sm text-[#0F172A]">{session.deviceName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{formatDate(session.lastActive)}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B] font-mono">{session.ip}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                              session.status === 'active'
                                ? 'bg-green-100 text-[#2E7D32]'
                                : 'bg-gray-100 text-[#64748B]'
                            }`}
                          >
                            {session.status === 'active' ? 'Hoạt động' : 'Hết hạn'}
                          </span>
                          {session.isCurrent && (
                            <span
                              data-testid={`current-session-badge-${session.id}`}
                              className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700"
                            >
                              Phiên hiện tại
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {session.isCurrent ? (
                          <span className="text-xs text-[#64748B] italic">—</span>
                        ) : (
                          <button
                            onClick={() => setConfirmSession(session)}
                            data-testid={`revoke-btn-${session.id}`}
                            className="flex items-center gap-1.5 mx-auto px-3 py-1.5 text-xs font-medium text-[#C62828] bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                          >
                            <X size={12} />
                            Thu hồi
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {confirmSession && (
        <RevokeDialog
          session={confirmSession}
          onConfirm={() => revokeMutation.mutate(confirmSession.id)}
          onCancel={() => setConfirmSession(null)}
          isLoading={revokeMutation.isPending}
        />
      )}
    </div>
  )
}

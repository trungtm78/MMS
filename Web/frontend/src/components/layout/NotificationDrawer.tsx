import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Bell, ChevronRight, Info, AlertTriangle, CheckCircle, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import client from '@/api/client'
import { toast } from 'sonner'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  createdAt: string
}

interface NotificationDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  sos:        <AlertTriangle size={14} className="text-[#C62828]" />,
  task:       <CheckCircle size={14} className="text-[#2E7D32]" />,
  message:    <MessageCircle size={14} className="text-[#1F3A5F]" />,
  info:       <Info size={14} className="text-[#64748B]" />,
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications-drawer'],
    queryFn: () =>
      client.get('/notifications', { params: { limit: 10 } })
        .then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? [])),
    enabled: isOpen,
    staleTime: 30_000,
  })

  const markAllMutation = useMutation({
    mutationFn: () => client.patch('/notifications/read-all'),
    onSuccess: () => {
      toast.success('Đã đánh dấu tất cả đã đọc')
      queryClient.invalidateQueries({ queryKey: ['notifications-drawer'] })
    },
    onError: () => toast.error('Không thể cập nhật'),
  })

  if (!isOpen) return null

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-20 w-80 h-[calc(100vh-5rem)] bg-white shadow-xl border-l border-[#E2E8F0] z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#C62828]" />
            <h2 className="font-semibold text-[#0F172A] text-sm">Thông báo</h2>
            {unreadCount > 0 && (
              <span className="bg-[#C62828] text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="text-xs text-[#1F3A5F] hover:text-[#162d4a] font-medium disabled:opacity-50"
              >
                Đọc tất cả
              </button>
            )}
            <button onClick={onClose} aria-label="Đóng thông báo">
              <X size={18} className="text-[#64748B] hover:text-[#0F172A]" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell size={32} className="mx-auto mb-2 text-[#E2E8F0]" />
              <p className="text-sm text-[#64748B]">Bạn không có thông báo nào</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/40' : ''}`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    {TYPE_ICONS[n.type] ?? <Info size={14} className="text-[#64748B]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium text-[#0F172A] leading-tight line-clamp-1">{n.title}</p>
                      {!n.isRead && <span className="w-2 h-2 bg-[#C62828] rounded-full shrink-0 mt-1" />}
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      {new Date(n.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#E2E8F0] p-3">
          <button
            onClick={() => { navigate('/notifications'); onClose() }}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-[#1F3A5F] hover:text-[#162d4a] font-medium py-2 rounded-lg hover:bg-[#F8FAFC] transition-colors"
          >
            Xem tất cả thông báo
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '@/api/client'
import { Bell, BellOff, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'

interface Notification {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: string
  type?: string
}

type FilterType = 'all' | 'unread' | 'read'

const FILTER_TABS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unread', label: 'Chưa đọc' },
  { id: 'read', label: 'Đã đọc' },
]

function formatTimestamp(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} giờ trước`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} ngày trước`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function NotificationSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse flex gap-4">
      <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
  )
}

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterType>('all')

  const queryParam = filter === 'all' ? undefined : filter === 'unread' ? false : true

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', filter],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (queryParam !== undefined) params.read = String(queryParam)
      return client.get('/notifications', { params }).then((r) => r.data)
    },
  })

  const readMutation = useMutation({
    mutationFn: (id: string) => client.patch(`/notifications/${id}/read`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: () => toast.error('Không thể đánh dấu đã đọc'),
  })

  const readAllMutation = useMutation({
    mutationFn: () => client.post('/notifications/read-all').then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã đánh dấu tất cả là đã đọc')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: () => toast.error('Không thể cập nhật'),
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="notifications-page">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <Bell size={24} className="text-[#C62828]" />
              Thông báo
              {unreadCount > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs font-bold bg-[#C62828] text-white rounded-full">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – ANTT</p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
              data-testid="mark-all-read-btn"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
            >
              <CheckCheck size={16} />
              Đánh dấu tất cả đã đọc
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              data-testid={`notif-filter-${tab.id}`}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.id ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {isLoading ? (
            <>
              <NotificationSkeleton />
              <NotificationSkeleton />
              <NotificationSkeleton />
              <NotificationSkeleton />
            </>
          ) : notifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-16 text-center">
              <BellOff size={40} className="mx-auto mb-3 text-[#64748B]" />
              <p className="text-[#0F172A] font-semibold">Không có thông báo</p>
              <p className="text-sm text-[#64748B] mt-1">
                {filter === 'unread' ? 'Bạn đã đọc tất cả thông báo' : 'Chưa có thông báo nào'}
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => !notif.read && readMutation.mutate(notif.id)}
                data-testid={`notification-${notif.id}`}
                className={`bg-white rounded-xl border p-5 flex items-start gap-4 cursor-pointer transition-all hover:shadow-sm ${
                  notif.read ? 'border-[#E2E8F0]' : 'border-blue-200 bg-blue-50/30'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 bg-[#C62828]/10 rounded-full flex items-center justify-center">
                    <Bell size={18} className="text-[#C62828]" />
                  </div>
                  {!notif.read && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${notif.read ? 'text-[#0F172A]' : 'font-semibold text-[#0F172A]'}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-[#64748B] mt-0.5 line-clamp-2">{notif.body}</p>
                  )}
                  <p className="text-xs text-[#64748B] mt-1">{formatTimestamp(notif.createdAt)}</p>
                </div>
                {!notif.read && (
                  <span className="shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

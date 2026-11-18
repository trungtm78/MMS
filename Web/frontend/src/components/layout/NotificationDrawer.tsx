import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Bell, ChevronRight, Info, AlertTriangle, CheckCircle, MessageCircle, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  notificationKeys,
  notificationsApi,
  type AppNotification,
  type NotificationQuery,
} from '@/api/notifications'
import { describeApiError } from '@/lib/api-error'

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

// The drawer shows the latest page only
const DRAWER_QUERY: NotificationQuery = { page: 1, limit: 10 }

function DrawerItemContent({ n }: { n: AppNotification }) {
  const { t } = useTranslation()
  return (
    <span className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {TYPE_ICONS[n.type] ?? <Info size={14} className="text-[#64748B]" />}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="flex items-start justify-between gap-1">
          <span className="text-sm font-medium text-[#0F172A] leading-tight line-clamp-1">{n.title}</span>
          {!n.isRead && (
            <>
              <span className="sr-only">{t('notifications.drawer.item.unread')}</span>
              <span className="w-2 h-2 bg-[#C62828] rounded-full shrink-0 mt-1" aria-hidden="true" />
            </>
          )}
        </span>
        {n.body && <span className="block text-xs text-[#64748B] mt-0.5 line-clamp-2">{n.body}</span>}
        <span className="block text-xs text-[#94A3B8] mt-1">{new Date(n.createdAt).toLocaleString('vi-VN')}</span>
      </span>
    </span>
  )
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Both reload every time the drawer opens, so the list agrees with the bell's polled count
  const listQuery = useQuery({
    queryKey: notificationKeys.list(DRAWER_QUERY),
    queryFn: () => notificationsApi.list(DRAWER_QUERY),
    enabled: isOpen,
    staleTime: 0,
  })

  const { data: unreadTotal = 0 } = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    enabled: isOpen,
    staleTime: 0,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all })

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      toast.success(t('notifications.drawer.markAll.success'))
      refresh()
    },
    onError: (err) => toast.error(describeApiError(err, { fallback: 'notifications.item.markAll.error' })),
  })

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: refresh,
    onError: (err) => {
      toast.error(describeApiError(err, { scope: 'notifications', fallback: 'notifications.item.markRead.error' }))
      refresh()
    },
  })

  const removeMutation = useMutation({
    mutationFn: notificationsApi.remove,
    onError: (err) =>
      toast.error(describeApiError(err, { scope: 'notifications', fallback: 'notifications.item.remove.error' })),
    onSettled: refresh,
  })

  if (!isOpen) return null

  const notifications = listQuery.data?.data ?? []

  return (
    <>
      {/* Backdrop */}
      <div data-testid="notification-drawer-backdrop" className="fixed inset-0 z-40" onClick={onClose} />

      {/* Drawer */}
      <aside
        aria-label={t('notifications.drawer.panel.title')}
        className="fixed right-0 top-20 w-80 h-[calc(100vh-5rem)] bg-white shadow-xl border-l border-[#E2E8F0] z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#C62828]" aria-hidden="true" />
            <h2 className="font-semibold text-[#0F172A] text-sm">{t('notifications.drawer.panel.title')}</h2>
            {unreadTotal > 0 && (
              <span
                data-testid="drawer-unread-count"
                aria-label={t('notifications.item.unreadBadge.label', { total: unreadTotal })}
                className="bg-[#C62828] text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center"
              >
                {unreadTotal}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadTotal > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="text-xs text-[#1F3A5F] hover:text-[#162d4a] font-medium disabled:opacity-50"
              >
                {t('notifications.drawer.markAll.action')}
              </button>
            )}
            <button type="button" onClick={onClose} aria-label={t('notifications.drawer.panel.close')}>
              <X size={18} className="text-[#64748B] hover:text-[#0F172A]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {listQuery.isError ? (
            <div role="alert" className="m-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-[#C62828]">
              {t('notifications.drawer.list.loadError')}{' '}
              <button type="button" onClick={() => listQuery.refetch()} className="font-medium underline">
                {t('common.actions.retry')}
              </button>
            </div>
          ) : !listQuery.isLoading && notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell size={32} className="mx-auto mb-2 text-[#E2E8F0]" aria-hidden="true" />
              <p className="text-sm text-[#64748B]">{t('notifications.drawer.list.empty')}</p>
            </div>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className={`flex items-start border-b border-[#F1F5F9] ${n.isRead ? '' : 'bg-blue-50/40'}`}>
                  {n.isRead ? (
                    <div className="flex-1 min-w-0 px-4 py-3">
                      <DrawerItemContent n={n} />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markReadMutation.mutate(n.id)}
                      className="flex-1 min-w-0 px-4 py-3 hover:bg-[#F8FAFC] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C62828]"
                    >
                      <DrawerItemContent n={n} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(n.id)}
                    disabled={removeMutation.isPending && removeMutation.variables === n.id}
                    aria-label={t('notifications.item.remove.label', { title: n.title })}
                    title={t('notifications.item.remove.title')}
                    className="shrink-0 self-center mr-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-red-50 hover:text-[#C62828] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#E2E8F0] p-3">
          <button
            type="button"
            onClick={() => { navigate('/notifications'); onClose() }}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-[#1F3A5F] hover:text-[#162d4a] font-medium py-2 rounded-lg hover:bg-[#F8FAFC] transition-colors"
          >
            {t('notifications.drawer.viewAll.action')}
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  )
}

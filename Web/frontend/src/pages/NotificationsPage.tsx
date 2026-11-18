import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import {
  notificationKeys,
  notificationsApi,
  type AppNotification,
  type NotificationQuery,
} from '@/api/notifications'
import { describeApiError } from '@/lib/api-error'
import type { TranslationKey } from '@/i18n/types'

type FilterType = 'all' | 'unread' | 'read'

const FILTER_TABS: { id: FilterType; label: TranslationKey }[] = [
  { id: 'all', label: 'common.filters.all' },
  { id: 'unread', label: 'notifications.page.filters.unread' },
  { id: 'read', label: 'notifications.page.filters.read' },
]

// Filter tab → `read` query parameter
const READ_PARAM: Record<FilterType, boolean | undefined> = { all: undefined, unread: false, read: true }

const PAGE_SIZE = 20

function formatTimestamp(iso: string, t: TFunction) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return t('notifications.page.time.justNow')
  if (diffMin < 60) return t('notifications.page.time.minutesAgo', { minutes: diffMin })
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return t('notifications.page.time.hoursAgo', { hours: diffH })
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return t('notifications.page.time.daysAgo', { days: diffD })
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

function NotificationContent({ notif }: { notif: AppNotification }) {
  const { t } = useTranslation()
  return (
    <>
      <span className="relative shrink-0">
        <span className="w-10 h-10 bg-[#C62828]/10 rounded-full flex items-center justify-center">
          <Bell size={18} className="text-[#C62828]" aria-hidden="true" />
        </span>
        {!notif.isRead && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 border-2 border-white rounded-full" aria-hidden="true" />
        )}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className={`block text-sm text-[#0F172A] ${notif.isRead ? '' : 'font-semibold'}`}>{notif.title}</span>
        {notif.body && (
          <span className="block text-xs text-[#64748B] mt-0.5 line-clamp-2">{notif.body}</span>
        )}
        <span className="block text-xs text-[#64748B] mt-1">{formatTimestamp(notif.createdAt, t)}</span>
      </span>
      {!notif.isRead && (
        <>
          <span className="sr-only">{t('notifications.page.item.unread')}</span>
          <span className="shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2" aria-hidden="true" />
        </>
      )}
    </>
  )
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterType>('all')
  const [page, setPage] = useState(1)

  const query: NotificationQuery = { read: READ_PARAM[filter], page, limit: PAGE_SIZE }

  const listQuery = useQuery({
    queryKey: notificationKeys.list(query),
    queryFn: () => notificationsApi.list(query),
  })

  const { data: unreadTotal = 0 } = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
  })

  const notifications = listQuery.data?.data ?? []
  const total = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Marking items read or dismissing them can shrink a list below the current page
  useEffect(() => {
    if (listQuery.data && page > totalPages) setPage(totalPages)
  }, [listQuery.data, page, totalPages])

  // Lists and the unread counter all live under the ['notifications'] key
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all })

  const readMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: refresh,
    onError: (err) => {
      toast.error(describeApiError(err, { scope: 'notifications', fallback: 'notifications.item.markRead.error' }))
      refresh()
    },
  })

  const readAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      toast.success(t('notifications.page.markAll.success'))
      refresh()
    },
    onError: (err) => toast.error(describeApiError(err, { fallback: 'notifications.item.markAll.error' })),
  })

  const removeMutation = useMutation({
    mutationFn: notificationsApi.remove,
    onSuccess: () => toast.success(t('notifications.item.remove.success')),
    onError: (err) =>
      toast.error(describeApiError(err, { scope: 'notifications', fallback: 'notifications.item.remove.error' })),
    // A 404 means it is already gone: reload either way
    onSettled: refresh,
  })

  const changeFilter = (next: FilterType) => {
    setFilter(next)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="notifications-page">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <Bell size={24} className="text-[#C62828]" aria-hidden="true" />
              {t('notifications.page.header.title')}
              {unreadTotal > 0 && (
                <span
                  data-testid="unread-count"
                  aria-label={t('notifications.item.unreadBadge.label', { total: unreadTotal })}
                  className="ml-1 px-2 py-0.5 text-xs font-bold bg-[#C62828] text-white rounded-full"
                >
                  {unreadTotal}
                </span>
              )}
            </h1>
            <p className="text-sm text-[#64748B] mt-1">{t('notifications.page.header.subtitle')}</p>
          </div>
          {unreadTotal > 0 && (
            <button
              type="button"
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
              data-testid="mark-all-read-btn"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
            >
              <CheckCheck size={16} aria-hidden="true" />
              {t('notifications.page.markAll.action')}
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => changeFilter(tab.id)}
              aria-pressed={filter === tab.id}
              data-testid={`notif-filter-${tab.id}`}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] ${
                filter === tab.id ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {listQuery.isLoading ? (
            <>
              <NotificationSkeleton />
              <NotificationSkeleton />
              <NotificationSkeleton />
              <NotificationSkeleton />
            </>
          ) : listQuery.isError ? (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center justify-between gap-4">
              <p className="text-sm text-[#C62828]">{t('notifications.page.list.loadError')}</p>
              <button
                type="button"
                onClick={() => listQuery.refetch()}
                className="text-sm font-medium text-[#C62828] underline hover:no-underline"
              >
                {t('common.actions.retry')}
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-16 text-center">
              <BellOff size={40} className="mx-auto mb-3 text-[#64748B]" aria-hidden="true" />
              <p className="text-[#0F172A] font-semibold">{t('notifications.page.empty.title')}</p>
              <p className="text-sm text-[#64748B] mt-1">
                {filter === 'unread' ? t('notifications.page.empty.allRead') : t('notifications.page.empty.none')}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((notif) => {
                const removing = removeMutation.isPending && removeMutation.variables === notif.id
                return (
                  <li key={notif.id} className="flex items-stretch gap-2">
                    {notif.isRead ? (
                      <div
                        data-testid={`notification-${notif.id}`}
                        className="flex-1 min-w-0 bg-white rounded-xl border border-[#E2E8F0] p-5 flex items-start gap-4"
                      >
                        <NotificationContent notif={notif} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => readMutation.mutate(notif.id)}
                        data-testid={`notification-${notif.id}`}
                        className="flex-1 min-w-0 bg-blue-50/30 rounded-xl border border-blue-200 p-5 flex items-start gap-4 transition-all hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
                      >
                        <NotificationContent notif={notif} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMutation.mutate(notif.id)}
                      disabled={removing}
                      aria-label={t('notifications.item.remove.label', { title: notif.title })}
                      title={t('notifications.item.remove.title')}
                      className="shrink-0 self-center inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#64748B] hover:bg-red-50 hover:text-[#C62828] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {!listQuery.isError && totalPages > 1 && (
          <nav aria-label={t('notifications.page.pagination.label')} className="flex items-center justify-between">
            <p data-testid="notifications-total" className="text-sm text-[#64748B]">
              <Trans
                i18nKey="notifications.page.pagination.total"
                values={{ total }}
                components={{ total: <span className="font-medium text-[#0F172A]" /> }}
              />
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('common.pagination.previous')}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="text-sm font-medium text-[#0F172A]">
                {t('notifications.page.pagination.page', { page, totalPages })}
              </span>
              <button
                type="button"
                aria-label={t('common.pagination.next')}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}

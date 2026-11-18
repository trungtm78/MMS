// Devices signed in to the caller's account: GET /devices/sessions (paged, the current session
// first), DELETE /devices/sessions/:id and POST /devices/sessions/revoke-others. Every listed
// session is live; revoking the current one signs this browser out at once.
import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ChevronLeft, ChevronRight, HelpCircle, LogOut, Monitor, Shield, Smartphone, Tablet, X } from 'lucide-react'
import { toast } from 'sonner'
import { signOutSession } from '@/api/client'
import {
  DEVICE_SESSIONS_PAGE_SIZE,
  deviceSessionKeys,
  deviceSessionsApi,
  type DeviceSession,
  type DeviceType,
} from '@/api/deviceSessions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useRbac } from '@/hooks/useRbac'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { formatVietnamDateTime } from '@/lib/vietnamDateTime'

const DEVICE_TYPE_LABELS = {
  desktop: 'devices.sessions.deviceType.desktop',
  mobile: 'devices.sessions.deviceType.mobile',
  tablet: 'devices.sessions.deviceType.tablet',
  unknown: 'devices.sessions.deviceType.unknown',
} as const satisfies Record<DeviceType, TranslationKey>

const COLUMNS = [
  'devices.sessions.columns.device',
  'devices.sessions.columns.ip',
  'devices.sessions.columns.lastActive',
  'devices.sessions.columns.expiresAt',
  'devices.sessions.columns.security',
  'devices.sessions.columns.actions',
] as const satisfies readonly TranslationKey[]

const MINUTE_MS = 60_000

/** "Vừa xong", minutes or hours ago within a day, otherwise the time and day in Vietnam */
function lastActiveText(t: TFunction, value: string): string {
  const time = new Date(value).getTime()
  if (isNaN(time)) return formatVietnamDateTime(value)
  const minutes = Math.floor((Date.now() - time) / MINUTE_MS)
  if (minutes < 1) return t('devices.sessions.lastActive.justNow')
  if (minutes < 60) return t('devices.sessions.lastActive.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('devices.sessions.lastActive.hours', { count: hours })
  return formatVietnamDateTime(value)
}

function DeviceIcon({ type }: { type: DeviceType }) {
  const className = 'text-[#64748B] shrink-0'
  if (type === 'mobile') return <Smartphone size={16} className={className} aria-hidden="true" />
  if (type === 'tablet') return <Tablet size={16} className={className} aria-hidden="true" />
  if (type === 'desktop') return <Monitor size={16} className={className} aria-hidden="true" />
  return <HelpCircle size={16} className={className} aria-hidden="true" />
}

function SkeletonRow() {
  return (
    <tr className="border-b border-[#F1F5F9]">
      {COLUMNS.map((column) => (
        <td key={column} className="px-5 py-4">
          <div className="h-4 bg-gray-200 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

export function DeviceSessionsPage() {
  const { t } = useTranslation()
  const { can } = useRbac()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [confirming, setConfirming] = useState<DeviceSession | null>(null)
  const [confirmingOthers, setConfirmingOthers] = useState(false)

  const query = useQuery({
    queryKey: deviceSessionKeys.page(page),
    queryFn: () => deviceSessionsApi.list(page),
    enabled: can.manageDevices,
    placeholderData: keepPreviousData,
  })
  const sessions = query.data?.data ?? []
  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / DEVICE_SESSIONS_PAGE_SIZE))

  // Signing devices out can leave the page past the last one
  useEffect(() => {
    if (query.data && page > pages) setPage(pages)
  }, [query.data, page, pages])

  const reload = () => queryClient.invalidateQueries({ queryKey: deviceSessionKeys.all })

  const revokeMutation = useMutation({
    mutationFn: (target: DeviceSession) => deviceSessionsApi.revoke(target.id),
    onSuccess: (_, target) => {
      setConfirming(null)
      if (target.current) {
        // This browser's session no longer exists: sign out as when the server refuses a refresh
        signOutSession('session_ended')
        return
      }
      toast.success(t('devices.sessions.revoke.success'))
      void reload()
    },
    onError: (err) => {
      setConfirming(null)
      // 404 session_not_found (errors.devices.sessions): signed out elsewhere meanwhile, or not
      // a session of this account
      toast.error(describeApiError(err, { scope: 'devices.sessions', fallback: 'devices.sessions.revoke.error' }))
      void reload()
    },
  })

  const revokeOthersMutation = useMutation({
    mutationFn: () => deviceSessionsApi.revokeOthers(),
    onSuccess: ({ revoked }) => {
      setConfirmingOthers(false)
      toast.success(
        revoked > 0
          ? t('devices.sessions.revokeOthers.success', { count: revoked })
          : t('devices.sessions.revokeOthers.none'),
      )
      void reload()
    },
    onError: (err) => {
      setConfirmingOthers(false)
      toast.error(describeApiError(err, { scope: 'devices.sessions', fallback: 'devices.sessions.revokeOthers.error' }))
    },
  })

  if (!can.manageDevices) return <Navigate to="/forbidden" replace />

  // The total counts this browser's session, which the backend lists first on page 1
  const currentCounted = sessions.some((session) => session.current) || page > 1
  const otherSessions = total - (currentCounted ? 1 : 0)
  const accountName = sessions[0]?.userName

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="device-sessions-page">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <Shield size={24} className="text-[#C62828]" aria-hidden="true" />
              {t('devices.sessions.page.heading')}
            </h1>
            <p className="text-sm text-[#64748B] mt-1">{t('devices.sessions.page.description')}</p>
            {accountName && (
              <p className="text-sm text-[#0F172A] mt-1">{t('devices.sessions.page.account', { name: accountName })}</p>
            )}
          </div>
          {query.data && (
            <button
              type="button"
              onClick={() => setConfirmingOthers(true)}
              disabled={otherSessions <= 0 || revokeOthersMutation.isPending}
              className="flex items-center gap-2 min-h-11 px-4 text-sm font-medium text-[#C62828] bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut size={16} aria-hidden="true" />
              {t('devices.sessions.revokeOthers.button')}
            </button>
          )}
        </div>

        {query.isError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
            {describeApiError(query.error, { scope: 'devices.sessions', fallback: 'devices.sessions.page.loadError' })}
          </p>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column}
                      className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase tracking-wide"
                    >
                      {t(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.isLoading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-5 py-16 text-center text-[#64748B] text-sm">
                      {t('devices.sessions.page.empty')}
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr
                      key={session.id}
                      data-testid={`session-row-${session.id}`}
                      className={`border-b border-[#F1F5F9] transition-colors ${
                        session.current ? 'bg-blue-50/30' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2">
                          <DeviceIcon type={session.deviceType} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-[#0F172A]" title={session.userAgent ?? undefined}>
                                {session.deviceName}
                              </span>
                              {session.current && (
                                <span
                                  data-testid={`current-session-badge-${session.id}`}
                                  className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700"
                                >
                                  {t('devices.sessions.badges.current')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#64748B]">{t(DEVICE_TYPE_LABELS[session.deviceType])}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#64748B] font-mono">
                        {session.ip ?? t('common.states.none')}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-[#0F172A]">{lastActiveText(t, session.lastActiveAt)}</p>
                        <p className="text-xs text-[#64748B]">
                          {t('devices.sessions.lastActive.signedInAt', { time: formatVietnamDateTime(session.createdAt) })}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{formatVietnamDateTime(session.expiresAt)}</td>
                      <td className="px-5 py-4">
                        <span
                          title={session.amr.join(', ') || undefined}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                            session.mfa ? 'bg-green-100 text-[#2E7D32]' : 'bg-gray-100 text-[#64748B]'
                          }`}
                        >
                          {session.mfa ? t('devices.sessions.badges.mfa') : t('devices.sessions.badges.passwordOnly')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setConfirming(session)}
                          data-testid={`revoke-btn-${session.id}`}
                          className="flex items-center gap-1.5 min-h-11 px-3 text-xs font-medium text-[#C62828] bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
                        >
                          {session.current ? <LogOut size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}
                          {session.current ? t('devices.sessions.revokeCurrent.button') : t('devices.sessions.revoke.button')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {total > DEVICE_SESSIONS_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-[#E2E8F0]">
              <span className="text-sm text-[#64748B]">
                {t('devices.sessions.page.pageInfo', { page, pages, total })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label={t('common.pagination.previous')}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  aria-label={t('common.pagination.next')}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={confirming?.current ? t('devices.sessions.revokeCurrent.title') : t('devices.sessions.revoke.title')}
        description={
          confirming?.current
            ? t('devices.sessions.revokeCurrent.description')
            : t('devices.sessions.revoke.description', { device: confirming?.deviceName ?? '' })
        }
        confirmLabel={
          confirming?.current ? t('devices.sessions.revokeCurrent.confirm') : t('devices.sessions.revoke.confirm')
        }
        tone="danger"
        busy={revokeMutation.isPending}
        onConfirm={() => {
          if (confirming) revokeMutation.mutate(confirming)
        }}
      />

      <ConfirmDialog
        open={confirmingOthers}
        onOpenChange={setConfirmingOthers}
        title={t('devices.sessions.revokeOthers.title')}
        description={t('devices.sessions.revokeOthers.description')}
        confirmLabel={t('devices.sessions.revokeOthers.confirm')}
        tone="danger"
        busy={revokeOthersMutation.isPending}
        onConfirm={() => revokeOthersMutation.mutate()}
      />
    </div>
  )
}

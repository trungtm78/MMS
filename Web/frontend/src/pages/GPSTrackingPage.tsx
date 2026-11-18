// Theo dõi GPS (Web/backend/src/gps). GET /gps/live answers the latest position of each militia
// member in the caller's scope (gps_latest), newest first; the page reads it again every 30 s and
// takes in each gps:update the socket pushes between reads. Presence comes from the server, which
// reports a member offline once their last position is older than GPS_OFFLINE_AFTER_MINUTES
// (gps-rooms.ts).
import { useEffect, useId, useReducer } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { gpsApi, gpsKeys, mergeGpsLiveRow, type GpsLiveRow } from '@/api/gps'
import { useRbac } from '@/hooks/useRbac'
import { useSocket } from '@/hooks/useSocket'
import { describeApiError } from '@/lib/api-error'
import { VIETNAM_TIME_ZONE, formatCalendarDate } from '@/lib/dates'
import { mapTileSource } from '@/lib/mapTiles'
import { cn } from '@/lib/utils'

type Presence = 'online' | 'offline' | 'unknown'

/** GpsLiveDto.status is any text: a value the page does not know reads as unknown */
function presenceOf(status: string): Presence {
  return status === 'online' || status === 'offline' ? status : 'unknown'
}

// Phường Phú Định, Quận 8, TP.HCM center
const PHU_DINH_CENTER: [number, number] = [10.7326, 106.6508]
const REFRESH_MS = 30_000
const MINUTES_PER_DAY = 24 * 60

const PRESENCE_TONE: Readonly<Record<Presence, string>> = {
  online: 'text-[#2E7D32]',
  offline: 'text-[#64748B]',
  unknown: 'text-[#94A3B8]',
}

const PIN_COLOR: Readonly<Record<Presence, string>> = {
  online: '#2E7D32',
  offline: '#64748B',
  unknown: '#94A3B8',
}

/**
 * A map pin drawn inline in the presence colour. No image is requested, so a Content Security
 * Policy or an offline deployment cannot break the markers. The custom className replaces
 * Leaflet's white leaflet-div-icon box.
 */
function pinIcon(presence: Presence): L.DivIcon {
  return L.divIcon({
    className: `gps-marker gps-marker-${presence}`,
    html:
      `<svg width="25" height="41" viewBox="0 0 25 41" aria-hidden="true">` +
      `<path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" ` +
      `fill="${PIN_COLOR[presence]}" stroke="#FFFFFF" stroke-width="1.5"/>` +
      `<circle cx="12.5" cy="12.5" r="4.5" fill="#FFFFFF"/></svg>`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })
}

const PRESENCE_ICON: Readonly<Record<Presence, L.DivIcon>> = {
  online: pinIcon('online'),
  offline: pinIcon('offline'),
  unknown: pinIcon('unknown'),
}

const clockFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: VIETNAM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

/** "Vừa xong", minutes or hours ago, then the Vietnamese day of the report */
function useLastSeenLabel() {
  const { t } = useTranslation()
  return (iso: string) => {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
    if (minutes < 1) return t('gps.time.justNow')
    if (minutes < 60) return t('gps.time.minutesAgo', { count: minutes })
    if (minutes < MINUTES_PER_DAY) return t('gps.time.hoursAgo', { count: Math.floor(minutes / 60) })
    return formatCalendarDate(iso)
  }
}

function StatCard({ testId, label, value, tone }: { testId: string; label: string; value: number; tone: string }) {
  return (
    <div data-testid={testId} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <p className="mb-1 text-xs uppercase tracking-wide text-[#64748B]">{label}</p>
      <p className={cn('text-3xl font-bold', tone)}>{value}</p>
    </div>
  )
}

function GpsBoard() {
  const { t } = useTranslation()
  const lastSeen = useLastSeenLabel()
  const listTitleId = useId()

  const queryClient = useQueryClient()
  const { onGpsUpdate } = useSocket()

  const live = useQuery({
    queryKey: gpsKeys.live,
    queryFn: gpsApi.live,
    refetchInterval: REFRESH_MS,
  })

  // A pushed row replaces that member's row (or adds a member first seen) until the next read.
  // The query result follows a cache write a tick later, so the page redraws from the cache itself
  // as soon as a row arrives.
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  useEffect(
    () =>
      onGpsUpdate((row) => {
        queryClient.setQueryData<GpsLiveRow[]>(gpsKeys.live, (rows) => mergeGpsLiveRow(rows, row))
        redraw()
      }),
    [onGpsUpdate, queryClient],
  )

  const rows = queryClient.getQueryData<GpsLiveRow[]>(gpsKeys.live) ?? live.data
  const updatedAt = queryClient.getQueryState(gpsKeys.live)?.dataUpdatedAt ?? live.dataUpdatedAt
  const tiles = mapTileSource(t('gps.map.view.attribution'))
  const members = (rows ?? []).map((member) => ({ ...member, presence: presenceOf(member.status) }))
  const onlineCount = members.filter((member) => member.presence === 'online').length
  const offlineCount = members.filter((member) => member.presence === 'offline').length

  let list
  if (rows === undefined && live.isPending) {
    list = (
      <div role="status" aria-label={t('gps.members.load.loading')} className="space-y-3 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-[#E2E8F0]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-1/2 rounded bg-[#E2E8F0]" />
              <div className="h-2.5 w-1/3 rounded bg-[#F1F5F9]" />
            </div>
          </div>
        ))}
      </div>
    )
  } else if (live.isError) {
    list = (
      <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
        <p>{describeApiError(live.error, { scope: 'gps.live', statuses: { 403: 'errors.common.forbidden' }, fallback: 'gps.members.load.error' })}</p>
        <button
          type="button"
          onClick={() => void live.refetch()}
          className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC]"
        >
          {t('common.actions.retry')}
        </button>
      </div>
    )
  } else if (members.length === 0) {
    list = <div className="p-12 text-center text-sm text-[#64748B]">{t('gps.members.load.empty')}</div>
  } else {
    list = (
      <ul className="divide-y divide-[#E2E8F0]">
        {members.map((member) => (
          <li
            key={member.id}
            data-testid={`gps-member-${member.id}`}
            data-presence={member.presence}
            className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[#F8FAFC]"
          >
            <div
              aria-hidden="true"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                member.presence === 'online' ? 'bg-[#C62828]' : 'bg-[#64748B]',
              )}
            >
              {initials(member.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#0F172A]">{member.name}</p>
              <p className="flex flex-wrap gap-x-2 text-xs text-[#64748B]">
                <span>{t('gps.members.row.unit', { unit: member.unitCode })}</span>
                <span>{lastSeen(member.lastUpdate)}</span>
                {member.accuracy !== null && <span>{t('gps.members.row.accuracy', { meters: Math.round(member.accuracy) })}</span>}
              </p>
              <p className="font-mono text-xs text-[#94A3B8]">
                {t('gps.members.row.coordinates', { lat: member.lat.toFixed(5), lng: member.lng.toFixed(5) })}
              </p>
            </div>
            <div className={cn('flex shrink-0 items-center gap-1.5', PRESENCE_TONE[member.presence])}>
              {member.presence === 'online' ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
              <span className="text-xs font-medium">{t(`gps.presence.${member.presence}`)}</span>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="gps-page">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0F172A]">
              <MapPin size={24} aria-hidden="true" className="text-[#C62828]" />
              {t('gps.page.header.title')}
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">{t('gps.page.header.subtitle')}</p>
          </div>
          {updatedAt > 0 && (
            <p className="flex items-center gap-2 text-xs text-[#64748B]">
              <RefreshCw size={12} aria-hidden="true" />
              <span>{t('gps.page.header.lastRefresh', { time: clockFormat.format(updatedAt) })}</span>
            </p>
          )}
        </div>

        <div data-testid="gps-stats" className="grid grid-cols-3 gap-4">
          <StatCard testId="gps-stat-total" label={t('gps.page.stats.total')} value={members.length} tone="text-[#0F172A]" />
          <StatCard testId="gps-stat-online" label={t('gps.page.stats.online')} value={onlineCount} tone="text-[#2E7D32]" />
          <StatCard testId="gps-stat-offline" label={t('gps.page.stats.offline')} value={offlineCount} tone="text-[#64748B]" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section
            aria-label={t('gps.map.view.label')}
            className="overflow-hidden rounded-xl border border-[#E2E8F0] shadow-sm"
            style={{ height: 420 }}
            data-testid="gps-map-placeholder"
          >
            <MapContainer
              center={PHU_DINH_CENTER}
              zoom={15}
              style={{ height: '100%', width: '100%', position: 'relative' }}
              scrollWheelZoom={false}
            >
              <TileLayer attribution={tiles.attribution} url={tiles.url} />
              {members.map((member) => (
                <Marker key={member.id} position={[member.lat, member.lng]} icon={PRESENCE_ICON[member.presence]} title={member.name}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">{member.name}</p>
                      <p className={PRESENCE_TONE[member.presence]}>{t(`gps.presence.${member.presence}`)}</p>
                      <p className="text-xs text-gray-400">{lastSeen(member.lastUpdate)}</p>
                      {member.accuracy !== null && (
                        <p className="text-xs text-gray-400">{t('gps.members.row.accuracy', { meters: Math.round(member.accuracy) })}</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </section>

          <section aria-labelledby={listTitleId} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="border-b border-[#E2E8F0] px-5 py-4">
              <h2 id={listTitleId} className="text-sm font-semibold text-[#0F172A]">
                {t('gps.members.list.title')}
              </h2>
            </div>
            <div className="max-h-[380px] overflow-y-auto">{list}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

export function GPSTrackingPage() {
  const { can } = useRbac()
  // gps.controller.ts GET /gps/live @Roles
  if (!can.viewGps) return <Navigate to="/forbidden" replace />
  return <GpsBoard />
}

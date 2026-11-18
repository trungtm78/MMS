import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { GpsLiveRow } from '@/api/gps'
import { GPSTrackingPage } from './GPSTrackingPage'

// The HTTP layer, the signed-in user, the live socket and the map library (Leaflet needs a real
// browser layout) are replaced; useRbac, gpsApi, mergeGpsLiveRow and the page run for real
const api = vi.hoisted(() => ({ get: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))
const socket = vi.hoisted(() => {
  const state = { listener: null as ((row: GpsLiveRow) => void) | null, unsubscribe: vi.fn() }
  // Stable across renders, as SocketContext's onGpsUpdate is
  const onGpsUpdate = vi.fn((listener: (row: GpsLiveRow) => void) => {
    state.listener = listener
    return state.unsubscribe
  })
  return { state, value: { isConnected: true, activeSosAlerts: [], clearSosAlert: () => undefined, onGpsUpdate } }
})

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))
vi.mock('@/hooks/useSocket', () => ({ useSocket: () => socket.value }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => (
    <p data-testid="map-attribution" data-url={url}>
      {attribution}
    </p>
  ),
  Marker: ({ position, icon, title, children }: { position: [number, number]; icon: { options: Record<string, unknown> }; title?: string; children: ReactNode }) => (
    <div data-testid="map-marker" data-position={position.join(',')} data-title={title} data-icon={JSON.stringify(icon.options)}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="map-popup">{children}</div>,
}))
vi.mock('leaflet', () => {
  // L.divIcon keeps its options, as Leaflet does
  const divIcon = (options: Record<string, unknown>) => ({ options })
  return { default: { divIcon }, divIcon }
})

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// Web/backend/src/gps/gps.service.ts GpsLiveDto, also the gps:update payload. lat, lng and accuracy
// are DECIMAL columns sent as JSON numbers (src/database/pg-types.ts); status is derived when read
// (offline after GPS_OFFLINE_AFTER_MINUTES without a report).
const live = (id: string, patch: Partial<GpsLiveRow> = {}): GpsLiveRow => ({
  id,
  militiaId: id,
  userId: `u-${id}`,
  name: 'Nguyễn Văn An',
  fullName: 'Nguyễn Văn An',
  unitCode: 'KV-A',
  lat: 10.762,
  lng: 106.66,
  accuracy: 12.5,
  lastUpdate: minutesAgo(2),
  lastSeenAt: minutesAgo(2),
  status: 'online',
  ...patch,
})

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = { live: [] as GpsLiveRow[] }

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/gps']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/gps" element={<GPSTrackingPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const liveCalls = () => api.get.mock.calls.filter(([url]) => url === '/gps/live')

/** Delivers one gps:update row to the page's subscription */
function push(row: GpsLiveRow) {
  const listener = socket.state.listener
  if (!listener) throw new Error('the page has not subscribed to gps:update')
  act(() => listener(row))
}

describe('GPSTrackingPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    // No tile server configured unless a test says so, whatever the local environment holds
    vi.stubEnv('VITE_MAP_TILE_URL', undefined)
    vi.stubEnv('VITE_MAP_TILE_ATTRIBUTION', undefined)
    // clearAllMocks keeps the socket mock's implementation and resets its calls
    vi.clearAllMocks()
    socket.state.listener = null
    // clearAllMocks keeps queued once-answers; a test that stops early must not leave one behind
    api.get.mockReset()
    signInAs('police_ward')
    server.live = [live('m1')]
    api.get.mockImplementation((url: string) =>
      url === '/gps/live' ? Promise.resolve({ data: server.live }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    )
  })

  // gps.controller.ts GET /gps/live @Roles
  describe('access', () => {
    it.each(['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer'])('opens for %s', async (role) => {
      signInAs(role)
      wrap()

      expect(screen.getByRole('heading', { name: 'Theo dõi GPS' })).toBeInTheDocument()
      expect(await screen.findByTestId('gps-member-m1')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/gps/live')
    })

    it.each(['office_staff', 'dqtv', 'ubnd_leader'])('sends %s to the forbidden page', async (role) => {
      signInAs(role)
      wrap()

      expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalled()
      expect(socket.value.onGpsUpdate).not.toHaveBeenCalled()
    })
  })

  describe('header and counts', () => {
    it('names the page and when the positions were last read', async () => {
      wrap()

      expect(screen.getByText('UBND Phường Phú Định – Giám sát vị trí DQTV')).toBeInTheDocument()
      expect(await screen.findByText(/^Cập nhật lúc \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument()
    })

    // The server derives presence when read (10 minutes without a report is offline): the page
    // shows it as sent instead of applying a threshold of its own
    it('counts the presence the server reports', async () => {
      server.live = [
        live('fresh'),
        live('recent', { lastUpdate: minutesAgo(8), lastSeenAt: minutesAgo(8) }),
        live('off', { status: 'offline', lastUpdate: minutesAgo(30), lastSeenAt: minutesAgo(30) }),
        live('unknown', { status: 'unknown' }),
      ]
      wrap()

      await screen.findByTestId('gps-member-fresh')
      const stats = within(screen.getByTestId('gps-stats'))
      expect(within(stats.getByTestId('gps-stat-total')).getByText('4')).toBeInTheDocument()
      expect(within(stats.getByTestId('gps-stat-online')).getByText('2')).toBeInTheDocument()
      expect(within(stats.getByTestId('gps-stat-offline')).getByText('1')).toBeInTheDocument()
      expect(stats.getByText('Tổng')).toBeInTheDocument()
      expect(stats.getByText('Trực tuyến')).toBeInTheDocument()
      expect(stats.getByText('Ngoại tuyến')).toBeInTheDocument()
    })
  })

  describe('member list', () => {
    it('lists the members in the order the server sends', async () => {
      server.live = [live('m2', { name: 'Trần Văn Bình' }), live('m1')]
      wrap()

      const list = within(await screen.findByRole('region', { name: 'Danh sách thành viên' }))
      await list.findByTestId('gps-member-m1')
      expect(list.getAllByTestId(/^gps-member-/).map((row) => row.getAttribute('data-testid'))).toEqual(['gps-member-m2', 'gps-member-m1'])
    })

    it('shows the name, presence, time, accuracy and coordinates of a member', async () => {
      wrap()

      const row = within(await screen.findByTestId('gps-member-m1'))
      // initials of the last two words of the name
      expect(row.getByText('VA')).toBeInTheDocument()
      expect(row.getByText('Nguyễn Văn An')).toBeInTheDocument()
      expect(row.getByText('Trực tuyến')).toBeInTheDocument()
      expect(row.getByText('Đơn vị KV-A')).toBeInTheDocument()
      expect(row.getByText('2 phút trước')).toBeInTheDocument()
      expect(row.getByText('Sai số ±13 m')).toBeInTheDocument()
      expect(row.getByText('10.76200, 106.66000')).toBeInTheDocument()
      expect(screen.getByTestId('gps-member-m1')).toHaveAttribute('data-presence', 'online')
    })

    it('lists a member whose profile has no account, and leaves out a missing accuracy', async () => {
      server.live = [live('m3', { userId: null, accuracy: null })]
      wrap()

      const row = within(await screen.findByTestId('gps-member-m3'))
      expect(row.getByText('Nguyễn Văn An')).toBeInTheDocument()
      expect(row.queryByText(/Sai số/)).not.toBeInTheDocument()
    })

    it.each([
      [{ lastUpdate: minutesAgo(-1) }, 'Vừa xong', 'online', 'Trực tuyến'],
      [{ lastUpdate: minutesAgo(8) }, '8 phút trước', 'online', 'Trực tuyến'],
      [{ lastUpdate: minutesAgo(30), status: 'offline' }, '30 phút trước', 'offline', 'Ngoại tuyến'],
      [{ lastUpdate: minutesAgo(185), status: 'offline' }, '3 giờ trước', 'offline', 'Ngoại tuyến'],
      [{ lastUpdate: '2026-01-02T20:30:00.000Z', status: 'offline' }, '03/01/2026', 'offline', 'Ngoại tuyến'],
      [{ status: 'offline' }, '2 phút trước', 'offline', 'Ngoại tuyến'],
      [{ status: 'unknown' }, '2 phút trước', 'unknown', 'Không rõ'],
      // GpsLiveDto.status is any text: a value the page does not know reads as unknown
      [{ status: 'maintenance' }, '2 phút trước', 'unknown', 'Không rõ'],
    ])('reads %o as "%s" and %s', async (patch, time, presence, label) => {
      server.live = [live('m1', patch)]
      wrap()

      const row = await screen.findByTestId('gps-member-m1')
      expect(within(row).getByText(time)).toBeInTheDocument()
      expect(within(row).getByText(label)).toBeInTheDocument()
      expect(row).toHaveAttribute('data-presence', presence)
    })

    it('shows an empty state', async () => {
      server.live = []
      wrap()

      expect(await screen.findByText('Không có dữ liệu GPS')).toBeInTheDocument()
      expect(screen.queryAllByTestId('map-marker')).toHaveLength(0)
    })

    it('shows a loading state', async () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      wrap()

      expect(await screen.findByRole('status', { name: 'Đang tải vị trí DQTV' })).toBeInTheDocument()
    })

    it.each([
      [403, 'insufficient_role', 'Bạn không có quyền xem vị trí DQTV.'],
      [403, 'no_unit_scope', 'Tài khoản của bạn chưa được gán đơn vị quản lý.'],
      [403, 'Forbidden resource', 'Bạn không có quyền thực hiện thao tác này'],
      [500, 'Internal server error', 'Không thể tải vị trí DQTV.'],
    ])('explains %i %s and retries', async (status, code, message) => {
      api.get.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap()

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      const loads = liveCalls().length
      await user.click(screen.getByRole('button', { name: 'Thử lại' }))
      expect(await screen.findByTestId('gps-member-m1')).toBeInTheDocument()
      expect(liveCalls().length).toBeGreaterThan(loads)
    })
  })

  // gps:update pushes one GET /gps/live row after each POST /gps/record (gps.service.ts publish)
  describe('live updates', () => {
    it('subscribes once and stops listening when the page closes', async () => {
      const view = wrap()

      await screen.findByTestId('gps-member-m1')
      expect(socket.value.onGpsUpdate).toHaveBeenCalledTimes(1)
      expect(socket.state.unsubscribe).not.toHaveBeenCalled()

      view.unmount()
      expect(socket.state.unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('moves a member to the pushed position and presence', async () => {
      server.live = [live('m1'), live('m2', { name: 'Trần Văn Bình', status: 'offline', lat: 10.7326, lng: 106.6508 })]
      wrap()
      await screen.findByTestId('gps-member-m1')

      push(live('m1', { lat: 10.75, lng: 106.64, accuracy: 30, status: 'offline', lastUpdate: minutesAgo(3), lastSeenAt: minutesAgo(3) }))

      const row = within(screen.getByTestId('gps-member-m1'))
      expect(screen.getByTestId('gps-member-m1')).toHaveAttribute('data-presence', 'offline')
      expect(row.getByText('10.75000, 106.64000')).toBeInTheDocument()
      expect(row.getByText('Sai số ±30 m')).toBeInTheDocument()
      expect(row.getByText('3 phút trước')).toBeInTheDocument()
      expect(screen.getAllByTestId(/^gps-member-/)).toHaveLength(2)
      expect(screen.getAllByTestId('map-marker').map((marker) => marker.getAttribute('data-position'))).toEqual(['10.75,106.64', '10.7326,106.6508'])
      const stats = within(screen.getByTestId('gps-stats'))
      expect(within(stats.getByTestId('gps-stat-total')).getByText('2')).toBeInTheDocument()
      expect(within(stats.getByTestId('gps-stat-online')).getByText('0')).toBeInTheDocument()
      expect(within(stats.getByTestId('gps-stat-offline')).getByText('2')).toBeInTheDocument()
      expect(liveCalls()).toHaveLength(1)
    })

    it('appends a member first seen through a push', async () => {
      wrap()
      await screen.findByTestId('gps-member-m1')

      push(live('m9', { name: 'Lê Văn Cường', unitCode: 'KV-B', lat: 10.74, lng: 106.65 }))

      expect(screen.getAllByTestId(/^gps-member-/).map((row) => row.getAttribute('data-testid'))).toEqual(['gps-member-m1', 'gps-member-m9'])
      expect(within(screen.getByTestId('gps-member-m9')).getByText('Đơn vị KV-B')).toBeInTheDocument()
      expect(screen.getAllByTestId('map-marker')).toHaveLength(2)
      expect(within(within(screen.getByTestId('gps-stats')).getByTestId('gps-stat-online')).getByText('2')).toBeInTheDocument()
    })

    it('shows a pushed position before the first list arrives, with its refresh time', async () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      wrap()
      await screen.findByRole('status', { name: 'Đang tải vị trí DQTV' })

      push(live('m5', { name: 'Phạm Thị Dung' }))

      expect(within(screen.getByTestId('gps-member-m5')).getByText('Phạm Thị Dung')).toBeInTheDocument()
      expect(screen.getByText(/^Cập nhật lúc \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument()
      expect(screen.queryByRole('status', { name: 'Đang tải vị trí DQTV' })).not.toBeInTheDocument()
    })
  })

  describe('map', () => {
    it('places a named marker per member at its numeric position', async () => {
      server.live = [live('m1'), live('m2', { name: 'Trần Văn Bình', lat: 10.7326, lng: 106.6508, status: 'offline' })]
      wrap()

      const map = within(await screen.findByRole('region', { name: 'Bản đồ vị trí DQTV' }))
      await waitFor(() => expect(map.getAllByTestId('map-marker')).toHaveLength(2))
      const [first, second] = map.getAllByTestId('map-marker')
      expect(first).toHaveAttribute('data-position', '10.762,106.66')
      expect(first).toHaveAttribute('data-title', 'Nguyễn Văn An')
      expect(second).toHaveAttribute('data-position', '10.7326,106.6508')
      expect(second).toHaveAttribute('data-title', 'Trần Văn Bình')
    })

    // A CSP or an offline deployment blocks remote images: the icons are drawn locally
    it('draws each presence with its own local icon and loads nothing from the network', async () => {
      server.live = [live('m1'), live('m2', { status: 'offline' }), live('m3', { status: 'unknown' })]
      wrap()

      const map = within(await screen.findByRole('region', { name: 'Bản đồ vị trí DQTV' }))
      await waitFor(() => expect(map.getAllByTestId('map-marker')).toHaveLength(3))
      const icons = map.getAllByTestId('map-marker').map((marker) => marker.getAttribute('data-icon') ?? '')
      for (const icon of icons) expect(icon).not.toMatch(/https?:\/\/|\/\/[a-z]/i)
      expect(new Set(icons).size).toBe(3)
      const [online, offline, unknown] = icons.map((icon) => JSON.parse(icon) as { className: string; html: string })
      expect(online.className).toContain('gps-marker-online')
      expect(offline.className).toContain('gps-marker-offline')
      expect(unknown.className).toContain('gps-marker-unknown')
      expect(online.html).toMatch(/^<svg/)
    })

    it('describes the member in the marker popup', async () => {
      wrap()

      const popup = within(await screen.findByTestId('map-popup'))
      expect(popup.getByText('Nguyễn Văn An')).toBeInTheDocument()
      expect(popup.getByText('Trực tuyến')).toBeInTheDocument()
      expect(popup.getByText('2 phút trước')).toBeInTheDocument()
      expect(popup.getByText('Sai số ±13 m')).toBeInTheDocument()
    })

    it('draws OpenStreetMap tiles and credits them by default', async () => {
      wrap()

      const tiles = await screen.findByTestId('map-attribution')
      expect(tiles).toHaveAttribute('data-url', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
      expect(tiles).toHaveTextContent('Những người đóng góp')
    })

    // Deployments behind a CSP or offline serve their own tiles
    it('draws tiles from the configured server with its attribution', async () => {
      vi.stubEnv('VITE_MAP_TILE_URL', 'https://tiles.phudinh.local/{z}/{x}/{y}.png')
      vi.stubEnv('VITE_MAP_TILE_ATTRIBUTION', 'Bản đồ nội bộ UBND Phường Phú Định')
      wrap()

      const tiles = await screen.findByTestId('map-attribution')
      expect(tiles).toHaveAttribute('data-url', 'https://tiles.phudinh.local/{z}/{x}/{y}.png')
      expect(tiles).toHaveTextContent('Bản đồ nội bộ UBND Phường Phú Định')
    })
  })
})

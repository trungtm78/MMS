import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SocketProvider } from './SocketContext'
import { useSocket } from '@/hooks/useSocket'

const state = vi.hoisted(() => ({
  isAuthenticated: true,
  token: 'access-1' as string | null,
  refreshAccessToken: vi.fn(),
  signOutSession: vi.fn(),
}))

// socket.io-client stand-in
const socket = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    handlers,
    connected: false,
    active: false,
    auth: undefined as unknown,
    options: undefined as unknown,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on(event: string, handler: (...args: unknown[]) => void) {
      const set = handlers.get(event) ?? new Set()
      set.add(handler)
      handlers.set(event, set)
      return this
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(handler)
      return this
    },
    fire(event: string, ...args: unknown[]) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(...args)
    },
  }
})

const io = vi.hoisted(() => vi.fn())
vi.mock('socket.io-client', () => ({ io }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: state.isAuthenticated }) }))
vi.mock('@/api/client', () => ({
  getAccessToken: () => state.token,
  refreshAccessToken: state.refreshAccessToken,
  signOutSession: state.signOutSession,
}))

// The sos:new payload (Web/backend/src/sos/sos.service.ts announce): no reporter, status or date
const alert = { id: 'sos-1', code: 'SOS-20260914-A1B2C3', incidentType: 'fire', severity: 'high', title: 'Cháy kho vật tư' }

// The gps:update payload (Web/backend/src/gps/gps.service.ts publish): one GET /gps/live row
const liveRow = {
  id: 'm1',
  militiaId: 'm1',
  userId: 'u1',
  name: 'Nguyễn Văn A',
  fullName: 'Nguyễn Văn A',
  unitCode: 'KV-A',
  lat: 10.762,
  lng: 106.66,
  accuracy: 12.5,
  lastUpdate: '2026-09-14T02:00:00.000Z',
  lastSeenAt: '2026-09-14T02:00:00.000Z',
  status: 'online',
}

function Probe() {
  const { isConnected, activeSosAlerts, clearSosAlert } = useSocket()
  return (
    <div>
      <p data-testid="connected">{String(isConnected)}</p>
      <p data-testid="alerts">{activeSosAlerts.map((a) => a.id).join(',')}</p>
      <p data-testid="last-alert">
        {activeSosAlerts[0] ? [activeSosAlerts[0].code, activeSosAlerts[0].incidentType, activeSosAlerts[0].severity, activeSosAlerts[0].title, activeSosAlerts[0].receivedAt].join('|') : ''}
      </p>
      <button type="button" onClick={() => clearSosAlert('sos-1')}>clear</button>
    </div>
  )
}

const wrapper = ({ children }: { children: ReactNode }) => <SocketProvider>{children}</SocketProvider>

describe('SocketProvider', () => {
  beforeEach(() => {
    state.isAuthenticated = true
    state.token = 'access-1'
    state.refreshAccessToken.mockReset()
    state.signOutSession.mockReset()
    socket.handlers.clear()
    socket.connected = false
    socket.active = false
    socket.connect.mockReset()
    socket.disconnect.mockReset()
    socket.emit.mockReset()
    io.mockReset()
    io.mockImplementation((_url: string, options: unknown) => {
      socket.options = options
      return socket
    })
  })

  it('does not connect without a signed-in session', () => {
    state.isAuthenticated = false
    render(<Probe />, { wrapper })
    expect(io).not.toHaveBeenCalled()

    state.isAuthenticated = true
    state.token = null
    render(<Probe />, { wrapper })
    expect(io).not.toHaveBeenCalled()
  })

  it('sends the current access token with every handshake', () => {
    render(<Probe />, { wrapper })
    expect(io).toHaveBeenCalledTimes(1)

    const handshake = socket.auth as (cb: (data: object) => void) => void
    const sent: object[] = []
    state.token = 'access-2'
    handshake((data) => sent.push(data))
    expect(sent).toEqual([{ token: 'access-2' }])
    expect(socket.options).toMatchObject({ reconnection: true })
  })

  it('reports the connection state and keeps live SOS alerts and GPS positions', () => {
    render(<Probe />, { wrapper })

    act(() => socket.fire('connect'))
    expect(screen.getByTestId('connected')).toHaveTextContent('true')

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-14T02:03:04.000Z'))
    act(() => socket.fire('sos:new', alert))
    vi.useRealTimers()
    // The payload carries no date: the alert keeps the moment it arrived
    expect(screen.getByTestId('last-alert')).toHaveTextContent('SOS-20260914-A1B2C3|fire|high|Cháy kho vật tư|2026-09-14T02:03:04.000Z')
    act(() => socket.fire('sos:new', alert))
    act(() => socket.fire('sos:new', { ...alert, id: 'sos-2' }))
    expect(screen.getByTestId('alerts')).toHaveTextContent('sos-2,sos-1')

    act(() => socket.fire('sos:resolved', { id: 'sos-2' }))
    expect(screen.getByTestId('alerts')).toHaveTextContent(/^sos-1$/)


    act(() => screen.getByRole('button', { name: 'clear' }).click())
    expect(socket.emit).toHaveBeenCalledWith('sos:resolve', { id: 'sos-1' })
    expect(screen.getByTestId('alerts')).toHaveTextContent(/^$/)

    act(() => socket.fire('disconnect', 'transport close'))
    expect(screen.getByTestId('connected')).toHaveTextContent('false')
  })

  it('refreshes the token and reconnects when the handshake is refused for an expired token', async () => {
    state.refreshAccessToken.mockImplementation(async () => {
      state.token = 'access-2'
      return 'access-2'
    })
    render(<Probe />, { wrapper })

    await act(async () => {
      socket.fire('connect_error', new Error('invalid_token'))
    })

    expect(state.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it('signs out when the handshake carried no token', () => {
    render(<Probe />, { wrapper })
    act(() => socket.fire('connect_error', new Error('missing_token')))
    expect(state.signOutSession).toHaveBeenCalledWith('session_ended')
  })

  it('stops the session handling and disconnects when the session ends', () => {
    const { rerender } = render(<Probe />, { wrapper })
    state.isAuthenticated = false
    rerender(<Probe />)

    expect(socket.disconnect).toHaveBeenCalledTimes(1)
    expect(socket.handlers.get('connect_error')?.size ?? 0).toBe(0)
    expect(socket.handlers.get('session_expired')?.size ?? 0).toBe(0)
  })

  // gps.service.ts publish sends one GET /gps/live row to the GPS rooms the gateway joined on
  // connect; the provider keeps no positions itself and hands each row to its subscribers
  it('hands each gps:update row to the subscribers until they unsubscribe', () => {
    const { result } = renderHook(() => useSocket(), { wrapper })
    expect(Object.keys(result.current).sort()).toEqual(['activeSosAlerts', 'clearSosAlert', 'isConnected', 'onGpsUpdate'])
    const first = vi.fn()
    const second = vi.fn()
    let stopFirst = () => {}
    act(() => {
      stopFirst = result.current.onGpsUpdate(first)
      result.current.onGpsUpdate(second)
    })

    act(() => socket.fire('gps:update', liveRow))
    expect(first).toHaveBeenCalledWith(liveRow)
    expect(second).toHaveBeenCalledWith(liveRow)

    act(() => stopFirst())
    const moved = { ...liveRow, lat: 10.8 }
    act(() => socket.fire('gps:update', moved))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenLastCalledWith(moved)
  })

  it('keeps the same subscribe function across renders', () => {
    const { result } = renderHook(() => useSocket(), { wrapper })
    const subscribe = result.current.onGpsUpdate
    act(() => socket.fire('sos:new', alert))
    expect(result.current.activeSosAlerts).toHaveLength(1)
    expect(result.current.onGpsUpdate).toBe(subscribe)
  })

  it('stops listening for gps:update when the session ends', () => {
    const { rerender } = render(<Probe />, { wrapper })
    expect(socket.handlers.get('gps:update')?.size ?? 0).toBe(1)

    state.isAuthenticated = false
    rerender(<Probe />)
    expect(socket.handlers.get('gps:update')?.size ?? 0).toBe(0)
  })

  it('refuses to be used outside the provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useSocket())).toThrow('useSocket must be used within SocketProvider')
    error.mockRestore()
  })
})

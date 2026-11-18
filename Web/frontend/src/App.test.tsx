// The signed-in shell: every page route is guarded by its permission and loads its page lazily
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import App from './App'

const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }))
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/contexts/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true, isLoading: false, logout: vi.fn() }),
}))
vi.mock('@/contexts/SocketContext', () => ({
  SocketProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({ activeSosAlerts: [], isConnected: true }),
}))

function signIn(role: string) {
  session.user = {
    id: 'u1',
    username: 'nguoidung',
    fullName: 'Nguyễn Văn A',
    role,
    roles: [role],
    unitScope: null,
    email: null,
    phone: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function openAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

describe('App shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url: string, config?: { params?: { limit?: number } }) => {
      if (url === '/notifications') {
        return Promise.resolve({ data: { data: [], total: 0, page: 1, limit: config?.params?.limit ?? 20 } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('renders the header and the lazily loaded page of the current route', async () => {
    signIn('system_admin')
    openAt('/notifications')

    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(await screen.findByTestId('notifications-page', {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(await screen.findByText('Không có thông báo')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/notifications')
  })

  it("sends a role without the page's permission to the forbidden page", async () => {
    signIn('dqtv_member')
    openAt('/users')

    expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/forbidden')
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
  })
})

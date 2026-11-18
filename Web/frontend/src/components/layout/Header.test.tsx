import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { Header } from './Header'

const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> | null, logout: vi.fn() }))
const socket = vi.hoisted(() => ({ activeSosAlerts: [] as { id: string }[], isConnected: true }))
const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }))
const server = vi.hoisted(() => ({ unread: 0 }))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, logout: session.logout }),
}))
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => socket,
}))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

type Params = { page?: number; limit?: number; read?: boolean }

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderHeader(onMenuToggle?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <QueryClientProvider client={client}>
        <Header onMenuToggle={onMenuToggle} />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.unread = 0
    socket.activeSosAlerts = []
    socket.isConnected = true
    session.user = { fullName: 'Nguyễn Văn A', role: 'police_ward', roles: ['police_ward'] }
    api.get.mockImplementation((url: string, config: { params: Params }) => {
      if (url !== '/notifications') return Promise.reject(new Error(`unexpected GET ${url}`))
      const { page = 1, limit = 20, read } = config.params
      if (read === false && limit === 1) {
        return Promise.resolve({ data: { data: [], total: server.unread, page: 1, limit: 1 } })
      }
      const rows = [
        { id: 'n1', type: 'sos', title: 'Báo động SOS', body: null, entityType: null, entityId: null, isRead: false, readAt: null, createdAt: '2026-09-14T01:00:00.000Z' },
      ]
      return Promise.resolve({ data: { data: rows, total: 1, page, limit } })
    })
  })

  // Labels are the role names of Web/backend/migrations/023_role_catalogue.sql
  it.each([
    ['system_admin', 'Quản trị hệ thống'],
    ['ubnd_leader', 'Lãnh đạo UBND'],
    ['police_ward', 'Công an phường'],
    ['police_area', 'Công an khu vực'],
    ['office_staff', 'Nhân viên văn phòng'],
    ['dqtv', 'Dân quân tự vệ'],
    ['ca_officer', 'Cán bộ công an'],
    ['ca_ward', 'Công an phường (CA)'],
    ['ca_area', 'Công an khu vực (CA)'],
    ['dqtv_member', 'Thành viên DQTV'],
  ])('labels the primary role %s in Vietnamese', (role, label) => {
    session.user = { fullName: 'Nguyễn Văn A', role, roles: [role] }
    renderHeader()
    expect(screen.getByTestId('user-role-label')).toHaveTextContent(label)
  })

  it('shows the system title, slogan and logo', () => {
    renderHeader()

    expect(screen.getByRole('heading', { name: 'HỆ THỐNG QUẢN LÝ LỰC LƯỢNG BẢO VỆ AN NINH TRẬT TỰ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'QUẢN LÝ ANTT' })).toBeInTheDocument()
    expect(screen.getByText('Giữ vững bình yên, vững vàng cơ sở')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Bảo vệ An ninh Trật tự' })).toBeInTheDocument()
  })

  it('replaces a logo that cannot load with the text logo', () => {
    renderHeader()
    const logo = screen.getByRole('img', { name: 'Bảo vệ An ninh Trật tự' })
    expect(screen.getByText('MMS')).toHaveClass('hidden')

    fireEvent.error(logo)

    expect(logo).toHaveStyle({ display: 'none' })
    expect(screen.getByText('MMS')).not.toHaveClass('hidden')
  })

  it('opens the navigation menu from the burger button', async () => {
    const user = userEvent.setup()
    const onMenuToggle = vi.fn()
    renderHeader(onMenuToggle)

    await user.click(screen.getByRole('button', { name: 'Mở menu' }))

    expect(onMenuToggle).toHaveBeenCalledTimes(1)
  })

  it('tells whether the real-time connection is up', () => {
    const { unmount } = renderHeader()
    expect(screen.getByTestId('connection-status')).toHaveAttribute('title', 'Kết nối real-time hoạt động')
    unmount()

    socket.isConnected = false
    renderHeader()
    expect(screen.getByTestId('connection-status')).toHaveAttribute('title', 'Đang kết nối lại...')
  })

  it('shows the number of active SOS alerts', () => {
    socket.activeSosAlerts = [{ id: 's1' }, { id: 's2' }]
    renderHeader()
    expect(screen.getByTestId('sos-alert-banner')).toHaveTextContent('2 SOS')
  })

  it('shows no SOS badge without active alerts', () => {
    renderHeader()
    expect(screen.queryByTestId('sos-alert-banner')).not.toBeInTheDocument()
  })

  it('shows the initial of the user, or a placeholder and no role without a name', () => {
    const { unmount } = renderHeader()
    expect(screen.getByTestId('user-initial')).toHaveTextContent('N')
    unmount()

    session.user = { fullName: '', role: null }
    renderHeader()
    expect(screen.getByTestId('user-initial')).toHaveTextContent('U')
    expect(screen.getByTestId('user-role-label')).toHaveTextContent('—')
  })

  describe('user menu', () => {
    it('opens the profile page and closes', async () => {
      const user = userEvent.setup()
      renderHeader()

      await user.click(screen.getByTestId('user-chip'))
      await user.click(screen.getByRole('button', { name: 'Thông tin cá nhân' }))

      expect(screen.getByTestId('location')).toHaveTextContent('/settings/profile')
      expect(screen.queryByRole('button', { name: 'Thông tin cá nhân' })).not.toBeInTheDocument()
    })

    it('opens the settings and closes', async () => {
      const user = userEvent.setup()
      renderHeader()

      await user.click(screen.getByTestId('user-chip'))
      await user.click(screen.getByRole('button', { name: 'Cài đặt' }))

      expect(screen.getByTestId('location')).toHaveTextContent('/settings/profile')
      expect(screen.queryByRole('button', { name: 'Cài đặt' })).not.toBeInTheDocument()
    })

    it('signs out', async () => {
      const user = userEvent.setup()
      renderHeader()

      await user.click(screen.getByTestId('user-chip'))
      await user.click(screen.getByRole('button', { name: 'Đăng xuất' }))

      expect(session.logout).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument()
    })

    it('closes on a click outside', async () => {
      const user = userEvent.setup()
      renderHeader()

      await user.click(screen.getByTestId('user-chip'))
      expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument()
      await user.click(screen.getByTestId('user-menu-backdrop'))

      expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument()
      expect(session.logout).not.toHaveBeenCalled()
    })
  })

  describe('notification bell', () => {
    it('shows the unread total on the bell', async () => {
      server.unread = 4
      renderHeader()

      await waitFor(() => expect(screen.getByTestId('bell-unread-count')).toHaveTextContent('4'))
      expect(screen.getByTestId('notifications-btn')).toHaveAccessibleName('Thông báo (4 chưa đọc)')
      expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 1, read: false } })
    })

    it('caps the badge at 99+', async () => {
      server.unread = 120
      renderHeader()
      await waitFor(() => expect(screen.getByTestId('bell-unread-count')).toHaveTextContent('99+'))
    })

    it('shows no badge when everything is read', async () => {
      renderHeader()

      await waitFor(() => expect(api.get).toHaveBeenCalled())
      expect(screen.queryByTestId('bell-unread-count')).not.toBeInTheDocument()
      expect(screen.getByTestId('notifications-btn')).toHaveAccessibleName('Thông báo')
    })

    it('does not ask for the unread total without a signed-in user', () => {
      session.user = null
      renderHeader()
      expect(api.get).not.toHaveBeenCalled()
    })

    it('opens the notification drawer from the bell and closes it again', async () => {
      const user = userEvent.setup()
      renderHeader()
      const bell = screen.getByTestId('notifications-btn')
      expect(bell).toHaveAttribute('aria-expanded', 'false')

      await user.click(bell)

      const drawer = await screen.findByRole('complementary', { name: 'Thông báo' })
      expect(await screen.findByText('Báo động SOS')).toBeInTheDocument()
      expect(drawer).toBeInTheDocument()
      expect(bell).toHaveAttribute('aria-expanded', 'true')
      expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 10 } })

      await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }))

      expect(screen.queryByRole('complementary', { name: 'Thông báo' })).not.toBeInTheDocument()
      expect(bell).toHaveAttribute('aria-expanded', 'false')
    })
  })
})

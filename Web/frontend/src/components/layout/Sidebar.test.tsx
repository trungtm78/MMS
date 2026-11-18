import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { ALL_ROLES, SIDEBAR_ROUTE_ROLES } from '@/test/backendRouteRoles'

const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }) } }))
// Real useRbac: every entry follows the @Roles of the page it opens
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, logout: vi.fn() }),
}))

function renderAs(role: string) {
  session.user = { id: `user-${role}`, role, roles: [role], unitScope: null }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Sidebar current="dashboard" onNavigate={vi.fn()} />
    </QueryClientProvider>,
  )
}

function openAllGroups() {
  for (const button of screen.queryAllByRole('button', { expanded: false })) fireEvent.click(button)
}

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // One mapping per entry: shown to exactly the roles the backend lets load the page
  it.each(Object.entries(SIDEBAR_ROUTE_ROLES))('shows %s to exactly the roles of its endpoint', (route, { roles, source }) => {
    const shownTo = ALL_ROLES.filter((role) => {
      renderAs(role)
      openAllGroups()
      const shown = screen.queryByTestId(`nav-${route}`) !== null
      cleanup()
      return shown
    })
    expect({ route, source, shownTo }).toEqual({ route, source, shownTo: ALL_ROLES.filter((role) => roles.includes(role)) })
  })

  it.each(ALL_ROLES)('always offers %s the dashboard, help and settings', (role) => {
    renderAs(role)
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('nav-help')).toBeInTheDocument()
    expect(screen.getByTestId('settings-btn')).toBeInTheDocument()
  })

  it('hides groups with no entry the role may open', () => {
    renderAs('dqtv_member')
    expect(screen.queryByRole('button', { name: 'Quản Trị' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quản Lý Nhân Sự' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Huấn Luyện' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Báo Cáo Pháp Định' })).not.toBeInTheDocument()
  })

  // DQTV members read their own decisions (rewards.roles.ts REWARD_READER_ROLES) without seeing the administration group
  it('lists rewards and discipline in a group of their own', () => {
    renderAs('dqtv_member')
    expect(screen.queryByTestId('nav-rewards')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Khen Thưởng - Kỷ Luật' }))
    expect(screen.getByTestId('nav-rewards')).toHaveTextContent('Quyết định khen thưởng, kỷ luật')
  })

  it('labels the fixed entries, the mobile close button and the favourite toggles', () => {
    session.user = { id: 'user-sa', role: 'system_admin', roles: ['system_admin'], unitScope: null }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Sidebar current="dashboard" onNavigate={vi.fn()} onClose={vi.fn()} />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('sidebar')).toHaveAccessibleName('Điều hướng')
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đóng menu' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-dashboard')).toHaveTextContent('Tổng quan')
    expect(screen.getByTestId('nav-help')).toHaveTextContent('Hướng dẫn')
    expect(screen.getByTestId('settings-btn')).toHaveTextContent('Cài đặt')
    expect(screen.getByTestId('logout-btn')).toHaveTextContent('Đăng xuất')

    fireEvent.click(screen.getByRole('button', { name: 'Quản Trị' }))
    expect(screen.getByTestId('nav-user-management')).toHaveTextContent('Quản lý tài khoản')
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm vào yêu thích' })[0])
    expect(screen.getByRole('button', { name: 'Yêu thích' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xóa khỏi yêu thích' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Bỏ yêu thích' }).length).toBeGreaterThan(0)
  })

  it('shows a DQTV member today’s attendance and open tasks', async () => {
    const api = (await import('@/api/client')).default as unknown as { get: ReturnType<typeof vi.fn> }
    api.get.mockResolvedValueOnce({ data: { pendingTasks: 3 } })
    renderAs('dqtv_member')
    expect(screen.getByText('Hôm nay')).toBeInTheDocument()
    expect(await screen.findByText('Đã ghi nhận')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Điểm danh:')).toBeInTheDocument()
    expect(screen.getByText('Nhiệm vụ:')).toBeInTheDocument()
  })

  it('keeps the administration group collapsed until it is opened', () => {
    renderAs('system_admin')
    expect(screen.queryByTestId('nav-user-management')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quản Trị' }))
    expect(screen.getByTestId('nav-user-management')).toBeInTheDocument()
  })
})

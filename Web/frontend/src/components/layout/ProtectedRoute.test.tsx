import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { i18n } from '@/test/i18n'
import type { UserRole } from '@/types'
import { ForbiddenPage, ProtectedRoute } from './ProtectedRoute'

const session = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  user: null as Record<string, unknown> | null,
}))
// Real useRbac
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => session }))

// Replaces texts of the locale files for one test, to prove the guard reads them from there
const restoreTexts: (() => void)[] = []
function overrideText(key: string, value: string) {
  const previous: unknown = i18n.getResource('vi', 'translation', key)
  i18n.addResource('vi', 'translation', key, value)
  restoreTexts.push(() => {
    if (typeof previous === 'string') i18n.addResource('vi', 'translation', key, previous)
  })
}

function renderGuarded(role: UserRole, requiredRoles?: UserRole[]) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
  render(
    <MemoryRouter initialEntries={['/page']}>
      <Routes>
        <Route
          path="/page"
          element={
            <ProtectedRoute requiredRoles={requiredRoles}>
              <p>Nội dung trang</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<p>Trang đăng nhập</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    session.isLoading = false
    session.isAuthenticated = true
    for (const restore of restoreTexts.splice(0).reverse()) restore()
  })

  it('shows a loading state while the session is being restored', () => {
    session.isLoading = true
    renderGuarded('system_admin')

    expect(screen.getByText('Đang tải...')).toBeInTheDocument()
    expect(screen.queryByText('Nội dung trang')).not.toBeInTheDocument()
  })

  it('sends a visitor who is not signed in to the login page', () => {
    session.isAuthenticated = false
    renderGuarded('system_admin')

    expect(screen.getByText('Trang đăng nhập')).toBeInTheDocument()
  })

  it('shows the forbidden page to a role that is not allowed', () => {
    renderGuarded('dqtv_member', ['system_admin'])

    expect(screen.getByTestId('forbidden-page')).toBeInTheDocument()
    expect(screen.queryByText('Nội dung trang')).not.toBeInTheDocument()
  })

  it('shows the page to an allowed role, or to every signed-in role without required roles', () => {
    renderGuarded('system_admin', ['system_admin'])
    expect(screen.getByText('Nội dung trang')).toBeInTheDocument()
  })

  it('shows the page to every signed-in role when no roles are required', () => {
    renderGuarded('dqtv_member')
    expect(screen.getByText('Nội dung trang')).toBeInTheDocument()
  })

  it('explains the forbidden page', () => {
    render(<ForbiddenPage />)

    expect(screen.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument()
    expect(
      screen.getByText('Bạn không có quyền xem trang này. Vui lòng liên hệ quản trị viên nếu cần hỗ trợ.'),
    ).toBeInTheDocument()
  })

  it('reads its texts from the locale file', () => {
    overrideText('common.states.loading', 'LOADING')
    overrideText('layout.forbidden.page.title', 'FORBIDDEN')
    overrideText('layout.forbidden.page.description', 'FORBIDDEN_DESCRIPTION')

    session.isLoading = true
    renderGuarded('system_admin')
    expect(screen.getByText('LOADING')).toBeInTheDocument()

    render(<ForbiddenPage />)
    expect(screen.getByRole('heading', { name: 'FORBIDDEN' })).toBeInTheDocument()
    expect(screen.getByText('FORBIDDEN_DESCRIPTION')).toBeInTheDocument()
  })
})

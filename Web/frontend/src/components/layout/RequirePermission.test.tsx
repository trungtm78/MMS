import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RequirePermission } from './RequirePermission'

const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))
// Real useRbac
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: session.user, isAuthenticated: true }) }))

function renderGuarded(role: string, permission: Parameters<typeof RequirePermission>[0]['permission']) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
  render(
    <MemoryRouter initialEntries={['/page']}>
      <Routes>
        <Route
          path="/page"
          element={
            <RequirePermission permission={permission}>
              <p>Nội dung trang</p>
            </RequirePermission>
          }
        />
        <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequirePermission', () => {
  it('shows the page to a role that holds the permission', () => {
    renderGuarded('office_staff', 'manageAttendance')
    expect(screen.getByText('Nội dung trang')).toBeInTheDocument()
  })

  it('sends a role without the permission to the forbidden page before the page loads', () => {
    renderGuarded('police_ward', 'manageAttendance')
    expect(screen.getByText('Trang cấm truy cập')).toBeInTheDocument()
    expect(screen.queryByText('Nội dung trang')).not.toBeInTheDocument()
  })

  it('shows a page that needs no permission to every signed-in role', () => {
    renderGuarded('dqtv_member', null)
    expect(screen.getByText('Nội dung trang')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserManagementPage } from './UserManagementPage'

// Mock the API module
vi.mock('@/api/admin', () => ({
  listUsers: vi.fn().mockResolvedValue({
    data: [
      { id: '1', username: 'admin1', fullName: 'Admin User', email: null, phone: null, status: 'active', role: 'system_admin', unitScope: null, createdAt: '2026-01-01' },
      { id: '2', username: 'staff1', fullName: 'Staff User', email: null, phone: null, status: 'inactive', role: 'office_staff', unitScope: 'UNIT_001', createdAt: '2026-01-02' },
    ],
    total: 2,
    page: 1,
    limit: 20,
  }),
  updateUserStatus: vi.fn().mockResolvedValue(undefined),
  resetPassword: vi.fn().mockResolvedValue({ temporaryPassword: 'TempPass123' }),
  createUser: vi.fn().mockResolvedValue({ id: '3', username: 'new_user', fullName: 'New User', email: null, phone: null, status: 'active', role: 'dqtv', unitScope: null, createdAt: '2026-01-03' }),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
}))

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('UserManagementPage', () => {
  it('renders user table after loading', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => expect(screen.getByTestId('user-table')).toBeInTheDocument())
    expect(screen.getByText('admin1')).toBeInTheDocument()
    expect(screen.getByText('staff1')).toBeInTheDocument()
  })

  it('search filters user list', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => screen.getByTestId('user-table'))
    const searchInput = screen.getByTestId('user-search-input')
    await userEvent.type(searchInput, 'admin')
    expect(screen.getByText('admin1')).toBeInTheDocument()
    expect(screen.queryByText('staff1')).not.toBeInTheDocument()
  })

  it('opens add user modal when button clicked', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => screen.getByTestId('add-user-btn'))
    await userEvent.click(screen.getByTestId('add-user-btn'))
    expect(screen.getByTestId('add-user-modal')).toBeInTheDocument()
  })

  it('shows reset password modal with temp password', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => screen.getAllByTestId(/^reset-password-/))
    const resetBtns = screen.getAllByTestId(/^reset-password-/)
    await userEvent.click(resetBtns[0])
    await waitFor(() => expect(screen.getByTestId('reset-password-modal')).toBeInTheDocument())
    expect(screen.getByTestId('temp-password')).toHaveTextContent('TempPass123')
  })

  it('closes reset password modal on confirm', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => screen.getAllByTestId(/^reset-password-/))
    const resetBtns = screen.getAllByTestId(/^reset-password-/)
    await userEvent.click(resetBtns[0])
    await waitFor(() => screen.getByTestId('close-reset-modal'))
    await userEvent.click(screen.getByTestId('close-reset-modal'))
    expect(screen.queryByTestId('reset-password-modal')).not.toBeInTheDocument()
  })
})

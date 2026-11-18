import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserManagementPage } from './UserManagementPage'

// The HTTP layer is replaced; api/admin.ts runs for real so request bodies are checked
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({
  user: { id: 'me', role: 'system_admin', roles: ['system_admin'], unitScope: null as string | null },
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// GET /admin/users rows (Web/backend/src/admin/admin.service.ts UserListItem)
const users = [
  { id: 'u1', username: 'admin1', fullName: 'Admin User', email: null, phone: null, status: 'active', role: 'system_admin', roles: ['system_admin'], unitScope: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u2', username: 'staff1', fullName: 'Staff User', email: null, phone: null, status: 'inactive', role: 'police_area', roles: ['police_area', 'office_staff'], unitScope: 'KP1', createdAt: '2026-01-02T00:00:00.000Z' },
]

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

type User = ReturnType<typeof userEvent.setup>

async function openAddUser(user: User) {
  await user.click(await screen.findByTestId('add-user-btn'))
  return screen.getByTestId('add-user-modal')
}

async function fillNewUser(user: User, fields: { username: string; fullName: string; role?: string; unit?: string; email?: string; phone?: string }) {
  await user.type(screen.getByTestId('new-username-input'), fields.username)
  await user.type(screen.getByTestId('new-fullname-input'), fields.fullName)
  if (fields.role) await user.selectOptions(screen.getByTestId('new-role-select'), fields.role)
  if (fields.unit) await user.type(screen.getByTestId('new-unit-input'), fields.unit)
  if (fields.email) await user.type(screen.getByTestId('new-email-input'), fields.email)
  if (fields.phone) await user.type(screen.getByTestId('new-phone-input'), fields.phone)
}

describe('UserManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.user = { id: 'me', role: 'system_admin', roles: ['system_admin'], unitScope: null }
    api.get.mockResolvedValue({ data: { data: users, total: 2, page: 1, limit: 20 } })
    api.post.mockImplementation((url: string) => {
      if (url.endsWith('/reset-password')) return Promise.resolve({ data: { temporaryPassword: 'TempPass123' } })
      return Promise.resolve({
        data: { id: 'u3', username: 'new.user', fullName: 'Nguyễn Văn Mới', email: null, phone: null, status: 'active', role: 'ca_officer', roles: ['ca_officer'], unitScope: 'KP2', createdAt: '2026-01-03T00:00:00.000Z', temporaryPassword: 'NewPass456' },
      })
    })
    api.patch.mockResolvedValue({ data: undefined })
  })

  describe('access', () => {
    function renderRoute() {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      return render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/admin/users']}>
            <Routes>
              <Route path="/admin/users" element={<UserManagementPage />} />
              <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
    }

    // /admin/users admits system_admin and office_staff (admin.controller.ts)
    it.each(['police_ward', 'police_area', 'ca_ward', 'ca_officer', 'ubnd_leader', 'dqtv'])(
      'sends %s to the forbidden page without calling /admin/users',
      async (role) => {
        session.user = { id: 'me', role, roles: [role], unitScope: 'KP1' }
        renderRoute()
        expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
        expect(api.get).not.toHaveBeenCalled()
      },
    )

    it('lets office_staff manage users', async () => {
      session.user = { id: 'me', role: 'office_staff', roles: ['office_staff'], unitScope: 'KP1' }
      renderRoute()
      expect(await screen.findByTestId('user-table')).toBeInTheDocument()
      expect(screen.queryByText('Trang cấm truy cập')).not.toBeInTheDocument()
    })
  })

  it('renders user table after loading', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => expect(screen.getByTestId('user-table')).toBeInTheDocument())
    expect(screen.getByText('admin1')).toBeInTheDocument()
    expect(screen.getByText('staff1')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/admin/users', { params: { page: 1, limit: 20 } })
  })

  it('search filters user list', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => screen.getByTestId('user-table'))
    const searchInput = screen.getByTestId('user-search-input')
    await userEvent.type(searchInput, 'admin')
    expect(screen.getByText('admin1')).toBeInTheDocument()
    expect(screen.queryByText('staff1')).not.toBeInTheDocument()
  })

  it('shows every role a user holds', async () => {
    renderWithQuery(<UserManagementPage />)
    const row = within(await screen.findByTestId('user-row-u2'))
    expect(row.getByText('Công an khu vực')).toBeInTheDocument()
    expect(row.getByText('Nhân viên văn phòng')).toBeInTheDocument()
  })

  it('falls back to the primary role when a row has no roles list', async () => {
    api.get.mockResolvedValue({ data: { data: [{ ...users[0], roles: undefined }], total: 1, page: 1, limit: 20 } })
    renderWithQuery(<UserManagementPage />)
    const row = within(await screen.findByTestId('user-row-u1'))
    expect(row.getByText('Quản trị hệ thống')).toBeInTheDocument()
  })

  it('counts the shown and total accounts under the table', async () => {
    renderWithQuery(<UserManagementPage />)
    await screen.findByTestId('user-row-u2')
    expect(screen.getByTestId('user-count')).toHaveTextContent('Hiển thị 2 / tổng 2 tài khoản')
  })

  it('names each status and the account an action applies to', async () => {
    api.get.mockResolvedValue({
      data: { data: [...users, { ...users[1], id: 'u4', username: 'locked1', status: 'suspended' }], total: 3, page: 1, limit: 20 },
    })
    renderWithQuery(<UserManagementPage />)

    const active = within(await screen.findByTestId('user-row-u1'))
    expect(active.getByText('Hoạt động')).toBeInTheDocument()
    expect(active.getByRole('button', { name: 'Khóa tài khoản admin1' })).toHaveAttribute('title', 'Khóa tài khoản')
    expect(active.getByRole('list', { name: 'Vai trò của Admin User' })).toBeInTheDocument()
    const inactive = within(screen.getByTestId('user-row-u2'))
    expect(inactive.getByText('Không hoạt động')).toBeInTheDocument()
    expect(inactive.getByRole('button', { name: 'Mở khóa tài khoản staff1' })).toBeInTheDocument()
    expect(inactive.getByRole('button', { name: 'Đặt lại mật khẩu cho staff1' })).toBeInTheDocument()
    expect(inactive.getByRole('button', { name: 'Đặt lại xác thực hai lớp cho staff1' })).toBeInTheDocument()
    expect(within(screen.getByTestId('user-row-u4')).getByText('Tạm khóa')).toBeInTheDocument()
  })

  it('opens add user modal when button clicked', async () => {
    renderWithQuery(<UserManagementPage />)
    await waitFor(() => screen.getByTestId('add-user-btn'))
    await userEvent.click(screen.getByTestId('add-user-btn'))
    expect(screen.getByTestId('add-user-modal')).toBeInTheDocument()
  })

  describe('create user', () => {
    it('posts exactly the CreateUserBodyDto fields, trimmed', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await openAddUser(user)
      await fillNewUser(user, { username: ' new.user ', fullName: ' Nguyễn Văn Mới ', role: 'ca_officer', unit: ' KP2 ' })
      await user.click(screen.getByTestId('submit-add-user'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      const [url, body] = api.post.mock.calls[0]
      expect(url).toBe('/admin/users')
      expect(body).toStrictEqual({ username: 'new.user', fullName: 'Nguyễn Văn Mới', role: 'ca_officer', unitCode: 'KP2' })
      expect(await screen.findByTestId('temp-password')).toHaveTextContent('NewPass456')
    })

    it('sends email and phone only when they are filled in', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await openAddUser(user)
      await fillNewUser(user, { username: 'new.user', fullName: 'Nguyễn Văn Mới', email: 'moi@phudinh.gov.vn', phone: '0901234567' })
      await user.click(screen.getByTestId('submit-add-user'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][1]).toStrictEqual({
        username: 'new.user',
        fullName: 'Nguyễn Văn Mới',
        email: 'moi@phudinh.gov.vn',
        phone: '0901234567',
        role: 'dqtv',
      })
    })

    it('checks the username format before sending', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await openAddUser(user)
      await fillNewUser(user, { username: 'ab', fullName: 'Nguyễn Văn Mới' })
      await user.click(screen.getByTestId('submit-add-user'))

      expect(await screen.findByTestId('new-username-error')).toHaveTextContent('3–50 ký tự')
      expect(screen.getByTestId('new-username-input')).toHaveAttribute('aria-invalid', 'true')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('checks the full name, email and phone before sending', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      const modal = within(await openAddUser(user))
      await fillNewUser(user, { username: 'new.user', fullName: '   ', email: 'not-an-email', phone: 'abc' })
      await user.click(screen.getByTestId('submit-add-user'))

      expect(await modal.findByTestId('new-fullname-error')).toHaveTextContent('Vui lòng nhập họ và tên')
      expect(modal.getByTestId('new-email-error')).toHaveTextContent('Email không hợp lệ')
      expect(modal.getByTestId('new-phone-error')).toHaveTextContent('Số điện thoại không hợp lệ')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('shows a 400 answer without a known code as invalid data', async () => {
      api.post.mockRejectedValueOnce(httpError(400, 'Bad Request'))
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      const modal = await openAddUser(user)
      await fillNewUser(user, { username: 'new.user', fullName: 'Nguyễn Văn Mới' })
      await user.click(screen.getByTestId('submit-add-user'))

      expect(await within(modal).findByRole('alert')).toHaveTextContent('Dữ liệu không hợp lệ. Vui lòng kiểm tra lại thông tin.')
    })

    it('falls back to a generic failure text for other answers', async () => {
      api.post.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      const modal = await openAddUser(user)
      await fillNewUser(user, { username: 'new.user', fullName: 'Nguyễn Văn Mới' })
      await user.click(screen.getByTestId('submit-add-user'))

      expect(await within(modal).findByRole('alert')).toHaveTextContent('Tạo tài khoản thất bại')
    })

    it('confirms a created account', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await openAddUser(user)
      await fillNewUser(user, { username: 'new.user', fullName: 'Nguyễn Văn Mới' })
      await user.click(screen.getByTestId('submit-add-user'))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tạo tài khoản thành công'))
      expect(await screen.findByText('Mật khẩu tạm thời')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Đã ghi nhận' })).toBeInTheDocument()
    })

    it('offers all 10 roles to a system admin', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await openAddUser(user)

      const options = within(screen.getByTestId('new-role-select')).getAllByRole('option')
      expect(options.map((o) => (o as HTMLOptionElement).value).sort()).toEqual(
        ['ca_area', 'ca_officer', 'ca_ward', 'dqtv', 'dqtv_member', 'office_staff', 'police_area', 'police_ward', 'system_admin', 'ubnd_leader'],
      )
    })

    it('offers office staff only the roles the backend lets them assign', async () => {
      session.user = { id: 'me', role: 'office_staff', roles: ['office_staff'], unitScope: 'KP1' }
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await openAddUser(user)

      const options = within(screen.getByTestId('new-role-select')).getAllByRole('option')
      expect(options.map((o) => (o as HTMLOptionElement).value).sort()).toEqual(['ca_officer', 'dqtv', 'dqtv_member', 'office_staff'])
    })

    // Web/backend/src/admin/admin.service.ts createUser
    it.each([
      [400, 'unknown_role', 'new-role-select', 'Vai trò không tồn tại trong hệ thống'],
      [400, 'unknown_unit', 'new-unit-input', 'Mã đơn vị không tồn tại'],
      [409, 'username_taken', 'new-username-input', 'Tên đăng nhập đã được sử dụng'],
      [409, 'email_taken', 'new-email-input', 'Email đã được sử dụng'],
    ])('shows HTTP %i %s next to the field', async (status, code, field, message) => {
      api.post.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      const modal = await openAddUser(user)
      await fillNewUser(user, { username: 'new.user', fullName: 'Nguyễn Văn Mới' })
      await user.click(screen.getByTestId('submit-add-user'))

      expect(await within(modal).findByText(message)).toBeInTheDocument()
      expect(screen.getByTestId(field)).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByTestId('add-user-modal')).toBeInTheDocument()
    })

    it('shows validation messages next to their fields and the rest in the form message', async () => {
      api.post.mockRejectedValueOnce({
        isAxiosError: true,
        request: {},
        response: {
          status: 400,
          data: {
            code: 'E001',
            message: 'validation_failed',
            errors: [
              'username must be 3-50 letters, digits, dots, underscores or hyphens',
              'phone must be a phone number',
              'property password should not exist',
            ],
            statusCode: 400,
          },
        },
      })
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      const modal = await openAddUser(user)
      await fillNewUser(user, { username: 'new.user', fullName: 'Nguyễn Văn Mới', phone: '0901234567' })
      await user.click(screen.getByTestId('submit-add-user'))

      expect(await within(modal).findByTestId('new-username-error')).toHaveTextContent('username must be 3-50 letters')
      expect(screen.getByTestId('new-username-input')).toHaveAttribute('aria-invalid', 'true')
      expect(within(modal).getByTestId('new-phone-error')).toHaveTextContent('phone must be a phone number')
      const formError = within(modal).getByRole('alert')
      expect(formError).toHaveTextContent('property password should not exist')
      expect(formError).not.toHaveTextContent('phone must be a phone number')
    })

    it('explains a refusal that is not about one field', async () => {
      api.post.mockRejectedValueOnce(httpError(403, 'unit_scope_violation'))
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      const modal = await openAddUser(user)
      await fillNewUser(user, { username: 'new.user', fullName: 'Nguyễn Văn Mới' })
      await user.click(screen.getByTestId('submit-add-user'))

      expect(await within(modal).findByRole('alert')).toHaveTextContent('Đơn vị nằm ngoài phạm vi quản lý của bạn')
    })
  })

  // POST /admin/users/:id/mfa/reset — MfaAdminController, system_admin only (mfa.controller.ts:190-203)
  describe('second-factor reset', () => {
    it('resets another user\'s second factor after a confirmation that their sessions end', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await user.click(await screen.findByTestId('reset-mfa-u2'))
      const dialog = await screen.findByRole('alertdialog', { name: 'Đặt lại xác thực hai lớp?' })
      expect(dialog).toHaveTextContent('staff1')
      expect(dialog).toHaveTextContent('Mọi phiên đăng nhập của tài khoản này sẽ kết thúc ngay')
      expect(api.post).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'Đặt lại' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/users/u2/mfa/reset'))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã đặt lại xác thực hai lớp cho staff1'))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    })

    it('does nothing when the confirmation is cancelled', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await user.click(await screen.findByTestId('reset-mfa-u2'))
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Hủy' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(api.post).not.toHaveBeenCalled()
    })

    it('offers no reset on the administrator\'s own account', async () => {
      api.get.mockResolvedValue({ data: { data: [...users, { ...users[0], id: 'me', username: 'me.admin' }], total: 3, page: 1, limit: 20 } })
      renderWithQuery(<UserManagementPage />)

      expect(await screen.findByTestId('reset-mfa-u2')).toBeInTheDocument()
      expect(screen.queryByTestId('reset-mfa-me')).not.toBeInTheDocument()
    })

    it('is not offered to office staff', async () => {
      session.user = { id: 'me', role: 'office_staff', roles: ['office_staff'], unitScope: 'KP1' }
      renderWithQuery(<UserManagementPage />)

      await screen.findByTestId('user-row-u2')
      expect(screen.queryByTestId('reset-mfa-u2')).not.toBeInTheDocument()
    })

    it('explains a refused reset', async () => {
      api.post.mockRejectedValueOnce(httpError(403, 'cannot_reset_own_mfa'))
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await user.click(await screen.findByTestId('reset-mfa-u2'))
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Đặt lại' }))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Bạn không thể tự đặt lại xác thực hai lớp của chính mình'),
      )
    })
  })

  describe('account actions', () => {
    it('explains 403 cannot_change_own_account when changing a status', async () => {
      api.patch.mockRejectedValueOnce(httpError(403, 'cannot_change_own_account'))
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await user.click(await screen.findByTestId('toggle-status-u1'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/users/u1/status', { status: 'inactive' }))
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Bạn không thể tự thay đổi trạng thái hoặc vai trò của chính tài khoản mình'),
      )
    })

    it('unlocks an inactive account and confirms it', async () => {
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await user.click(await screen.findByTestId('toggle-status-u2'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/users/u2/status', { status: 'active' }))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cập nhật trạng thái thành công'))
    })

    it('falls back to generic texts when a status change or password reset fails', async () => {
      api.patch.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      api.post.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      const user = userEvent.setup()
      renderWithQuery(<UserManagementPage />)

      await user.click(await screen.findByTestId('toggle-status-u1'))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cập nhật thất bại'))

      await user.click(screen.getByTestId('reset-password-u1'))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Đặt lại mật khẩu thất bại'))
      expect(screen.queryByTestId('reset-password-modal')).not.toBeInTheDocument()
    })

    it('shows reset password modal with temp password', async () => {
      renderWithQuery(<UserManagementPage />)
      await waitFor(() => screen.getAllByTestId(/^reset-password-/))
      const resetBtns = screen.getAllByTestId(/^reset-password-/)
      await userEvent.click(resetBtns[0])
      await waitFor(() => expect(screen.getByTestId('reset-password-modal')).toBeInTheDocument())
      expect(screen.getByTestId('temp-password')).toHaveTextContent('TempPass123')
      expect(api.post).toHaveBeenCalledWith('/admin/users/u1/reset-password')
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
})

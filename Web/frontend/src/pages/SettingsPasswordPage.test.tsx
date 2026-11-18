import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthProvider } from '@/contexts/AuthProvider'
import { LoginPage } from '@/components/auth/LoginPage'
import { SettingsPasswordPage } from './SettingsPasswordPage'

// Only the HTTP layer and token storage are replaced: AuthProvider, the profile API and LoginPage run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const tokens = vi.hoisted(() => ({ storeTokens: vi.fn(), clearTokens: vi.fn() }))
vi.mock('@/api/client', () => ({
  default: api,
  TOKEN_KEYS: { access: 'mms_access_token', refresh: 'mms_refresh_token', user: 'mms_user' },
  storeTokens: tokens.storeTokens,
  clearTokens: tokens.clearTokens,
  getAccessToken: vi.fn(() => 'access-token'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Error body produced by the backend HttpExceptionFilter
const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E004', message, statusCode: status } },
})

const me ={ id: 'u1', username: 'admin', fullName: 'Quản trị viên', role: 'system_admin', roles: ['system_admin'], unitScope: null }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings/password']}>
        <AuthProvider>
          <Routes>
            <Route path="/settings/password" element={<SettingsPasswordPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url: string) =>
      url === '/auth/me' ? Promise.resolve({ data: me }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    )
    // POST /users/me/change-password → 204 (users.controller.ts:44)
    api.post.mockResolvedValue({ status: 204, data: '' })
  })

  it('renders all password fields', () => {
    renderPage()
    expect(screen.getByTestId('current-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('new-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('change-password-btn')).toBeInTheDocument()
  })

  it('shows validation error when submitting empty form', async () => {
    renderPage()
    await userEvent.click(screen.getByTestId('change-password-btn'))
    expect(screen.getByText('Vui lòng nhập mật khẩu hiện tại')).toBeInTheDocument()
  })

  it('shows error when passwords do not match', async () => {
    renderPage()
    await userEvent.type(screen.getByTestId('current-password-input'), 'OldPass@1')
    await userEvent.type(screen.getByTestId('new-password-input'), 'NewPass@1')
    await userEvent.type(screen.getByTestId('confirm-password-input'), 'Mismatch@1')
    await userEvent.click(screen.getByTestId('change-password-btn'))
    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
  })

  it('shows password strength meter when typing', async () => {
    renderPage()
    await userEvent.type(screen.getByTestId('new-password-input'), 'StrongPass@1')
    expect(screen.getByText('Mạnh')).toBeInTheDocument()
  })

  it('shows weak strength for short password', async () => {
    renderPage()
    await userEvent.type(screen.getByTestId('new-password-input'), 'abc')
    expect(screen.getByText('Yếu')).toBeInTheDocument()
  })

  it('shows a medium strength and the requirements met so far', async () => {
    renderPage()
    await userEvent.type(screen.getByTestId('new-password-input'), 'abcdefgh1')
    expect(screen.getByText('Trung bình')).toBeInTheDocument()
    for (const label of ['Ít nhất 8 ký tự', 'Có chữ hoa', 'Có chữ thường', 'Có số', 'Có ký tự đặc biệt']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Có chữ thường')).toHaveClass('text-[#2E7D32]')
    expect(screen.getByText('Có chữ hoa')).toHaveClass('text-[#64748B]')
  })

  it.each([
    ['a missing new password', { current: 'OldPass@1', next: '', confirm: '' }, ['Vui lòng nhập mật khẩu mới', 'Vui lòng xác nhận mật khẩu mới']],
    ['a short new password', { current: 'OldPass@1', next: 'Ab@1', confirm: 'Ab@1' }, ['Mật khẩu phải có ít nhất 8 ký tự']],
    ['an unchanged password', { current: 'OldPass@1', next: 'OldPass@1', confirm: 'OldPass@1' }, ['Mật khẩu mới phải khác mật khẩu hiện tại']],
  ])('refuses %s before sending it', async (_, values, messages) => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('current-password-input'), values.current)
    if (values.next) await user.type(screen.getByTestId('new-password-input'), values.next)
    if (values.confirm) await user.type(screen.getByTestId('confirm-password-input'), values.confirm)
    await user.click(screen.getByTestId('change-password-btn'))

    for (const message of messages) expect(screen.getByText(message)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  async function changePasswordWithValidForm() {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('current-password-input'), 'OldPass@1')
    await user.type(screen.getByTestId('new-password-input'), 'NewPass@12')
    await user.type(screen.getByTestId('confirm-password-input'), 'NewPass@12')
    await user.click(screen.getByTestId('change-password-btn'))
  }

  // POST /users/me/change-password answers 401 invalid_credentials for a wrong current password
  it('marks the current password as wrong when the server refuses it', async () => {
    api.post.mockRejectedValueOnce(httpError(401, 'invalid_credentials'))

    await changePasswordWithValidForm()

    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đổi mật khẩu' })).toBeEnabled()
  })

  it.each([
    ['a server failure', httpError(500, 'Internal server error'), 'Đổi mật khẩu thất bại'],
    ['a network failure', { isAxiosError: true, code: 'ERR_NETWORK', request: {} }, 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'],
  ])('reports %s in a toast and stays on the page', async (_, error, message) => {
    api.post.mockRejectedValueOnce(error)

    await changePasswordWithValidForm()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    expect(screen.getByTestId('settings-password-page')).toBeInTheDocument()
    expect(screen.queryByText('Mật khẩu hiện tại không đúng')).not.toBeInTheDocument()
  })

  it('shows the pending label while the change is sent', async () => {
    api.post.mockReturnValueOnce(new Promise(() => {}))

    await changePasswordWithValidForm()

    expect(await screen.findByRole('button', { name: 'Đang xử lý...' })).toBeDisabled()
  })

  // The change ends every session of the account, this one included
  it('clears the session after a password change and asks to sign in again with the new password', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/auth/me'))

    await user.type(screen.getByTestId('current-password-input'), 'OldPass@1')
    await user.type(screen.getByTestId('new-password-input'), 'NewPass@12')
    await user.type(screen.getByTestId('confirm-password-input'), 'NewPass@12')
    await user.click(screen.getByTestId('change-password-btn'))

    const notice = await screen.findByTestId('login-notice')
    expect(api.post).toHaveBeenCalledWith('/users/me/change-password', { currentPassword: 'OldPass@1', newPassword: 'NewPass@12' })
    expect(notice).toHaveTextContent('Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.')
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
    expect(tokens.clearTokens).toHaveBeenCalled()
    // The server already ended the session: no logout request with a dead token
    expect(api.post).not.toHaveBeenCalledWith('/auth/logout')
  })
})

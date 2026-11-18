import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthProvider'
import { LoginPage } from './LoginPage'

// Only the HTTP layer and token storage are replaced: AuthProvider and authApi run for real
const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
const tokens = vi.hoisted(() => ({ storeTokens: vi.fn(), clearTokens: vi.fn() }))
vi.mock('@/api/client', () => ({
  default: api,
  TOKEN_KEYS: { access: 'mms_access_token', refresh: 'mms_refresh_token', user: 'mms_user' },
  storeTokens: tokens.storeTokens,
  clearTokens: tokens.clearTokens,
  getAccessToken: vi.fn(() => null),
}))

// Error body produced by the backend HttpExceptionFilter
const httpError = (status: number, message: string, extra: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  request: {},
  response: { status, data: { code: status === 429 ? 'E006' : 'E004', message, statusCode: status, ...extra } },
})

const signedInUser = { id: 'u1', username: 'admin', fullName: 'Quản trị viên', role: 'system_admin', roles: ['system_admin'], unitScope: null }

// POST /auth/login bodies (Web/backend/src/auth/mfa/mfa.service.ts LoginResult)
const success = { status: 'SUCCESS', user: signedInUser, tokens: { accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 } }
const mfaRequired = {
  status: 'MFA_REQUIRED',
  mfaToken: 'challenge-token',
  expiresAt: '2026-09-14T03:05:00.000Z',
  methods: ['totp', 'recovery_code'],
  mfa_required: true,
  requiresMfa: true,
  tempToken: 'challenge-token',
}
const mfaSetupRequired = {
  status: 'MFA_SETUP_REQUIRED',
  mfaToken: 'setup-token',
  expiresAt: '2026-09-14T03:10:00.000Z',
  requiresMfaSetup: true,
  tempToken: 'setup-token',
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>Trang tổng quan</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function submitLogin(options: { username?: string; password?: string; rememberMe?: boolean } = {}) {
  const user = userEvent.setup()
  await user.type(screen.getByTestId('username-input'), options.username ?? 'admin')
  await user.type(screen.getByTestId('password-input'), options.password ?? 'Sai@123')
  if (options.rememberMe) await user.click(screen.getByTestId('remember-me-checkbox'))
  await user.click(screen.getByTestId('login-btn'))
  return user
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the credentials to POST /auth/login', async () => {
    api.post.mockRejectedValueOnce(httpError(401, 'invalid_credentials'))
    renderLogin()

    await submitLogin({ username: 'admin', password: 'Admin@123' })

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'admin', password: 'Admin@123', rememberMe: false }),
    )
  })

  // Codes thrown by Web/backend/src/auth/auth.service.ts validateUser/requireUserRoles and MfaService.beginLogin
  it.each([
    [401, 'invalid_credentials', 'Tên đăng nhập hoặc mật khẩu không đúng.'],
    [403, 'account_disabled', 'Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.'],
    [403, 'no_role_assigned', 'Tài khoản chưa được phân quyền sử dụng hệ thống. Vui lòng liên hệ quản trị viên.'],
    [403, 'account_locked', 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau 30 phút.'],
    [429, 'mfa_locked', 'Xác thực hai lớp đang tạm khóa 15 phút do nhập sai mã nhiều lần. Vui lòng thử lại sau.'],
    [429, 'ThrottlerException: Too Many Requests', 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi một lát rồi thử lại.'],
    [500, 'Internal server error', 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.'],
    [403, 'something_new', 'Đăng nhập thất bại. Vui lòng thử lại.'],
  ])('explains HTTP %i %s', async (status, code, message) => {
    api.post.mockRejectedValueOnce(httpError(status, code))
    renderLogin()

    await submitLogin()

    expect(await screen.findByTestId('login-error-message')).toHaveTextContent(message)
  })

  it('asks for the user name and the password before sending anything', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByTestId('login-btn'))

    expect(await screen.findByText('Vui lòng nhập tên đăng nhập')).toHaveAttribute('role', 'alert')
    expect(screen.getByText('Vui lòng nhập mật khẩu')).toHaveAttribute('role', 'alert')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('labels the form and lets the user show and hide the password', async () => {
    const user = userEvent.setup()
    renderLogin()

    expect(screen.getByRole('form', { name: 'Đăng nhập' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ĐĂNG NHẬP' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tài khoản')).toHaveAttribute('placeholder', 'Nhập tên đăng nhập')
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('placeholder', 'Nhập mật khẩu')
    expect(screen.getByLabelText('Ghi nhớ đăng nhập')).not.toBeChecked()
    expect(screen.getByRole('img', { name: 'Bảo vệ An ninh Trật tự' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(screen.getByTestId('password-input')).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(screen.getByTestId('password-input')).toHaveAttribute('type', 'password')
  })

  it('lists the demo accounts', () => {
    renderLogin()

    expect(screen.getByText('Tài khoản demo')).toBeInTheDocument()
    expect(screen.getByText('Admin@123').previousSibling).toHaveTextContent('admin')
    expect(screen.getByText('Dqtv@123').previousSibling).toHaveTextContent('dqtv01')
  })

  it('shows the pending label while the credentials are checked', async () => {
    api.post.mockReturnValueOnce(new Promise(() => {}))
    renderLogin()

    await submitLogin()

    expect(await screen.findByRole('button', { name: 'ĐANG ĐĂNG NHẬP...' })).toBeDisabled()
  })

  it.each([
    [401, 'Unauthorized', 'Tên đăng nhập hoặc mật khẩu không đúng.'],
    [503, 'Service Unavailable', 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.'],
  ])('explains HTTP %i without a known code by its status', async (status, code, message) => {
    api.post.mockRejectedValueOnce(httpError(status, code))
    renderLogin()

    await submitLogin()

    expect(await screen.findByTestId('login-error-message')).toHaveTextContent(message)
  })

  it('explains a network failure', async () => {
    api.post.mockRejectedValueOnce({ isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error', request: {} })
    renderLogin()

    await submitLogin()

    expect(await screen.findByTestId('login-error-message')).toHaveTextContent(
      'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
    )
  })

  it('clears the previous error when the user tries again', async () => {
    api.post.mockRejectedValueOnce(httpError(401, 'invalid_credentials'))
    api.post.mockReturnValueOnce(new Promise(() => {})) // second attempt still pending
    renderLogin()

    const user = await submitLogin()
    await screen.findByTestId('login-error-message')

    await user.click(screen.getByTestId('login-btn'))

    await waitFor(() => expect(screen.queryByTestId('login-error-message')).not.toBeInTheDocument())
  })

  // api/client.ts signs out when POST /auth/refresh is refused and says why
  describe('after the session ended', () => {
    const endSession = (reason: string) =>
      act(() => {
        window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { reason } }))
      })

    it.each([
      ['session_ended', 'Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại'],
      ['mfa_reauthentication_required', 'Tài khoản cần xác thực hai lớp, vui lòng đăng nhập lại'],
    ])('explains a %s ending with a neutral message', async (reason, message) => {
      renderLogin()

      endSession(reason)

      const notice = await screen.findByTestId('login-notice')
      expect(notice).toHaveTextContent(message)
      expect(notice).toHaveAttribute('role', 'status')
      expect(screen.queryByTestId('login-error-message')).not.toBeInTheDocument()
    })

    it('clears the notice once the user signs in again', async () => {
      api.post.mockRejectedValueOnce(httpError(401, 'invalid_credentials'))
      renderLogin()
      endSession('session_ended')
      await screen.findByTestId('login-notice')

      await submitLogin()

      await waitFor(() => expect(screen.queryByTestId('login-notice')).not.toBeInTheDocument())
    })
  })

  describe('status branching', () => {
    it('signs in straight away on SUCCESS and keeps the tokens', async () => {
      api.post.mockResolvedValueOnce({ data: success })
      renderLogin()

      await submitLogin({ rememberMe: true })

      expect(await screen.findByText('Trang tổng quan')).toBeInTheDocument()
      expect(tokens.storeTokens).toHaveBeenCalledWith('access-1', 'refresh-1', true)
    })

    it('asks for the second factor on MFA_REQUIRED without storing anything', async () => {
      api.post.mockResolvedValueOnce({ data: mfaRequired })
      renderLogin()

      await submitLogin()

      expect(await screen.findByRole('heading', { name: 'Xác thực hai lớp' })).toBeInTheDocument()
      expect(screen.queryByTestId('login-error-message')).not.toBeInTheDocument()
      expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()
      expect(tokens.storeTokens).not.toHaveBeenCalled()
    })

    it('completes the sign-in with an authenticator code and honours "remember me"', async () => {
      api.post
        .mockResolvedValueOnce({ data: mfaRequired })
        .mockResolvedValueOnce({ data: { ...success, tokens: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 } } })
      renderLogin()

      const user = await submitLogin({ rememberMe: true })
      await user.type(await screen.findByLabelText('Mã xác thực'), '123456')
      await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

      expect(await screen.findByText('Trang tổng quan')).toBeInTheDocument()
      expect(api.post).toHaveBeenLastCalledWith('/auth/mfa/verify', { mfaToken: 'challenge-token', method: 'totp', code: '123456' })
      expect(tokens.storeTokens).toHaveBeenCalledTimes(1)
      expect(tokens.storeTokens).toHaveBeenCalledWith('access-2', 'refresh-2', true)
    })

    it('goes back to the password form when the challenge is no longer valid', async () => {
      api.post.mockResolvedValueOnce({ data: mfaRequired }).mockRejectedValueOnce(httpError(401, 'mfa_token_invalid'))
      renderLogin()

      const user = await submitLogin()
      await user.type(await screen.findByLabelText('Mã xác thực'), '123456')
      await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

      expect(await screen.findByTestId('login-form')).toBeInTheDocument()
      expect(screen.getByTestId('login-error-message')).toHaveTextContent(
        'Phiên xác thực đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.',
      )
      expect(tokens.storeTokens).not.toHaveBeenCalled()
    })

    it('lets the user leave the second-factor step', async () => {
      api.post.mockResolvedValueOnce({ data: mfaRequired })
      renderLogin()

      const user = await submitLogin()
      await user.click(await screen.findByRole('button', { name: 'Quay lại đăng nhập' }))

      expect(screen.getByTestId('login-form')).toBeInTheDocument()
      expect(screen.queryByTestId('login-error-message')).not.toBeInTheDocument()
    })

    it('starts the authenticator set-up on MFA_SETUP_REQUIRED', async () => {
      api.post.mockResolvedValueOnce({ data: mfaSetupRequired })
      renderLogin()

      await submitLogin()

      expect(await screen.findByRole('heading', { name: 'Thiết lập xác thực hai lớp' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Bắt đầu thiết lập' })).toBeInTheDocument()
      expect(tokens.storeTokens).not.toHaveBeenCalled()
    })

    it('signs in only after the new recovery codes were acknowledged', async () => {
      const recoveryCodes = Array.from({ length: 10 }, (_, i) => `ABCDE-${String(10000 + i)}`)
      api.post
        .mockResolvedValueOnce({ data: mfaSetupRequired })
        .mockResolvedValueOnce({
          data: { mfaToken: 'setup-token', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/MMS:admin?secret=JBSWY3DPEHPK3PXP&issuer=MMS', qrUri: 'otpauth://totp/MMS:admin?secret=JBSWY3DPEHPK3PXP&issuer=MMS', expiresAt: '2026-09-14T03:10:00.000Z' },
        })
        .mockResolvedValueOnce({ data: { ...success, recoveryCodes } })
      renderLogin()

      const user = await submitLogin()
      await user.click(await screen.findByRole('button', { name: 'Bắt đầu thiết lập' }))
      await user.type(await screen.findByLabelText('Mã xác thực'), '654321')
      await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

      expect(await screen.findByText('ABCDE-10000')).toBeInTheDocument()
      expect(tokens.storeTokens).not.toHaveBeenCalled()
      await user.click(screen.getByLabelText('Tôi đã lưu các mã khôi phục ở nơi an toàn'))
      await user.click(screen.getByRole('button', { name: 'Tiếp tục vào hệ thống' }))

      expect(await screen.findByText('Trang tổng quan')).toBeInTheDocument()
      expect(tokens.storeTokens).toHaveBeenCalledWith('access-1', 'refresh-1', false)
    })

    it.each([
      ['a body that is not an object', 'SUCCESS'],
      ['a challenge without mfaToken', { status: 'MFA_REQUIRED', methods: ['totp'] }],
    ])('does not trust a login answer with %s', async (_, data) => {
      api.post.mockResolvedValueOnce({ data })
      renderLogin()

      await submitLogin()

      expect(await screen.findByTestId('login-error-message')).toHaveTextContent('Đăng nhập thất bại. Vui lòng thử lại.')
      expect(tokens.storeTokens).not.toHaveBeenCalled()
    })

    it('does not trust a login answer without a known status', async () => {
      api.post.mockResolvedValueOnce({ data: { mfa_required: false } })
      renderLogin()

      await submitLogin()

      expect(await screen.findByTestId('login-error-message')).toHaveTextContent('Đăng nhập thất bại. Vui lòng thử lại.')
      expect(tokens.storeTokens).not.toHaveBeenCalled()
    })
  })
})

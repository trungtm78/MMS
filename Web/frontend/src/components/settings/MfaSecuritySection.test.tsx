import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MfaSecuritySection } from './MfaSecuritySection'

// Signed-in MFA routes (Web/backend/src/auth/mfa/mfa.controller.ts) are answered here; api/mfa.ts runs for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const auth = vi.hoisted(() => ({ completeSignIn: vi.fn(), rememberedRefreshToken: 'remembered-refresh' as string | null }))
vi.mock('@/api/client', () => ({ default: api, getRefreshToken: () => auth.rememberedRefreshToken }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ completeSignIn: auth.completeSignIn }) }))

// POST /auth/mfa/confirm ends every earlier session and answers with a new one (mfa.service.ts:354-355)
const newSession = {
  user: { id: 'u7', username: 'ca.ward', fullName: 'Công an phường', role: 'ca_ward', roles: ['ca_ward'], unitScope: null },
  tokens: { accessToken: 'mfa-access', refreshToken: 'mfa-refresh', expiresIn: 900 },
}

const httpError = (status: number, message: string, extra: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E004', message, statusCode: status, ...extra } },
})

const OTPAUTH = 'otpauth://totp/MMS:ca.ward?secret=KRUGS4ZANFZSAYJA&issuer=MMS'
const disabled = { enabled: false, enrolledAt: null, required: false, recoveryCodesRemaining: 0 }
const enabled = { enabled: true, enrolledAt: '2026-09-01T03:00:00.000Z', required: false, recoveryCodesRemaining: 8 }
const recoveryCodes = Array.from({ length: 10 }, (_, i) => `QW3RT-${String(20000 + i)}`)

let status: Record<string, unknown>

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MfaSecuritySection />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const statusCalls = () => api.get.mock.calls.filter(([url]) => url === '/auth/mfa/status').length

describe('MfaSecuritySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.rememberedRefreshToken = 'remembered-refresh'
    status = disabled
    api.get.mockImplementation((url: string) =>
      url === '/auth/mfa/status' ? Promise.resolve({ data: status }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    )
  })

  it('shows that two-factor authentication is off', async () => {
    renderSection()

    expect(await screen.findByTestId('mfa-status')).toHaveTextContent('Chưa bật')
    expect(screen.getByRole('heading', { name: 'Xác thực hai lớp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bật xác thực hai lớp' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tắt xác thực hai lớp' })).not.toBeInTheDocument()
  })

  it('shows when it was enabled and how many recovery codes are left', async () => {
    status = enabled
    renderSection()

    expect(await screen.findByTestId('mfa-status')).toHaveTextContent('Đang bật')
    expect(screen.getByText('Bật từ ngày 01/09/2026')).toBeInTheDocument()
    expect(screen.getByTestId('mfa-recovery-remaining')).toHaveTextContent('Còn 8 mã khôi phục chưa dùng')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns when three or fewer recovery codes are left', async () => {
    status = { ...enabled, recoveryCodesRemaining: 3 }
    renderSection()

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn chỉ còn 3 mã khôi phục. Hãy tạo bộ mã mới.')
  })

  it('explains that the role requires the second factor and offers no way to turn it off', async () => {
    status = { ...enabled, required: true }
    renderSection()

    expect(await screen.findByText('Vai trò của bạn bắt buộc sử dụng xác thực hai lớp nên không thể tắt.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tắt xác thực hai lớp' })).not.toBeInTheDocument()
  })

  it('warns when every recovery code has been used', async () => {
    status = { ...enabled, recoveryCodesRemaining: 0 }
    renderSection()

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn đã dùng hết mã khôi phục. Hãy tạo bộ mã mới.')
    expect(screen.getByTestId('mfa-recovery-remaining')).toHaveTextContent('Còn 0 mã khôi phục chưa dùng')
  })

  it('asks to turn it on when the role requires it and it is still off', async () => {
    status = { ...disabled, required: true }
    renderSection()

    expect(await screen.findByText('Vai trò của bạn bắt buộc sử dụng xác thực hai lớp. Hãy bật ngay.')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái:')).toBeInTheDocument()
    expect(screen.getByText('Ngoài mật khẩu, mỗi lần đăng nhập cần thêm mã từ ứng dụng xác thực trên điện thoại.')).toBeInTheDocument()
  })

  it('explains when the status cannot be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'Internal server error'))
    renderSection()

    expect(await screen.findByText('Không thể tải trạng thái xác thực hai lớp')).toBeInTheDocument()
  })

  describe('turning it on', () => {
    it('sets up the authenticator, confirms the first code and shows the recovery codes', async () => {
      api.post.mockImplementation((url: string) => {
        if (url === '/auth/mfa/setup') {
          return Promise.resolve({ data: { mfaToken: 'setup-token', secret: 'KRUGS4ZANFZSAYJA', otpauthUri: OTPAUTH, qrUri: OTPAUTH, expiresAt: '2026-09-14T03:10:00.000Z' } })
        }
        return Promise.resolve({ data: { recoveryCodes, ...newSession } })
      })
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật xác thực hai lớp' })
      expect(api.post).toHaveBeenCalledWith('/auth/mfa/setup')
      expect(await within(dialog).findByRole('img', { name: 'Mã QR để quét bằng ứng dụng xác thực' })).toBeInTheDocument()
      expect(within(dialog).getByTestId('mfa-secret').textContent?.replace(/\s/g, '')).toBe('KRUGS4ZANFZSAYJA')

      await user.type(within(dialog).getByLabelText('Mã xác thực'), '111222')
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      expect(api.post).toHaveBeenLastCalledWith('/auth/mfa/confirm', { mfaToken: 'setup-token', code: '111222' })
      expect(await within(dialog).findByText('QW3RT-20000')).toBeInTheDocument()

      status = enabled
      await user.click(within(dialog).getByLabelText('Tôi đã lưu các mã khôi phục ở nơi an toàn'))
      await user.click(within(dialog).getByRole('button', { name: 'Hoàn tất' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(toast.success).toHaveBeenCalledWith('Đã bật xác thực hai lớp')
      expect(await screen.findByTestId('mfa-status')).toHaveTextContent('Đang bật')
      expect(statusCalls()).toBeGreaterThanOrEqual(2)
    })

    // The earlier tokens are dead from the confirmation on: a background request with them would
    // fail to refresh and sign the user out while the recovery codes are still on screen
    it.each([
      ['remembered', 'remembered-refresh', true],
      ['not remembered', null, false],
    ])('switches to the new session returned by the confirmation (%s sign-in)', async (_, remembered, rememberMe) => {
      auth.rememberedRefreshToken = remembered
      api.post.mockImplementation((url: string) =>
        url === '/auth/mfa/setup'
          ? Promise.resolve({ data: { mfaToken: 'setup-token', secret: 'KRUGS4ZANFZSAYJA', otpauthUri: OTPAUTH, qrUri: OTPAUTH, expiresAt: '2026-09-14T03:10:00.000Z' } })
          : Promise.resolve({ data: { recoveryCodes, ...newSession } }),
      )
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật xác thực hai lớp' })
      await user.type(await within(dialog).findByLabelText('Mã xác thực'), '111222')
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      expect(await within(dialog).findByText('QW3RT-20000')).toBeInTheDocument()
      expect(auth.completeSignIn).toHaveBeenCalledTimes(1)
      expect(auth.completeSignIn).toHaveBeenCalledWith(newSession, rememberMe)
      // The codes stay until the user confirms they are saved
      expect(within(dialog).getByRole('button', { name: 'Hoàn tất' })).toBeDisabled()
    })

    it('treats a confirmation without a new session as a failure', async () => {
      api.post.mockImplementation((url: string) =>
        url === '/auth/mfa/setup'
          ? Promise.resolve({ data: { mfaToken: 'setup-token', secret: 'KRUGS4ZANFZSAYJA', otpauthUri: OTPAUTH, qrUri: OTPAUTH, expiresAt: '2026-09-14T03:10:00.000Z' } })
          : Promise.resolve({ data: { recoveryCodes } }),
      )
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật xác thực hai lớp' })
      await user.type(await within(dialog).findByLabelText('Mã xác thực'), '111222')
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không thể xác nhận mã')
      expect(auth.completeSignIn).not.toHaveBeenCalled()
    })

    it('reports a wrong first code with the attempts left', async () => {
      api.post.mockImplementation((url: string) =>
        url === '/auth/mfa/setup'
          ? Promise.resolve({ data: { mfaToken: 'setup-token', secret: 'KRUGS4ZANFZSAYJA', otpauthUri: OTPAUTH, qrUri: OTPAUTH, expiresAt: '2026-09-14T03:10:00.000Z' } })
          : Promise.reject(httpError(401, 'invalid_code', { details: { attemptsRemaining: 2 } })),
      )
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật xác thực hai lớp' })
      await user.type(await within(dialog).findByLabelText('Mã xác thực'), '000000')
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      expect(await within(dialog).findByText('Mã không đúng. Bạn còn 2 lần thử.')).toHaveAttribute('role', 'alert')
      await waitFor(() => expect(within(dialog).getByLabelText('Mã xác thực')).toHaveFocus())
    })

    it('keeps focus in the code field while the first code is checked', async () => {
      api.post.mockImplementation((url: string) =>
        url === '/auth/mfa/setup'
          ? Promise.resolve({ data: { mfaToken: 'setup-token', secret: 'KRUGS4ZANFZSAYJA', otpauthUri: OTPAUTH, qrUri: OTPAUTH, expiresAt: '2026-09-14T03:10:00.000Z' } })
          : new Promise(() => {}),
      )
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật xác thực hai lớp' })
      await user.type(await within(dialog).findByLabelText('Mã xác thực'), '111222')
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      expect(within(dialog).getByRole('button', { name: 'Đang xác nhận...' })).toBeDisabled()
      expect(within(dialog).getByLabelText('Mã xác thực')).toHaveFocus()
    })

    const setupAnswer = { mfaToken: 'setup-token', secret: 'KRUGS4ZANFZSAYJA', otpauthUri: OTPAUTH, qrUri: OTPAUTH, expiresAt: '2026-09-14T03:10:00.000Z' }

    it('explains a set-up the server could not start', async () => {
      api.post.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Không thể bắt đầu thiết lập xác thực hai lớp')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes the set-up for good when its challenge expired', async () => {
      api.post.mockImplementation((url: string) =>
        url === '/auth/mfa/setup' ? Promise.resolve({ data: setupAnswer }) : Promise.reject(httpError(401, 'mfa_token_invalid')),
      )
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật xác thực hai lớp' })
      await user.type(await within(dialog).findByLabelText('Mã xác thực'), '111222')
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Phiên thiết lập đã hết hạn hoặc bị đóng. Hãy đóng hộp thoại và bắt đầu lại.',
      )
      expect(within(dialog).getByRole('button', { name: 'Xác nhận' })).toBeDisabled()
      expect(within(dialog).getByLabelText('Mã xác thực')).toBeDisabled()
    })

    it.each([
      ['the cancel button', async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => user.click(within(dialog).getByRole('button', { name: 'Hủy' }))],
      ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ])('leaves the set-up with %s and refreshes the status', async (_, leave) => {
      api.post.mockResolvedValueOnce({ data: setupAnswer })
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Bật xác thực hai lớp' })
      await leave(user, dialog)

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(statusCalls()).toBeGreaterThanOrEqual(2))
    })

    it('refreshes the status when it was already enabled elsewhere', async () => {
      api.post.mockRejectedValueOnce(httpError(409, 'mfa_already_enabled'))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Bật xác thực hai lớp' }))

      expect(await screen.findByText('Xác thực hai lớp đã được bật cho tài khoản này.')).toBeInTheDocument()
      await waitFor(() => expect(statusCalls()).toBeGreaterThanOrEqual(2))
    })
  })

  describe('recovery codes', () => {
    it('regenerates the codes with an authenticator code', async () => {
      status = enabled
      api.post.mockResolvedValueOnce({ data: { recoveryCodes } })
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tạo lại mã khôi phục' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo lại mã khôi phục' })
      expect(within(dialog).getByText(/Các mã khôi phục cũ sẽ không dùng được nữa/)).toBeInTheDocument()
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '333444')
      await user.click(within(dialog).getByRole('button', { name: 'Tạo mã mới' }))

      expect(api.post).toHaveBeenCalledWith('/auth/mfa/recovery-codes/regenerate', { code: '333444' })
      const list = await within(dialog).findByRole('list', { name: 'Mã khôi phục' })
      expect(within(list).getAllByRole('listitem')).toHaveLength(10)

      await user.click(within(dialog).getByLabelText('Tôi đã lưu các mã khôi phục ở nơi an toàn'))
      await user.click(within(dialog).getByRole('button', { name: 'Hoàn tất' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(toast.success).toHaveBeenCalledWith('Đã tạo bộ mã khôi phục mới')
      await waitFor(() => expect(statusCalls()).toBeGreaterThanOrEqual(2))
    })

    it('explains an answer without new codes', async () => {
      status = enabled
      api.post.mockResolvedValueOnce({ data: {} })
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tạo lại mã khôi phục' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo lại mã khôi phục' })
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '333444')
      await user.click(within(dialog).getByRole('button', { name: 'Tạo mã mới' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không thể tạo mã khôi phục mới')
      await waitFor(() => expect(within(dialog).getByLabelText('Mã xác thực')).toHaveFocus())
    })

    it('shows the pending label while new codes are made', async () => {
      status = enabled
      api.post.mockReturnValueOnce(new Promise(() => {}))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tạo lại mã khôi phục' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo lại mã khôi phục' })
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '333444')
      await user.click(within(dialog).getByRole('button', { name: 'Tạo mã mới' }))

      expect(within(dialog).getByRole('button', { name: 'Đang tạo...' })).toBeDisabled()
    })

    it.each([
      ['the cancel button', async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => user.click(within(dialog).getByRole('button', { name: 'Hủy' }))],
      ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ])('leaves without new codes with %s', async (_, leave) => {
      status = enabled
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tạo lại mã khôi phục' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo lại mã khôi phục' })
      await leave(user, dialog)

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.post).not.toHaveBeenCalled()
    })

    it('reports a wrong code', async () => {
      status = enabled
      api.post.mockRejectedValueOnce(httpError(401, 'invalid_code'))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tạo lại mã khôi phục' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo lại mã khôi phục' })
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '000000')
      await user.click(within(dialog).getByRole('button', { name: 'Tạo mã mới' }))

      expect(await within(dialog).findByText('Mã không đúng.')).toHaveAttribute('role', 'alert')
      await waitFor(() => expect(within(dialog).getByLabelText('Mã xác thực')).toHaveFocus())
    })
  })

  describe('turning it off', () => {
    it('disables it with a recovery code', async () => {
      status = enabled
      api.post.mockResolvedValueOnce({ data: undefined, status: 204 })
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tắt xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tắt xác thực hai lớp' })
      await user.click(within(dialog).getByRole('radio', { name: 'Dùng mã khôi phục' }))
      await user.type(within(dialog).getByLabelText('Mã khôi phục'), 'ABCDE-12345')
      status = disabled
      await user.click(within(dialog).getByRole('button', { name: 'Tắt' }))

      expect(api.post).toHaveBeenCalledWith('/auth/mfa/disable', { method: 'recovery_code', code: 'ABCDE-12345' })
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã tắt xác thực hai lớp'))
      expect(await screen.findByTestId('mfa-status')).toHaveTextContent('Chưa bật')
    })

    it.each([
      [403, 'mfa_required_by_role', 'Vai trò của bạn bắt buộc sử dụng xác thực hai lớp nên không thể tắt.'],
      [429, 'mfa_locked', 'Xác thực hai lớp đang tạm khóa 15 phút do nhập sai mã nhiều lần. Vui lòng thử lại sau.'],
    ])('explains %i %s', async (httpStatus, code, message) => {
      status = enabled
      api.post.mockRejectedValueOnce(httpError(httpStatus, code))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tắt xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tắt xác thực hai lớp' })
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '123456')
      await user.click(within(dialog).getByRole('button', { name: 'Tắt' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      await waitFor(() => expect(within(dialog).getByLabelText('Mã xác thực')).toHaveFocus())
    })

    it('explains the dialog and reports a wrong code with the attempts left', async () => {
      status = enabled
      api.post.mockRejectedValueOnce(httpError(401, 'invalid_code', { details: { attemptsRemaining: 1 } }))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tắt xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tắt xác thực hai lớp' })
      expect(dialog).toHaveAccessibleDescription(
        'Tài khoản sẽ chỉ còn được bảo vệ bằng mật khẩu. Nhập mã từ ứng dụng xác thực hoặc một mã khôi phục để xác nhận.',
      )
      expect(within(dialog).getByRole('group', { name: 'Cách xác thực' })).toBeInTheDocument()
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '123456')
      await user.click(within(dialog).getByRole('button', { name: 'Tắt' }))

      expect(await within(dialog).findByText('Mã không đúng. Bạn còn 1 lần thử.')).toHaveAttribute('role', 'alert')
    })

    it('explains a failure the server gives no reason for', async () => {
      status = enabled
      api.post.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tắt xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tắt xác thực hai lớp' })
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '123456')
      await user.click(within(dialog).getByRole('button', { name: 'Tắt' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không thể tắt xác thực hai lớp')
    })

    it.each([
      ['the cancel button', async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => user.click(within(dialog).getByRole('button', { name: 'Hủy' }))],
      ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ])('leaves it on with %s', async (_, leave) => {
      status = enabled
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tắt xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tắt xác thực hai lớp' })
      await leave(user, dialog)

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.post).not.toHaveBeenCalled()
      expect(screen.getByTestId('mfa-status')).toHaveTextContent('Đang bật')
    })

    it('keeps focus in the code field while turning it off', async () => {
      status = enabled
      api.post.mockReturnValueOnce(new Promise(() => {}))
      const user = renderSection()

      await user.click(await screen.findByRole('button', { name: 'Tắt xác thực hai lớp' }))
      const dialog = await screen.findByRole('dialog', { name: 'Tắt xác thực hai lớp' })
      await user.type(within(dialog).getByLabelText('Mã xác thực'), '123456')
      await user.click(within(dialog).getByRole('button', { name: 'Tắt' }))

      expect(within(dialog).getByRole('button', { name: 'Đang tắt...' })).toBeDisabled()
      expect(within(dialog).getByLabelText('Mã xác thực')).toHaveFocus()
    })
  })
})

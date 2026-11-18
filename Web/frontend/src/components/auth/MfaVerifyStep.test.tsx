import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MfaVerifyStep } from './MfaVerifyStep'

// POST /auth/mfa/verify is answered here; api/auth.ts runs for real
const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

const httpError = (status: number, message: string, extra: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: status === 429 ? 'E006' : 'E004', message, statusCode: status, ...extra } },
})

const challenge = { mfaToken: 'challenge-token', expiresAt: '2026-09-14T03:05:00.000Z', methods: ['totp', 'recovery_code'] as const }
const session = {
  user: { id: 'u1', username: 'admin', fullName: 'Quản trị viên', role: 'system_admin', roles: ['system_admin'], unitScope: null },
  tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
}

function renderStep(props: Partial<React.ComponentProps<typeof MfaVerifyStep>> = {}) {
  const onSignedIn = vi.fn()
  const onRestart = vi.fn()
  render(<MfaVerifyStep challenge={{ ...challenge, methods: [...challenge.methods] }} onSignedIn={onSignedIn} onRestart={onRestart} {...props} />)
  return { onSignedIn, onRestart, user: userEvent.setup() }
}

async function enterCode(user: ReturnType<typeof userEvent.setup>, label: string, code: string) {
  await user.type(screen.getByLabelText(label), code)
  await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
}

describe('MfaVerifyStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the authenticator code, without spaces, and signs in', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'SUCCESS', ...session } })
    const { onSignedIn, onRestart, user } = renderStep()

    await enterCode(user, 'Mã xác thực', '123 456')

    expect(api.post).toHaveBeenCalledWith('/auth/mfa/verify', { mfaToken: 'challenge-token', method: 'totp', code: '123456' })
    expect(onSignedIn).toHaveBeenCalledWith({ user: session.user, tokens: session.tokens })
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('checks the authenticator code has six digits before sending it', async () => {
    const { user } = renderStep()

    await enterCode(user, 'Mã xác thực', '12a4')

    expect(await screen.findByText('Mã xác thực gồm 6 chữ số')).toBeInTheDocument()
    expect(screen.getByLabelText('Mã xác thực')).toHaveAttribute('aria-invalid', 'true')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('accepts a recovery code in any case and with spaces', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'SUCCESS', ...session, recoveryCodesRemaining: 7 } })
    const { onSignedIn, user } = renderStep()

    await user.click(screen.getByRole('radio', { name: 'Dùng mã khôi phục' }))
    await enterCode(user, 'Mã khôi phục', '  abcde 12345 ')

    expect(api.post).toHaveBeenCalledWith('/auth/mfa/verify', { mfaToken: 'challenge-token', method: 'recovery_code', code: 'abcde 12345' })
    expect(onSignedIn).toHaveBeenCalledTimes(1)
  })

  it('checks a recovery code has ten characters before sending it', async () => {
    const { user } = renderStep()

    await user.click(screen.getByRole('radio', { name: 'Dùng mã khôi phục' }))
    await enterCode(user, 'Mã khôi phục', 'ABCDE-123')

    expect(await screen.findByText('Mã khôi phục gồm 10 ký tự, dạng XXXXX-XXXXX')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('warns when three or fewer recovery codes remain before continuing', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'SUCCESS', ...session, recoveryCodesRemaining: 2 } })
    const { onSignedIn, user } = renderStep()

    await user.click(screen.getByRole('radio', { name: 'Dùng mã khôi phục' }))
    await enterCode(user, 'Mã khôi phục', 'ABCDE-12345')

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn chỉ còn 2 mã khôi phục')
    expect(onSignedIn).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(onSignedIn).toHaveBeenCalledWith({ user: session.user, tokens: session.tokens })
  })

  it('says so when the last recovery code was just used', async () => {
    api.post.mockResolvedValueOnce({ data: { status: 'SUCCESS', ...session, recoveryCodesRemaining: 0 } })
    const { onSignedIn, user } = renderStep()

    await user.click(screen.getByRole('radio', { name: 'Dùng mã khôi phục' }))
    expect(screen.getByText(/Nhập một trong các mã khôi phục bạn đã lưu khi thiết lập/)).toBeInTheDocument()
    await enterCode(user, 'Mã khôi phục', 'ABCDE-12345')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bạn đã dùng hết mã khôi phục. Sau khi đăng nhập, hãy vào Cài đặt → Thông tin cá nhân → Bảo mật tài khoản để tạo bộ mã mới.',
    )
    expect(screen.getByRole('heading', { name: 'Xác thực hai lớp' })).toBeInTheDocument()
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('explains a wrong code when the server does not say how many attempts are left', async () => {
    api.post.mockRejectedValueOnce(httpError(401, 'invalid_code'))
    const { user } = renderStep()

    await enterCode(user, 'Mã xác thực', '000000')

    expect(await screen.findByText('Mã không đúng.')).toHaveAttribute('role', 'alert')
  })

  it('explains a failure the server gives no reason for', async () => {
    api.post.mockRejectedValueOnce(httpError(500, 'Internal server error'))
    const { onRestart, user } = renderStep()

    await enterCode(user, 'Mã xác thực', '000000')

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xác thực. Vui lòng thử lại.')
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('shows how many attempts are left after a wrong code', async () => {
    api.post.mockRejectedValueOnce(httpError(401, 'invalid_code', { details: { attemptsRemaining: 3 } }))
    const { onSignedIn, onRestart, user } = renderStep()

    await enterCode(user, 'Mã xác thực', '000000')

    expect(await screen.findByText('Mã không đúng. Bạn còn 3 lần thử.')).toBeInTheDocument()
    expect(screen.getByLabelText('Mã xác thực')).toHaveAttribute('aria-invalid', 'true')
    expect(onSignedIn).not.toHaveBeenCalled()
    expect(onRestart).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'mfa_token_invalid', 'Phiên xác thực đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.'],
    [429, 'mfa_attempts_exceeded', 'Bạn đã nhập sai mã quá số lần cho phép. Vui lòng đăng nhập lại.'],
  ])('sends the user back to the password step on %i %s', async (status, code, message) => {
    api.post.mockRejectedValueOnce(httpError(status, code))
    const { onRestart, user } = renderStep()

    await enterCode(user, 'Mã xác thực', '000000')

    expect(onRestart).toHaveBeenCalledWith(message)
  })

  it.each([
    ['mfa_locked', 'Xác thực hai lớp đang tạm khóa 15 phút do nhập sai mã nhiều lần. Vui lòng thử lại sau.'],
    ['ThrottlerException: Too Many Requests', 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.'],
  ])('explains 429 %s and stays on the step', async (code, message) => {
    api.post.mockRejectedValueOnce(httpError(429, code))
    const { onRestart, user } = renderStep()

    await enterCode(user, 'Mã xác thực', '000000')

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onRestart).not.toHaveBeenCalled()
  })

  describe('focus and announcements', () => {
    it('keeps focus in the code field while the code is being checked', async () => {
      api.post.mockReturnValueOnce(new Promise(() => {}))
      const { user } = renderStep()

      await enterCode(user, 'Mã xác thực', '123456')

      expect(screen.getByRole('button', { name: 'Đang xác thực...' })).toBeDisabled()
      expect(screen.getByLabelText('Mã xác thực')).toHaveFocus()
    })

    it('announces a wrong code and puts focus back in the field', async () => {
      api.post.mockRejectedValueOnce(httpError(401, 'invalid_code', { details: { attemptsRemaining: 2 } }))
      const { user } = renderStep()

      await enterCode(user, 'Mã xác thực', '000000')

      expect(await screen.findByText('Mã không đúng. Bạn còn 2 lần thử.')).toHaveAttribute('role', 'alert')
      await waitFor(() => expect(screen.getByLabelText('Mã xác thực')).toHaveFocus())
    })

    it('announces a code of the wrong format and keeps focus in the field', async () => {
      const { user } = renderStep()

      await enterCode(user, 'Mã xác thực', '12')

      expect(await screen.findByText('Mã xác thực gồm 6 chữ số')).toHaveAttribute('role', 'alert')
      expect(screen.getByLabelText('Mã xác thực')).toHaveFocus()
    })

    it('puts focus back in the field after an error about the whole form', async () => {
      api.post.mockRejectedValueOnce(httpError(429, 'mfa_locked'))
      const { user } = renderStep()

      await enterCode(user, 'Mã xác thực', '000000')

      expect(await screen.findByRole('alert')).toHaveTextContent('tạm khóa 15 phút')
      await waitFor(() => expect(screen.getByLabelText('Mã xác thực')).toHaveFocus())
    })
  })

  it('offers only the methods of the challenge', () => {
    renderStep({ challenge: { ...challenge, methods: ['totp'] } })

    expect(screen.queryByRole('radio', { name: 'Dùng mã khôi phục' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mã xác thực')).toBeInTheDocument()
  })

  it('goes back to the password step on request', async () => {
    const { onRestart, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Quay lại đăng nhập' }))

    expect(onRestart).toHaveBeenCalledWith(null)
  })
})

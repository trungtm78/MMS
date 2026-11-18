import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MfaEnrollStep } from './MfaEnrollStep'

// POST /auth/mfa/enroll and /auth/mfa/enroll/confirm are answered here; api/auth.ts runs for real
const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

const httpError = (status: number, message: string, extra: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: status === 429 ? 'E006' : 'E004', message, statusCode: status, ...extra } },
})

const OTPAUTH = 'otpauth://totp/MMS%20Phu%20Dinh:admin?secret=JBSWY3DPEHPK3PXP&issuer=MMS%20Phu%20Dinh'
const enrollment = { mfaToken: 'setup-token', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: OTPAUTH, qrUri: OTPAUTH, expiresAt: '2026-09-14T03:10:00.000Z' }
const session = {
  user: { id: 'u1', username: 'admin', fullName: 'Quản trị viên', role: 'system_admin', roles: ['system_admin'], unitScope: null },
  tokens: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 },
}
const recoveryCodes = Array.from({ length: 10 }, (_, i) => `K7M2P-${String(40000 + i)}`)

function renderStep() {
  const onSignedIn = vi.fn()
  const onRestart = vi.fn()
  const view = render(
    <MfaEnrollStep challenge={{ mfaToken: 'setup-token', expiresAt: '2026-09-14T03:10:00.000Z' }} onSignedIn={onSignedIn} onRestart={onRestart} />,
  )
  return { ...view, onSignedIn, onRestart, user: userEvent.setup() }
}

describe('MfaEnrollStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('explains why the set-up is needed before starting it', () => {
    renderStep()

    expect(screen.getByText(/Vai trò của bạn bắt buộc sử dụng xác thực hai lớp/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows a QR code of the otpauth URI and the secret for manual entry', async () => {
    api.post.mockResolvedValueOnce({ data: enrollment })
    const { user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))

    expect(api.post).toHaveBeenCalledWith('/auth/mfa/enroll', { mfaToken: 'setup-token' })
    const qr = await screen.findByRole('img', { name: 'Mã QR để quét bằng ứng dụng xác thực' })
    // The QR library is loaded on demand
    await vi.waitFor(() => expect(qr.querySelector('svg')).not.toBeNull())
    expect(screen.getByRole('link', { name: 'Mở bằng ứng dụng xác thực trên thiết bị này' })).toHaveAttribute('href', OTPAUTH)
    expect(screen.getByTestId('mfa-secret').textContent?.replace(/\s/g, '')).toBe('JBSWY3DPEHPK3PXP')
  })

  it('confirms the first code and shows the recovery codes before signing in', async () => {
    api.post
      .mockResolvedValueOnce({ data: enrollment })
      .mockResolvedValueOnce({ data: { status: 'SUCCESS', ...session, recoveryCodes } })
    const { onSignedIn, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    await user.type(await screen.findByLabelText('Mã xác thực'), '654 321')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

    expect(api.post).toHaveBeenLastCalledWith('/auth/mfa/enroll/confirm', { mfaToken: 'setup-token', code: '654321' })
    const list = await screen.findByRole('list', { name: 'Mã khôi phục' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    expect(onSignedIn).not.toHaveBeenCalled()

    const proceed = screen.getByRole('button', { name: 'Tiếp tục vào hệ thống' })
    expect(proceed).toBeDisabled()
    await user.click(screen.getByLabelText('Tôi đã lưu các mã khôi phục ở nơi an toàn'))
    await user.click(proceed)

    expect(onSignedIn).toHaveBeenCalledWith({ user: session.user, tokens: session.tokens })
  })

  it('shows how many attempts are left after a wrong first code', async () => {
    api.post
      .mockResolvedValueOnce({ data: enrollment })
      .mockRejectedValueOnce(httpError(401, 'invalid_code', { details: { attemptsRemaining: 4 } }))
    const { onRestart, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    await user.type(await screen.findByLabelText('Mã xác thực'), '000000')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

    expect(await screen.findByText('Mã không đúng. Bạn còn 4 lần thử.')).toBeInTheDocument()
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('keeps focus in the code field while the first code is checked', async () => {
    api.post.mockResolvedValueOnce({ data: enrollment }).mockReturnValueOnce(new Promise(() => {}))
    const { user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    const input = await screen.findByLabelText('Mã xác thực')
    expect(input).toHaveFocus()
    await user.type(input, '654321')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

    expect(screen.getByRole('button', { name: 'Đang xác nhận...' })).toBeDisabled()
    expect(screen.getByLabelText('Mã xác thực')).toHaveFocus()
  })

  it('announces a wrong first code and puts focus back in the field', async () => {
    api.post
      .mockResolvedValueOnce({ data: enrollment })
      .mockRejectedValueOnce(httpError(401, 'invalid_code', { details: { attemptsRemaining: 3 } }))
    const { user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    await user.type(await screen.findByLabelText('Mã xác thực'), '000000')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

    expect(await screen.findByText('Mã không đúng. Bạn còn 3 lần thử.')).toHaveAttribute('role', 'alert')
    await vi.waitFor(() => expect(screen.getByLabelText('Mã xác thực')).toHaveFocus())
  })

  it('sends the user back to the password step when the set-up challenge expired', async () => {
    api.post.mockRejectedValueOnce(httpError(401, 'mfa_token_invalid'))
    const { onRestart, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))

    await vi.waitFor(() =>
      expect(onRestart).toHaveBeenCalledWith('Phiên xác thực đã hết hạn hoặc không còn hiệu lực. Vui lòng đăng nhập lại.'),
    )
  })

  // The account enrolled in another tab meanwhile: signing in again asks for a code instead
  it('asks to sign in again when the account already has the second factor', async () => {
    api.post.mockRejectedValueOnce(httpError(409, 'mfa_already_enabled'))
    const { onRestart, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))

    await vi.waitFor(() =>
      expect(onRestart).toHaveBeenCalledWith('Xác thực hai lớp đã được bật cho tài khoản này. Vui lòng đăng nhập lại.'),
    )
  })

  it('starts over from the introduction when the server has no set-up in progress', async () => {
    api.post.mockResolvedValueOnce({ data: enrollment }).mockRejectedValueOnce(httpError(409, 'mfa_setup_not_started'))
    const { onRestart, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    await user.type(await screen.findByLabelText('Mã xác thực'), '654321')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa bắt đầu thiết lập. Vui lòng bắt đầu lại.')
    expect(screen.getByRole('button', { name: 'Bắt đầu thiết lập' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Mã xác thực')).not.toBeInTheDocument()
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('explains a set-up answer without a usable secret', async () => {
    api.post.mockResolvedValueOnce({ data: { mfaToken: 'setup-token' } })
    const { user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể bắt đầu thiết lập. Vui lòng thử lại.')
    expect(screen.getByRole('button', { name: 'Bắt đầu thiết lập' })).toBeEnabled()
  })

  it('explains a confirmation the server could not process', async () => {
    api.post.mockResolvedValueOnce({ data: enrollment }).mockRejectedValueOnce(httpError(500, 'Internal server error'))
    const { user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    await user.type(await screen.findByLabelText('Mã xác thực'), '654321')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xác nhận mã. Vui lòng thử lại.')
  })

  it('goes back to the password step on request, before and during the set-up', async () => {
    api.post.mockResolvedValueOnce({ data: enrollment })
    const { onRestart, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Quay lại đăng nhập' }))
    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    await screen.findByLabelText('Mã xác thực')
    await user.click(screen.getByRole('button', { name: 'Quay lại đăng nhập' }))

    expect(onRestart).toHaveBeenNthCalledWith(1, null)
    expect(onRestart).toHaveBeenNthCalledWith(2, null)
  })

  it('sends the user back to the password step after too many wrong codes', async () => {
    api.post.mockResolvedValueOnce({ data: enrollment }).mockRejectedValueOnce(httpError(429, 'mfa_attempts_exceeded'))
    const { onRestart, user } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Bắt đầu thiết lập' }))
    await user.type(await screen.findByLabelText('Mã xác thực'), '000000')
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }))

    await vi.waitFor(() =>
      expect(onRestart).toHaveBeenCalledWith('Bạn đã nhập sai mã quá số lần cho phép. Vui lòng đăng nhập lại.'),
    )
  })
})

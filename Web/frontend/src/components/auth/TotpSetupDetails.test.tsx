import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TotpSetupDetails } from './TotpSetupDetails'

const OTPAUTH = 'otpauth://totp/MMS:admin?secret=JBSWY3DPEHPK3PXP&issuer=MMS'
const enrollment = { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: OTPAUTH }

describe('TotpSetupDetails', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('walks through the set-up with a QR code, a same-device link and the secret in groups of four', async () => {
    render(<TotpSetupDetails enrollment={enrollment} />)

    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual([
      'Mở ứng dụng xác thực (Google Authenticator, Microsoft Authenticator…) trên điện thoại.',
      'Quét mã QR bên dưới, hoặc nhập khóa bí mật thủ công.',
      'Nhập mã 6 chữ số mà ứng dụng hiển thị để xác nhận.',
    ])
    const qr = screen.getByRole('img', { name: 'Mã QR để quét bằng ứng dụng xác thực' })
    await vi.waitFor(() => expect(qr.querySelector('svg')).not.toBeNull())
    expect(screen.getByRole('link', { name: 'Mở bằng ứng dụng xác thực trên thiết bị này' })).toHaveAttribute('href', OTPAUTH)
    expect(screen.getByText('Khóa bí mật (nhập thủ công):')).toBeInTheDocument()
    expect(screen.getByTestId('mfa-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP')
  })

  it('copies the secret without the spaces', async () => {
    const user = userEvent.setup()
    render(<TotpSetupDetails enrollment={enrollment} />)

    await user.click(screen.getByRole('button', { name: 'Sao chép khóa' }))

    expect(await navigator.clipboard.readText()).toBe('JBSWY3DPEHPK3PXP')
    expect(await screen.findByRole('status')).toHaveTextContent('Đã sao chép khóa bí mật')
  })

  it('asks to copy the secret by hand when the clipboard refuses', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    render(<TotpSetupDetails enrollment={enrollment} />)

    await user.click(screen.getByRole('button', { name: 'Sao chép khóa' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Không thể sao chép tự động. Hãy chọn và sao chép khóa thủ công.',
    )
  })
})

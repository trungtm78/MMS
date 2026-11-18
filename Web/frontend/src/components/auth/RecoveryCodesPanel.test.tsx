import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecoveryCodesPanel } from './RecoveryCodesPanel'

const codes = Array.from({ length: 10 }, (_, i) => `ZX9Q${i}-7HJ2K`)

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

describe('RecoveryCodesPanel', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('lists every recovery code once', () => {
    render(<RecoveryCodesPanel codes={codes} doneLabel="Hoàn tất" onDone={vi.fn()} />)

    const list = screen.getByRole('list', { name: 'Mã khôi phục' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(codes)
    expect(screen.getByText(/Mỗi mã chỉ dùng được một lần/)).toBeInTheDocument()
  })

  it('continues only after the user confirms the codes are saved', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<RecoveryCodesPanel codes={codes} doneLabel="Hoàn tất" onDone={onDone} />)

    const done = screen.getByRole('button', { name: 'Hoàn tất' })
    expect(done).toBeDisabled()
    await user.click(done)
    expect(onDone).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('Tôi đã lưu các mã khôi phục ở nơi an toàn'))
    await user.click(done)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('copies all codes, one per line', async () => {
    const user = userEvent.setup()
    render(<RecoveryCodesPanel codes={codes} doneLabel="Hoàn tất" onDone={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Sao chép tất cả' }))

    expect(await navigator.clipboard.readText()).toBe(codes.join('\n'))
    expect(await screen.findByRole('status')).toHaveTextContent('Đã sao chép các mã khôi phục')
  })

  it('asks to copy the codes by hand when the clipboard refuses', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    render(<RecoveryCodesPanel codes={codes} doneLabel="Hoàn tất" onDone={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Sao chép tất cả' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Không thể sao chép tự động. Hãy chọn và sao chép các mã thủ công.',
    )
  })

  // Revoking the URL right after click() can cancel the download in Safari
  it('downloads the codes as a text file and revokes the link only afterwards', async () => {
    let saved: Blob | undefined
    const createObjectURL = vi.fn((blob: Blob) => {
      saved = blob
      return 'blob:recovery-codes'
    })
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('ma-khoi-phuc-mms.txt')
      expect(this.href).toBe('blob:recovery-codes')
    })
    render(<RecoveryCodesPanel codes={codes} doneLabel="Hoàn tất" onDone={vi.fn()} />)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    fireEvent.click(screen.getByRole('button', { name: 'Tải xuống (.txt)' }))

    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    act(() => {
      vi.runAllTimers()
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery-codes')
    vi.useRealTimers()

    expect(saved?.type).toContain('text/plain')
    const text = await readBlob(saved!)
    expect(text.split('\r\n').slice(0, 2)).toEqual([
      'Mã khôi phục xác thực hai lớp — Hệ thống quản lý DQTV (MMS)',
      'Mỗi mã chỉ dùng được một lần. Cất giữ ở nơi an toàn.',
    ])
    for (const code of codes) expect(text).toContain(code)
    expect(screen.getByRole('status')).toHaveTextContent('Đã tải xuống tệp ma-khoi-phuc-mms.txt')
  })
})

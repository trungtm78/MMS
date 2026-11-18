import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Dialog'

function Harness({
  busy = false,
  description,
  closeLabel,
}: {
  busy?: boolean
  description?: string
  closeLabel?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Tạo quyết định
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Tạo quyết định miễn/hoãn"
        description={description}
        busy={busy}
        closeLabel={closeLabel}
      >
        <label htmlFor="reason">Lý do</label>
        <input id="reason" />
      </Dialog>
    </>
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Tạo quyết định' }))
  return screen.findByRole('dialog')
}

describe('Dialog', () => {
  it('is a modal dialog labelled by its title', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const dialog = await openDialog(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Tạo quyết định miễn/hoãn')
    expect(dialog).toHaveAccessibleName('Tạo quyết định miễn/hoãn')
  })

  it('links an optional description', async () => {
    const user = userEvent.setup()
    render(<Harness description="Các trường có dấu * là bắt buộc." />)

    const dialog = await openDialog(user)

    expect(dialog).toHaveAccessibleDescription('Các trường có dấu * là bắt buộc.')
  })

  it('moves focus inside on open and back to the trigger on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Tạo quyết định' })

    const dialog = await openDialog(user)
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('closes from its close button, which has a 44px target and a focus ring', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const dialog = await openDialog(user)
    const close = within(dialog).getByRole('button', { name: 'Đóng' })
    expect(close.className).toMatch(/h-11/)
    expect(close.className).toMatch(/w-11/)
    expect(close.className).toMatch(/focus-visible:ring-2/)

    await user.click(close)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('names its close button with a caller label when one is given', async () => {
    const user = userEvent.setup()
    render(<Harness closeLabel="Đóng biểu mẫu" />)

    const dialog = await openDialog(user)

    expect(within(dialog).getByRole('button', { name: 'Đóng biểu mẫu' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument()
  })

  it('cannot be closed while busy', async () => {
    const user = userEvent.setup()
    render(<Harness busy />)

    const dialog = await openDialog(user)
    const close = within(dialog).getByRole('button', { name: 'Đóng' })

    expect(close).toBeDisabled()
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

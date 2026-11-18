import { useRef, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

function Harness({
  onConfirm = vi.fn(),
  busy = false,
  closeOnConfirm = true,
  useReturnFocus = false,
  cancelLabel,
}: {
  onConfirm?: () => void
  busy?: boolean
  closeOnConfirm?: boolean
  useReturnFocus?: boolean
  cancelLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const rowAction = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button type="button" ref={rowAction}>
        Hàng khác
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Thu hồi
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Thu hồi quyết định?"
        description="Quyết định hoãn của Trần Văn Bình sẽ hết hiệu lực ngay."
        confirmLabel="Thu hồi"
        cancelLabel={cancelLabel}
        tone="danger"
        busy={busy}
        returnFocusTo={useReturnFocus ? rowAction.current : undefined}
        onConfirm={() => {
          onConfirm()
          if (closeOnConfirm) setOpen(false)
        }}
      />
    </>
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Thu hồi' }))
  return screen.findByRole('alertdialog')
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('is a labelled, described modal alert dialog', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const dialog = await openDialog(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Thu hồi quyết định?')
    expect(dialog).toHaveAccessibleDescription('Quyết định hoãn của Trần Văn Bình sẽ hết hiệu lực ngay.')
  })

  it('puts initial focus on the safe (cancel) action', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await openDialog(user)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus())
  })

  it('cancels on Escape and returns focus to the button that opened it', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const trigger = screen.getByRole('button', { name: 'Thu hồi' })

    await openDialog(user)
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('uses the cancel label of the caller when one is given', async () => {
    const user = userEvent.setup()
    render(<Harness cancelLabel="Giữ lại" />)

    const dialog = await openDialog(user)

    expect(within(dialog).getByRole('button', { name: 'Giữ lại' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Hủy' })).not.toBeInTheDocument()
  })

  it('cancels with the cancel button', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await openDialog(user)
    await user.click(screen.getByRole('button', { name: 'Hủy' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('runs onConfirm from the confirm action', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Thu hồi' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('returns focus to an explicit element when one is given', async () => {
    const user = userEvent.setup()
    render(<Harness useReturnFocus />)

    await openDialog(user)
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Hàng khác' })).toHaveFocus())
  })

  it('cannot be dismissed while busy', async () => {
    const user = userEvent.setup()
    render(<Harness busy closeOnConfirm={false} />)

    const dialog = await openDialog(user)
    const cancel = within(dialog).getByRole('button', { name: 'Hủy' })
    const confirm = within(dialog).getByRole('button', { name: /Thu hồi/ })

    expect(cancel).toBeDisabled()
    expect(confirm).toBeDisabled()
    expect(dialog).toHaveAttribute('aria-busy', 'true')

    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('gives its actions a 44px touch target and a visible focus ring', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const dialog = await openDialog(user)
    for (const button of within(dialog).getAllByRole('button')) {
      expect(button.className).toMatch(/min-h-11/)
      expect(button.className).toMatch(/focus-visible:ring-2/)
    }
  })
})

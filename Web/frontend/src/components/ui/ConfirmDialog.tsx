// Accessible in-app confirmation (replaces window.confirm): Radix AlertDialog gives
// role="alertdialog" labelled by the title and described by the description, focuses the safe
// (cancel) action first, cancels on Escape and never closes on an outside click.
import type { ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { useReturnFocus } from '@/hooks/useReturnFocus'

export interface ConfirmDialogProps {
  open: boolean
  /** Called with false when the user cancels (button or Escape) */
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  /** Defaults to the common "cancel" text */
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  /** While true both actions are disabled and the dialog cannot be dismissed */
  busy?: boolean
  /** The caller decides whether to close (immediately, or after its request settles) */
  onConfirm: () => void
  /** Element to focus after closing; defaults to the element focused when it opened */
  returnFocusTo?: HTMLElement | null
}

const ACTION_CLASS = 'min-h-11 focus-visible:ring-2 focus-visible:ring-offset-2'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  returnFocusTo,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const restoreFocus = useReturnFocus(open, returnFocusTo)

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return
        onOpenChange(next)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content
          aria-modal="true"
          aria-busy={busy || undefined}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onCloseAutoFocus={restoreFocus}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-xl focus:outline-none"
        >
          <AlertDialog.Title className="text-lg font-semibold text-[#0F172A]">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[#64748B]">{description}</AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary" disabled={busy} className={ACTION_CLASS}>
                {cancelLabel ?? t('common.actions.cancel')}
              </Button>
            </AlertDialog.Cancel>
            <Button
              type="button"
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={busy}
              onClick={onConfirm}
              className={ACTION_CLASS}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

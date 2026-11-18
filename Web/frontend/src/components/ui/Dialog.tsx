// Accessible modal dialog (Radix Dialog): role="dialog", aria-modal, labelled by its title,
// focus trapped inside and returned to the opener on close. `busy` blocks every way of
// dismissing it while a request is in flight.
import type { ReactNode } from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useReturnFocus } from '@/hooks/useReturnFocus'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  /** While true the dialog cannot be closed (Escape, outside click, close button) */
  busy?: boolean
  /** Accessible name of the close button; defaults to the common "close" text */
  closeLabel?: string
  /** Element to focus after closing; defaults to the element focused when it opened */
  returnFocusTo?: HTMLElement | null
  className?: string
  'data-testid'?: string
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  busy = false,
  closeLabel,
  returnFocusTo,
  className,
  'data-testid': testId,
}: DialogProps) {
  const { t } = useTranslation()
  const restoreFocus = useReturnFocus(open, returnFocusTo)
  const preventWhileBusy = (event: Event) => {
    if (busy) event.preventDefault()
  }

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return
        onOpenChange(next)
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content
          aria-modal="true"
          aria-busy={busy || undefined}
          // Without a description, drop the default aria-describedby that would point nowhere
          {...(description ? {} : { 'aria-describedby': undefined })}
          onEscapeKeyDown={preventWhileBusy}
          onPointerDownOutside={preventWhileBusy}
          onInteractOutside={preventWhileBusy}
          onCloseAutoFocus={restoreFocus}
          data-testid={testId}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
            'max-h-[90vh] overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white shadow-xl focus:outline-none',
            className,
          )}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6 py-4">
            <div className="min-w-0 pt-2">
              <RadixDialog.Title className="text-lg font-semibold text-[#0F172A]">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-sm text-[#64748B]">{description}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label={closeLabel ?? t('common.actions.close')}
                disabled={busy}
                className={cn(
                  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors',
                  'hover:bg-[#F8FAFC] hover:text-[#0F172A]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </RadixDialog.Close>
          </div>
          <div className="px-6 py-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

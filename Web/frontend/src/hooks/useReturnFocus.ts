import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Focus restoration for dialogs opened without a Radix Trigger (e.g. one confirm dialog shared
 * by many row buttons). The element focused when `open` turns true is remembered before the
 * dialog moves focus inside; the returned handler is meant for Radix `onCloseAutoFocus`.
 * `returnFocusTo` overrides the remembered element.
 */
export function useReturnFocus(open: boolean, returnFocusTo?: HTMLElement | null) {
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Layout effects run before Radix focuses the dialog content (a passive effect)
  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) {
      previouslyFocused.current = active
    }
  }, [open])

  return useCallback(
    (event: Event) => {
      event.preventDefault()
      const target = returnFocusTo ?? previouslyFocused.current
      previouslyFocused.current = null
      if (target?.isConnected) target.focus()
    },
    [returnFocusTo],
  )
}

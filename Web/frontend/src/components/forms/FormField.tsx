// One labelled form control with its hint and error text. The control is rendered by the
// caller and receives the id, the ARIA wiring that ties it to the hint and the error, and the
// shared input styling.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const INPUT_CLASS =
  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]'

export interface FormControlProps {
  id: string
  'aria-invalid': true | undefined
  'aria-describedby': string | undefined
  className: string
}

export interface FormFieldProps {
  id: string
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: string
  children: (control: FormControlProps) => ReactNode
  className?: string
}

export function FormField({ id, label, required = false, hint, error, children, className }: FormFieldProps) {
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-[#0F172A]">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-[#C62828]">*</span>}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
        className: cn(INPUT_CLASS, error ? 'border-[#C62828]' : 'border-[#E2E8F0]'),
      })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-[#64748B]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} data-testid={errorId} className="mt-1 text-xs text-[#C62828]">
          {error}
        </p>
      )}
    </div>
  )
}

/** A request failure shown at the top of a form */
export function FormAlert({ message, testId }: { message: string | null; testId?: string }) {
  if (!message) return null
  return (
    <p role="alert" data-testid={testId} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#C62828]">
      {message}
    </p>
  )
}

// Reusable Input component
import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  errorMessage?: string
  label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, errorMessage, label, className, id, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          'w-full rounded-md border px-3 py-2 text-sm text-slate-800 placeholder-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
          error
            ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
            : 'border-slate-300',
          className,
        )}
        aria-invalid={error ? 'true' : 'false'}
        {...props}
      />
      {error && errorMessage && (
        <p className="text-xs text-red-500" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  ),
)
Input.displayName = 'Input'

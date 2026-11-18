// Code entry for the second factor, shared by sign-in and the security settings
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { MfaMethod } from '@/api/mfa'
import type { TranslationKey } from '@/i18n/types'
import { cn } from '@/lib/utils'

const METHOD_LABELS = {
  totp: 'auth.mfa.method.totp',
  recovery_code: 'auth.mfa.method.recoveryCode',
} as const satisfies Record<MfaMethod, TranslationKey>

interface MfaMethodChoiceProps {
  name: string
  methods: readonly MfaMethod[]
  value: MfaMethod
  onChange: (method: MfaMethod) => void
  disabled?: boolean
}

/** Radio choice between the authenticator and a recovery code (rendered only when both are allowed) */
export function MfaMethodChoice({ name, methods, value, onChange, disabled }: MfaMethodChoiceProps) {
  const { t } = useTranslation()
  if (methods.length < 2) return null
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold text-[#0F172A] mb-1">{t('auth.mfa.method.legend')}</legend>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
        {methods.map((method) => (
          <label key={method} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
            <input
              type="radio"
              name={name}
              value={method}
              checked={value === method}
              onChange={() => onChange(method)}
              className="h-4 w-4 accent-[#C62828]"
            />
            {t(METHOD_LABELS[method])}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

interface MfaCodeFieldProps {
  id: string
  method: MfaMethod
  value: string
  onChange: (value: string) => void
  error?: string | null
  disabled?: boolean
  /** While a code is being checked: the field keeps focus (a disabled field would drop it) */
  readOnly?: boolean
  autoFocus?: boolean
  inputRef?: Ref<HTMLInputElement>
}

export function MfaCodeField({ id, method, value, onChange, error, disabled, readOnly, autoFocus, inputRef }: MfaCodeFieldProps) {
  const { t } = useTranslation()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const isTotp = method === 'totp'
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-[#0F172A] mb-1">
        {isTotp ? t('auth.mfa.code.totpLabel') : t('auth.mfa.code.recoveryLabel')}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        aria-busy={readOnly || undefined}
        autoFocus={autoFocus}
        inputMode={isTotp ? 'numeric' : 'text'}
        autoComplete={isTotp ? 'one-time-code' : 'off'}
        autoCapitalize={isTotp ? undefined : 'characters'}
        spellCheck={false}
        maxLength={isTotp ? 8 : 32}
        placeholder={isTotp ? t('auth.mfa.code.totpPlaceholder') : t('auth.mfa.code.recoveryPlaceholder')}
        aria-invalid={!!error}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        className={cn(
          'h-11 w-full rounded-lg border-2 bg-white px-3 font-mono text-base tracking-widest text-[#0F172A] outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#C62828]/40 disabled:opacity-60 read-only:bg-[#F8FAFC]',
          error ? 'border-[#C62828]' : 'border-[#CBD5E1]',
        )}
      />
      <p id={hintId} className="mt-1 text-xs text-[#475569]">
        {isTotp ? t('auth.mfa.code.totpHint') : t('auth.mfa.code.recoveryHint')}
      </p>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-[#C62828]">
          {error}
        </p>
      )}
    </div>
  )
}

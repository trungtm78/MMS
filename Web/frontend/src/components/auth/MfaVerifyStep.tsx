// Sign-in step 2 for MFA_REQUIRED: POST /auth/mfa/verify with an authenticator code or a
// recovery code
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authApi, type MfaChallenge, type SignedInSession } from '@/api/auth'
import {
  RECOVERY_CODES_LOW_THRESHOLD,
  classifyMfaError,
  mfaCodeForRequest,
  mfaCodeFormatError,
  type MfaMethod,
} from '@/api/mfa'
import { MfaCodeField, MfaMethodChoice } from './MfaCodeField'

interface MfaVerifyStepProps {
  challenge: MfaChallenge
  onSignedIn: (session: SignedInSession) => void
  /** Back to the password form, with the reason (null when the user chose to go back) */
  onRestart: (message: string | null) => void
}

const PRIMARY_BUTTON =
  'w-full min-h-11 bg-[#C62828] hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2'
const LINK_BUTTON =
  'w-full min-h-11 text-sm font-medium text-[#C62828] underline underline-offset-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]'

export function MfaVerifyStep({ challenge, onSignedIn, onRestart }: MfaVerifyStepProps) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<MfaMethod>(challenge.methods.includes('totp') ? 'totp' : challenge.methods[0])
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lowCodes, setLowCodes] = useState<{ session: SignedInSession; remaining: number } | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const focusCode = () => codeRef.current?.focus()

  const chooseMethod = (next: MfaMethod) => {
    setMethod(next)
    setCode('')
    setCodeError(null)
    setFormError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    // Focus stays in the field while checking and for whatever answer comes back
    focusCode()
    setFormError(null)
    const formatError = mfaCodeFormatError(method, code)
    setCodeError(formatError)
    if (formatError) return

    setSubmitting(true)
    try {
      const { session, recoveryCodesRemaining } = await authApi.verifyMfa({
        mfaToken: challenge.mfaToken,
        method,
        code: mfaCodeForRequest(method, code),
      })
      setSubmitting(false)
      if (recoveryCodesRemaining !== undefined && recoveryCodesRemaining <= RECOVERY_CODES_LOW_THRESHOLD) {
        setLowCodes({ session, remaining: recoveryCodesRemaining })
        return
      }
      onSignedIn(session)
    } catch (err) {
      setSubmitting(false)
      const failure = classifyMfaError(err, 'auth.mfa.verify.error.fallback')
      if (failure.kind === 'restart') return onRestart(failure.message)
      if (failure.kind === 'code') setCodeError(failure.message)
      else setFormError(failure.message)
      focusCode()
    }
  }

  if (lowCodes) {
    return (
      <div className="space-y-5">
        <h3 className="text-center text-2xl font-bold tracking-wide text-[#C62828]">{t('auth.mfa.verify.heading')}</h3>
        <div role="alert" className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {lowCodes.remaining === 0
            ? t('auth.mfa.verify.lowCodes.none')
            : t('auth.mfa.verify.lowCodes.some', { count: lowCodes.remaining })}
        </div>
        <button type="button" className={PRIMARY_BUTTON} onClick={() => onSignedIn(lowCodes.session)} autoFocus>
          {t('auth.mfa.verify.lowCodes.continue')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-labelledby="mfa-verify-heading">
      <h3 id="mfa-verify-heading" className="text-center text-2xl font-bold tracking-wide text-[#C62828]">
        {t('auth.mfa.verify.heading')}
      </h3>
      <p className="text-sm text-[#0F172A]">
        {method === 'totp' ? t('auth.mfa.verify.totpIntro') : t('auth.mfa.verify.recoveryIntro')}
      </p>
      <MfaMethodChoice
        name="mfa-verify-method"
        methods={challenge.methods}
        value={method}
        onChange={chooseMethod}
        disabled={submitting}
      />
      <MfaCodeField
        id="mfa-verify-code"
        method={method}
        value={code}
        onChange={(value) => {
          setCode(value)
          setCodeError(null)
        }}
        error={codeError}
        readOnly={submitting}
        inputRef={codeRef}
        autoFocus
      />
      {formError && (
        <div role="alert" className="rounded-lg border border-red-500 bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700">
          {formError}
        </div>
      )}
      <button type="submit" disabled={submitting} className={PRIMARY_BUTTON}>
        {submitting ? t('auth.mfa.verify.submit.pending') : t('auth.mfa.verify.submit.idle')}
      </button>
      <button type="button" onClick={() => onRestart(null)} disabled={submitting} className={LINK_BUTTON}>
        {t('auth.mfa.verify.back.label')}
      </button>
    </form>
  )
}

// Sign-in for MFA_SETUP_REQUIRED: POST /auth/mfa/enroll → scan the QR code → POST
// /auth/mfa/enroll/confirm with the first code → save the recovery codes → signed in
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authApi, type MfaSetupChallenge, type SignedInSession } from '@/api/auth'
import { classifyMfaError, mfaCodeForRequest, mfaCodeFormatError, type MfaEnrollment } from '@/api/mfa'
import type { TranslationKey } from '@/i18n/types'
import { MfaCodeField } from './MfaCodeField'
import { RecoveryCodesPanel } from './RecoveryCodesPanel'
import { TotpSetupDetails } from './TotpSetupDetails'

interface MfaEnrollStepProps {
  challenge: MfaSetupChallenge
  onSignedIn: (session: SignedInSession) => void
  /** Back to the password form, with the reason (null when the user chose to go back) */
  onRestart: (message: string | null) => void
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'scan'; enrollment: MfaEnrollment }
  | { kind: 'codes'; session: SignedInSession; recoveryCodes: string[] }

const PRIMARY_BUTTON =
  'w-full min-h-11 bg-[#C62828] hover:bg-[#A91D1D] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2'
const LINK_BUTTON =
  'w-full min-h-11 text-sm font-medium text-[#C62828] underline underline-offset-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]'

export function MfaEnrollStep({ challenge, onSignedIn, onRestart }: MfaEnrollStepProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const focusCode = () => codeRef.current?.focus()

  const handleFailure = (err: unknown, fallback: TranslationKey) => {
    const failure = classifyMfaError(err, fallback)
    if (failure.kind === 'restart') return onRestart(failure.message)
    // The account enrolled elsewhere in the meantime: signing in again asks for a code instead
    if (failure.kind === 'form' && failure.code === 'mfa_already_enabled') {
      return onRestart(t('auth.mfa.enroll.restart.signInAgain', { reason: failure.message }))
    }
    if (failure.kind === 'code') {
      setCodeError(failure.message)
    } else {
      if (failure.code === 'mfa_setup_not_started') {
        setPhase({ kind: 'intro' })
        setCode('')
      }
      setFormError(failure.message)
    }
    focusCode()
  }

  const start = async () => {
    setFormError(null)
    setBusy(true)
    try {
      const enrollment = await authApi.startEnrollment(challenge.mfaToken)
      setBusy(false)
      setPhase({ kind: 'scan', enrollment })
    } catch (err) {
      setBusy(false)
      handleFailure(err, 'auth.mfa.enroll.start.error')
    }
  }

  const confirm = async (event: React.FormEvent, enrollment: MfaEnrollment) => {
    event.preventDefault()
    // Focus stays in the field while checking and for whatever answer comes back
    focusCode()
    setFormError(null)
    const formatError = mfaCodeFormatError('totp', code)
    setCodeError(formatError)
    if (formatError) return

    setBusy(true)
    try {
      const { session, recoveryCodes } = await authApi.confirmEnrollment({
        mfaToken: enrollment.mfaToken,
        code: mfaCodeForRequest('totp', code),
      })
      setBusy(false)
      setPhase({ kind: 'codes', session, recoveryCodes })
    } catch (err) {
      setBusy(false)
      handleFailure(err, 'auth.mfa.enroll.confirm.error')
    }
  }

  const errorBox = formError && (
    <div role="alert" className="rounded-lg border border-red-500 bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700">
      {formError}
    </div>
  )

  return (
    <div className="space-y-5">
      <h3 className="text-center text-2xl font-bold tracking-wide text-[#C62828]">{t('auth.mfa.enroll.heading')}</h3>

      {phase.kind === 'intro' && (
        <>
          <p className="text-sm text-[#0F172A]">{t('auth.mfa.enroll.intro')}</p>
          {errorBox}
          <button type="button" onClick={start} disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? t('auth.mfa.enroll.start.pending') : t('auth.mfa.enroll.start.idle')}
          </button>
          <button type="button" onClick={() => onRestart(null)} disabled={busy} className={LINK_BUTTON}>
            {t('auth.mfa.enroll.back.label')}
          </button>
        </>
      )}

      {phase.kind === 'scan' && (
        <form onSubmit={(event) => confirm(event, phase.enrollment)} noValidate className="space-y-5">
          <TotpSetupDetails enrollment={phase.enrollment} />
          <MfaCodeField
            id="mfa-enroll-code"
            method="totp"
            value={code}
            onChange={(value) => {
              setCode(value)
              setCodeError(null)
            }}
            error={codeError}
            readOnly={busy}
            inputRef={codeRef}
            autoFocus
          />
          {errorBox}
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? t('auth.mfa.enroll.confirm.pending') : t('auth.mfa.enroll.confirm.idle')}
          </button>
          <button type="button" onClick={() => onRestart(null)} disabled={busy} className={LINK_BUTTON}>
            {t('auth.mfa.enroll.back.label')}
          </button>
        </form>
      )}

      {phase.kind === 'codes' && (
        <RecoveryCodesPanel
          codes={phase.recoveryCodes}
          doneLabel={t('auth.mfa.enroll.done.label')}
          onDone={() => onSignedIn(phase.session)}
        />
      )}
    </div>
  )
}

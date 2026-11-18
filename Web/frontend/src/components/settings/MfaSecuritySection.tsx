// Security settings for the signed-in user's second factor: status, enabling it (QR code +
// first code + recovery codes), regenerating recovery codes and disabling it.
// GET /auth/mfa/status, POST /auth/mfa/setup|confirm|recovery-codes/regenerate|disable
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, ShieldOff, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  RECOVERY_CODES_LOW_THRESHOLD,
  classifyMfaError,
  mfaApi,
  mfaCodeForRequest,
  mfaCodeFormatError,
  mfaKeys,
  type MfaEnrollment,
  type MfaMethod,
} from '@/api/mfa'
import { MfaCodeField, MfaMethodChoice } from '@/components/auth/MfaCodeField'
import { RecoveryCodesPanel } from '@/components/auth/RecoveryCodesPanel'
import { TotpSetupDetails } from '@/components/auth/TotpSetupDetails'
import { Dialog } from '@/components/ui/Dialog'
import { getRefreshToken } from '@/api/client'
import { UnexpectedSessionResponseError } from '@/api/session'
import { useAuth } from '@/contexts/AuthContext'
import { describeApiError, parseApiError } from '@/lib/api-error'
import { formatCalendarDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#1F3A5F] px-4 text-sm font-medium text-white hover:bg-[#2d5380] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F] focus-visible:ring-offset-2'
const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A5F] focus-visible:ring-offset-2'
const DANGER_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#C62828] px-4 text-sm font-medium text-white hover:bg-[#A91D1D] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2'

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#C62828]">
      {message}
    </p>
  )
}

/** A code field that keeps focus while its code is checked and takes it back when an error returns */
function useCodeFocus() {
  const ref = useRef<HTMLInputElement>(null)
  return { ref, focus: () => ref.current?.focus() }
}

export function MfaSecuritySection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null)
  const [dialog, setDialog] = useState<'regenerate' | 'disable' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const statusQuery = useQuery({ queryKey: mfaKeys.status, queryFn: mfaApi.status })
  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: mfaKeys.status })

  const setupMutation = useMutation({
    mutationFn: mfaApi.setup,
    onMutate: () => setNotice(null),
    onSuccess: setEnrollment,
    onError: (err) => {
      const { code } = parseApiError(err)
      if (code === 'mfa_already_enabled') refreshStatus()
      setNotice(describeApiError(err, { scope: 'auth.mfa', fallback: 'settings.mfa.setup.error' }))
    },
  })

  const status = statusQuery.data

  return (
    <div className="space-y-4" data-testid="mfa-security-section">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E3F2FD] text-[#1F3A5F]">
          <ShieldCheck size={20} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[#0F172A]">{t('settings.mfa.section.heading')}</h3>
          <p className="text-sm text-[#64748B]">{t('settings.mfa.section.description')}</p>
        </div>
      </div>

      {statusQuery.isLoading && <p className="text-sm text-[#64748B]">{t('common.states.loading')}</p>}

      {statusQuery.isError && (
        <p role="alert" className="text-sm text-[#C62828]">{t('settings.mfa.section.loadError')}</p>
      )}

      {status && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[#64748B]">{t('settings.mfa.section.statusLabel')}</span>
            <span
              data-testid="mfa-status"
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                status.enabled ? 'bg-green-100 text-[#2E7D32]' : 'bg-gray-100 text-[#475569]',
              )}
            >
              {status.enabled ? t('settings.mfa.section.enabled') : t('settings.mfa.section.disabled')}
            </span>
            {status.enabled && status.enrolledAt && (
              <span className="text-[#64748B]">
                {t('settings.mfa.section.enabledSince', { date: formatCalendarDate(status.enrolledAt) })}
              </span>
            )}
          </div>

          {status.enabled && (
            <p data-testid="mfa-recovery-remaining" className="text-sm text-[#0F172A]">
              {t('settings.mfa.section.recoveryRemaining', { count: status.recoveryCodesRemaining })}
            </p>
          )}

          {status.enabled && status.recoveryCodesRemaining <= RECOVERY_CODES_LOW_THRESHOLD && (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {status.recoveryCodesRemaining === 0
                ? t('settings.mfa.lowCodes.none')
                : t('settings.mfa.lowCodes.some', { count: status.recoveryCodesRemaining })}
            </p>
          )}

          {status.required && (
            <p className="text-sm text-[#475569]">
              {status.enabled ? t('settings.mfa.section.requiredEnabled') : t('settings.mfa.section.requiredDisabled')}
            </p>
          )}

          <FormAlert message={notice} />

          <div className="flex flex-wrap gap-2">
            {!status.enabled && (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                onClick={() => setupMutation.mutate()}
                disabled={setupMutation.isPending}
              >
                <ShieldCheck size={16} aria-hidden="true" />
                {setupMutation.isPending ? t('settings.mfa.setup.pending') : t('settings.mfa.setup.idle')}
              </button>
            )}
            {status.enabled && (
              <button type="button" className={SECONDARY_BUTTON} onClick={() => setDialog('regenerate')}>
                <KeyRound size={16} aria-hidden="true" />
                {t('settings.mfa.regenerate.open')}
              </button>
            )}
            {status.enabled && !status.required && (
              <button type="button" className={SECONDARY_BUTTON} onClick={() => setDialog('disable')}>
                <ShieldOff size={16} aria-hidden="true" />
                {t('settings.mfa.disable.open')}
              </button>
            )}
          </div>
        </div>
      )}

      {enrollment && (
        <EnableMfaDialog
          enrollment={enrollment}
          onClose={() => {
            setEnrollment(null)
            refreshStatus()
          }}
          onEnabled={() => {
            setEnrollment(null)
            toast.success(t('settings.mfa.enable.success'))
            refreshStatus()
          }}
        />
      )}

      {dialog === 'regenerate' && (
        <RegenerateCodesDialog
          onClose={() => setDialog(null)}
          onRegenerated={refreshStatus}
        />
      )}

      {dialog === 'disable' && (
        <DisableMfaDialog
          onClose={() => setDialog(null)}
          onDisabled={() => {
            setDialog(null)
            toast.success(t('settings.mfa.disable.success'))
            refreshStatus()
          }}
          onStale={refreshStatus}
        />
      )}
    </div>
  )
}

// ─── Enable ───────────────────────────────────────────────────────────────────

function EnableMfaDialog({
  enrollment,
  onClose,
  onEnabled,
}: {
  enrollment: MfaEnrollment
  onClose: () => void
  onEnabled: () => void
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const codeField = useCodeFocus()

  const { completeSignIn } = useAuth()

  const confirmMutation = useMutation({
    mutationFn: mfaApi.confirm,
    onSuccess: ({ recoveryCodes: codes, session }) => {
      // The confirmation ended every earlier session, this one included. The new session is used
      // at once, so no request leaves with the dead token (and fails its refresh, signing the user
      // out) while the codes are still on screen; "remember me" carries over.
      completeSignIn(session, getRefreshToken() !== null)
      setRecoveryCodes(codes)
    },
    onError: (err) => {
      const failure = classifyMfaError(err, 'settings.mfa.enable.error')
      if (failure.kind === 'code') {
        setCodeError(failure.message)
      } else if (failure.kind === 'restart' || failure.code === 'mfa_setup_not_started') {
        setExpired(true)
        setFormError(t('settings.mfa.enable.expired'))
        return
      } else {
        setFormError(failure.message)
      }
      codeField.focus()
    },
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    codeField.focus()
    setFormError(null)
    const formatError = mfaCodeFormatError('totp', code)
    setCodeError(formatError)
    if (formatError) return
    confirmMutation.mutate({ mfaToken: enrollment.mfaToken, code: mfaCodeForRequest('totp', code) })
  }

  return (
    <Dialog
      open
      // Once the codes are shown they are active: leaving goes through the done button
      onOpenChange={(open) => {
        if (!open && !recoveryCodes) onClose()
      }}
      title={t('settings.mfa.enable.title')}
      busy={confirmMutation.isPending}
    >
      {recoveryCodes ? (
        <RecoveryCodesPanel codes={recoveryCodes} doneLabel={t('settings.mfa.enable.done')} onDone={onEnabled} />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <TotpSetupDetails enrollment={enrollment} />
          <MfaCodeField
            id="mfa-setup-code"
            method="totp"
            value={code}
            onChange={(value) => {
              setCode(value)
              setCodeError(null)
            }}
            error={codeError}
            disabled={expired}
            readOnly={confirmMutation.isPending}
            inputRef={codeField.ref}
          />
          <FormAlert message={formError} />
          <div className="flex justify-end gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={onClose} disabled={confirmMutation.isPending}>
              {t('common.actions.cancel')}
            </button>
            <button type="submit" className={PRIMARY_BUTTON} disabled={confirmMutation.isPending || expired}>
              {confirmMutation.isPending ? t('settings.mfa.enable.submitting') : t('settings.mfa.enable.submit')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

// ─── Regenerate recovery codes ────────────────────────────────────────────────

function RegenerateCodesDialog({ onClose, onRegenerated }: { onClose: () => void; onRegenerated: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const codeField = useCodeFocus()

  const regenerateMutation = useMutation({
    mutationFn: mfaApi.regenerateRecoveryCodes,
    onSuccess: (codes) => {
      setRecoveryCodes(codes)
      // The previous codes stopped working already
      onRegenerated()
    },
    onError: (err) => {
      const failure = classifyMfaError(err, 'settings.mfa.regenerate.error')
      if (failure.kind === 'code') setCodeError(failure.message)
      else setFormError(failure.message)
      codeField.focus()
    },
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    codeField.focus()
    setFormError(null)
    const formatError = mfaCodeFormatError('totp', code)
    setCodeError(formatError)
    if (formatError) return
    regenerateMutation.mutate(mfaCodeForRequest('totp', code))
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !recoveryCodes) onClose()
      }}
      title={t('settings.mfa.regenerate.title')}
      description={recoveryCodes ? undefined : t('settings.mfa.regenerate.description')}
      busy={regenerateMutation.isPending}
    >
      {recoveryCodes ? (
        <RecoveryCodesPanel
          codes={recoveryCodes}
          doneLabel={t('settings.mfa.regenerate.done')}
          onDone={() => {
            toast.success(t('settings.mfa.regenerate.success'))
            onClose()
          }}
        />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <MfaCodeField
            id="mfa-regenerate-code"
            method="totp"
            value={code}
            onChange={(value) => {
              setCode(value)
              setCodeError(null)
            }}
            error={codeError}
            readOnly={regenerateMutation.isPending}
            inputRef={codeField.ref}
            autoFocus
          />
          <FormAlert message={formError} />
          <div className="flex justify-end gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={onClose} disabled={regenerateMutation.isPending}>
              {t('common.actions.cancel')}
            </button>
            <button type="submit" className={PRIMARY_BUTTON} disabled={regenerateMutation.isPending}>
              {regenerateMutation.isPending ? t('settings.mfa.regenerate.submitting') : t('settings.mfa.regenerate.submit')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

// ─── Disable ──────────────────────────────────────────────────────────────────

function DisableMfaDialog({
  onClose,
  onDisabled,
  onStale,
}: {
  onClose: () => void
  onDisabled: () => void
  /** The status shown is out of date (already disabled, or now required by a role) */
  onStale: () => void
}) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<MfaMethod>('totp')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const codeField = useCodeFocus()

  const { completeSignIn } = useAuth()

  const disableMutation = useMutation({
    mutationFn: mfaApi.disable,
    onSuccess: ({ session }) => {
      // Turning it off ended every session, this one included: the new one is used at once, as
      // after enabling it; "remember me" carries over
      completeSignIn(session, getRefreshToken() !== null)
      onDisabled()
    },
    onError: (err) => {
      // An answer without the new session: the factor may be off already, so the status is reloaded
      if (err instanceof UnexpectedSessionResponseError) onStale()
      const failure = classifyMfaError(err, 'settings.mfa.disable.error')
      if (failure.kind === 'code') {
        setCodeError(failure.message)
      } else {
        if (failure.kind === 'form' && (failure.code === 'mfa_not_enabled' || failure.code === 'mfa_required_by_role')) {
          onStale()
        }
        setFormError(failure.message)
      }
      codeField.focus()
    },
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    codeField.focus()
    setFormError(null)
    const formatError = mfaCodeFormatError(method, code)
    setCodeError(formatError)
    if (formatError) return
    disableMutation.mutate({ method, code: mfaCodeForRequest(method, code) })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.mfa.disable.title')}
      description={t('settings.mfa.disable.description')}
      busy={disableMutation.isPending}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <MfaMethodChoice
          name="mfa-disable-method"
          methods={['totp', 'recovery_code']}
          value={method}
          onChange={(next) => {
            setMethod(next)
            setCode('')
            setCodeError(null)
          }}
          disabled={disableMutation.isPending}
        />
        <MfaCodeField
          id="mfa-disable-code"
          method={method}
          value={code}
          onChange={(value) => {
            setCode(value)
            setCodeError(null)
          }}
          error={codeError}
          readOnly={disableMutation.isPending}
          inputRef={codeField.ref}
        />
        <FormAlert message={formError} />
        <div className="flex justify-end gap-2">
          <button type="button" className={SECONDARY_BUTTON} onClick={onClose} disabled={disableMutation.isPending}>
            {t('common.actions.cancel')}
          </button>
          <button type="submit" className={DANGER_BUTTON} disabled={disableMutation.isPending}>
            {disableMutation.isPending ? t('settings.mfa.disable.submitting') : t('settings.mfa.disable.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

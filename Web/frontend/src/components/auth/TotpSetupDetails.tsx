// What a user needs to add the account to an authenticator app: a QR code of the otpauth URI,
// a link for authenticators on the same device, and the secret for manual entry
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import type { MfaEnrollment } from '@/api/mfa'

// The QR library downloads only when a QR code is shown, not with the sign-in page
const QRCodeSVG = lazy(() => import('qrcode.react').then((module) => ({ default: module.QRCodeSVG })))

// Base32 secrets are easier to type in groups of four
function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret
}

export function TotpSetupDetails({ enrollment }: { enrollment: Pick<MfaEnrollment, 'secret' | 'otpauthUri'> }) {
  const { t } = useTranslation()
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setCopyStatus(t('auth.mfa.totpSetup.copy.success'))
    } catch {
      setCopyStatus(t('auth.mfa.totpSetup.copy.error'))
    }
  }

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-[#0F172A]">
        <li>{t('auth.mfa.totpSetup.steps.openApp')}</li>
        <li>{t('auth.mfa.totpSetup.steps.scan')}</li>
        <li>{t('auth.mfa.totpSetup.steps.enterCode')}</li>
      </ol>
      <div className="flex flex-col items-center gap-2">
        <div role="img" aria-label={t('auth.mfa.totpSetup.qr.label')} className="rounded-lg border border-[#E2E8F0] bg-white p-3">
          <Suspense fallback={<span aria-hidden="true" className="block h-[176px] w-[176px] animate-pulse rounded bg-[#F1F5F9]" />}>
            <QRCodeSVG value={enrollment.otpauthUri} size={176} level="M" marginSize={1} aria-hidden="true" />
          </Suspense>
        </div>
        <a
          href={enrollment.otpauthUri}
          className="inline-flex min-h-11 items-center text-sm font-medium text-[#1F3A5F] underline underline-offset-2"
        >
          {t('auth.mfa.totpSetup.openLink.label')}
        </a>
      </div>
      <div>
        <p className="text-sm text-[#475569]">{t('auth.mfa.totpSetup.secret.label')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code data-testid="mfa-secret" className="select-all break-all rounded bg-white px-2 py-1 font-mono text-sm text-[#0F172A] border border-[#E2E8F0]">
            {groupSecret(enrollment.secret)}
          </code>
          <button
            type="button"
            onClick={copySecret}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-[#1F3A5F] hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
          >
            <Copy size={14} aria-hidden="true" />
            {t('auth.mfa.totpSetup.copy.label')}
          </button>
        </div>
        {copyStatus && (
          <p role="status" className="mt-1 text-xs text-[#475569]">
            {copyStatus}
          </p>
        )}
      </div>
    </div>
  )
}

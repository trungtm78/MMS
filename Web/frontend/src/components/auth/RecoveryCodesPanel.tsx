// New recovery codes, shown this once: the user can copy or download them and has to confirm
// they are saved before moving on
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Download } from 'lucide-react'

interface RecoveryCodesPanelProps {
  codes: readonly string[]
  /** Label of the button that continues once the codes are saved */
  doneLabel: string
  onDone: () => void
  busy?: boolean
}

const FILE_NAME = 'ma-khoi-phuc-mms.txt'
const REVOKE_DELAY_MS = 1_000

export function RecoveryCodesPanel({ codes, doneLabel, onDone, busy = false }: RecoveryCodesPanelProps) {
  const { t } = useTranslation()
  const ackId = useId()
  const [acknowledged, setAcknowledged] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setStatus(t('auth.mfa.recoveryCodes.copy.success'))
    } catch {
      setStatus(t('auth.mfa.recoveryCodes.copy.error'))
    }
  }

  const downloadCodes = () => {
    const content = [
      t('auth.mfa.recoveryCodes.download.fileTitle'),
      t('auth.mfa.recoveryCodes.download.fileNote'),
      '',
      ...codes,
      '',
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = FILE_NAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoking at once can cancel the download before it starts (Safari)
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
    setStatus(t('auth.mfa.recoveryCodes.download.success', { fileName: FILE_NAME }))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {t('auth.mfa.recoveryCodes.warning')}
      </div>
      <ol
        aria-label={t('auth.mfa.recoveryCodes.list.label')}
        className="grid grid-cols-1 gap-2 rounded-lg border border-[#E2E8F0] bg-white p-3 sm:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code} className="select-all text-center font-mono text-base tracking-wider text-[#0F172A]">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyCodes}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
        >
          <Copy size={16} aria-hidden="true" />
          {t('auth.mfa.recoveryCodes.copy.label')}
        </button>
        <button
          type="button"
          onClick={downloadCodes}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
        >
          <Download size={16} aria-hidden="true" />
          {t('auth.mfa.recoveryCodes.download.label')}
        </button>
      </div>
      {status && (
        <p role="status" className="text-sm text-[#475569]">
          {status}
        </p>
      )}
      <div className="flex items-start gap-2">
        <input
          id={ackId}
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 h-5 w-5 accent-[#C62828]"
        />
        <label htmlFor={ackId} className="text-sm font-medium text-[#0F172A]">
          {t('auth.mfa.recoveryCodes.acknowledge.label')}
        </label>
      </div>
      <button
        type="button"
        onClick={onDone}
        disabled={!acknowledged || busy}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#C62828] px-4 text-sm font-bold text-white hover:bg-[#A91D1D] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2"
      >
        {doneLabel}
      </button>
    </div>
  )
}

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, Eye, EyeOff, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { changePassword } from '@/api/profile'
import { useAuth } from '@/contexts/AuthContext'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError, errorCodeText, parseApiError } from '@/lib/api-error'

type PasswordFormField = 'currentPassword' | 'newPassword' | 'confirmPassword'

// Codes of POST /users/me/change-password that are about one form field; their texts are in
// errors.settings.password
const ERROR_FIELD: ReadonlyMap<string, PasswordFormField> = new Map([['invalid_credentials', 'currentPassword']])

function getPasswordStrength(password: string): { strength: number; labelKey: TranslationKey | null; color: string } {
  if (!password) return { strength: 0, labelKey: null, color: '' }
  let strength = 0
  if (password.length >= 8) strength += 25
  if (password.length >= 12) strength += 15
  if (/[a-z]/.test(password)) strength += 15
  if (/[A-Z]/.test(password)) strength += 15
  if (/[0-9]/.test(password)) strength += 15
  if (/[^a-zA-Z0-9]/.test(password)) strength += 15
  if (strength <= 40) return { strength, labelKey: 'settings.password.strength.weak', color: '#C62828' }
  if (strength <= 70) return { strength, labelKey: 'settings.password.strength.medium', color: '#F57C00' }
  return { strength, labelKey: 'settings.password.strength.strong', color: '#2E7D32' }
}

export function SettingsPasswordPage() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [show, setShow] = useState({ current: false, new: false, confirm: false })
  const [errors, setErrors] = useState<Partial<Record<PasswordFormField, string>>>({})

  const passwordStrength = getPasswordStrength(formData.newPassword)
  const { endSession } = useAuth()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword: formData.currentPassword, newPassword: formData.newPassword }),
    // POST /users/me/change-password (204) ends every session of the account, this one included
    onSuccess: () => {
      endSession({ tone: 'success', message: t('settings.password.change.success') })
      navigate('/login', { replace: true })
    },
    onError: (err: unknown) => {
      const { code } = parseApiError(err)
      const field = code !== null ? ERROR_FIELD.get(code) : undefined
      const fieldText = code !== null && field ? errorCodeText('settings.password', code) : null
      if (field && fieldText) {
        setErrors({ [field]: fieldText })
      } else {
        toast.error(describeApiError(err, { scope: 'settings.password', fallback: 'settings.password.change.error' }))
      }
    },
  })

  const validate = (): boolean => {
    const e: Partial<Record<PasswordFormField, string>> = {}
    if (!formData.currentPassword) e.currentPassword = t('settings.password.validation.currentRequired')
    if (!formData.newPassword) e.newPassword = t('settings.password.validation.newRequired')
    else if (formData.newPassword.length < 8) e.newPassword = t('settings.password.validation.newTooShort')
    else if (formData.newPassword === formData.currentPassword) e.newPassword = t('settings.password.validation.newSameAsCurrent')
    if (!formData.confirmPassword) e.confirmPassword = t('settings.password.validation.confirmRequired')
    else if (formData.newPassword !== formData.confirmPassword) e.confirmPassword = t('settings.password.validation.confirmMismatch')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (validate()) mutation.mutate()
  }

  const requirements: { key: TranslationKey; met: boolean }[] = [
    { key: 'settings.password.requirements.minLength', met: formData.newPassword.length >= 8 },
    { key: 'settings.password.requirements.uppercase', met: /[A-Z]/.test(formData.newPassword) },
    { key: 'settings.password.requirements.lowercase', met: /[a-z]/.test(formData.newPassword) },
    { key: 'settings.password.requirements.digit', met: /[0-9]/.test(formData.newPassword) },
    { key: 'settings.password.requirements.special', met: /[^a-zA-Z0-9]/.test(formData.newPassword) },
  ]

  return (
    <div className="p-6 space-y-6 max-w-lg bg-[#F8FAFC] min-h-full" data-testid="settings-password-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">{t('settings.password.page.heading')}</h1>
        <p className="text-sm text-[#64748B] mt-1">{t('settings.password.page.description')}</p>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5">
        {/* Current Password */}
        <PasswordField
          label={t('settings.password.fields.current')}
          value={formData.currentPassword}
          show={show.current}
          error={errors.currentPassword}
          onChange={v => setFormData(f => ({ ...f, currentPassword: v }))}
          onToggleShow={() => setShow(s => ({ ...s, current: !s.current }))}
          testId="current-password-input"
        />

        {/* New Password */}
        <div>
          <PasswordField
            label={t('settings.password.fields.new')}
            value={formData.newPassword}
            show={show.new}
            error={errors.newPassword}
            onChange={v => setFormData(f => ({ ...f, newPassword: v }))}
            onToggleShow={() => setShow(s => ({ ...s, new: !s.new }))}
            testId="new-password-input"
          />
          {formData.newPassword && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${passwordStrength.strength}%`, backgroundColor: passwordStrength.color }}
                  />
                </div>
                <span className="text-xs font-medium" style={{ color: passwordStrength.color }}>
                  {passwordStrength.labelKey && t(passwordStrength.labelKey)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {requirements.map(r => (
                  <div key={r.key} className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${r.met ? 'bg-[#2E7D32]' : 'bg-[#E2E8F0]'}`} />
                    <span className={`text-xs ${r.met ? 'text-[#2E7D32]' : 'text-[#64748B]'}`}>{t(r.key)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <PasswordField
          label={t('settings.password.fields.confirm')}
          value={formData.confirmPassword}
          show={show.confirm}
          error={errors.confirmPassword}
          onChange={v => setFormData(f => ({ ...f, confirmPassword: v }))}
          onToggleShow={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
          testId="confirm-password-input"
        />

        <button
          onClick={handleSubmit}
          disabled={mutation.isPending}
          className="w-full py-3 bg-[#1F3A5F] text-white hover:bg-[#2d5380] rounded-lg font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          data-testid="change-password-btn"
        >
          <Shield size={16} />
          {mutation.isPending ? t('settings.password.change.pending') : t('settings.password.change.idle')}
        </button>
      </div>
    </div>
  )
}

function PasswordField({
  label, value, show, error, onChange, onToggleShow, testId,
}: {
  label: string; value: string; show: boolean; error?: string;
  onChange: (v: string) => void; onToggleShow: () => void; testId: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#C62828] mb-1">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" size={16} />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full pl-10 pr-10 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A] ${
            error ? 'border-[#C62828]' : 'border-[#E2E8F0]'
          }`}
          data-testid={testId}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <p className="text-xs text-[#C62828] mt-1">{error}</p>}
    </div>
  )
}

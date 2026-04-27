import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Lock, Eye, EyeOff, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { changePassword } from '@/api/profile'

function getPasswordStrength(password: string): { strength: number; label: string; color: string } {
  if (!password) return { strength: 0, label: '', color: '' }
  let strength = 0
  if (password.length >= 8) strength += 25
  if (password.length >= 12) strength += 15
  if (/[a-z]/.test(password)) strength += 15
  if (/[A-Z]/.test(password)) strength += 15
  if (/[0-9]/.test(password)) strength += 15
  if (/[^a-zA-Z0-9]/.test(password)) strength += 15
  if (strength <= 40) return { strength, label: 'Yếu', color: '#C62828' }
  if (strength <= 70) return { strength, label: 'Trung bình', color: '#F57C00' }
  return { strength, label: 'Mạnh', color: '#2E7D32' }
}

export function SettingsPasswordPage() {
  const [formData, setFormData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [show, setShow] = useState({ current: false, new: false, confirm: false })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const passwordStrength = getPasswordStrength(formData.newPassword)

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword: formData.currentPassword, newPassword: formData.newPassword }),
    onSuccess: () => {
      toast.success('Đổi mật khẩu thành công')
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setErrors({})
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      if (msg === 'invalid_credentials') {
        setErrors({ currentPassword: 'Mật khẩu hiện tại không đúng' })
      } else {
        toast.error('Đổi mật khẩu thất bại')
      }
    },
  })

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!formData.currentPassword) e.currentPassword = 'Vui lòng nhập mật khẩu hiện tại'
    if (!formData.newPassword) e.newPassword = 'Vui lòng nhập mật khẩu mới'
    else if (formData.newPassword.length < 8) e.newPassword = 'Mật khẩu phải có ít nhất 8 ký tự'
    else if (formData.newPassword === formData.currentPassword) e.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại'
    if (!formData.confirmPassword) e.confirmPassword = 'Vui lòng xác nhận mật khẩu mới'
    else if (formData.newPassword !== formData.confirmPassword) e.confirmPassword = 'Mật khẩu xác nhận không khớp'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (validate()) mutation.mutate()
  }

  const requirements = [
    { label: 'Ít nhất 8 ký tự', met: formData.newPassword.length >= 8 },
    { label: 'Có chữ hoa', met: /[A-Z]/.test(formData.newPassword) },
    { label: 'Có chữ thường', met: /[a-z]/.test(formData.newPassword) },
    { label: 'Có số', met: /[0-9]/.test(formData.newPassword) },
    { label: 'Có ký tự đặc biệt', met: /[^a-zA-Z0-9]/.test(formData.newPassword) },
  ]

  return (
    <div className="p-6 space-y-6 max-w-lg bg-[#F8FAFC] min-h-full" data-testid="settings-password-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Đổi Mật Khẩu</h1>
        <p className="text-sm text-[#64748B] mt-1">Đảm bảo tài khoản của bạn được bảo mật tốt</p>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5">
        {/* Current Password */}
        <PasswordField
          label="Mật khẩu hiện tại"
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
            label="Mật khẩu mới"
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
                  {passwordStrength.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {requirements.map(r => (
                  <div key={r.label} className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${r.met ? 'bg-[#2E7D32]' : 'bg-[#E2E8F0]'}`} />
                    <span className={`text-xs ${r.met ? 'text-[#2E7D32]' : 'text-[#64748B]'}`}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <PasswordField
          label="Xác nhận mật khẩu mới"
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
          className="w-full py-3 bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          data-testid="change-password-btn"
        >
          <Shield size={16} />
          {mutation.isPending ? 'Đang xử lý...' : 'Đổi mật khẩu'}
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

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { User, Mail, Phone, Save, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getProfile, updateProfile } from '@/api/profile'
import { describeApiError } from '@/lib/api-error'
import { heldRoles, roleLabel } from '@/lib/roles'
import { MfaSecuritySection } from '@/components/settings/MfaSecuritySection'

export function SettingsProfilePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
  })

  const mutation = useMutation({
    mutationFn: () => updateProfile({
      fullName: formData.fullName || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success(t('settings.profile.update.success'))
      setIsEditing(false)
    },
    onError: (err: unknown) => toast.error(describeApiError(err, { fallback: 'settings.profile.update.error' })),
  })

  const handleStartEdit = () => {
    setFormData({
      fullName: profile?.fullName ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
    })
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="p-6 bg-[#F8FAFC] min-h-full">
        <div className="text-center text-[#64748B] py-12 text-sm">{t('common.states.loading')}</div>
      </div>
    )
  }

  // Every role held, primary first; older responses carry only the primary role
  const roles = heldRoles(profile)
  const primaryRole = profile?.role ?? roles[0] ?? null
  const initial = profile?.fullName?.[0]?.toUpperCase() ?? '?'
  const none = t('common.states.none')

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="settings-profile-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('settings.profile.page.heading')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('settings.profile.page.description')}</p>
        </div>
        {!isEditing && (
          <button
            onClick={handleStartEdit}
            className="bg-[#1F3A5F] text-white hover:bg-[#2d5380] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            data-testid="edit-profile-btn"
          >
            {t('common.actions.edit')}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        {/* Banner */}
        <div className="h-24 bg-gradient-to-r from-[#1F3A5F] to-[#2d5380]" />

        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-12 mb-6">
            {/* Avatar circle with initial */}
            <div className="w-24 h-24 bg-gradient-to-br from-[#1F3A5F] to-[#2d5380] rounded-full border-4 border-white shadow-md flex items-center justify-center flex-shrink-0">
              <span className="text-3xl font-bold text-white">{initial}</span>
            </div>
            <div className="pb-2">
              <h2 className="text-xl font-bold text-[#0F172A]">{profile?.fullName}</h2>
              <p className="text-sm text-[#64748B]" data-testid="profile-primary-role">{roleLabel(primaryRole)}</p>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#C62828] mb-1">{t('settings.profile.form.fullName')}</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={e => setFormData(f => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A]"
                  data-testid="fullname-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#C62828] mb-1">{t('settings.profile.form.email')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A]"
                  data-testid="email-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#C62828] mb-1">{t('settings.profile.form.phone')}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A]"
                  data-testid="phone-input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCancel}
                  className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
                  data-testid="cancel-edit-btn"
                >
                  {t('common.actions.cancel')}
                </button>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="bg-[#2E7D32] text-white hover:bg-[#1B5E20] rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-60 flex items-center gap-2 transition-colors"
                  data-testid="save-profile-btn"
                >
                  <Save size={16} />
                  {mutation.isPending ? t('common.actions.saving') : t('settings.profile.update.idle')}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <InfoRow icon={<User size={16} />} label={t('settings.profile.info.username')} value={profile?.username ?? none} />
              <InfoRow icon={<Mail size={16} />} label={t('settings.profile.info.email')} value={profile?.email ?? none} />
              <InfoRow icon={<Phone size={16} />} label={t('settings.profile.info.phone')} value={profile?.phone ?? none} />
              <InfoRow icon={<CheckCircle size={16} />} label={t('settings.profile.info.unit')} value={profile?.unitScope ?? none} />
              <InfoRow
                icon={<CheckCircle size={16} />}
                label={t('settings.profile.info.roles')}
                value={roles.length ? roles.map(roleLabel).join(', ') : none}
                testId="profile-roles"
              />
              <InfoRow
                icon={<CheckCircle size={16} />}
                label={t('settings.profile.info.status')}
                value={profile?.status === 'active' ? t('settings.profile.status.active') : t('settings.profile.status.inactive')}
              />
            </div>
          )}
        </div>
      </div>

      <section
        aria-labelledby="account-security-heading"
        className="bg-white rounded-lg border border-[#E2E8F0] p-6 space-y-4"
      >
        <h2 id="account-security-heading" className="text-lg font-bold text-[#0F172A]">{t('settings.profile.security.heading')}</h2>
        <MfaSecuritySection />
      </section>
    </div>
  )
}

function InfoRow({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-[#FFF3E0] rounded-lg flex items-center justify-center text-[#C62828] flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-xs text-[#64748B]">{label}</p>
        <p className="text-sm font-medium text-[#0F172A] mt-0.5" data-testid={testId}>{value}</p>
      </div>
    </div>
  )
}

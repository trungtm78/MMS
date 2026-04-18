import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Mail, Phone, Save, X, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getProfile, updateProfile } from '@/api/profile'

export function SettingsProfilePage() {
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
      toast.success('Cập nhật thông tin thành công')
      setIsEditing(false)
    },
    onError: () => toast.error('Cập nhật thất bại'),
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
    return <div className="p-6 text-center text-gray-500">Đang tải...</div>
  }

  const ROLE_LABELS: Record<string, string> = {
    system_admin: 'Quản trị viên', office_staff: 'Văn phòng',
    police_area: 'CA khu vực', police_ward: 'CA phường',
    ubnd_leader: 'Lãnh đạo UBND', dqtv: 'Dân quân',
  }

  return (
    <div className="p-6 space-y-6" data-testid="settings-profile-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Thông Tin Cá Nhân</h1>
          <p className="text-sm text-gray-600 mt-1">Quản lý thông tin tài khoản của bạn</p>
        </div>
        {!isEditing && (
          <button
            onClick={handleStartEdit}
            className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg hover:bg-[#2d5380] transition-colors text-sm font-medium"
            data-testid="edit-profile-btn"
          >
            Chỉnh sửa
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {/* Header banner */}
        <div className="h-24 bg-gradient-to-r from-[#1F3A5F] to-[#366092]" />

        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-12 mb-6">
            <div className="w-24 h-24 bg-white rounded-full border-4 border-white shadow-md flex items-center justify-center">
              <span className="text-3xl font-bold text-[#1F3A5F]">
                {profile?.fullName?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="pb-2">
              <h2 className="text-xl font-bold text-gray-900">{profile?.fullName}</h2>
              <p className="text-sm text-gray-500">{ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}</p>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={e => setFormData(f => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="fullname-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="email-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] text-sm"
                  data-testid="phone-input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCancel}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  data-testid="cancel-edit-btn"
                >
                  Hủy
                </button>
                <button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="px-6 py-2.5 bg-[#15803D] text-white rounded-lg hover:bg-[#166534] text-sm font-medium disabled:opacity-60 flex items-center gap-2"
                  data-testid="save-profile-btn"
                >
                  <Save size={16} />
                  {mutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <InfoRow icon={<User size={16} />} label="Tài khoản" value={profile?.username ?? '—'} />
              <InfoRow icon={<Mail size={16} />} label="Email" value={profile?.email ?? '—'} />
              <InfoRow icon={<Phone size={16} />} label="Điện thoại" value={profile?.phone ?? '—'} />
              <InfoRow icon={<CheckCircle size={16} />} label="Đơn vị" value={profile?.unitScope ?? '—'} />
              <InfoRow icon={<CheckCircle size={16} />} label="Vai trò" value={ROLE_LABELS[profile?.role ?? ''] ?? '—'} />
              <InfoRow icon={<CheckCircle size={16} />} label="Trạng thái" value={profile?.status === 'active' ? 'Hoạt động' : 'Không hoạt động'} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

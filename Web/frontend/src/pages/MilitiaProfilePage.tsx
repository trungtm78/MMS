// US-W003: Militia member full profile — 6 tabs
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { User, Edit, ArrowLeft, MapPin, Phone, Mail, Calendar, Award, Shield, Briefcase } from 'lucide-react'
import { getMilitiaById } from '@/api/militia'

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  active:   { label: 'Đang hoạt động', className: 'bg-green-100 text-green-700' },
  reserve:  { label: 'Dự bị',          className: 'bg-yellow-100 text-yellow-700' },
  inactive: { label: 'Đã xuất ngũ',    className: 'bg-gray-100 text-gray-700' },
  leave:    { label: 'Nghỉ phép',       className: 'bg-blue-100 text-blue-700' },
}

const TABS = [
  { id: 'personal',   label: 'Hồ sơ cá nhân',       icon: User },
  { id: 'history',    label: 'Quá trình công tác',   icon: Briefcase },
  { id: 'training',   label: 'Huấn luyện',            icon: Award },
  { id: 'rewards',    label: 'Khen thưởng - Kỷ luật', icon: Award },
  { id: 'documents',  label: 'Hồ sơ đính kèm',        icon: Shield },
  { id: 'changelog',  label: 'Lịch sử chỉnh sửa',     icon: Calendar },
]

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</p>
      <p className="text-sm text-gray-900 font-medium">{value || '—'}</p>
    </div>
  )
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="py-16 text-center text-sm text-gray-500">{message}</div>
  )
}

export function MilitiaProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('personal')

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['militia-profile', id],
    queryFn: () => getMilitiaById(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-4 border-[#1F3A5F] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Không thể tải thông tin. Vui lòng thử lại.
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_DISPLAY[profile.status] ?? { label: profile.status, className: 'bg-gray-100 text-gray-700' }

  return (
    <div className="p-6 space-y-6" data-testid="militia-profile-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/militia')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Chi tiết Dân Quân Tự Vệ</h1>
            <p className="text-sm text-gray-500 mt-1">Thông tin đầy đủ và lịch sử hoạt động</p>
          </div>
        </div>
        <button className="px-4 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
          <Edit size={16} />
          Chỉnh sửa
        </button>
      </div>

      {/* Profile header card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.fullName} className="w-24 h-24 rounded-lg object-cover" />
            ) : (
              <User size={40} className="text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{profile.fullName}</h2>
            <p className="text-sm text-gray-500 mb-3">
              Mã DQTV: <span className="font-semibold text-[#1F3A5F]">{profile.id}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg">
                <Shield size={14} className="text-[#2E7D32]" />
                <span className="font-medium">{profile.unitCode}</span>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg">
                  <Phone size={14} className="text-gray-500" />
                  <span>{profile.phone}</span>
                </div>
              )}
              {profile.email && (
                <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg">
                  <Mail size={14} className="text-gray-500" />
                  <span>{profile.email}</span>
                </div>
              )}
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200 flex overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={`px-5 py-4 text-sm font-medium whitespace-nowrap flex items-center gap-2 relative transition-colors ${
                  isActive ? 'text-[#1F3A5F] bg-gray-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1F3A5F]" />}
              </button>
            )
          })}
        </div>

        <div className="p-8">
          {activeTab === 'personal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
              <InfoField label="Số CCCD" value={profile.id} />
              <InfoField label="Giới tính" value={profile.unitCode} />
              <InfoField label="Điện thoại" value={profile.phone ?? '—'} />
              <InfoField label="Email" value={profile.email ?? '—'} />
              <InfoField
                label="Trạng thái"
                value={
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                }
              />
            </div>
          )}

          {activeTab === 'history' && (
            <EmptyTab message="Chưa có dữ liệu quá trình công tác" />
          )}

          {activeTab === 'training' && (
            <EmptyTab message="Chưa có dữ liệu huấn luyện" />
          )}

          {activeTab === 'rewards' && (
            <EmptyTab message="Chưa có khen thưởng / kỷ luật" />
          )}

          {activeTab === 'documents' && (
            <EmptyTab message="Chưa có tài liệu đính kèm" />
          )}

          {activeTab === 'changelog' && (
            <EmptyTab message="Chưa có lịch sử chỉnh sửa" />
          )}
        </div>
      </div>
    </div>
  )
}

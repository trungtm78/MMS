// US-W003: Militia member full profile — 6 tabs
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { User, Edit, ArrowLeft, Phone, Mail, Calendar, Award, Shield, Briefcase, FileText, Download } from 'lucide-react'
import { getMilitiaById } from '@/api/militia'
import { trainingApi } from '@/api/training'
import client from '@/api/client'
import type { TrainingRecord } from '@/api/training'

const HEALTH_LABEL: Record<string, string> = { good: 'Tốt', average: 'Trung bình', poor: 'Kém' }
const JUDICIAL_LABEL: Record<string, string> = { clear: 'Sạch', pending: 'Đang xem xét', flagged: 'Có vấn đề' }

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  active:   { label: 'Đang hoạt động', className: 'bg-green-100 text-green-700' },
  reserve:  { label: 'Dự bị',          className: 'bg-yellow-100 text-yellow-700' },
  inactive: { label: 'Đã xuất ngũ',    className: 'bg-gray-100 text-gray-600' },
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

const TRAINING_TYPE_LABEL: Record<string, string> = {
  military:  'Quân sự',
  political: 'Chính trị',
  fire:      'PCCC',
  first_aid: 'Sơ cứu',
  other:     'Khác',
}

const TRAINING_RESULT: Record<string, { label: string; className: string }> = {
  pass:          { label: 'Đạt',           className: 'bg-green-100 text-green-700' },
  fail:          { label: 'Không đạt',     className: 'bg-red-100 text-red-700' },
  not_evaluated: { label: 'Chưa đánh giá', className: 'bg-gray-100 text-gray-600' },
}

const REQUIRED_TRAINING_DAYS = 15 // Luật DQTV 2019 Điều 26

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrainingTab({
  records,
  year,
}: {
  records: TrainingRecord[]
  year: number
}) {
  const totalDays = records.reduce((sum, r) => sum + r.totalDays, 0)
  const meetsRequirement = totalDays >= REQUIRED_TRAINING_DAYS

  return (
    <div className="space-y-4">
      {/* Annual compliance card */}
      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${
          meetsRequirement
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-[#C62828]/30'
        }`}
        data-testid="training-compliance-card"
      >
        <span
          className={`text-sm font-semibold ${
            meetsRequirement ? 'text-green-700' : 'text-[#C62828]'
          }`}
          data-testid="compliance-badge"
        >
          Năm {year}: {totalDays}/{REQUIRED_TRAINING_DAYS} ngày —{' '}
          {meetsRequirement ? 'Đạt ✓' : 'Chưa đạt ✗'}
        </span>
      </div>

      {records.length === 0 ? (
        <div
          className="py-12 text-center text-sm text-[#64748B]"
          data-testid="training-empty"
        >
          Chưa có dữ liệu huấn luyện
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="w-full text-sm" data-testid="training-table">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Từ ngày</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Đến ngày</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Số ngày</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Địa điểm</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {records.map((r) => {
                const result = TRAINING_RESULT[r.result] ?? TRAINING_RESULT.not_evaluated
                return (
                  <tr key={r.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 font-medium text-[#0F172A]">
                      {TRAINING_TYPE_LABEL[r.trainingType] ?? r.trainingType}
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">
                      {new Date(r.fromDate).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">
                      {new Date(r.toDate).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">{r.totalDays}</td>
                    <td className="px-4 py-3 text-[#64748B]">{r.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${result.className}`}>
                        {result.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
      <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-[#0F172A] font-medium">{value || '—'}</p>
    </div>
  )
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="py-16 text-center text-sm text-[#64748B]">{message}</div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MilitiaProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('personal')

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['militia-profile', id],
    queryFn: () => getMilitiaById(id!),
    enabled: !!id,
  })

  const currentYear = new Date().getFullYear()
  const { data: trainingData } = useQuery({
    queryKey: ['training-records', id, currentYear],
    queryFn: () => trainingApi.listRecords({ militiaId: id!, year: currentYear, limit: 100 }),
    enabled: !!id && activeTab === 'training',
  })

  const { data: historyData } = useQuery({
    queryKey: ['militia-history', id],
    queryFn: () => client.get(`/militia/${id}/history`).then((r) => r.data),
    enabled: !!id && activeTab === 'history',
  })

  const { data: rewardsData } = useQuery({
    queryKey: ['militia-rewards', id],
    queryFn: () => client.get(`/militia/${id}/rewards`).then((r) => r.data),
    enabled: !!id && activeTab === 'rewards',
  })

  const { data: documentsData } = useQuery({
    queryKey: ['militia-documents', id],
    queryFn: () => client.get(`/militia/${id}/documents`).then((r) => r.data),
    enabled: !!id && activeTab === 'documents',
  })

  const { data: changelogData } = useQuery({
    queryKey: ['militia-changelog', id],
    queryFn: () => client.get(`/audit?entityType=militia_profile&entityId=${id}&limit=50`).then((r) => r.data),
    enabled: !!id && activeTab === 'changelog',
  })

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await client.get('/militia/me/data-export')
      return res.data
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `ho-so-DQTV-${profile?.fullName ?? 'member'}-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    onError: () => { /* silently ignore */ },
  })

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          Không thể tải thông tin. Vui lòng thử lại.
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_DISPLAY[profile.status] ?? { label: profile.status, className: 'bg-gray-100 text-gray-600' }
  const initials = profile.fullName
    .split(' ')
    .slice(-2)
    .map((w: string) => w.charAt(0).toUpperCase())
    .join('')

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen" data-testid="militia-profile-page">
      {/* Top nav bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/militia')}
            className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-[#E2E8F0]"
            data-testid="back-btn"
          >
            <ArrowLeft size={20} className="text-[#64748B]" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Chi tiết Dân Quân Tự Vệ</h1>
            <p className="text-sm text-[#64748B] mt-0.5">Thông tin đầy đủ và lịch sử hoạt động</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="px-4 py-2 border border-[#C62828] text-[#C62828] rounded-lg hover:bg-red-50 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Download size={16} />
            Xuất hồ sơ
          </button>
          <button className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
            <Edit size={16} />
            Chỉnh sửa
          </button>
        </div>
      </div>

      {/* Profile header card — gradient */}
      <div className="bg-gradient-to-r from-[#1F3A5F] to-[#2E7D32] rounded-xl shadow-md overflow-hidden">
        <div className="p-8 flex items-start gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-xl border-4 border-white/30 flex items-center justify-center flex-shrink-0 overflow-hidden bg-white/20">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.fullName} className="w-24 h-24 object-cover" />
            ) : (
              <span className="text-3xl font-bold text-white">{initials}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-white mb-1">{profile.fullName}</h2>
            <p className="text-sm text-white/70 mb-3">
              Mã DQTV:{' '}
              <span className="font-semibold text-white">{profile.militiaCode ?? profile.id}</span>
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2 text-sm bg-white/15 px-3 py-1.5 rounded-lg text-white">
                <Shield size={14} className="text-white/70" />
                <span className="font-medium">{profile.unitCode}</span>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-sm bg-white/15 px-3 py-1.5 rounded-lg text-white">
                  <Phone size={14} className="text-white/70" />
                  <span>{profile.phone}</span>
                </div>
              )}
              {profile.email && (
                <div className="flex items-center gap-2 text-sm bg-white/15 px-3 py-1.5 rounded-lg text-white">
                  <Mail size={14} className="text-white/70" />
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

      {/* Tabs + content */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        {/* Tab navigation */}
        <div className="border-b border-[#E2E8F0] flex overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={`px-6 py-4 text-sm font-medium whitespace-nowrap flex items-center gap-2 relative transition-colors ${
                  isActive
                    ? 'text-[#1F3A5F] bg-gray-50'
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1F3A5F]" />
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="p-8">
          {activeTab === 'personal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Mã DQTV"           value={profile.militiaCode} />
              <InfoField label="Cấp bậc"            value={profile.rank ?? '—'} />
              <InfoField label="Điện thoại"          value={profile.phone ?? '—'} />
              <InfoField label="Email"              value={profile.email ?? '—'} />
              <InfoField label="Đơn vị"             value={profile.unitName} />
              <InfoField
                label="Trạng thái"
                value={
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                }
              />
              <InfoField label="Nghề nghiệp"        value={profile.occupation ?? '—'} />
              <InfoField label="Trình độ học vấn"   value={profile.educationLevel ?? '—'} />
              <InfoField
                label="Sức khỏe"
                value={profile.healthStatus ? (HEALTH_LABEL[profile.healthStatus] ?? profile.healthStatus) : '—'}
              />
              <InfoField label="Nhóm máu"           value={profile.bloodType ?? '—'} />
              <InfoField label="Địa chỉ thường trú" value={profile.permanentAddress ?? '—'} />
              <InfoField
                label="Lý lịch tư pháp"
                value={profile.judicialClearanceStatus ? (JUDICIAL_LABEL[profile.judicialClearanceStatus] ?? profile.judicialClearanceStatus) : '—'}
              />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6" data-testid="history-tab">
              <section>
                <h3 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#C62828] rounded inline-block" />
                  Phân công CA–DQTV
                </h3>
                {!historyData?.assignments?.length ? (
                  <p className="text-sm text-[#64748B]">Chưa có phân công.</p>
                ) : (
                  <ul className="divide-y divide-[#E2E8F0]">
                    {(historyData.assignments as Record<string, unknown>[]).map((a) => (
                      <li key={a['id'] as string} className="py-2 text-sm text-[#64748B]">
                        CA: {a['caUsername'] as string} — {new Date(a['assignedAt'] as string).toLocaleDateString('vi-VN')}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h3 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#C62828] rounded inline-block" />
                  Lịch sử nhiệm vụ
                </h3>
                {!historyData?.taskHistory?.length ? (
                  <p className="text-sm text-[#64748B]">Chưa có nhiệm vụ nào.</p>
                ) : (
                  <ul className="divide-y divide-[#E2E8F0]">
                    {(historyData.taskHistory as Record<string, unknown>[]).map((t) => (
                      <li key={t['id'] as string} className="py-2 flex justify-between text-sm">
                        <span className="text-[#0F172A]">{t['title'] as string}</span>
                        <span className="text-xs text-[#64748B]">{t['status'] as string}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {activeTab === 'training' && (
            <TrainingTab
              records={trainingData?.data ?? []}
              year={currentYear}
            />
          )}

          {activeTab === 'rewards' && (
            <div data-testid="rewards-tab">
              {!rewardsData?.length ? (
                <EmptyTab message="Chưa có khen thưởng / kỷ luật" />
              ) : (
                <ul className="divide-y divide-[#E2E8F0]">
                  {(rewardsData as Record<string, unknown>[]).map((r) => (
                    <li key={r['id'] as string} className="py-4 flex items-start gap-3">
                      <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r['rewardType'] === 'reward' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-[#C62828]'}`}>
                        {r['rewardType'] === 'reward' ? 'Khen thưởng' : 'Kỷ luật'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">{r['title'] as string}</p>
                        {!!r['description'] && (
                          <p className="text-xs text-[#64748B] mt-0.5">{r['description'] as string}</p>
                        )}
                        <p className="text-xs text-[#64748B] mt-1">
                          {r['issuedDate'] ? new Date(r['issuedDate'] as string).toLocaleDateString('vi-VN') : ''}{' '}
                          {r['issuedBy'] ? `— ${r['issuedBy'] as string}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'documents' && (
            <div data-testid="documents-tab">
              {!documentsData?.length ? (
                <EmptyTab message="Chưa có tài liệu đính kèm" />
              ) : (
                <ul className="divide-y divide-[#E2E8F0]">
                  {(documentsData as Record<string, unknown>[]).map((d) => (
                    <li key={d['id'] as string} className="py-3 flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex items-center justify-center flex-shrink-0">
                        <FileText size={16} className="text-[#64748B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#0F172A] truncate">{d['originalName'] as string}</p>
                        <p className="text-xs text-[#64748B]">
                          {d['uploadedAt'] ? new Date(d['uploadedAt'] as string).toLocaleDateString('vi-VN') : ''}
                        </p>
                      </div>
                      {typeof d['url'] === 'string' && (
                        <a
                          href={d['url']}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#C62828] hover:underline font-medium"
                        >
                          Tải xuống
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'changelog' && (
            <div data-testid="changelog-tab">
              {!changelogData?.data?.length ? (
                <EmptyTab message="Chưa có lịch sử chỉnh sửa" />
              ) : (
                <ul className="divide-y divide-[#E2E8F0]">
                  {(changelogData.data as Record<string, unknown>[]).map((log) => (
                    <li key={log['id'] as string} className="py-3 flex justify-between text-sm">
                      <div>
                        <span className="font-medium text-[#0F172A]">{log['action'] as string}</span>
                        {!!log['actorName'] && (
                          <span className="text-[#64748B] ml-2">bởi {log['actorName'] as string}</span>
                        )}
                      </div>
                      <span className="text-xs text-[#64748B]">
                        {log['createdAt'] ? new Date(log['createdAt'] as string).toLocaleString('vi-VN') : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

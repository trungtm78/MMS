import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { Award, AlertCircle, Plus, X, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

interface RewardRecord {
  id: string
  militiaId: string
  militiaName?: string
  rewardType: string
  issuingAuthority: string
  criteria: string
  issuedDate: string
  createdAt: string
}

interface DisciplineRecord {
  id: string
  militiaId: string
  militiaName?: string
  disciplineType: string
  violation: string
  decisionDate: string
  appealedAt?: string | null
  status: 'active' | 'appealed' | 'overturned'
}

const REWARD_TYPES = [
  'Chiến sĩ thi đua',
  'Bằng khen UBND xã',
  'Bằng khen UBND huyện',
  'Bằng khen UBND tỉnh',
  'Giấy khen',
  'Huân chương',
  'Huy chương',
  'Danh hiệu chiến sĩ xuất sắc',
  'Tập thể tiên tiến',
  'Tập thể xuất sắc',
  'Phần thưởng khác',
  'Khen thưởng đột xuất',
]

const DISCIPLINE_TYPES = [
  { value: 'khien_trach', label: 'Khiển trách' },
  { value: 'canh_cao', label: 'Cảnh cáo' },
  { value: 'ha_cap_bac', label: 'Hạ cấp bậc' },
  { value: 'cach_chuc', label: 'Cách chức' },
  { value: 'khai_tru', label: 'Khai trừ' },
]

const ISSUING_AUTHORITIES = ['UBND xã/phường', 'UBND huyện/quận', 'UBND tỉnh/thành phố']

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function CreateRewardModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    militiaName: '',
    rewardType: '',
    issuingAuthority: '',
    criteria: '',
    issuedDate: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => client.post('/rewards', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã tạo quyết định khen thưởng')
      queryClient.invalidateQueries({ queryKey: ['rewards'] })
      onClose()
    },
    onError: () => toast.error('Không thể tạo quyết định khen thưởng'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.militiaName.trim()) return toast.error('Vui lòng nhập tên DQTV')
    if (!form.rewardType) return toast.error('Vui lòng chọn hình thức khen thưởng')
    if (!form.issuingAuthority) return toast.error('Vui lòng chọn cấp ra quyết định')
    if (!form.issuedDate) return toast.error('Vui lòng chọn ngày')
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0] sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-[#0F172A]">Tạo quyết định khen thưởng</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">DQTV <span className="text-[#C62828]">*</span></label>
            <input
              type="text"
              value={form.militiaName}
              onChange={(e) => setForm((f) => ({ ...f, militiaName: e.target.value }))}
              placeholder="Tên DQTV được khen thưởng"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Hình thức khen thưởng <span className="text-[#C62828]">*</span></label>
            <select
              value={form.rewardType}
              onChange={(e) => setForm((f) => ({ ...f, rewardType: e.target.value }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            >
              <option value="">-- Chọn hình thức --</option>
              {REWARD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Cấp ra quyết định <span className="text-[#C62828]">*</span></label>
            <select
              value={form.issuingAuthority}
              onChange={(e) => setForm((f) => ({ ...f, issuingAuthority: e.target.value }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            >
              <option value="">-- Chọn cấp --</option>
              {ISSUING_AUTHORITIES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Tiêu chí</label>
            <textarea
              value={form.criteria}
              onChange={(e) => setForm((f) => ({ ...f, criteria: e.target.value }))}
              rows={3}
              placeholder="Nêu tiêu chí khen thưởng..."
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Ngày quyết định <span className="text-[#C62828]">*</span></label>
            <input
              type="date"
              value={form.issuedDate}
              onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]">Hủy</button>
            <button type="submit" disabled={createMutation.isPending} className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {createMutation.isPending ? 'Đang lưu...' : 'Tạo quyết định'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateDisciplineModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    militiaName: '',
    disciplineType: '',
    violation: '',
    decisionDate: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => client.post('/discipline', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã tạo quyết định kỷ luật')
      queryClient.invalidateQueries({ queryKey: ['discipline'] })
      onClose()
    },
    onError: () => toast.error('Không thể tạo quyết định kỷ luật'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.militiaName.trim()) return toast.error('Vui lòng nhập tên DQTV')
    if (!form.disciplineType) return toast.error('Vui lòng chọn hình thức kỷ luật')
    if (!form.violation.trim()) return toast.error('Vui lòng nhập vi phạm')
    if (!form.decisionDate) return toast.error('Vui lòng chọn ngày quyết định')
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">Tạo quyết định kỷ luật</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">DQTV <span className="text-[#C62828]">*</span></label>
            <input
              type="text"
              value={form.militiaName}
              onChange={(e) => setForm((f) => ({ ...f, militiaName: e.target.value }))}
              placeholder="Tên DQTV bị kỷ luật"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Hình thức kỷ luật <span className="text-[#C62828]">*</span></label>
            <select
              value={form.disciplineType}
              onChange={(e) => setForm((f) => ({ ...f, disciplineType: e.target.value }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            >
              <option value="">-- Chọn hình thức --</option>
              {DISCIPLINE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Vi phạm <span className="text-[#C62828]">*</span></label>
            <textarea
              value={form.violation}
              onChange={(e) => setForm((f) => ({ ...f, violation: e.target.value }))}
              rows={3}
              placeholder="Mô tả vi phạm..."
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Ngày quyết định <span className="text-[#C62828]">*</span></label>
            <input
              type="date"
              value={form.decisionDate}
              onChange={(e) => setForm((f) => ({ ...f, decisionDate: e.target.value }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]">Hủy</button>
            <button type="submit" disabled={createMutation.isPending} className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {createMutation.isPending ? 'Đang lưu...' : 'Tạo quyết định'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RewardsTab() {
  const [showModal, setShowModal] = useState(false)

  const { data: rewards = [], isLoading } = useQuery<RewardRecord[]>({
    queryKey: ['rewards'],
    queryFn: () => client.get('/rewards').then((r) => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          data-testid="create-reward-btn"
          className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          Tạo quyết định khen thưởng
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => (<div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse h-16" />))}</div>
      ) : rewards.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <Award size={40} className="mx-auto mb-3 text-[#64748B]" />
          <p className="text-[#64748B]">Chưa có quyết định khen thưởng nào</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
              <tr>
                {['DQTV', 'Hình thức', 'Cấp ra QĐ', 'Tiêu chí', 'Ngày'].map((h) => (
                  <th key={h} className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]" data-testid={`reward-row-${r.id}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-700 text-xs font-bold">
                        {r.militiaName?.split(' ').filter(Boolean).slice(-1)[0]?.[0] ?? '?'}
                      </div>
                      <span className="text-sm font-medium text-[#0F172A]">{r.militiaName ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">
                      {r.rewardType}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-[#64748B]">{r.issuingAuthority}</td>
                  <td className="px-5 py-4 text-sm text-[#64748B] max-w-xs truncate">{r.criteria || '—'}</td>
                  <td className="px-5 py-4 text-sm text-[#64748B]">{formatDate(r.issuedDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <CreateRewardModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

function DisciplineTab() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: records = [], isLoading } = useQuery<DisciplineRecord[]>({
    queryKey: ['discipline'],
    queryFn: () => client.get('/discipline').then((r) => r.data),
  })

  const appealMutation = useMutation({
    mutationFn: (id: string) => client.patch(`/discipline/${id}/appeal`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã ghi nhận kháng cáo')
      queryClient.invalidateQueries({ queryKey: ['discipline'] })
    },
    onError: () => toast.error('Không thể ghi nhận kháng cáo'),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          data-testid="create-discipline-btn"
          className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          Tạo quyết định kỷ luật
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => (<div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse h-16" />))}</div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-[#64748B]" />
          <p className="text-[#64748B]">Chưa có quyết định kỷ luật nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((rec) => {
            const disciplineLabel = DISCIPLINE_TYPES.find((t) => t.value === rec.disciplineType)?.label ?? rec.disciplineType
            return (
              <div
                key={rec.id}
                data-testid={`discipline-row-${rec.id}`}
                className="bg-white rounded-xl border border-[#E2E8F0] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-[#C62828] text-sm font-bold shrink-0">
                      {rec.militiaName?.split(' ').filter(Boolean).slice(-1)[0]?.[0] ?? '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#0F172A]">{rec.militiaName ?? '—'}</p>
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                          rec.status === 'overturned' ? 'bg-green-100 text-[#2E7D32]' :
                          rec.status === 'appealed' ? 'bg-blue-100 text-blue-700' :
                          'bg-red-100 text-[#C62828]'
                        }`}>
                          {rec.status === 'overturned' ? 'Đã hủy' : rec.status === 'appealed' ? 'Đang kháng cáo' : 'Hiệu lực'}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {disciplineLabel} · Ngày {formatDate(rec.decisionDate)}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5 max-w-lg">{rec.violation}</p>
                    </div>
                  </div>
                  {rec.status === 'active' && (
                    <button
                      onClick={() => appealMutation.mutate(rec.id)}
                      disabled={appealMutation.isPending}
                      data-testid={`appeal-btn-${rec.id}`}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors disabled:opacity-50"
                    >
                      <MessageSquare size={12} />
                      Kháng cáo
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && <CreateDisciplineModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

type MainTab = 'rewards' | 'discipline'

export function RewardsManagePage() {
  const { can } = useRbac()
  const [activeTab, setActiveTab] = useState<MainTab>('rewards')

  if (!can.manageMilitia) return <Navigate to="/forbidden" replace />

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="rewards-page">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <Award size={24} className="text-[#C62828]" />
            Khen thưởng – Kỷ luật
          </h1>
          <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Quản lý thi đua khen thưởng DQTV</p>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
          <button
            onClick={() => setActiveTab('rewards')}
            data-testid="tab-rewards"
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'rewards' ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          >
            Khen thưởng
          </button>
          <button
            onClick={() => setActiveTab('discipline')}
            data-testid="tab-discipline"
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'discipline' ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
            }`}
          >
            Kỷ luật
          </button>
        </div>

        {activeTab === 'rewards' ? <RewardsTab /> : <DisciplineTab />}
      </div>
    </div>
  )
}

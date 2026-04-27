import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { BookOpen, Plus, X, CheckSquare, BarChart2 } from 'lucide-react'
import { toast } from 'sonner'

interface TrainingPlan {
  id: string
  year: number
  type: string
  requiredDays: number
  completedDays: number
  status: 'draft' | 'active' | 'completed'
}

interface TrainingSession {
  id: string
  planId?: string
  name: string
  type: string
  startDate: string
  endDate: string
  location: string
  daysCount: number
  attendancePercent?: number
  status: 'upcoming' | 'ongoing' | 'completed'
}

interface Member {
  id: string
  name: string
  attended?: boolean
}

type TabId = 'plans' | 'sessions' | 'stats'

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function AttendanceModal({ session, onClose }: { session: TrainingSession; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [members, setMembers] = useState<Member[]>([])

  const { data: fetchedMembers } = useQuery<Member[]>({
    queryKey: ['training-session-members', session.id],
    queryFn: () => client.get(`/training/sessions/${session.id}/members`).then((r) => r.data),
  })

  useEffect(() => {
    if (fetchedMembers) {
      setMembers(fetchedMembers.map((m) => ({ ...m, attended: m.attended ?? false })))
    }
  }, [fetchedMembers])

  const submitMutation = useMutation({
    mutationFn: (data: { memberId: string; attended: boolean }[]) =>
      client.post(`/training/sessions/${session.id}/attendance`, { attendance: data }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã lưu điểm danh')
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] })
      onClose()
    },
    onError: () => toast.error('Không thể lưu điểm danh'),
  })

  const toggleMember = (id: string) => {
    setMembers((ms) => ms.map((m) => m.id === id ? { ...m, attended: !m.attended } : m))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-md shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">Điểm danh – {session.name}</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {members.length === 0 ? (
            <p className="text-center text-[#64748B] py-8 text-sm">Không có thành viên</p>
          ) : (
            members.map((m) => (
              <label key={m.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F8FAFC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={m.attended ?? false}
                  onChange={() => toggleMember(m.id)}
                  className="w-4 h-4 text-[#C62828] rounded focus:ring-[#C62828]/30"
                />
                <span className="text-sm text-[#0F172A]">{m.name}</span>
                {m.attended && <span className="ml-auto text-xs text-[#2E7D32] font-medium">Có mặt</span>}
              </label>
            ))
          )}
        </div>
        <div className="p-4 border-t border-[#E2E8F0] flex justify-between items-center">
          <span className="text-sm text-[#64748B]">
            {members.filter((m) => m.attended).length}/{members.length} có mặt
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]">Hủy</button>
            <button
              onClick={() => submitMutation.mutate(members.map((m) => ({ memberId: m.id, attended: m.attended ?? false })))}
              disabled={submitMutation.isPending || members.length === 0}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Lưu điểm danh
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlansTab() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ year: String(new Date().getFullYear()), type: '', requiredDays: '' })

  const { data: plans = [], isLoading } = useQuery<TrainingPlan[]>({
    queryKey: ['training-plans'],
    queryFn: () => client.get('/training/plans').then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      client.post('/training/plans', { ...data, year: parseInt(data.year), requiredDays: parseInt(data.requiredDays) }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã tạo kế hoạch huấn luyện')
      queryClient.invalidateQueries({ queryKey: ['training-plans'] })
      setShowForm(false)
      setForm({ year: String(new Date().getFullYear()), type: '', requiredDays: '' })
    },
    onError: () => toast.error('Không thể tạo kế hoạch'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.type.trim()) return toast.error('Vui lòng nhập loại huấn luyện')
    if (!form.requiredDays || parseInt(form.requiredDays) <= 0) return toast.error('Vui lòng nhập số ngày hợp lệ')
    createMutation.mutate(form)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          data-testid="create-plan-btn"
          className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          Tạo kế hoạch
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Kế hoạch huấn luyện mới</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Năm</label>
              <input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Loại huấn luyện <span className="text-[#C62828]">*</span></label>
              <input type="text" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="VD: Chiến đấu cơ bản" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Số ngày quy định <span className="text-[#C62828]">*</span></label>
              <input type="number" min="1" value={form.requiredDays} onChange={(e) => setForm((f) => ({ ...f, requiredDays: e.target.value }))} placeholder="15" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
            </div>
            <div className="col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]">Hủy</button>
              <button type="submit" disabled={createMutation.isPending} className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                {createMutation.isPending ? 'Đang lưu...' : 'Tạo kế hoạch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => (<div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse h-16" />))}</div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center"><p className="text-[#64748B]">Chưa có kế hoạch nào</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
              <tr>
                {['Năm', 'Loại', 'Số ngày quy định', 'Đã hoàn thành', 'Trạng thái'].map((h) => (
                  <th key={h} className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const pct = plan.requiredDays > 0 ? Math.round((plan.completedDays / plan.requiredDays) * 100) : 0
                return (
                  <tr key={plan.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-5 py-4 text-sm font-semibold text-[#0F172A]">{plan.year}</td>
                    <td className="px-5 py-4 text-sm text-[#0F172A]">{plan.type}</td>
                    <td className="px-5 py-4 text-sm text-[#0F172A]">{plan.requiredDays} ngày</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[80px]">
                          <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-[#2E7D32]' : 'bg-[#C62828]'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-xs text-[#64748B]">{plan.completedDays}/{plan.requiredDays} ({pct}%)</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                        plan.status === 'completed' ? 'bg-green-100 text-[#2E7D32]' :
                        plan.status === 'active' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-[#64748B]'
                      }`}>
                        {plan.status === 'completed' ? 'Hoàn thành' : plan.status === 'active' ? 'Đang thực hiện' : 'Nháp'}
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

function SessionsTab() {
  const [attendanceSession, setAttendanceSession] = useState<TrainingSession | null>(null)

  const { data: sessions = [], isLoading } = useQuery<TrainingSession[]>({
    queryKey: ['training-sessions'],
    queryFn: () => client.get('/training/sessions').then((r) => r.data),
  })

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse h-40" />
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {['Đợt', 'Loại', 'Ngày bắt đầu', 'Ngày kết thúc', 'Địa điểm', 'Số ngày', '% Tham dự', ''].map((h) => (
                    <th key={h} className="px-4 py-4 text-left text-xs font-semibold text-[#64748B] uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-[#64748B] text-sm">Chưa có đợt huấn luyện nào</td></tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]" data-testid={`session-row-${s.id}`}>
                      <td className="px-4 py-4 text-sm font-medium text-[#0F172A]">{s.name}</td>
                      <td className="px-4 py-4 text-sm text-[#64748B]">{s.type}</td>
                      <td className="px-4 py-4 text-sm text-[#64748B]">{formatDate(s.startDate)}</td>
                      <td className="px-4 py-4 text-sm text-[#64748B]">{formatDate(s.endDate)}</td>
                      <td className="px-4 py-4 text-sm text-[#0F172A]">{s.location}</td>
                      <td className="px-4 py-4 text-sm text-[#0F172A]">{s.daysCount}</td>
                      <td className="px-4 py-4">
                        {s.attendancePercent !== undefined ? (
                          <span className={`text-sm font-semibold ${s.attendancePercent >= 80 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
                            {s.attendancePercent}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => setAttendanceSession(s)}
                          data-testid={`attendance-btn-${s.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2E7D32] bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors whitespace-nowrap"
                        >
                          <CheckSquare size={12} />
                          Điểm danh
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {attendanceSession && (
        <AttendanceModal session={attendanceSession} onClose={() => setAttendanceSession(null)} />
      )}
    </div>
  )
}

function StatsTab() {
  const { data: plans = [], isLoading } = useQuery<TrainingPlan[]>({
    queryKey: ['training-plans'],
    queryFn: () => client.get('/training/plans').then((r) => r.data),
  })

  const currentYear = new Date().getFullYear()
  const currentPlan = plans.find((p) => p.year === currentYear)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <h3 className="text-sm font-semibold text-[#0F172A] mb-4 flex items-center gap-2">
          <BarChart2 size={16} className="text-[#C62828]" />
          Quy định huấn luyện (Thông tư 56/2020/TT-BQP)
        </h3>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
            <p className="text-xs text-[#64748B] mb-1">Năm đầu (Dân quân mới)</p>
            <p className="text-2xl font-bold text-[#0F172A]">15 ngày</p>
            <p className="text-xs text-[#64748B] mt-1">Huấn luyện quân sự cơ bản</p>
          </div>
          <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
            <p className="text-xs text-[#64748B] mb-1">Năm tiếp theo</p>
            <p className="text-2xl font-bold text-[#0F172A]">7–12 ngày</p>
            <p className="text-xs text-[#64748B] mt-1">Bổ túc huấn luyện hàng năm</p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-16 bg-gray-100 rounded animate-pulse" />
        ) : currentPlan ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-[#0F172A]">Hoàn thành năm {currentYear}</p>
              <span className={`text-sm font-bold ${currentPlan.completedDays >= currentPlan.requiredDays ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
                {currentPlan.completedDays}/{currentPlan.requiredDays} ngày
                ({currentPlan.requiredDays > 0 ? Math.round((currentPlan.completedDays / currentPlan.requiredDays) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${currentPlan.completedDays >= currentPlan.requiredDays ? 'bg-[#2E7D32]' : 'bg-[#C62828]'}`}
                style={{
                  width: `${Math.min(100, currentPlan.requiredDays > 0 ? (currentPlan.completedDays / currentPlan.requiredDays) * 100 : 0)}%`,
                }}
              />
            </div>
            <p className="text-xs text-[#64748B] mt-2">
              {currentPlan.completedDays >= currentPlan.requiredDays
                ? 'Đã hoàn thành chỉ tiêu huấn luyện năm nay'
                : `Còn ${currentPlan.requiredDays - currentPlan.completedDays} ngày để hoàn thành chỉ tiêu`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#64748B]">Chưa có kế hoạch cho năm {currentYear}</p>
        )}
      </div>

      {/* All years summary */}
      {plans.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E2E8F0]">
            <h3 className="text-sm font-semibold text-[#0F172A]">Thống kê theo năm</h3>
          </div>
          <table className="w-full">
            <thead className="bg-[#F8FAFC]">
              <tr>
                {['Năm', 'Loại', 'Quy định', 'Thực hiện', '% Hoàn thành'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-[#64748B] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const pct = plan.requiredDays > 0 ? Math.round((plan.completedDays / plan.requiredDays) * 100) : 0
                return (
                  <tr key={plan.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3 text-sm font-semibold text-[#0F172A]">{plan.year}</td>
                    <td className="px-5 py-3 text-sm text-[#64748B]">{plan.type}</td>
                    <td className="px-5 py-3 text-sm text-[#0F172A]">{plan.requiredDays} ngày</td>
                    <td className="px-5 py-3 text-sm text-[#0F172A]">{plan.completedDays} ngày</td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-bold ${pct >= 100 ? 'text-[#2E7D32]' : pct >= 50 ? 'text-yellow-600' : 'text-[#C62828]'}`}>
                        {pct}%
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

export function TrainingPlanPage() {
  const { can } = useRbac()
  const [activeTab, setActiveTab] = useState<TabId>('plans')

  if (!can.manageMilitia) return <Navigate to="/forbidden" replace />

  const tabs: { id: TabId; label: string }[] = [
    { id: 'plans', label: 'Kế hoạch năm' },
    { id: 'sessions', label: 'Đợt huấn luyện' },
    { id: 'stats', label: 'Thống kê' },
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="training-page">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <BookOpen size={24} className="text-[#C62828]" />
            Kế hoạch huấn luyện
          </h1>
          <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Quản lý huấn luyện DQTV</p>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`training-tab-${tab.id}`}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'plans' && <PlansTab />}
        {activeTab === 'sessions' && <SessionsTab />}
        {activeTab === 'stats' && <StatsTab />}
      </div>
    </div>
  )
}

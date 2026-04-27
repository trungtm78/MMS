import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { FileText, Plus, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'

interface ExemptionRecord {
  id: string
  militiaId: string
  militiaName?: string
  type: 'exemption' | 'deferral'
  reason: string
  legalBasis: string
  effectiveDate: string
  expiryDate?: string
  status: 'active' | 'expired' | 'revoked'
  documents: string[]
}

const STATUS_BADGE: Record<ExemptionRecord['status'], string> = {
  active: 'bg-green-100 text-[#2E7D32]',
  expired: 'bg-gray-100 text-[#64748B]',
  revoked: 'bg-red-100 text-[#C62828]',
}

const STATUS_LABEL: Record<ExemptionRecord['status'], string> = {
  active: 'Đang hiệu lực',
  expired: 'Hết hạn',
  revoked: 'Thu hồi',
}

const TYPE_LABEL: Record<ExemptionRecord['type'], string> = {
  exemption: 'Miễn',
  deferral: 'Hoãn',
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function daysUntilExpiry(expiryDate: string | undefined): number | null {
  if (!expiryDate) return null
  const d = new Date(expiryDate)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

interface CreateExemptionForm {
  militiaId: string
  militiaName: string
  type: ExemptionRecord['type']
  reason: string
  legalBasis: string
  effectiveDate: string
  expiryDate: string
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreateExemptionForm>({
    militiaId: '',
    militiaName: '',
    type: 'deferral',
    reason: '',
    legalBasis: '',
    effectiveDate: '',
    expiryDate: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateExemptionForm) =>
      client.post('/exemptions', {
        ...data,
        expiryDate: data.expiryDate || undefined,
      }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã tạo quyết định miễn/hoãn')
      queryClient.invalidateQueries({ queryKey: ['exemptions'] })
      onClose()
    },
    onError: () => toast.error('Không thể tạo quyết định'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.militiaId.trim() && !form.militiaName.trim()) return toast.error('Vui lòng nhập thông tin DQTV')
    if (!form.reason.trim()) return toast.error('Vui lòng nhập lý do')
    if (!form.legalBasis.trim()) return toast.error('Vui lòng nhập căn cứ pháp lý')
    if (!form.effectiveDate) return toast.error('Vui lòng nhập ngày hiệu lực')
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0] sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-[#0F172A]">Tạo quyết định miễn/hoãn</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">DQTV <span className="text-[#C62828]">*</span></label>
            <input
              type="text"
              value={form.militiaName}
              onChange={(e) => setForm((f) => ({ ...f, militiaName: e.target.value }))}
              placeholder="Tìm tên DQTV..."
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Loại quyết định</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ExemptionRecord['type'] }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            >
              <option value="deferral">Hoãn nghĩa vụ</option>
              <option value="exemption">Miễn nghĩa vụ</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Lý do <span className="text-[#C62828]">*</span></label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Nêu lý do miễn/hoãn..."
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Căn cứ pháp lý <span className="text-[#C62828]">*</span></label>
            <input
              type="text"
              value={form.legalBasis}
              onChange={(e) => setForm((f) => ({ ...f, legalBasis: e.target.value }))}
              placeholder="VD: Điều 14 Luật Dân quân tự vệ 2019"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Ngày hiệu lực <span className="text-[#C62828]">*</span></label>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1">Ngày hết hạn (tùy chọn)</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
              />
            </div>
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

export function ExemptionPage() {
  const { can } = useRbac()
  const [showModal, setShowModal] = useState(false)

  if (!can.manageMilitia) return <Navigate to="/forbidden" replace />

  const { data: exemptions = [], isLoading } = useQuery<ExemptionRecord[]>({
    queryKey: ['exemptions'],
    queryFn: () => client.get('/exemptions').then((r) => r.data),
  })

  const expiringCount = exemptions.filter((e) => {
    const days = daysUntilExpiry(e.expiryDate)
    return e.status === 'active' && days !== null && days <= 30 && days >= 0
  }).length

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="exemption-page">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <FileText size={24} className="text-[#C62828]" />
              Miễn hoãn nghĩa vụ
            </h1>
            <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Quyết định miễn/hoãn DQTV</p>
          </div>
          <div className="flex items-center gap-3">
            {expiringCount > 0 && (
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded-lg text-sm">
                <AlertTriangle size={14} />
                {expiringCount} quyết định sắp hết hạn
              </div>
            )}
            <button
              onClick={() => setShowModal(true)}
              data-testid="create-exemption-btn"
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Plus size={16} />
              Tạo quyết định
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Đang hiệu lực</p>
            <p className="text-3xl font-bold text-[#2E7D32]">{exemptions.filter((e) => e.status === 'active').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Sắp hết hạn (30 ngày)</p>
            <p className={`text-3xl font-bold ${expiringCount > 0 ? 'text-yellow-600' : 'text-[#0F172A]'}`}>{expiringCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Hết hạn / Thu hồi</p>
            <p className="text-3xl font-bold text-[#64748B]">{exemptions.filter((e) => e.status !== 'active').length}</p>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))
          ) : exemptions.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
              <FileText size={40} className="mx-auto mb-3 text-[#64748B]" />
              <p className="text-[#64748B]">Chưa có quyết định nào</p>
            </div>
          ) : (
            exemptions.map((rec) => {
              const days = daysUntilExpiry(rec.expiryDate)
              const isExpiringSoon = rec.status === 'active' && days !== null && days <= 30 && days >= 0
              return (
                <div
                  key={rec.id}
                  data-testid={`exemption-${rec.id}`}
                  className={`bg-white rounded-xl border p-5 ${isExpiringSoon ? 'border-yellow-300' : 'border-[#E2E8F0]'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[#0F172A]">{rec.militiaName ?? 'Không rõ'}</p>
                        <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                          {TYPE_LABEL[rec.type]}
                        </span>
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[rec.status]}`}>
                          {STATUS_LABEL[rec.status]}
                        </span>
                        {isExpiringSoon && (
                          <span
                            data-testid="expiry-warning"
                            className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700"
                          >
                            <AlertTriangle size={10} />
                            Sắp hết hạn ({days} ngày)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748B] mt-1.5">{rec.reason}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">Căn cứ: {rec.legalBasis}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        Hiệu lực: {formatDate(rec.effectiveDate)}
                        {rec.expiryDate && ` – ${formatDate(rec.expiryDate)}`}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {showModal && <CreateModal onClose={() => setShowModal(false)} />}
    </div>
  )
}

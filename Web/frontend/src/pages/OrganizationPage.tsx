import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { Users, Plus, ChevronDown, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'

interface OrganizationUnit {
  id: string
  type: 'tieu_doi' | 'trung_doi' | 'dai_doi'
  name: string
  commanderId?: string
  commanderName?: string
  parentId?: string
  capacity: number
  memberCount: number
  children?: OrganizationUnit[]
}

const TYPE_LABELS: Record<OrganizationUnit['type'], string> = {
  dai_doi: 'Đại đội',
  trung_doi: 'Trung đội',
  tieu_doi: 'Tiểu đội',
}

const TYPE_BADGE_CLASS: Record<OrganizationUnit['type'], string> = {
  dai_doi: 'bg-red-100 text-[#C62828]',
  trung_doi: 'bg-blue-100 text-blue-700',
  tieu_doi: 'bg-purple-100 text-purple-700',
}

function CapacityBar({ actual, capacity }: { actual: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((actual / capacity) * 100)) : 0
  const isOk = actual >= capacity
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[80px]">
        <div
          className={`h-2 rounded-full transition-all ${isOk ? 'bg-[#2E7D32]' : 'bg-[#C62828]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold ${isOk ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
        {actual}/{capacity}
      </span>
    </div>
  )
}

function UnitCard({ unit, depth = 0 }: { unit: OrganizationUnit; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasChildren = unit.children && unit.children.length > 0

  return (
    <div className={`bg-white rounded-xl border border-[#E2E8F0] overflow-hidden ${depth > 0 ? 'ml-6' : ''}`}>
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors"
        onClick={() => hasChildren && setExpanded((e) => !e)}
        data-testid={`unit-card-${unit.id}`}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={16} className="text-[#64748B] shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-[#64748B] shrink-0" />
          )
        ) : (
          <div className="w-4 shrink-0" />
        )}
        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${TYPE_BADGE_CLASS[unit.type]}`}>
          {TYPE_LABELS[unit.type]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0F172A]">{unit.name}</p>
          {unit.commanderName && (
            <p className="text-xs text-[#64748B]">CHT: {unit.commanderName}</p>
          )}
        </div>
        <div className="shrink-0">
          <CapacityBar actual={unit.memberCount} capacity={unit.capacity} />
          <p className="text-xs text-[#64748B] text-right mt-0.5">Biên chế</p>
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="border-t border-[#F1F5F9] p-4 space-y-3">
          {unit.children!.map((child) => (
            <UnitCard key={child.id} unit={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface AddUnitForm {
  type: OrganizationUnit['type']
  name: string
  parentId: string
  capacity: string
  commanderName: string
}

function AddUnitModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AddUnitForm>({
    type: 'tieu_doi',
    name: '',
    parentId: '',
    capacity: '',
    commanderName: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: AddUnitForm) =>
      client.post('/organization/units', {
        ...data,
        capacity: parseInt(data.capacity) || 0,
        parentId: data.parentId || undefined,
      }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã thêm đơn vị mới')
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      onClose()
    },
    onError: () => toast.error('Không thể thêm đơn vị'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Vui lòng nhập tên đơn vị')
    if (!form.capacity || parseInt(form.capacity) <= 0) return toast.error('Vui lòng nhập biên chế hợp lệ')
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">Thêm đơn vị mới</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Loại đơn vị</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as OrganizationUnit['type'] }))}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            >
              <option value="dai_doi">Đại đội</option>
              <option value="trung_doi">Trung đội</option>
              <option value="tieu_doi">Tiểu đội</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Tên đơn vị <span className="text-[#C62828]">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: Trung đội 1"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Biên chế (người) <span className="text-[#C62828]">*</span></label>
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              placeholder="VD: 30"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1">Tên chỉ huy trưởng</label>
            <input
              type="text"
              value={form.commanderName}
              onChange={(e) => setForm((f) => ({ ...f, commanderName: e.target.value }))}
              placeholder="Họ tên CHT"
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Thêm đơn vị'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function OrganizationPage() {
  const { can } = useRbac()
  const [showAddModal, setShowAddModal] = useState(false)

  if (!can.manageMilitia) return <Navigate to="/forbidden" replace />

  const { data: units = [], isLoading } = useQuery<OrganizationUnit[]>({
    queryKey: ['organization'],
    queryFn: () => client.get('/organization/structure').then((r) => r.data),
  })

  const totalCapacity = units.reduce((sum, u) => sum + u.capacity, 0)
  const totalMembers = units.reduce((sum, u) => sum + u.memberCount, 0)

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="organization-page">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <Users size={24} className="text-[#C62828]" />
              Tổ chức biên chế
            </h1>
            <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Cơ cấu tổ chức DQTV</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            data-testid="add-unit-btn"
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Plus size={16} />
            Thêm đơn vị
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Tổng biên chế</p>
            <p className="text-3xl font-bold text-[#0F172A]">{totalCapacity}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Thực tế</p>
            <p className={`text-3xl font-bold ${totalMembers >= totalCapacity ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
              {totalMembers}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">Số đơn vị</p>
            <p className="text-3xl font-bold text-[#0F172A]">{units.length}</p>
          </div>
        </div>

        {/* Tree */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : units.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
            <Users size={40} className="mx-auto mb-3 text-[#64748B]" />
            <p className="text-[#64748B]">Chưa có đơn vị nào</p>
          </div>
        ) : (
          <div className="space-y-4">
            {units.map((unit) => (
              <UnitCard key={unit.id} unit={unit} />
            ))}
          </div>
        )}
      </div>

      {showAddModal && <AddUnitModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}

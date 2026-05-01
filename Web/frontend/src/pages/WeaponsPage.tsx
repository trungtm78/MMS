import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import { Shield, Plus, X, CheckSquare, Download } from 'lucide-react'
import { toast } from 'sonner'

interface WeaponItem {
  id: string
  type: string
  serialNumber: string
  acquiredAt: string
  condition: 'good' | 'damaged' | 'maintenance'
  storageLocation: string
  responsiblePersonId: string
  responsiblePersonName?: string
}

interface AllocationLog {
  id: string
  weaponId: string
  weaponType: string
  serialNumber: string
  allocatedTo: string
  allocatedToName: string
  purpose: string
  allocatedAt: string
  returnedAt?: string | null
}

const CONDITION_BADGE: Record<WeaponItem['condition'], string> = {
  good: 'bg-green-100 text-[#2E7D32]',
  damaged: 'bg-red-100 text-[#C62828]',
  maintenance: 'bg-yellow-100 text-yellow-700',
}

const CONDITION_LABEL: Record<WeaponItem['condition'], string> = {
  good: 'Tốt',
  damaged: 'Hỏng',
  maintenance: 'Bảo trì',
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

type TabId = 'catalog' | 'log' | 'inventory'

function WeaponCatalogTab() {
  return (() => {
    const queryClient = useQueryClient()
    const [showAddModal, setShowAddModal] = useState(false)
    const [addForm, setAddForm] = useState({
      type: '',
      serialNumber: '',
      acquiredAt: '',
      condition: 'good' as WeaponItem['condition'],
      storageLocation: '',
      responsiblePersonName: '',
    })

    const { data: weapons = [], isLoading } = useQuery<WeaponItem[]>({
      queryKey: ['weapons'],
      queryFn: () => client.get('/weapons').then((r) => r.data),
    })

    const createMutation = useMutation({
      mutationFn: (data: typeof addForm) => client.post('/weapons', data).then((r) => r.data),
      onSuccess: () => {
        toast.success('Đã thêm vũ khí')
        queryClient.invalidateQueries({ queryKey: ['weapons'] })
        setShowAddModal(false)
      },
      onError: () => toast.error('Không thể thêm vũ khí'),
    })

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!addForm.type || !addForm.serialNumber) return toast.error('Vui lòng điền đầy đủ thông tin')
      createMutation.mutate(addForm)
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddModal(true)}
            data-testid="add-weapon-btn"
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Plus size={16} />
            Thêm vũ khí
          </button>
        </div>

        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {['Số hiệu', 'Loại', 'Tình trạng', 'Nơi cất', 'Người chịu trách nhiệm', 'Ngày nhập'].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i} className="border-b border-[#F1F5F9]">
                      {[1, 2, 3, 4, 5, 6].map((j) => (
                        <td key={j} className="px-5 py-4"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : weapons.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-[#64748B] text-sm">Chưa có vũ khí nào</td></tr>
                ) : (
                  weapons.map((w) => (
                    <tr key={w.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors" data-testid={`weapon-row-${w.id}`}>
                      <td className="px-5 py-4 text-sm font-mono text-[#0F172A]">{w.serialNumber}</td>
                      <td className="px-5 py-4 text-sm text-[#0F172A]">{w.type}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${CONDITION_BADGE[w.condition]}`}>
                          {CONDITION_LABEL[w.condition]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{w.storageLocation}</td>
                      <td className="px-5 py-4 text-sm text-[#0F172A]">{w.responsiblePersonName ?? '—'}</td>
                      <td className="px-5 py-4 text-sm text-[#64748B]">{formatDate(w.acquiredAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl">
              <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
                <h2 className="text-lg font-semibold text-[#0F172A]">Thêm vũ khí / trang thiết bị</h2>
                <button onClick={() => setShowAddModal(false)} className="text-[#64748B] hover:text-[#0F172A]"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#0F172A] mb-1">Loại vũ khí <span className="text-[#C62828]">*</span></label>
                    <input type="text" value={addForm.type} onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))} placeholder="VD: Súng AK-47" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#0F172A] mb-1">Số hiệu <span className="text-[#C62828]">*</span></label>
                    <input type="text" value={addForm.serialNumber} onChange={(e) => setAddForm((f) => ({ ...f, serialNumber: e.target.value }))} placeholder="VD: AK-2024-001" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#0F172A] mb-1">Tình trạng</label>
                    <select value={addForm.condition} onChange={(e) => setAddForm((f) => ({ ...f, condition: e.target.value as WeaponItem['condition'] }))} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30">
                      <option value="good">Tốt</option>
                      <option value="damaged">Hỏng</option>
                      <option value="maintenance">Bảo trì</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#0F172A] mb-1">Ngày nhập</label>
                    <input type="date" value={addForm.acquiredAt} onChange={(e) => setAddForm((f) => ({ ...f, acquiredAt: e.target.value }))} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Nơi cất</label>
                  <input type="text" value={addForm.storageLocation} onChange={(e) => setAddForm((f) => ({ ...f, storageLocation: e.target.value }))} placeholder="VD: Kho vũ khí A" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0F172A] mb-1">Người chịu trách nhiệm</label>
                  <input type="text" value={addForm.responsiblePersonName} onChange={(e) => setAddForm((f) => ({ ...f, responsiblePersonName: e.target.value }))} placeholder="Họ tên" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]">Hủy</button>
                  <button type="submit" disabled={createMutation.isPending} className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                    {createMutation.isPending ? 'Đang lưu...' : 'Thêm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  })()
}

function AllocationLogTab() {
  const { data: logs = [], isLoading } = useQuery<AllocationLog[]>({
    queryKey: ['weapon-allocations'],
    queryFn: () => client.get('/weapons/allocations').then((r) => r.data),
  })

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
            <tr>
              {['Ngày', 'Vũ khí', 'Người nhận', 'Mục đích', 'Ngày trả'].map((h) => (
                <th key={h} className="px-5 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <tr key={i} className="border-b border-[#F1F5F9]">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-[#64748B] text-sm">Chưa có log cấp phát nào</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-5 py-4 text-sm text-[#64748B]">{formatDate(log.allocatedAt)}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-[#0F172A]">{log.weaponType}</p>
                    <p className="text-xs font-mono text-[#64748B]">{log.serialNumber}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-[#0F172A]">{log.allocatedToName}</td>
                  <td className="px-5 py-4 text-sm text-[#64748B]">{log.purpose}</td>
                  <td className="px-5 py-4 text-sm text-[#64748B]">{formatDate(log.returnedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface InventoryReportItem {
  id: string
  weaponType: string
  serialNumber: string
  condition: string
  storageLocation: string
  acquiredAt: string | null
  status: string
  responsiblePersonName: string | null
  currentHolder: string | null
  issuedAt: string | null
  returnedAt: string | null
  overdue: boolean
}

function InventoryTab() {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState('')
  const [exporting, setExporting] = useState(false)

  const { data: weapons = [] } = useQuery<WeaponItem[]>({
    queryKey: ['weapons'],
    queryFn: () => client.get('/weapons').then((r) => r.data),
  })

  const { data: inventoryReport = [] } = useQuery<InventoryReportItem[]>({
    queryKey: ['weapons-inventory-report'],
    queryFn: () => client.get('/weapons/inventory-report').then((r) => r.data),
  })

  const inventoryMutation = useMutation({
    mutationFn: (data: { confirmedCount: number; notes: string }) =>
      client.post('/weapons/inventory', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('Đã xác nhận kiểm kê')
      queryClient.invalidateQueries({ queryKey: ['weapons'] })
      setNotes('')
    },
    onError: () => toast.error('Không thể xác nhận kiểm kê'),
  })

  const goodCount = weapons.filter((w) => w.condition === 'good').length
  const damagedCount = weapons.filter((w) => w.condition === 'damaged').length
  const maintenanceCount = weapons.filter((w) => w.condition === 'maintenance').length
  const overdueCount = inventoryReport.filter(r => r.overdue).length

  const handleExport = async () => {
    setExporting(true)
    try {
      const resp = await client.get('/weapons/export', { responseType: 'blob' })
      const url = URL.createObjectURL(resp.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `KiemKe_VuKhi_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Không thể xuất biên bản kiểm kê')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 text-center">
          <p className="text-3xl font-bold text-[#2E7D32]">{goodCount}</p>
          <p className="text-sm text-[#64748B] mt-1">Tình trạng tốt</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 text-center">
          <p className="text-3xl font-bold text-yellow-600">{maintenanceCount}</p>
          <p className="text-sm text-[#64748B] mt-1">Đang bảo trì</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 text-center">
          <p className="text-3xl font-bold text-[#C62828]">{damagedCount}</p>
          <p className="text-sm text-[#64748B] mt-1">Hỏng</p>
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 text-center">
          <p className={`text-3xl font-bold ${overdueCount > 0 ? 'text-orange-600' : 'text-[#64748B]'}`}>{overdueCount}</p>
          <p className="text-sm text-[#64748B] mt-1">Quá hạn (&gt;180 ngày)</p>
        </div>
      </div>

      {/* Inventory table */}
      {inventoryReport.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {['Loại', 'Số hiệu', 'Tình trạng', 'Nơi cất', 'Người chịu TN', 'Đang cấp phát', 'Quá hạn'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-[#64748B] uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventoryReport.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-[#F1F5F9] transition-colors ${item.overdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-[#F8FAFC]'}`}
                  >
                    <td className="px-5 py-3 text-sm text-[#0F172A]">{item.weaponType}</td>
                    <td className="px-5 py-3 text-sm font-mono text-[#64748B]">{item.serialNumber}</td>
                    <td className="px-5 py-3 text-sm">{item.condition}</td>
                    <td className="px-5 py-3 text-sm text-[#64748B]">{item.storageLocation}</td>
                    <td className="px-5 py-3 text-sm text-[#0F172A]">{item.responsiblePersonName ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-[#64748B]">{item.currentHolder ?? '—'}</td>
                    <td className="px-5 py-3">
                      {item.overdue && (
                        <span className="px-2 py-0.5 bg-red-100 text-[#C62828] text-xs font-semibold rounded-full">Quá hạn</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#0F172A]">Xác nhận kiểm kê</h3>
          <button
            onClick={handleExport}
            disabled={exporting}
            data-testid="export-inventory-btn"
            className="flex items-center gap-2 border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? 'Đang xuất...' : 'Biên bản kiểm kê (nội bộ)'}
          </button>
        </div>
        <p className="text-sm text-[#64748B]">
          Tổng số vũ khí / trang thiết bị trong hệ thống: <strong className="text-[#0F172A]">{weapons.length}</strong>
        </p>
        <div>
          <label className="block text-sm font-medium text-[#0F172A] mb-1">Ghi chú kiểm kê</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Ghi chú về tình trạng kiểm kê..."
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30 resize-none"
          />
        </div>
        <button
          onClick={() => inventoryMutation.mutate({ confirmedCount: weapons.length, notes })}
          disabled={inventoryMutation.isPending}
          data-testid="confirm-inventory-btn"
          className="flex items-center gap-2 bg-[#2E7D32] text-white hover:bg-[#1B5E20] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <CheckSquare size={16} />
          {inventoryMutation.isPending ? 'Đang xác nhận...' : 'Xác nhận kiểm kê'}
        </button>
      </div>
    </div>
  )
}

export function WeaponsPage() {
  const { can, hasMinRole } = useRbac()
  const [activeTab, setActiveTab] = useState<TabId>('catalog')

  if (!can.manageMilitia && !hasMinRole('police_ward')) return <Navigate to="/forbidden" replace />

  const tabs: { id: TabId; label: string }[] = [
    { id: 'catalog', label: 'Danh mục' },
    { id: 'log', label: 'Log cấp phát' },
    { id: 'inventory', label: 'Kiểm kê' },
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="weapons-page">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
            <Shield size={24} className="text-[#C62828]" />
            Vũ khí & Trang thiết bị
          </h1>
          <p className="text-sm text-[#64748B] mt-1">UBND Phường Phú Định – Quản lý vũ khí ANTT</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-[#E2E8F0] p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`weapons-tab-${tab.id}`}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'catalog' && <WeaponCatalogTab />}
        {activeTab === 'log' && <AllocationLogTab />}
        {activeTab === 'inventory' && <InventoryTab />}
      </div>
    </div>
  )
}

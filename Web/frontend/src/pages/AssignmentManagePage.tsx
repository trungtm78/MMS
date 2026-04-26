import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, Plus, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  getAssignments,
  createAssignment,
  removeAssignment,
  getCaOfficers,
  getAvailableDqtv,
  type AssignmentRow,
  type UserRow,
  type MilitiaUserRow,
} from '@/api/assignments'

// ── helpers ──────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function roleBadge(role: string) {
  if (role === 'ca_officer' || role === 'police_ward') return 'CA Phường'
  if (role === 'police_area' || role === 'ca_area') return 'CA Khu Vực'
  return 'CA'
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// ── AddDqtvModal ──────────────────────────────────────────────

interface AddModalProps {
  caUserId: string
  caName: string
  onClose: () => void
  onAdded: () => void
}

function AddDqtvModal({ caUserId, caName, onClose, onAdded }: AddModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const debouncedSearch = useDebounce(search, 300)
  const titleId = 'add-dqtv-modal-title'
  const firstRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: available = [], isLoading } = useQuery({
    queryKey: ['dqtv-available', caUserId, debouncedSearch],
    queryFn: () => getAvailableDqtv(caUserId, debouncedSearch),
  })

  const addMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      // allSettled so partial failures don't silently orphan earlier successes
      const results = await Promise.allSettled(
        ids.map((dqtvUserId) => createAssignment(caUserId, dqtvUserId)),
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const succeeded = results.length - failed
      return { succeeded, failed }
    },
    onSuccess: ({ succeeded, failed }) => {
      if (succeeded > 0) {
        toast.success(`Đã thêm ${succeeded} DQTV`)
        queryClient.invalidateQueries({ queryKey: ['assignments', caUserId] })
        queryClient.invalidateQueries({ queryKey: ['ca-officers'] })
      }
      if (failed > 0) toast.error(`${failed} DQTV không thể thêm`)
      onAdded()
      onClose()
    },
    onError: () => toast.error('Không thể thêm DQTV'),
  })

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id={titleId} className="text-lg font-semibold text-[#1F3A5F]">
            Thêm DQTV vào danh sách
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <p className="text-sm text-gray-500 mb-2">Phân công cho: <strong>{caName}</strong></p>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={firstRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm dân quân tự vệ..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : available.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {debouncedSearch ? 'Không tìm thấy kết quả' : 'Tất cả DQTV đã được phân công'}
            </p>
          ) : (
            available.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.userId)}
                  onChange={() => toggle(m.userId)}
                  className="w-4 h-4 accent-[#1F3A5F]"
                />
                <span className="flex-1 text-sm font-medium text-gray-800">{m.fullName}</span>
                <span className="text-xs text-gray-500">{m.unitCode}</span>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            data-testid="add-dqtv-submit"
            disabled={selected.size === 0 || addMutation.isPending}
            onClick={() => addMutation.mutate(Array.from(selected))}
            className="px-4 py-2 text-sm text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? 'Đang thêm...' : `Thêm ${selected.size > 0 ? selected.size + ' ' : ''}DQTV`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AssignmentManagePage ──────────────────────────────────────

export function AssignmentManagePage() {
  const [selectedCa, setSelectedCa] = useState<UserRow | null>(null)
  const [caSearch, setCaSearch] = useState('')
  const [caPage, setCaPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const debouncedCaSearch = useDebounce(caSearch, 300)
  const CA_PAGE_SIZE = 10
  const queryClient = useQueryClient()

  const { data: caOfficers = [], isLoading: caLoading } = useQuery({
    queryKey: ['ca-officers'],
    queryFn: getCaOfficers,
  })

  const filtered = caOfficers.filter((ca) =>
    debouncedCaSearch === '' ||
    ca.fullName.toLowerCase().includes(debouncedCaSearch.toLowerCase()),
  )

  const totalPages = Math.ceil(filtered.length / CA_PAGE_SIZE)
  const paged = filtered.slice((caPage - 1) * CA_PAGE_SIZE, caPage * CA_PAGE_SIZE)

  const {
    data: assignments = [],
    isLoading: assignLoading,
    isError: assignError,
  } = useQuery({
    queryKey: ['assignments', selectedCa?.id],
    queryFn: () => getAssignments(selectedCa!.id),
    enabled: !!selectedCa,
  })

  const removeMutation = useMutation({
    mutationFn: removeAssignment,
    onSuccess: () => {
      toast.success('Đã xóa phân công')
      queryClient.invalidateQueries({ queryKey: ['assignments', selectedCa?.id] })
      queryClient.invalidateQueries({ queryKey: ['ca-officers'] })
      setDeletingId(null)
    },
    onError: () => toast.error('Không thể xóa phân công'),
  })

  const handleCaSelect = useCallback((ca: UserRow) => {
    setSelectedCa(ca)
    setDeletingId(null)
  }, [])

  // Mobile guard
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div data-testid="assignment-manage-page" className="p-6 space-y-6">
      {/* Breadcrumb + Heading */}
      <div>
        <p className="text-xs text-gray-500 mb-1">Trang chủ &rsaquo; Phân Công</p>
        <h1 className="text-2xl font-bold text-[#1F3A5F]">Phân Công</h1>
      </div>

      {/* Mobile guard */}
      <div className="md:hidden bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
        <p className="text-sm text-amber-800">Vui lòng sử dụng trên máy tính để quản lý phân công.</p>
      </div>

      {/* Main split panel (desktop only) */}
      <div className="hidden md:flex gap-0 border border-gray-200 rounded-lg shadow-sm overflow-hidden min-h-[560px]">
        {/* Left panel — CA list (35%) */}
        <div className="w-[35%] border-r border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cán bộ CA</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                aria-label="Tìm cán bộ CA"
                value={caSearch}
                onChange={(e) => { setCaSearch(e.target.value); setCaPage(1) }}
                placeholder="Tìm theo tên..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {caLoading ? (
              <div className="space-y-1 p-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-13 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : paged.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Không có cán bộ CA</p>
            ) : (
              paged.map((ca) => {
                const isSelected = selectedCa?.id === ca.id
                return (
                  <button
                    key={ca.id}
                    data-testid={`ca-row-${ca.id}`}
                    onClick={() => handleCaSelect(ca)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2 ${
                      isSelected
                        ? 'border-[#1F3A5F] bg-blue-50'
                        : 'border-transparent hover:bg-gray-50'
                    }`}
                    style={{ minHeight: 52 }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: '#1F3A5F' }}
                    >
                      {initials(ca.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{ca.fullName}</p>
                      <p className="text-xs text-gray-500">{roleBadge(ca.role)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* CA pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
              <button
                onClick={() => setCaPage((p) => Math.max(1, p - 1))}
                disabled={caPage === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                aria-label="Trang trước"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-500">{caPage} / {totalPages}</span>
              <button
                onClick={() => setCaPage((p) => Math.min(totalPages, p + 1))}
                disabled={caPage === totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                aria-label="Trang sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Right panel — assignments (65%) */}
        <div className="flex-1 flex flex-col">
          {!selectedCa ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p className="text-sm">&larr; Chọn một cán bộ CA để xem phân công</p>
            </div>
          ) : (
            <>
              {/* Right panel header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <p className="font-semibold text-[#1F3A5F]">{selectedCa.fullName}</p>
                  <p className="text-xs text-gray-500">{roleBadge(selectedCa.role)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {!assignLoading && !assignError && (
                    <span className="text-sm text-gray-500">
                      DQTV phân công ({assignments.length})
                    </span>
                  )}
                  <button
                    data-testid="add-dqtv-btn"
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a]"
                  >
                    <Plus size={16} />
                    Thêm DQTV
                  </button>
                </div>
              </div>

              {/* Right panel body */}
              <div className="flex-1 overflow-y-auto">
                {assignLoading ? (
                  <div className="space-y-3 p-6">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : assignError ? (
                  <div className="m-6 bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-700">Không thể tải danh sách phân công.</p>
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
                    <p className="text-sm text-gray-500">Chưa có DQTV nào được phân công</p>
                    <button
                      data-testid="add-dqtv-empty-btn"
                      onClick={() => setShowAddModal(true)}
                      className="px-4 py-2 text-sm text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a]"
                    >
                      Thêm ngay
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500 text-xs">
                        <th className="px-6 py-3 text-left font-medium">Tên DQTV</th>
                        <th className="px-4 py-3 text-left font-medium">Đơn vị</th>
                        <th className="px-4 py-3 text-left font-medium">Ngày phân công</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => {
                        const isDeleting = deletingId === a.id
                        return (
                          <tr
                            key={a.id}
                            data-testid={`assignment-row-${a.id}`}
                            className={`border-b border-gray-50 transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-6 py-3 font-medium text-gray-800">{a.dqtvFullName}</td>
                            <td className="px-4 py-3 text-gray-500">{a.dqtvUnitCode}</td>
                            <td className="px-4 py-3 text-gray-500">{formatDate(a.assignedAt)}</td>
                            <td className="px-4 py-3">
                              {isDeleting ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    data-testid={`confirm-delete-${a.id}`}
                                    onClick={() => removeMutation.mutate(a.id)}
                                    disabled={removeMutation.isPending}
                                    className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                                  >
                                    Xác nhận xóa
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <button
                                  data-testid={`delete-btn-${a.id}`}
                                  onClick={() => setDeletingId(a.id)}
                                  aria-label={`Xóa phân công ${a.dqtvFullName}`}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add DQTV modal */}
      {showAddModal && selectedCa && (
        <AddDqtvModal
          caUserId={selectedCa.id}
          caName={selectedCa.fullName}
          onClose={() => setShowAddModal(false)}
          onAdded={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}

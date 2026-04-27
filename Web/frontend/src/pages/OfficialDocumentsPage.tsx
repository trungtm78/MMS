import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Plus, Search, ChevronLeft, ChevronRight, X, Eye } from 'lucide-react'
import client from '@/api/client'

interface OfficialDocument {
  id: string
  docNumber: string | null
  docType: string
  title: string
  issuedBy: string | null
  issuedDate: string | null
  effectiveDate: string | null
  expiryDate: string | null
  status: string
  subject: string | null
  createdAt: string
}

interface ListResponse {
  data: OfficialDocument[]
  total: number
  page: number
  limit: number
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cong_van: 'Công văn',
  quyet_dinh: 'Quyết định',
  thong_bao: 'Thông báo',
  bao_cao: 'Báo cáo',
  bien_ban: 'Biên bản',
  other: 'Khác',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  active: 'Hiệu lực',
  expired: 'Hết hạn',
  revoked: 'Thu hồi',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-[#64748B]',
  active: 'bg-green-100 text-[#2E7D32]',
  expired: 'bg-yellow-100 text-yellow-700',
  revoked: 'bg-red-100 text-[#C62828]',
}

const DOC_TYPES = ['cong_van', 'quyet_dinh', 'thong_bao', 'bao_cao', 'bien_ban', 'other']

async function listDocuments(params: {
  page: number
  limit: number
  type?: string
  status?: string
}): Promise<ListResponse> {
  const res = await client.get('/official-documents', { params })
  return res.data
}

async function createDocument(dto: {
  title: string
  docType: string
  docNumber?: string
  issuedBy?: string
  issuedDate?: string
  effectiveDate?: string
  subject?: string
}): Promise<OfficialDocument> {
  const res = await client.post('/official-documents', dto)
  return res.data
}

async function revokeDocument(id: string): Promise<void> {
  await client.delete(`/official-documents/${id}`)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// ── Category Filter Pills ────────────────────────────────────────

interface FilterPillsProps {
  value: string
  onChange: (v: string) => void
}

function CategoryFilterPills({ value, onChange }: FilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange('')}
        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          value === ''
            ? 'bg-[#C62828] text-white'
            : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828]'
        }`}
      >
        Tất cả loại
      </button>
      {DOC_TYPES.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            value === t
              ? 'bg-[#C62828] text-white'
              : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828]'
          }`}
        >
          {DOC_TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  )
}

// ── CreateDocumentModal ──────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
}

function CreateDocumentModal({ onClose }: CreateModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '',
    docType: 'cong_van',
    docNumber: '',
    issuedBy: '',
    issuedDate: '',
    effectiveDate: '',
    subject: '',
  })

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: () => {
      toast.success('Đã tạo văn bản')
      queryClient.invalidateQueries({ queryKey: ['official-documents'] })
      onClose()
    },
    onError: () => toast.error('Không thể tạo văn bản'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Vui lòng nhập tiêu đề'); return }
    createMutation.mutate({
      title: form.title,
      docType: form.docType,
      docNumber: form.docNumber || undefined,
      issuedBy: form.issuedBy || undefined,
      issuedDate: form.issuedDate || undefined,
      effectiveDate: form.effectiveDate || undefined,
      subject: form.subject || undefined,
    })
  }

  const inputCls = "w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
  const labelCls = "block text-sm font-medium text-[#C62828] mb-1"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tạo văn bản mới"
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] rounded-t-xl">
          <h2 className="text-lg font-semibold text-[#0F172A]">Tạo văn bản mới</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#E2E8F0] text-[#64748B] transition-colors" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className={labelCls}>Tiêu đề *</label>
            <input
              data-testid="doc-title-input"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder="Nhập tiêu đề văn bản..."
            />
          </div>

          <div>
            <label className={labelCls}>Loại văn bản</label>
            <select
              data-testid="doc-type-select"
              value={form.docType}
              onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
              className={inputCls}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Số hiệu</label>
              <input
                type="text"
                value={form.docNumber}
                onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
                className={inputCls}
                placeholder="VD: 123/CV-BCA"
              />
            </div>
            <div>
              <label className={labelCls}>Cơ quan ban hành</label>
              <input
                type="text"
                value={form.issuedBy}
                onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))}
                className={inputCls}
                placeholder="BCA, UBND..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Ngày ban hành</label>
              <input
                type="date"
                value={form.issuedDate}
                onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Ngày hiệu lực</label>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Tóm tắt nội dung</label>
            <textarea
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Mô tả nội dung văn bản..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Hủy
            </button>
            <button
              data-testid="create-doc-submit"
              type="submit"
              disabled={createMutation.isPending}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Tạo văn bản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── OfficialDocumentsPage ──────────────────────────────────────────

export function OfficialDocumentsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const LIMIT = 20

  const { data, isLoading, isError } = useQuery({
    queryKey: ['official-documents', page, typeFilter, statusFilter],
    queryFn: () => listDocuments({
      page,
      limit: LIMIT,
      type: typeFilter || undefined,
      status: statusFilter || undefined,
    }),
    placeholderData: (prev) => prev,
  })

  const revokeMutation = useMutation({
    mutationFn: revokeDocument,
    onSuccess: () => {
      toast.success('Đã thu hồi văn bản')
      queryClient.invalidateQueries({ queryKey: ['official-documents'] })
      setRevokingId(null)
    },
    onError: () => toast.error('Không thể thu hồi văn bản'),
  })

  const docs = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const filtered = search
    ? docs.filter((d) =>
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        (d.docNumber ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : docs

  return (
    <div data-testid="official-documents-page" className="p-6 space-y-6 bg-[#F8FAFC] min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#64748B] mb-1">Trang chủ &rsaquo; Văn bản pháp lý</p>
          <h1 className="text-2xl font-bold text-[#0F172A]">Văn bản pháp lý</h1>
          <p className="text-sm text-[#64748B] mt-1">Quản lý văn bản hành chính — NĐ 30/2020</p>
        </div>
        <button
          data-testid="create-doc-btn"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Tạo văn bản
        </button>
      </div>

      {/* Category filter pills */}
      <CategoryFilterPills value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1) }} />

      {/* Search + Status filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, số hiệu..."
            className="pl-9 pr-4 py-2 text-sm border border-[#E2E8F0] rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white text-[#0F172A]"
          />
        </div>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white text-[#0F172A]"
        >
          <option value="">Tất cả trạng thái</option>
          {['draft', 'active', 'expired', 'revoked'].map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {/* Hidden type filter (still accessible via pills above, keep for testid compatibility) */}
        <select
          data-testid="type-filter"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white text-[#0F172A]"
        >
          <option value="">Tất cả loại</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-6">
            <p className="text-sm text-[#C62828]">Không thể tải danh sách văn bản.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText size={40} className="text-[#E2E8F0]" />
            <p className="text-sm text-[#64748B]">Chưa có văn bản nào</p>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Tạo văn bản đầu tiên
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Số hiệu</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Tiêu đề</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Ban hành</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Hiệu lực</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const isRevoking = revokingId === doc.id
                return (
                  <tr
                    key={doc.id}
                    data-testid={`doc-row-${doc.id}`}
                    className={`border-b border-[#E2E8F0] transition-colors ${isRevoking ? 'bg-red-50' : 'hover:bg-[#F8FAFC]'}`}
                  >
                    <td className="px-6 py-3 text-[#64748B] font-mono text-xs">{doc.docNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0F172A] line-clamp-2 max-w-xs">{doc.title}</p>
                      {doc.subject && (
                        <p className="text-xs text-[#64748B] line-clamp-1 mt-0.5">{doc.subject}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#64748B] text-xs">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</td>
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap text-xs">{formatDate(doc.issuedDate)}</td>
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap text-xs">{formatDate(doc.effectiveDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-[#64748B]'}`}>
                        {STATUS_LABELS[doc.status] ?? doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isRevoking ? (
                        <div className="flex items-center gap-2">
                          <button
                            data-testid={`confirm-revoke-${doc.id}`}
                            onClick={() => revokeMutation.mutate(doc.id)}
                            disabled={revokeMutation.isPending}
                            className="px-2 py-1 text-xs text-white bg-[#C62828] rounded hover:bg-[#A91D1D] disabled:opacity-50 transition-colors"
                          >
                            Xác nhận
                          </button>
                          <button
                            onClick={() => setRevokingId(null)}
                            className="px-2 py-1 text-xs text-[#64748B] border border-[#E2E8F0] rounded hover:bg-[#F8FAFC] transition-colors"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { /* view detail */ }}
                            aria-label="Xem chi tiết"
                            className="p-1.5 text-[#64748B] hover:text-[#1F3A5F] hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                          {doc.status !== 'revoked' && (
                            <button
                              data-testid={`revoke-btn-${doc.id}`}
                              onClick={() => setRevokingId(doc.id)}
                              aria-label="Thu hồi văn bản"
                              className="p-1.5 text-[#64748B] hover:text-[#C62828] hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#64748B]">
            {total} văn bản · Trang {page}/{totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-[#E2E8F0] hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-40 transition-colors bg-white"
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-[#E2E8F0] hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-40 transition-colors bg-white"
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {showCreate && <CreateDocumentModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

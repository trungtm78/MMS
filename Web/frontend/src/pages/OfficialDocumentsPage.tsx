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
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-yellow-100 text-yellow-700',
  revoked: 'bg-red-100 text-red-700',
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tạo văn bản mới"
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-[#1F3A5F]">Tạo văn bản mới</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề *</label>
            <input
              data-testid="doc-title-input"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
              placeholder="Nhập tiêu đề văn bản..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại văn bản</label>
            <select
              data-testid="doc-type-select"
              value={form.docType}
              onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số hiệu</label>
              <input
                type="text"
                value={form.docNumber}
                onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
                placeholder="VD: 123/CV-BCA"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cơ quan ban hành</label>
              <input
                type="text"
                value={form.issuedBy}
                onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
                placeholder="BCA, UBND..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày ban hành</label>
              <input
                type="date"
                value={form.issuedDate}
                onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày hiệu lực</label>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tóm tắt nội dung</label>
            <textarea
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30 resize-none"
              placeholder="Mô tả nội dung văn bản..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              data-testid="create-doc-submit"
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div data-testid="official-documents-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">Trang chủ &rsaquo; Văn bản pháp lý</p>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Văn bản pháp lý</h1>
          <p className="text-sm text-gray-600 mt-1">Quản lý văn bản hành chính — NĐ 30/2020</p>
        </div>
        <button
          data-testid="create-doc-btn"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a]"
        >
          <Plus size={16} />
          Tạo văn bản
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tiêu đề, số hiệu..."
            className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
          />
        </div>
        <select
          data-testid="type-filter"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
        >
          <option value="">Tất cả loại</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]/30"
        >
          <option value="">Tất cả trạng thái</option>
          {['draft', 'active', 'expired', 'revoked'].map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-6">
            <p className="text-sm text-red-600">Không thể tải danh sách văn bản.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText size={40} className="text-gray-300" />
            <p className="text-sm text-gray-500">Chưa có văn bản nào</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-sm text-white bg-[#1F3A5F] rounded-lg hover:bg-[#162d4a]"
            >
              Tạo văn bản đầu tiên
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs">
                <th className="px-6 py-3 text-left font-medium">Số hiệu</th>
                <th className="px-4 py-3 text-left font-medium">Tiêu đề</th>
                <th className="px-4 py-3 text-left font-medium">Loại</th>
                <th className="px-4 py-3 text-left font-medium">Ban hành</th>
                <th className="px-4 py-3 text-left font-medium">Hiệu lực</th>
                <th className="px-4 py-3 text-left font-medium">Trạng thái</th>
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
                    className={`border-b border-gray-50 transition-colors ${isRevoking ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-6 py-3 text-gray-600 font-mono text-xs">{doc.docNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 line-clamp-2 max-w-xs">{doc.title}</p>
                      {doc.subject && (
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{doc.subject}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(doc.issuedDate)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(doc.effectiveDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-gray-700'}`}>
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
                            className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            Xác nhận
                          </button>
                          <button
                            onClick={() => setRevokingId(null)}
                            className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { /* view detail — could open modal */ }}
                            aria-label="Xem chi tiết"
                            className="p-1.5 text-gray-400 hover:text-[#1F3A5F] hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                          {doc.status !== 'revoked' && (
                            <button
                              data-testid={`revoke-btn-${doc.id}`}
                              onClick={() => setRevokingId(doc.id)}
                              aria-label="Thu hồi văn bản"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
          <p className="text-sm text-gray-500">
            {total} văn bản · Trang {page}/{totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
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

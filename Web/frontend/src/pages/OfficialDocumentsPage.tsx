import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileText, Plus, Search, ChevronLeft, ChevronRight, X, Eye, Paperclip, Download } from 'lucide-react'
import client from '@/api/client'
import { filesApi, saveFile, uploadProblem, UPLOAD_ACCEPT, type StoredFile, type UploadProblem } from '@/api/files'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError, errorCodeText, parseApiError } from '@/lib/api-error'
import { formatCalendarDate } from '@/lib/dates'

/** official-documents.service.ts list() row; DATE columns arrive as YYYY-MM-DD */
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

/** getById(): the list fields, the attached file as create answers it, and the related records */
interface OfficialDocumentDetail extends OfficialDocument {
  fileId: string | null
  file: StoredFile | null
  relatedMilitiaId: string | null
  relatedUnitId: string | null
  createdBy: string
}

interface ListResponse {
  data: OfficialDocument[]
  total: number
  page: number
  limit: number
}

/** Body of POST /official-documents — CreateDocDto (the ValidationPipe drops other properties) */
interface CreateDocumentBody {
  title: string
  docType: string
  docNumber?: string
  issuedBy?: string
  issuedDate?: string
  effectiveDate?: string
  subject?: string
  /** Id of the caller's own upload for an official document, not attached elsewhere */
  fileId?: string
}

const DOC_TYPES = ['cong_van', 'quyet_dinh', 'thong_bao', 'bao_cao', 'bien_ban', 'other'] as const
type DocType = (typeof DOC_TYPES)[number]

const DOC_TYPE_LABELS: Readonly<Record<string, TranslationKey>> = {
  cong_van: 'documents.types.cong_van',
  quyet_dinh: 'documents.types.quyet_dinh',
  thong_bao: 'documents.types.thong_bao',
  bao_cao: 'documents.types.bao_cao',
  bien_ban: 'documents.types.bien_ban',
  other: 'documents.types.other',
} satisfies Record<DocType, TranslationKey>

const STATUSES = ['draft', 'active', 'expired', 'revoked'] as const
type DocStatus = (typeof STATUSES)[number]

const STATUS_LABELS: Readonly<Record<string, TranslationKey>> = {
  draft: 'documents.status.draft',
  active: 'documents.status.active',
  expired: 'documents.status.expired',
  revoked: 'documents.status.revoked',
} satisfies Record<DocStatus, TranslationKey>

const STATUS_COLORS: Readonly<Record<string, string>> = {
  draft: 'bg-gray-100 text-[#64748B]',
  active: 'bg-green-100 text-[#2E7D32]',
  expired: 'bg-yellow-100 text-yellow-700',
  revoked: 'bg-red-100 text-[#C62828]',
}

// Why a file is refused before it is sent: the texts of the upload codes
const UPLOAD_PROBLEM_TEXT = {
  file_empty: 'errors.files.upload.file_empty',
  file_too_large: 'errors.files.upload.file_too_large',
  file_type_not_allowed: 'errors.files.upload.file_type_not_allowed',
} as const satisfies Record<UploadProblem, TranslationKey>

const OPTIONAL_FIELDS = ['docNumber', 'issuedBy', 'issuedDate', 'effectiveDate', 'subject'] as const

const KILOBYTE = 1024
const MEGABYTE = 1024 * 1024
const SIZE_NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

async function listDocuments(filters: {
  page: number
  limit: number
  type: string
  status: string
}): Promise<ListResponse> {
  const params: Record<string, string | number> = { page: filters.page, limit: filters.limit }
  if (filters.type) params.type = filters.type
  if (filters.status) params.status = filters.status
  const res = await client.get<ListResponse>('/official-documents', { params })
  return res.data
}

async function getDocument(id: string): Promise<OfficialDocumentDetail> {
  const res = await client.get<OfficialDocumentDetail>(`/official-documents/${id}`)
  return res.data
}

async function createDocument(body: CreateDocumentBody): Promise<unknown> {
  const res = await client.post('/official-documents', body)
  return res.data
}

async function revokeDocument(id: string): Promise<void> {
  await client.delete(`/official-documents/${id}`)
}

/** The label of a known value, or the value itself */
function Label({ labels, value }: { labels: Readonly<Record<string, TranslationKey>>; value: string }) {
  const { t } = useTranslation()
  const key = labels[value]
  return <>{key ? t(key) : value}</>
}

/** A file size in B, KB or MB; BIGINT and NUMERIC columns may still arrive as text */
function FileSize({ bytes }: { bytes: number | string }) {
  const { t } = useTranslation()
  const size = Number(bytes)
  if (size < KILOBYTE) return <>{t('documents.detail.file.size.bytes', { value: SIZE_NUMBER.format(size) })}</>
  if (size < MEGABYTE) return <>{t('documents.detail.file.size.kilobytes', { value: SIZE_NUMBER.format(size / KILOBYTE) })}</>
  return <>{t('documents.detail.file.size.megabytes', { value: SIZE_NUMBER.format(size / MEGABYTE) })}</>
}

// ── Category Filter Pills ────────────────────────────────────────

interface FilterPillsProps {
  value: string
  onChange: (v: string) => void
}

function pillClass(active: boolean): string {
  return `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
    active
      ? 'bg-[#C62828] text-white'
      : 'bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] hover:text-[#C62828]'
  }`
}

function CategoryFilterPills({ value, onChange }: FilterPillsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onChange('')} aria-pressed={value === ''} className={pillClass(value === '')}>
        {t('documents.list.filters.allTypes')}
      </button>
      {DOC_TYPES.map((type) => (
        <button key={type} onClick={() => onChange(type)} aria-pressed={value === type} className={pillClass(value === type)}>
          {t(DOC_TYPE_LABELS[type])}
        </button>
      ))}
    </div>
  )
}

// ── CreateDocumentModal ──────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
}

const INPUT_CLASS = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]'
const LABEL_CLASS = 'block text-sm font-medium text-[#C62828] mb-1'

function CreateDocumentModal({ onClose }: CreateModalProps) {
  const { t } = useTranslation()
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
  // The uploaded file the document will carry, and why the chosen file cannot be used
  const [attachment, setAttachment] = useState<StoredFile | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.upload(file, 'official_document'),
    onSuccess: (stored) => setAttachment(stored),
    onError: (err) =>
      setFileError(describeApiError(err, { scope: 'files.upload', fallback: 'documents.create.file.uploadError' })),
  })

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: () => {
      toast.success(t('documents.create.submit.success'))
      queryClient.invalidateQueries({ queryKey: ['official-documents'] })
      onClose()
    },
    onError: (err) => {
      // files.service.ts attach() refusals belong to the file field: that upload cannot be used again
      const { code } = parseApiError(err)
      const fileText = code === null ? null : errorCodeText('files.attach', code)
      if (fileText !== null) {
        setAttachment(null)
        setFileError(fileText)
        return
      }
      toast.error(
        describeApiError(err, {
          statuses: { 403: 'errors.common.forbidden' },
          fallback: 'documents.create.submit.error',
        }),
      )
    },
  })

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Lets the same file be chosen again after a refusal
    event.target.value = ''
    if (!file) return
    const problem = uploadProblem(file)
    if (problem) {
      setFileError(t(UPLOAD_PROBLEM_TEXT[problem]))
      return
    }
    setFileError(null)
    uploadMutation.mutate(file)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      toast.error(t('documents.create.validation.titleRequired'))
      return
    }
    const body: CreateDocumentBody = { title, docType: form.docType }
    for (const key of OPTIONAL_FIELDS) {
      const value = form[key].trim()
      if (value) body[key] = value
    }
    if (attachment) body.fileId = attachment.id
    createMutation.mutate(body)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('documents.create.form.title')}
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] rounded-t-xl">
          <h2 className="text-lg font-semibold text-[#0F172A]">{t('documents.create.form.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#E2E8F0] text-[#64748B] transition-colors" aria-label={t('common.actions.close')}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label htmlFor="doc-title" className={LABEL_CLASS}>
              {t('documents.fields.title')} <span aria-hidden="true">*</span>
            </label>
            <input
              id="doc-title"
              data-testid="doc-title-input"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={INPUT_CLASS}
              placeholder={t('documents.create.placeholders.title')}
            />
          </div>

          <div>
            <label htmlFor="doc-type" className={LABEL_CLASS}>{t('documents.fields.docType')}</label>
            <select
              id="doc-type"
              data-testid="doc-type-select"
              value={form.docType}
              onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
              className={INPUT_CLASS}
            >
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>{t(DOC_TYPE_LABELS[type])}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="doc-number" className={LABEL_CLASS}>{t('documents.fields.docNumber')}</label>
              <input
                id="doc-number"
                type="text"
                value={form.docNumber}
                onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
                className={INPUT_CLASS}
                placeholder={t('documents.create.placeholders.docNumber')}
              />
            </div>
            <div>
              <label htmlFor="doc-issued-by" className={LABEL_CLASS}>{t('documents.fields.issuedBy')}</label>
              <input
                id="doc-issued-by"
                type="text"
                value={form.issuedBy}
                onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))}
                className={INPUT_CLASS}
                placeholder={t('documents.create.placeholders.issuedBy')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="doc-issued-date" className={LABEL_CLASS}>{t('documents.fields.issuedDate')}</label>
              <input
                id="doc-issued-date"
                type="date"
                value={form.issuedDate}
                onChange={(e) => setForm((f) => ({ ...f, issuedDate: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="doc-effective-date" className={LABEL_CLASS}>{t('documents.fields.effectiveDate')}</label>
              <input
                id="doc-effective-date"
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="doc-subject" className={LABEL_CLASS}>{t('documents.fields.subject')}</label>
            <textarea
              id="doc-subject"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              rows={3}
              className={`${INPUT_CLASS} resize-none`}
              placeholder={t('documents.create.placeholders.subject')}
            />
          </div>

          <div>
            <label htmlFor="doc-file" className={LABEL_CLASS}>{t('documents.fields.file')}</label>
            {attachment ? (
              <div className="flex items-center justify-between gap-3 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A]">
                <span className="flex items-center gap-2 min-w-0">
                  <Paperclip size={14} className="shrink-0 text-[#64748B]" />
                  <span className="truncate">{attachment.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="shrink-0 text-xs font-medium text-[#C62828] hover:underline"
                >
                  {t('documents.create.file.remove')}
                </button>
              </div>
            ) : (
              <input
                id="doc-file"
                type="file"
                accept={UPLOAD_ACCEPT}
                onChange={chooseFile}
                disabled={uploadMutation.isPending}
                className={`${INPUT_CLASS} file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium`}
              />
            )}
            <p className="text-xs text-[#64748B] mt-1">
              {t(uploadMutation.isPending ? 'documents.create.file.uploading' : 'documents.create.file.hint')}
            </p>
            {fileError && (
              <p role="alert" className="text-xs text-[#C62828] mt-1">{fileError}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              data-testid="create-doc-submit"
              type="submit"
              disabled={createMutation.isPending || uploadMutation.isPending}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t(createMutation.isPending ? 'common.actions.saving' : 'documents.create.form.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── DocumentDetailDialog ─────────────────────────────────────────

function DetailField({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-xs text-[#64748B]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[#0F172A]">{value || t('common.states.none')}</dd>
    </div>
  )
}

function DocumentDetailDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const detail = useQuery({
    queryKey: ['official-documents', 'detail', documentId],
    queryFn: () => getDocument(documentId),
  })

  // GET /files/:id needs the Bearer token: the content is fetched by the api client and saved
  // under the file's own name, which carries its extension
  const download = useMutation({
    mutationFn: saveFile,
    onError: (err) =>
      toast.error(describeApiError(err, { scope: 'files.download', fallback: 'documents.detail.file.error' })),
  })

  const doc = detail.data
  const file = doc?.file ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('documents.detail.dialog.title')}
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] rounded-t-xl">
          <h2 className="text-lg font-semibold text-[#0F172A]">{t('documents.detail.dialog.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#E2E8F0] text-[#64748B] transition-colors" aria-label={t('common.actions.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {detail.isLoading ? (
            <p className="text-sm text-[#64748B]">{t('common.states.loading')}</p>
          ) : detail.isError ? (
            <p role="alert" className="text-sm text-[#C62828]">
              {describeApiError(detail.error, {
                statuses: { 404: 'documents.detail.load.notFound' },
                fallback: 'documents.detail.load.error',
              })}
            </p>
          ) : doc ? (
            <>
              <h3 className="text-base font-semibold text-[#0F172A]">{doc.title}</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <DetailField label={t('documents.fields.docNumber')} value={doc.docNumber} />
                <DetailField label={t('documents.fields.docType')} value={<Label labels={DOC_TYPE_LABELS} value={doc.docType} />} />
                <DetailField label={t('documents.fields.issuedBy')} value={doc.issuedBy} />
                <DetailField label={t('documents.fields.status')} value={<Label labels={STATUS_LABELS} value={doc.status} />} />
                <DetailField label={t('documents.fields.issuedDate')} value={formatCalendarDate(doc.issuedDate)} />
                <DetailField label={t('documents.fields.effectiveDate')} value={formatCalendarDate(doc.effectiveDate)} />
                <DetailField label={t('documents.fields.expiryDate')} value={formatCalendarDate(doc.expiryDate)} />
                <DetailField label={t('documents.fields.subject')} value={doc.subject} wide />
              </dl>
              <div>
                <p className="text-xs text-[#64748B] mb-1">{t('documents.fields.file')}</p>
                {file ? (
                  <div className="flex items-center justify-between gap-3 border border-[#E2E8F0] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip size={14} className="shrink-0 text-[#64748B]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0F172A] truncate">{file.name}</p>
                        <p className="text-xs text-[#64748B]"><FileSize bytes={file.size} /></p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => download.mutate(file)}
                      disabled={download.isPending}
                      className="shrink-0 inline-flex items-center gap-2 border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50 transition-colors"
                    >
                      <Download size={14} aria-hidden="true" />
                      {t(download.isPending ? 'documents.detail.file.downloading' : 'documents.detail.file.download')}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-[#64748B]">{t('documents.detail.file.none')}</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── OfficialDocumentsPage ──────────────────────────────────────────

const SELECT_CLASS = 'border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white text-[#0F172A]'
const HEADER_CELL_CLASS = 'px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide'

export function OfficialDocumentsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const LIMIT = 20

  const { data, isLoading, isError } = useQuery({
    queryKey: ['official-documents', page, typeFilter, statusFilter],
    queryFn: () => listDocuments({ page, limit: LIMIT, type: typeFilter, status: statusFilter }),
    placeholderData: (prev) => prev,
  })

  const revokeMutation = useMutation({
    mutationFn: revokeDocument,
    onSuccess: () => {
      toast.success(t('documents.list.revoke.success'))
      queryClient.invalidateQueries({ queryKey: ['official-documents'] })
      setRevokingId(null)
    },
    onError: (err) =>
      toast.error(
        describeApiError(err, {
          statuses: { 403: 'errors.common.forbidden' },
          fallback: 'documents.list.revoke.error',
        }),
      ),
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
          <p className="text-xs text-[#64748B] mb-1">{t('documents.page.header.breadcrumb')}</p>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('documents.page.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('documents.page.header.subtitle')}</p>
        </div>
        <button
          data-testid="create-doc-btn"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          {t('documents.page.header.create')}
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
            aria-label={t('common.actions.search')}
            placeholder={t('documents.list.filters.searchPlaceholder')}
            className="pl-9 pr-4 py-2 text-sm border border-[#E2E8F0] rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white text-[#0F172A]"
          />
        </div>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          aria-label={t('documents.fields.status')}
          className={SELECT_CLASS}
        >
          <option value="">{t('documents.list.filters.allStatuses')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>{t(STATUS_LABELS[status])}</option>
          ))}
        </select>
        {/* Hidden type filter (still accessible via pills above, keep for testid compatibility) */}
        <select
          data-testid="type-filter"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          aria-label={t('documents.list.columns.type')}
          className={SELECT_CLASS}
        >
          <option value="">{t('documents.list.filters.allTypes')}</option>
          {DOC_TYPES.map((type) => (
            <option key={type} value={type}>{t(DOC_TYPE_LABELS[type])}</option>
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
            <p role="alert" className="text-sm text-[#C62828]">{t('documents.list.load.error')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText size={40} className="text-[#E2E8F0]" />
            <p className="text-sm text-[#64748B]">{t('documents.list.empty.title')}</p>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {t('documents.list.empty.action')}
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('documents.list.columns.docNumber')}</th>
                <th className={HEADER_CELL_CLASS}>{t('documents.list.columns.title')}</th>
                <th className={HEADER_CELL_CLASS}>{t('documents.list.columns.type')}</th>
                <th className={HEADER_CELL_CLASS}>{t('documents.list.columns.issued')}</th>
                <th className={HEADER_CELL_CLASS}>{t('documents.list.columns.effective')}</th>
                <th className={HEADER_CELL_CLASS}>{t('documents.list.columns.status')}</th>
                <th className="px-4 py-3">
                  <span className="sr-only">{t('documents.list.columns.actions')}</span>
                </th>
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
                    <td className="px-6 py-3 text-[#64748B] font-mono text-xs">{doc.docNumber ?? t('common.states.none')}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0F172A] line-clamp-2 max-w-xs">{doc.title}</p>
                      {doc.subject && (
                        <p className="text-xs text-[#64748B] line-clamp-1 mt-0.5">{doc.subject}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#64748B] text-xs"><Label labels={DOC_TYPE_LABELS} value={doc.docType} /></td>
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap text-xs">{formatCalendarDate(doc.issuedDate)}</td>
                    <td className="px-4 py-3 text-[#64748B] whitespace-nowrap text-xs">{formatCalendarDate(doc.effectiveDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status] ?? 'bg-gray-100 text-[#64748B]'}`}>
                        <Label labels={STATUS_LABELS} value={doc.status} />
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
                            {t('common.actions.confirm')}
                          </button>
                          <button
                            onClick={() => setRevokingId(null)}
                            className="px-2 py-1 text-xs text-[#64748B] border border-[#E2E8F0] rounded hover:bg-[#F8FAFC] transition-colors"
                          >
                            {t('common.actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setViewingId(doc.id)}
                            aria-label={t('common.actions.view')}
                            className="p-1.5 text-[#64748B] hover:text-[#1F3A5F] hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                          {doc.status !== 'revoked' && (
                            <button
                              data-testid={`revoke-btn-${doc.id}`}
                              onClick={() => setRevokingId(doc.id)}
                              aria-label={t('documents.list.revoke.action')}
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
            {t('documents.list.pagination.summary', { total, page, totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-[#E2E8F0] hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-40 transition-colors bg-white"
              aria-label={t('common.pagination.previous')}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-[#E2E8F0] hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-40 transition-colors bg-white"
              aria-label={t('common.pagination.next')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {showCreate && <CreateDocumentModal onClose={() => setShowCreate(false)} />}
      {viewingId && <DocumentDetailDialog documentId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  )
}

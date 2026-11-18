// US-W003: Militia member full profile — 6 tabs
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { User, Edit, ArrowLeft, Phone, Mail, Calendar, Award, Shield, Briefcase, FileText, Download } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getMilitiaById } from '@/api/militia'
import { MilitiaEditModal } from '@/components/militia/MilitiaEditModal'
import { trainingApi } from '@/api/training'
import { auditApi } from '@/api/audit'
import client from '@/api/client'
import { filesApi, saveFile, uploadProblem, UPLOAD_ACCEPT, type StoredFile, type UploadProblem } from '@/api/files'
import type { TrainingRecord } from '@/api/training'
import { useRbac } from '@/hooks/useRbac'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError, skipRetryOnClientError } from '@/lib/api-error'
import { formatCalendarDate, todayInVietnam } from '@/lib/dates'

const HEALTH_LABEL: Readonly<Record<string, TranslationKey>> = {
  good: 'militia.profile.health.good',
  average: 'militia.profile.health.average',
  poor: 'militia.profile.health.poor',
}
const JUDICIAL_LABEL: Readonly<Record<string, TranslationKey>> = {
  clear: 'militia.profile.judicial.clear',
  pending: 'militia.profile.judicial.pending',
  flagged: 'militia.profile.judicial.flagged',
}

const STATUS_DISPLAY: Readonly<Record<string, { label: TranslationKey; className: string }>> = {
  active:   { label: 'militia.status.active',   className: 'bg-green-100 text-green-700' },
  reserve:  { label: 'militia.status.reserve',  className: 'bg-yellow-100 text-yellow-700' },
  inactive: { label: 'militia.status.inactive', className: 'bg-gray-100 text-gray-600' },
  leave:    { label: 'militia.status.leave',    className: 'bg-blue-100 text-blue-700' },
}

const TABS: readonly { id: string; label: TranslationKey; icon: LucideIcon }[] = [
  { id: 'personal',   label: 'militia.profile.tabs.personal',  icon: User },
  { id: 'history',    label: 'militia.profile.tabs.history',   icon: Briefcase },
  { id: 'training',   label: 'militia.profile.tabs.training',  icon: Award },
  { id: 'rewards',    label: 'militia.profile.tabs.rewards',   icon: Award },
  { id: 'documents',  label: 'militia.profile.tabs.documents', icon: Shield },
  { id: 'changelog',  label: 'militia.profile.tabs.changelog', icon: Calendar },
]

const TRAINING_TYPE_LABEL: Readonly<Record<string, TranslationKey>> = {
  military:  'militia.profile.training.types.military',
  political: 'militia.profile.training.types.political',
  fire:      'militia.profile.training.types.fire',
  first_aid: 'militia.profile.training.types.first_aid',
  other:     'militia.profile.training.types.other',
}

const TRAINING_RESULT: Readonly<Record<string, { label: TranslationKey; className: string }>> = {
  pass:          { label: 'militia.profile.training.results.pass',          className: 'bg-green-100 text-green-700' },
  fail:          { label: 'militia.profile.training.results.fail',          className: 'bg-red-100 text-red-700' },
  not_evaluated: { label: 'militia.profile.training.results.not_evaluated', className: 'bg-gray-100 text-gray-600' },
}

const REQUIRED_TRAINING_DAYS = 15 // Luật DQTV 2019 Điều 26

// Profile access is decided by the backend (militia.service.ts assertCanReadProfile): a DQTV
// member asking for someone else's profile gets 404, staff outside their unit 403. The codes
// (militia_not_found, unit_scope_violation, no_unit_scope) are texts of errors.militia.profile.
const PROFILE_STATUS_KEYS: Readonly<Partial<Record<number, TranslationKey>>> = {
  400: 'militia.profile.load.badRequest', // ParseUUIDPipe
  403: 'militia.profile.load.forbidden',
  404: 'errors.militia.profile.militia_not_found',
}

// POST /militia/:id/documents takes at most this many files (militia.controller.ts
// MILITIA_DOCUMENTS_PER_REQUEST)
const MAX_DOCUMENTS_PER_REQUEST = 10

const DOCUMENT_TYPE_LABEL: Readonly<Record<string, TranslationKey>> = {
  'application/pdf': 'militia.profile.documents.types.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'militia.profile.documents.types.word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'militia.profile.documents.types.excel',
}

// Why a file is refused before it is sent: the texts of the upload codes
const UPLOAD_PROBLEM_TEXT = {
  file_empty: 'errors.files.upload.file_empty',
  file_too_large: 'errors.files.upload.file_too_large',
  file_type_not_allowed: 'errors.files.upload.file_type_not_allowed',
} as const satisfies Record<UploadProblem, TranslationKey>

const KILOBYTE = 1024
const MEGABYTE = 1024 * 1024
const SIZE_NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

// The QueryClient's default errors are Error, so its retry policy takes an Error
type RetryPolicy = ReturnType<typeof skipRetryOnClientError<Error>>

/** Which request of adding documents failed: an upload and an attach answer codes of different tables */
class AddDocumentsError extends Error {
  readonly step: 'upload' | 'attach'
  readonly reason: unknown

  constructor(step: 'upload' | 'attach', reason: unknown) {
    super(`${step} failed`)
    this.step = step
    this.reason = reason
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrainingTab({
  records,
  year,
}: {
  records: TrainingRecord[]
  year: number
}) {
  const { t } = useTranslation()
  const totalDays = records.reduce((sum, r) => sum + r.totalDays, 0)
  const meetsRequirement = totalDays >= REQUIRED_TRAINING_DAYS
  const columns: readonly TranslationKey[] = [
    'militia.profile.training.columns.type',
    'militia.profile.training.columns.from',
    'militia.profile.training.columns.to',
    'militia.profile.training.columns.days',
    'militia.profile.training.columns.location',
    'militia.profile.training.columns.result',
  ]

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
          {t('militia.profile.training.compliance', {
            year,
            days: totalDays,
            required: REQUIRED_TRAINING_DAYS,
            result: t(meetsRequirement ? 'militia.profile.training.met' : 'militia.profile.training.notMet'),
          })}
        </span>
      </div>

      {records.length === 0 ? (
        <div
          className="py-12 text-center text-sm text-[#64748B]"
          data-testid="training-empty"
        >
          {t('militia.profile.training.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="w-full text-sm" data-testid="training-table">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">
                    {t(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {records.map((r) => {
                const result = TRAINING_RESULT[r.result] ?? TRAINING_RESULT.not_evaluated
                const typeLabel = TRAINING_TYPE_LABEL[r.trainingType]
                return (
                  <tr key={r.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 font-medium text-[#0F172A]">
                      {typeLabel ? t(typeLabel) : r.trainingType}
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">
                      {formatCalendarDate(r.fromDate)}
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">
                      {formatCalendarDate(r.toDate)}
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">{r.totalDays}</td>
                    <td className="px-4 py-3 text-[#64748B]">{r.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${result.className}`}>
                        {t(result.label)}
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

// A tab whose request was refused or failed — never shown as "empty"
function TabError({ error, forbiddenKey }: { error: unknown; forbiddenKey: TranslationKey }) {
  return (
    <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
      {describeApiError(error, {
        scope: 'militia.profile',
        statuses: { 403: forbiddenKey, 404: 'errors.militia.profile.militia_not_found' },
        fallback: 'militia.profile.tabs.loadError',
      })}
    </div>
  )
}

/** "PDF · 20 KB": the kind of a stored file and its size; BIGINT and NUMERIC columns may arrive as text */
function DocumentDetails({ file }: { file: StoredFile }) {
  const { t } = useTranslation()
  const bytes = Number(file.size)
  const size =
    bytes < KILOBYTE
      ? t('militia.profile.documents.size.bytes', { value: SIZE_NUMBER.format(bytes) })
      : bytes < MEGABYTE
        ? t('militia.profile.documents.size.kilobytes', { value: SIZE_NUMBER.format(bytes / KILOBYTE) })
        : t('militia.profile.documents.size.megabytes', { value: SIZE_NUMBER.format(bytes / MEGABYTE) })
  const typeKey =
    DOCUMENT_TYPE_LABEL[file.mimeType] ??
    (file.mimeType.startsWith('image/') ? 'militia.profile.documents.types.image' : undefined)
  return (
    <p className="text-xs text-[#64748B]">
      {t('militia.profile.documents.details', { type: typeKey ? t(typeKey) : file.mimeType, size })}
    </p>
  )
}

// GET /militia/:id/documents → FileView[], newest first; staff add their uploads with
// POST /militia/:id/documents
function DocumentsTab({ militiaId, canAdd, retry }: { militiaId: string; canAdd: boolean; retry: RetryPolicy }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [addError, setAddError] = useState<string | null>(null)

  const documents = useQuery({
    queryKey: ['militia-documents', militiaId],
    queryFn: () => client.get<StoredFile[]>(`/militia/${militiaId}/documents`).then((r) => r.data),
    retry,
  })

  // GET /files/:id needs the Bearer token: the content is fetched by the api client and saved
  const download = useMutation({
    mutationFn: saveFile,
    onError: (err) =>
      toast.error(describeApiError(err, { scope: 'files.download', fallback: 'militia.profile.documents.downloadError' })),
  })

  // Each file is uploaded for a militia profile, then all are attached in one request. A refused
  // attach claims none of them, so choosing the files again is a clean retry.
  const add = useMutation({
    mutationFn: async (files: File[]) => {
      const fileIds: string[] = []
      for (const file of files) {
        try {
          const stored = await filesApi.upload(file, 'militia_profile')
          fileIds.push(stored.id)
        } catch (err) {
          throw new AddDocumentsError('upload', err)
        }
      }
      try {
        const response = await client.post<StoredFile[]>(`/militia/${militiaId}/documents`, { fileIds })
        return response.data
      } catch (err) {
        throw new AddDocumentsError('attach', err)
      }
    },
    onSuccess: () => {
      setAddError(null)
      toast.success(t('militia.profile.documents.upload.success'))
      queryClient.invalidateQueries({ queryKey: ['militia-documents', militiaId] })
    },
    onError: (err) => {
      const failure = err instanceof AddDocumentsError ? err : new AddDocumentsError('attach', err)
      setAddError(
        failure.step === 'upload'
          ? describeApiError(failure.reason, { scope: 'files.upload', fallback: 'militia.profile.documents.upload.uploadError' })
          : describeApiError(failure.reason, {
              scope: ['files.attach', 'militia.documents'],
              fallback: 'militia.profile.documents.upload.attachError',
            }),
      )
    },
  })

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    // Lets the same files be chosen again after a refusal
    event.target.value = ''
    if (files.length === 0) return
    if (files.length > MAX_DOCUMENTS_PER_REQUEST) {
      setAddError(t('militia.profile.documents.upload.tooMany', { max: MAX_DOCUMENTS_PER_REQUEST }))
      return
    }
    for (const file of files) {
      const problem = uploadProblem(file)
      if (problem) {
        setAddError(t('militia.profile.documents.upload.fileProblem', { name: file.name, reason: t(UPLOAD_PROBLEM_TEXT[problem]) }))
        return
      }
    }
    setAddError(null)
    add.mutate(files)
  }

  const files = documents.data ?? []

  return (
    <div data-testid="documents-tab" className="space-y-4">
      {canAdd && (
        <div className="rounded-xl border border-dashed border-[#E2E8F0] p-4">
          <label htmlFor="militia-documents-input" className="block text-sm font-medium text-[#0F172A] mb-1">
            {t('militia.profile.documents.upload.label')}
          </label>
          <input
            id="militia-documents-input"
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            onChange={chooseFiles}
            disabled={add.isPending}
            className="block w-full text-sm text-[#64748B] file:mr-3 file:rounded-lg file:border-0 file:bg-[#F8FAFC] file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-50"
          />
          <p className="text-xs text-[#64748B] mt-1">
            {add.isPending
              ? t('militia.profile.documents.upload.uploading')
              : t('militia.profile.documents.upload.hint', { max: MAX_DOCUMENTS_PER_REQUEST })}
          </p>
          {addError && (
            <p role="alert" className="text-xs text-[#C62828] mt-1">{addError}</p>
          )}
        </div>
      )}

      {documents.isError ? (
        <TabError error={documents.error} forbiddenKey="militia.profile.documents.forbidden" />
      ) : documents.isLoading ? (
        <p className="py-16 text-center text-sm text-[#64748B]">{t('common.states.loading')}</p>
      ) : files.length === 0 ? (
        <EmptyTab message={t('militia.profile.documents.empty')} />
      ) : (
        <ul className="divide-y divide-[#E2E8F0]">
          {files.map((file) => {
            const isDownloading = download.isPending && download.variables?.id === file.id
            return (
              <li key={file.id} className="py-3 flex items-center gap-3">
                <div className="w-9 h-9 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] flex items-center justify-center flex-shrink-0">
                  <FileText size={16} className="text-[#64748B]" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#0F172A] truncate">{file.name}</p>
                  <DocumentDetails file={file} />
                </div>
                <button
                  type="button"
                  onClick={() => download.mutate(file)}
                  disabled={isDownloading}
                  className="text-xs text-[#C62828] hover:underline font-medium disabled:opacity-50"
                >
                  {t(isDownloading ? 'militia.profile.documents.downloading' : 'militia.profile.documents.download')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MilitiaProfilePage() {
  const { t } = useTranslation()
  const { can } = useRbac()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('personal')
  const [editOpen, setEditOpen] = useState(false)

  // 400/403/404 will not change on retry: show them at once, keep the app's policy otherwise
  const retry = skipRetryOnClientError(queryClient.getDefaultOptions().queries?.retry)

  const { data: profile, isLoading, isError, error } = useQuery({
    queryKey: ['militia-profile', id],
    queryFn: () => getMilitiaById(id!),
    enabled: !!id,
    retry,
  })

  const currentYear = new Date().getFullYear()
  const { data: trainingData } = useQuery({
    queryKey: ['training-records', id, currentYear],
    queryFn: () => trainingApi.listRecords({ militiaId: id!, year: currentYear, limit: 100 }),
    enabled: !!id && !!profile && activeTab === 'training',
  })

  const history = useQuery({
    queryKey: ['militia-history', id],
    queryFn: () => client.get(`/militia/${id}/history`).then((r) => r.data),
    enabled: !!id && !!profile && activeTab === 'history',
    retry,
  })

  const rewards = useQuery({
    queryKey: ['militia-rewards', id],
    queryFn: () => client.get(`/militia/${id}/rewards`).then((r) => r.data),
    enabled: !!id && !!profile && activeTab === 'rewards',
    retry,
  })

  // The audit interceptor records /militia/:id requests with entityType "militia"
  const changelog = useQuery({
    queryKey: ['militia-changelog', id],
    queryFn: () => auditApi.list({ entityType: 'militia', entityId: id!, limit: 50 }),
    enabled: !!id && !!profile && activeTab === 'changelog',
    retry,
  })

  const historyData = history.data
  const rewardsData = rewards.data
  const changelogData = changelog.data

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
      const date = todayInVietnam()
      a.download = `ho-so-DQTV-${profile?.fullName ?? 'member'}-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    onError: (err) => toast.error(describeApiError(err, { fallback: 'militia.profile.export.error' })),
  })

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-4 border-[#C62828] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !profile) {
    const message = isError
      ? describeApiError(error, {
          scope: 'militia.profile',
          statuses: PROFILE_STATUS_KEYS,
          fallback: 'militia.profile.load.error',
        })
      : t('militia.profile.load.error')
    return (
      <div className="p-6 space-y-4">
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {message}
        </div>
        <button
          type="button"
          onClick={() => navigate('/militia')}
          className="inline-flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] rounded-lg text-sm font-medium text-[#0F172A] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t('militia.profile.header.backToList')}
        </button>
      </div>
    )
  }

  const status = STATUS_DISPLAY[profile.status]
  const statusInfo = status
    ? { label: t(status.label), className: status.className }
    : { label: profile.status, className: 'bg-gray-100 text-gray-600' }
  const healthLabel = profile.healthStatus ? HEALTH_LABEL[profile.healthStatus] : undefined
  const judicialLabel = profile.judicialClearanceStatus ? JUDICIAL_LABEL[profile.judicialClearanceStatus] : undefined
  const initials = profile.fullName
    .split(' ')
    .slice(-2)
    .map((w: string) => w.charAt(0).toUpperCase())
    .join('')

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen" data-testid="militia-profile-page">
      {editOpen && (
        <MilitiaEditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          id={id!}
          profile={profile}
        />
      )}
      {/* Top nav bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/militia')}
            aria-label={t('militia.profile.header.backToList')}
            className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all border border-transparent hover:border-[#E2E8F0]"
            data-testid="back-btn"
          >
            <ArrowLeft size={20} className="text-[#64748B]" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">{t('militia.profile.header.title')}</h1>
            <p className="text-sm text-[#64748B] mt-0.5">{t('militia.profile.header.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="px-4 py-2 border border-[#C62828] text-[#C62828] rounded-lg hover:bg-red-50 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Download size={16} />
            {t('militia.profile.export.action')}
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            data-testid="edit-btn"
          >
            <Edit size={16} />
            {t('common.actions.edit')}
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
            <p className="text-sm text-white/70 mb-3" data-testid="profile-code">
              <Trans
                i18nKey="militia.profile.header.code"
                values={{ code: profile.militiaCode ?? profile.id }}
                components={{ strong: <span className="font-semibold text-white" /> }}
              />
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
                {t(tab.label)}
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
              <InfoField label={t('militia.profile.personal.code')}       value={profile.militiaCode} />
              <InfoField label={t('militia.profile.personal.rank')}       value={profile.rank ?? '—'} />
              <InfoField label={t('militia.profile.personal.phone')}      value={profile.phone ?? '—'} />
              <InfoField label={t('militia.profile.personal.email')}      value={profile.email ?? '—'} />
              <InfoField label={t('militia.profile.personal.unit')}       value={profile.unitName} />
              <InfoField
                label={t('militia.profile.personal.status')}
                value={
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                }
              />
              <InfoField label={t('militia.profile.personal.occupation')} value={profile.occupation ?? '—'} />
              <InfoField label={t('militia.profile.personal.education')}  value={profile.educationLevel ?? '—'} />
              <InfoField
                label={t('militia.profile.personal.health')}
                value={healthLabel ? t(healthLabel) : (profile.healthStatus ?? '—')}
              />
              <InfoField label={t('militia.profile.personal.bloodType')}  value={profile.bloodType ?? '—'} />
              <InfoField label={t('militia.profile.personal.permanentAddress')} value={profile.permanentAddress ?? '—'} />
              <InfoField
                label={t('militia.profile.personal.judicial')}
                value={judicialLabel ? t(judicialLabel) : (profile.judicialClearanceStatus ?? '—')}
              />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6" data-testid="history-tab">
              {history.isError ? (
                <TabError error={history.error} forbiddenKey="militia.profile.history.forbidden" />
              ) : (
                <>
                  <section>
                    <h3 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                      <span className="w-1 h-4 bg-[#C62828] rounded inline-block" />
                      {t('militia.profile.history.assignments')}
                    </h3>
                    {!historyData?.assignments?.length ? (
                      <p className="text-sm text-[#64748B]">{t('militia.profile.history.noAssignments')}</p>
                    ) : (
                      <ul className="divide-y divide-[#E2E8F0]">
                        {(historyData.assignments as Record<string, unknown>[]).map((a) => (
                          <li key={a['id'] as string} className="py-2 text-sm text-[#64748B]">
                            {t('militia.profile.history.assignment', {
                              username: a['caUsername'] as string,
                              date: formatCalendarDate(a['assignedAt'] as string),
                            })}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-[#0F172A] mb-3 flex items-center gap-2">
                      <span className="w-1 h-4 bg-[#C62828] rounded inline-block" />
                      {t('militia.profile.history.tasks')}
                    </h3>
                    {!historyData?.taskHistory?.length ? (
                      <p className="text-sm text-[#64748B]">{t('militia.profile.history.noTasks')}</p>
                    ) : (
                      <ul className="divide-y divide-[#E2E8F0]">
                        {(historyData.taskHistory as Record<string, unknown>[]).map((task) => (
                          <li key={task['id'] as string} className="py-2 flex justify-between text-sm">
                            <span className="text-[#0F172A]">{task['title'] as string}</span>
                            <span className="text-xs text-[#64748B]">{task['status'] as string}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
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
              {rewards.isError ? (
                <TabError error={rewards.error} forbiddenKey="militia.profile.rewards.forbidden" />
              ) : !rewardsData?.length ? (
                <EmptyTab message={t('militia.profile.rewards.empty')} />
              ) : (
                <ul className="divide-y divide-[#E2E8F0]">
                  {(rewardsData as Record<string, unknown>[]).map((r) => (
                    <li key={r['id'] as string} className="py-4 flex items-start gap-3">
                      <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r['rewardType'] === 'reward' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-[#C62828]'}`}>
                        {t(r['rewardType'] === 'reward' ? 'militia.profile.rewards.reward' : 'militia.profile.rewards.discipline')}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[#0F172A]">{r['title'] as string}</p>
                        {!!r['description'] && (
                          <p className="text-xs text-[#64748B] mt-0.5">{r['description'] as string}</p>
                        )}
                        <p className="text-xs text-[#64748B] mt-1">
                          {formatCalendarDate(r['issuedDate'] as string | null, '')}{' '}
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
            <DocumentsTab militiaId={id!} canAdd={can.manageMilitia} retry={retry} />
          )}

          {activeTab === 'changelog' && (
            <div data-testid="changelog-tab">
              {changelog.isError ? (
                // GET /audit is limited to system_admin, police_ward and police_area
                <TabError error={changelog.error} forbiddenKey="militia.profile.changelog.forbidden" />
              ) : !changelogData?.data?.length ? (
                <EmptyTab message={t('militia.profile.changelog.empty')} />
              ) : (
                <ul className="divide-y divide-[#E2E8F0]">
                  {changelogData.data.map((log) => (
                    <li key={log.id} className="py-3 flex justify-between text-sm">
                      <div>
                        <span className="font-medium text-[#0F172A]">{log.action}</span>
                        {!!log.actorName && (
                          <span className="text-[#64748B] ml-2">{t('militia.profile.changelog.actor', { name: log.actorName })}</span>
                        )}
                      </div>
                      <span className="text-xs text-[#64748B]">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString('vi-VN') : ''}
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

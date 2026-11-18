import { useState } from 'react'
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import i18n from '@/i18n'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { formatCalendarDate } from '@/lib/dates'
import { UserPlus, FileText, CheckCircle, Clock, X, Eye, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface Application {
  id: string
  name: string
  age: number
  address: string
  phone: string
  applyDate: string // DATE column, YYYY-MM-DD
  status: 'new' | 'reviewing' | 'approved' | 'rejected'
  district?: string
  email?: string
  idNumber?: string
}

/** GET /recruitment/applications?status=&page=&limit= — recruitment.service.ts listApplications */
interface ApplicationPage {
  data: Application[]
  total: number
}

type StatusTab = 'all' | Application['status']
type StatusChange = 'approved' | 'rejected' | 'reviewing'

const PAGE_SIZE = 20

const STATUS_COLORS: Record<Application['status'], { bg: string; text: string }> = {
  new: { bg: '#E3F2FD', text: '#1976D2' },
  reviewing: { bg: '#FFF3E0', text: '#F57C00' },
  approved: { bg: '#E8F5E9', text: '#2E7D32' },
  rejected: { bg: '#FFEBEE', text: '#C62828' },
}

const STATUS_LABELS = {
  new: 'recruitment.status.new',
  reviewing: 'recruitment.status.reviewing',
  approved: 'recruitment.status.approved',
  rejected: 'recruitment.status.rejected',
} as const satisfies Record<Application['status'], TranslationKey>

const STATUS_TABS: readonly { id: StatusTab; label: TranslationKey }[] = [
  { id: 'all', label: 'common.filters.all' },
  { id: 'new', label: STATUS_LABELS.new },
  { id: 'reviewing', label: STATUS_LABELS.reviewing },
  { id: 'approved', label: STATUS_LABELS.approved },
  { id: 'rejected', label: STATUS_LABELS.rejected },
]

const STATUS_CHANGE_SUCCESS = {
  approved: 'recruitment.statusChange.success.approved',
  rejected: 'recruitment.statusChange.success.rejected',
  reviewing: 'recruitment.statusChange.success.reviewing',
} as const satisfies Record<StatusChange, TranslationKey>

const TABLE_COLUMNS: readonly TranslationKey[] = [
  'recruitment.fields.index',
  'recruitment.fields.name',
  'recruitment.fields.age',
  'recruitment.fields.address',
  'recruitment.fields.phone',
  'recruitment.fields.applyDate',
  'recruitment.fields.status',
  'recruitment.fields.actions',
]

const recruitmentKeys = {
  all: ['recruitment'] as const,
  list: (tab: StatusTab, page: number) => ['recruitment', 'list', tab, page] as const,
  count: (tab: StatusTab) => ['recruitment', 'count', tab] as const,
}

async function fetchApplications(tab: StatusTab, page: number, limit: number): Promise<ApplicationPage> {
  const params = tab === 'all' ? { page, limit } : { status: tab, page, limit }
  const response = await client.get<ApplicationPage>('/recruitment/applications', { params })
  const body = response.data
  if (!body || !Array.isArray(body.data) || typeof body.total !== 'number') {
    throw new Error('GET /recruitment/applications did not return { data, total }')
  }
  return body
}

interface CreateApplicationForm {
  name: string
  age: string
  address: string
  phone: string
  district: string
  idNumber: string
}

/** Body of POST /recruitment/applications — CreateApplicationDto; unknown properties are rejected */
interface CreateApplicationBody {
  name: string
  age?: number
  address?: string
  phone?: string
  email?: string
  idNumber?: string
  district?: string
}

// Empty optional fields are left out: an empty age would be sent as 0 and fail @Min(16)
function buildApplicationBody(form: CreateApplicationForm): CreateApplicationBody {
  const body: CreateApplicationBody = { name: form.name.trim() }
  const age = form.age.trim()
  if (age) body.age = parseInt(age, 10)
  for (const key of ['address', 'phone', 'district', 'idNumber'] as const) {
    const value = form[key].trim()
    if (value) body[key] = value
  }
  return body
}

// Exports the rows of the page on screen
function exportApplicationsCsv(applications: readonly Application[]) {
  const headers = [
    i18n.t('recruitment.fields.name'),
    i18n.t('recruitment.fields.age'),
    i18n.t('recruitment.fields.phoneShort'),
    i18n.t('recruitment.fields.address'),
    i18n.t('recruitment.fields.district'),
    i18n.t('recruitment.fields.status'),
    i18n.t('recruitment.fields.applyDate'),
  ]
  const rows = applications.map((a) => [
    a.name,
    String(a.age ?? ''),
    a.phone ?? '',
    a.address ?? '',
    a.district ?? '',
    i18n.t(STATUS_LABELS[a.status]),
    a.applyDate,
  ])
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tuyen-chon-dqtv.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const INPUT_CLASS = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828]/30'

function CreateModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreateApplicationForm>({
    name: '',
    age: '',
    address: '',
    phone: '',
    district: '',
    idNumber: '',
  })

  const createMutation = useMutation({
    mutationFn: (body: CreateApplicationBody) =>
      client.post('/recruitment/applications', body).then((r) => r.data),
    onSuccess: () => {
      toast.success(t('recruitment.create.submit.success'))
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all })
      onClose()
    },
    onError: (err) =>
      toast.error(
        describeApiError(err, {
          statuses: { 403: 'errors.common.forbidden' },
          fallback: 'recruitment.create.submit.error',
        }),
      ),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('recruitment.create.validation.nameRequired'))
    if (!form.phone.trim()) return toast.error(t('recruitment.create.validation.phoneRequired'))
    createMutation.mutate(buildApplicationBody(form))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">{t('recruitment.create.form.title')}</h2>
          <button onClick={onClose} aria-label={t('common.actions.close')} className="text-[#64748B] hover:text-[#0F172A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label htmlFor="application-name" className="block text-sm font-medium text-[#0F172A] mb-1">{t('recruitment.fields.name')} <span className="text-[#C62828]" aria-hidden="true">*</span></label>
              <input id="application-name" type="text" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('recruitment.create.placeholders.name')} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="application-age" className="block text-sm font-medium text-[#0F172A] mb-1">{t('recruitment.fields.age')}</label>
              <input id="application-age" type="number" min="16" max="65" value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))} placeholder="25" className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="application-phone" className="block text-sm font-medium text-[#0F172A] mb-1">{t('recruitment.fields.phone')} <span className="text-[#C62828]" aria-hidden="true">*</span></label>
              <input id="application-phone" type="tel" required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0901234567" className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="application-id-number" className="block text-sm font-medium text-[#0F172A] mb-1">{t('recruitment.fields.idNumber')}</label>
              <input id="application-id-number" type="text" value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} placeholder="0123456789" className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="application-district" className="block text-sm font-medium text-[#0F172A] mb-1">{t('recruitment.fields.ward')}</label>
              <input id="application-district" type="text" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder={t('recruitment.create.placeholders.district')} className={INPUT_CLASS} />
            </div>
            <div className="col-span-2">
              <label htmlFor="application-address" className="block text-sm font-medium text-[#0F172A] mb-1">{t('recruitment.fields.address')}</label>
              <input id="application-address" type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder={t('recruitment.create.placeholders.address')} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]">{t('common.actions.cancel')}</button>
            <button type="submit" disabled={createMutation.isPending} className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {t(createMutation.isPending ? 'common.actions.saving' : 'recruitment.create.form.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function RecruitmentPage() {
  const { can } = useRbac()
  // GET /recruitment/applications admits ca_officer; creating and changing applications do not
  if (!can.viewRecruitment) return <Navigate to="/forbidden" replace />
  return <RecruitmentContent canManage={can.manageRecruitment} />
}

function RecruitmentContent({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedTab, setSelectedTab] = useState<StatusTab>('all')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  const listQuery = useQuery({
    queryKey: recruitmentKeys.list(selectedTab, page),
    queryFn: () => fetchApplications(selectedTab, page, PAGE_SIZE),
  })
  const applications = listQuery.data?.data ?? []
  const listTotal = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE))

  // Every tab counts all its applications: one limit=1 request per status, read for its total
  const countQueries = useQueries({
    queries: STATUS_TABS.map((tab) => ({
      queryKey: recruitmentKeys.count(tab.id),
      queryFn: () => fetchApplications(tab.id, 1, 1).then((body) => body.total),
    })),
  })
  const counts = Object.fromEntries(
    STATUS_TABS.map((tab, index) => [tab.id, countQueries[index].data ?? 0]),
  ) as Record<StatusTab, number>

  // PATCH /recruitment/applications/:id — UpdateApplicationDto { status?, reviewerNotes? }
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StatusChange }) =>
      client.patch(`/recruitment/applications/${id}`, { status }).then((r) => r.data),
    onSuccess: (_, { status }) => {
      toast.success(t(STATUS_CHANGE_SUCCESS[status]))
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all })
    },
    onError: (err) => {
      // application_not_found: the row is stale, so the list is read again whatever the answer
      toast.error(
        describeApiError(err, {
          scope: 'recruitment.statusChange',
          statuses: { 403: 'errors.common.forbidden' },
          fallback: 'recruitment.statusChange.error.generic',
        }),
      )
      queryClient.invalidateQueries({ queryKey: recruitmentKeys.all })
    },
  })

  const chooseTab = (tab: StatusTab) => {
    setSelectedTab(tab)
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="recruitment-page">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">{t('recruitment.page.header.title')}</h1>
            <p className="text-sm text-[#64748B] mt-1">{t('recruitment.page.header.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {canManage && (
              <button
                onClick={() => setShowModal(true)}
                data-testid="create-application-btn"
                className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <UserPlus size={16} />
                {t('recruitment.create.form.title')}
              </button>
            )}
            <button onClick={() => exportApplicationsCsv(applications)} className="px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] flex items-center gap-2 transition-colors">
              <Download size={16} />
              {t('common.actions.export')}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#E3F2FD] rounded-lg flex items-center justify-center">
                <FileText size={24} className="text-[#1976D2]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">{t('recruitment.page.summary.total')}</p>
                <p className="text-2xl font-bold text-[#0F172A]">{counts.all}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#E8F5E9] rounded-lg flex items-center justify-center">
                <CheckCircle size={24} className="text-[#2E7D32]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">{t(STATUS_LABELS.approved)}</p>
                <p className="text-2xl font-bold text-[#2E7D32]">{counts.approved}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#FFF3E0] rounded-lg flex items-center justify-center">
                <Clock size={24} className="text-[#F57C00]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">{t('recruitment.page.summary.pending')}</p>
                <p className="text-2xl font-bold text-[#F57C00]">{counts.new + counts.reviewing}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[#E2E8F0] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#FFEBEE] rounded-lg flex items-center justify-center">
                <X size={24} className="text-[#C62828]" />
              </div>
              <div>
                <p className="text-xs text-[#64748B]">{t(STATUS_LABELS.rejected)}</p>
                <p className="text-2xl font-bold text-[#C62828]">{counts.rejected}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-1 flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => chooseTab(tab.id)}
              data-testid={`recruitment-tab-${tab.id}`}
              aria-pressed={selectedTab === tab.id}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                selectedTab === tab.id ? 'bg-[#1F3A5F] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]'
              }`}
            >
              {t(tab.label)}
              <span className={`ml-1.5 px-2 py-0.5 text-xs rounded-full ${
                selectedTab === tab.id ? 'bg-white/20' : 'bg-[#F1F5F9]'
              }`}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F8FAFC] border-b-2 border-[#E2E8F0]">
                <tr>
                  {TABLE_COLUMNS.map((column) => (
                    <th key={column} className="px-6 py-4 text-left text-xs font-semibold text-[#64748B] uppercase">{t(column)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i} className="border-b border-[#F1F5F9]">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                        <td key={j} className="px-5 py-4"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : listQuery.isError ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm">
                      <p role="alert" className="text-[#C62828]">
                        {t('recruitment.list.load.error')}{' '}
                        <button type="button" onClick={() => listQuery.refetch()} className="font-medium underline">{t('common.actions.retry')}</button>
                      </p>
                    </td>
                  </tr>
                ) : applications.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-[#64748B] text-sm">
                      {t('recruitment.list.empty.title')}
                    </td>
                  </tr>
                ) : (
                  applications.map((app, index) => {
                    const color = STATUS_COLORS[app.status]
                    return (
                      <tr
                        key={app.id}
                        data-testid={`application-row-${app.id}`}
                        className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-[#64748B]">{(page - 1) * PAGE_SIZE + index + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                              {app.name.split(' ').filter(Boolean).slice(-1)[0]?.[0] ?? '?'}
                            </div>
                            <span className="text-sm font-semibold text-[#0F172A]">{app.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#0F172A]">{app.age}</td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-[#0F172A]">{app.address}</p>
                          {app.district && <p className="text-xs text-[#64748B]">{app.district}</p>}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#0F172A]">{app.phone}</td>
                        <td className="px-6 py-4 text-sm text-[#64748B]">{formatCalendarDate(app.applyDate)}</td>
                        <td className="px-6 py-4">
                          <span
                            className="px-3 py-1.5 text-xs font-semibold rounded-full"
                            style={{ backgroundColor: color.bg, color: color.text }}
                          >
                            {t(STATUS_LABELS[app.status])}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedApp(app)} className="w-8 h-8 flex items-center justify-center hover:bg-[#E3F2FD] rounded transition-colors" title={t('common.actions.view')}>
                              <Eye size={15} className="text-[#64748B]" />
                            </button>
                            {canManage && app.status === 'new' && (
                              <button
                                onClick={() => statusMutation.mutate({ id: app.id, status: 'reviewing' })}
                                disabled={statusMutation.isPending}
                                data-testid={`review-btn-${app.id}`}
                                className="w-8 h-8 flex items-center justify-center hover:bg-[#FFF3E0] rounded transition-colors"
                                title={t('recruitment.list.actions.review')}
                              >
                                <Clock size={15} className="text-[#F57C00]" />
                              </button>
                            )}
                            {canManage && (app.status === 'new' || app.status === 'reviewing') && (
                              <>
                                <button
                                  onClick={() => statusMutation.mutate({ id: app.id, status: 'approved' })}
                                  disabled={statusMutation.isPending}
                                  data-testid={`approve-btn-${app.id}`}
                                  className="w-8 h-8 flex items-center justify-center hover:bg-[#E8F5E9] rounded transition-colors"
                                  title={t('recruitment.list.actions.approve')}
                                >
                                  <CheckCircle size={15} className="text-[#2E7D32]" />
                                </button>
                                <button
                                  onClick={() => statusMutation.mutate({ id: app.id, status: 'rejected' })}
                                  disabled={statusMutation.isPending}
                                  data-testid={`reject-btn-${app.id}`}
                                  className="w-8 h-8 flex items-center justify-center hover:bg-[#FFEBEE] rounded transition-colors"
                                  title={t('recruitment.list.actions.reject')}
                                >
                                  <X size={15} className="text-[#C62828]" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
            <p className="text-sm text-[#64748B]" data-testid="recruitment-total">
              <Trans
                i18nKey="recruitment.list.pagination.total"
                values={{ count: listTotal }}
                components={{ strong: <span className="font-medium text-[#0F172A]" /> }}
              />
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={t('common.pagination.previous')}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span data-testid="recruitment-page-indicator" className="text-sm font-medium text-[#0F172A]">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label={t('common.pagination.next')}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {canManage && showModal && <CreateModal onClose={() => setShowModal(false)} />}

      {selectedApp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedApp(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0F172A]">{t('recruitment.detail.modal.title')}</h2>
              <button onClick={() => setSelectedApp(null)} className="text-[#64748B] hover:text-[#0F172A]">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-[#64748B]">{t('recruitment.fields.name')}</p><p className="font-medium text-[#0F172A]">{selectedApp.name}</p></div>
              <div><p className="text-[#64748B]">{t('recruitment.fields.age')}</p><p className="font-medium text-[#0F172A]">{selectedApp.age}</p></div>
              <div><p className="text-[#64748B]">{t('recruitment.fields.phoneShort')}</p><p className="font-medium text-[#0F172A]">{selectedApp.phone}</p></div>
              <div><p className="text-[#64748B]">{t('recruitment.fields.address')}</p><p className="font-medium text-[#0F172A] col-span-2">{selectedApp.address}</p></div>
              {selectedApp.district && <div><p className="text-[#64748B]">{t('recruitment.fields.district')}</p><p className="font-medium text-[#0F172A]">{selectedApp.district}</p></div>}
              {selectedApp.email && <div><p className="text-[#64748B]">{t('recruitment.fields.email')}</p><p className="font-medium text-[#0F172A]">{selectedApp.email}</p></div>}
              {selectedApp.idNumber && <div><p className="text-[#64748B]">{t('recruitment.fields.idNumber')}</p><p className="font-medium text-[#0F172A]">{selectedApp.idNumber}</p></div>}
              <div><p className="text-[#64748B]">{t('recruitment.fields.applyDate')}</p><p className="font-medium text-[#0F172A]">{formatCalendarDate(selectedApp.applyDate)}</p></div>
              <div>
                <p className="text-[#64748B]">{t('recruitment.fields.status')}</p>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-0.5"
                  style={{ backgroundColor: STATUS_COLORS[selectedApp.status].bg, color: STATUS_COLORS[selectedApp.status].text }}
                >
                  {t(STATUS_LABELS[selectedApp.status])}
                </span>
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-3">
              <button onClick={() => setSelectedApp(null)} className="border border-[#E2E8F0] text-[#64748B] rounded-lg px-4 py-2 text-sm hover:border-[#C62828] transition-colors">
                {t('common.actions.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import client from '@/api/client'
import { downloadExcelReport } from '@/utils/export-utils'
import { formatCalendarDate, todayInVietnam } from '@/lib/dates'
import type { TranslationKey } from '@/i18n/types'

/** A row of GET /militia (militia.service.ts searchMilitia, MilitiaListItem): gender is its code */
interface MilitiaRosterRow {
  id: string
  militiaCode: string
  fullName: string
  dateOfBirth: string | null
  gender: string | null
  phone: string | null
  unitCode: string
  rank: string | null
  occupation: string | null
  educationLevel: string | null
  status: string
}

// A gender code the backend adds later is shown as its code
const GENDER_LABELS: Readonly<Partial<Record<string, TranslationKey>>> = {
  male: 'reports.roster.gender.male',
  female: 'reports.roster.gender.female',
  other: 'reports.roster.gender.other',
}

// A field the profile does not have
const MISSING = '—'

interface PaginatedRoster {
  data: MilitiaRosterRow[]
  total: number
  page: number
  limit: number
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'reports.roster.filters.allStatuses' },
  { value: 'active', label: 'reports.roster.filters.active' },
  { value: 'reserve', label: 'reports.roster.filters.reserve' },
  { value: 'inactive', label: 'reports.roster.filters.inactive' },
] as const satisfies readonly { value: string; label: TranslationKey }[]

// Area units KP1…KP6 (Khu phố 1…6)
const AREA_NUMBERS = [1, 2, 3, 4, 5, 6] as const

const COLUMNS = [
  'reports.roster.columns.index',
  'reports.roster.columns.militiaCode',
  'reports.roster.columns.fullName',
  'reports.roster.columns.dateOfBirth',
  'reports.roster.columns.gender',
  'reports.roster.columns.phone',
  'reports.roster.columns.unit',
  'reports.roster.columns.rank',
  'reports.roster.columns.occupation',
  'reports.roster.columns.education',
  'reports.roster.columns.status',
] as const satisfies readonly TranslationKey[]

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-green-100 text-[#2E7D32]',
  reserve: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-[#64748B]',
}

// A status the backend adds later is shown as its code
const STATUS_LABELS: Readonly<Partial<Record<string, TranslationKey>>> = {
  active: 'reports.roster.status.active',
  reserve: 'reports.roster.status.reserve',
  inactive: 'reports.roster.status.inactive',
}

const LIMIT = 20

async function fetchRoster(params: {
  page: number
  limit: number
  unitCode: string
  status: string
}): Promise<PaginatedRoster> {
  const res = await client.get('/militia', {
    params: {
      page: params.page,
      limit: params.limit,
      unitCode: params.unitCode || undefined,
      status: params.status === 'all' ? undefined : params.status,
    },
  })
  return res.data
}

export function RosterReportPage() {
  const { t } = useTranslation()
  const [unitCode, setUnitCode] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['roster-report', unitCode, status, page],
    queryFn: () => fetchRoster({ page, limit: LIMIT, unitCode, status }),
    placeholderData: prev => prev,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function handleExport() {
    await downloadExcelReport(
      async () => {
        const res = await client.get('/militia/export', {
          params: {
            format: 'xlsx',
            unitCode: unitCode || undefined,
            status: status === 'all' ? undefined : status,
          },
          responseType: 'blob',
        })
        return res.data as Blob
      },
      `danh-sach-quan-nhan-${todayInVietnam()}.xlsx`,
      () => setIsExporting(true),
      () => setIsExporting(false),
    )
  }

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="roster-report-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('reports.roster.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('reports.roster.header.subtitle')}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || rows.length === 0}
          data-testid="export-btn"
          className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
        >
          <Download size={16} />
          {isExporting ? t('common.actions.exporting') : t('reports.roster.export.idle')}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="roster-unit" className="text-sm font-medium text-[#0F172A]">{t('reports.roster.filters.unit')}</label>
            <select
              id="roster-unit"
              value={unitCode}
              onChange={e => { setUnitCode(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            >
              <option value="">{t('common.filters.all')}</option>
              {AREA_NUMBERS.map((number) => (
                <option key={number} value={`KP${number}`}>{t('reports.roster.filters.area', { number })}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="roster-status" className="text-sm font-medium text-[#0F172A]">{t('reports.roster.filters.status')}</label>
            <select
              id="roster-status"
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {t('reports.roster.load.error')}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[#64748B] text-sm">{t('common.states.loading')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    {COLUMNS.map(column => (
                      <th key={column} className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide whitespace-nowrap">{t(column)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className="px-6 py-12 text-center text-sm text-[#64748B]">
                        {t('common.states.empty')}
                      </td>
                    </tr>
                  ) : rows.map((row, idx) => {
                    const statusLabel = STATUS_LABELS[row.status]
                    const genderLabel = row.gender ? GENDER_LABELS[row.gender] : undefined
                    return (
                      <tr key={row.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-4 py-3 text-sm text-[#64748B]">{(page - 1) * LIMIT + idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-mono text-[#1F3A5F] font-medium">{row.militiaCode}</td>
                        <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{row.fullName}</td>
                        <td className="px-4 py-3 text-sm text-[#64748B] whitespace-nowrap">
                          {row.dateOfBirth ? formatCalendarDate(row.dateOfBirth) : MISSING}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">
                          {genderLabel ? t(genderLabel) : row.gender ?? MISSING}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#64748B] font-mono">{row.phone ?? MISSING}</td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">{row.unitCode}</td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">{row.rank ?? MISSING}</td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">{row.occupation ?? MISSING}</td>
                        <td className="px-4 py-3 text-sm text-[#64748B]">{row.educationLevel ?? MISSING}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGES[row.status] ?? 'bg-gray-100 text-[#64748B]'}`}>
                            {statusLabel ? t(statusLabel) : row.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]">
                <Trans
                  i18nKey="reports.roster.pagination.total"
                  values={{ total }}
                  components={{ count: <span className="font-medium text-[#0F172A]" /> }}
                />
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label={t('common.pagination.previous')}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-[#0F172A] font-medium">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label={t('common.pagination.next')}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

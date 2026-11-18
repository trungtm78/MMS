// US-W003: Militia personnel list — server-side pagination + filters + export
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { Search, FileDown, Eye, Edit, Filter, ChevronDown, Users, Plus } from 'lucide-react'
import { searchMilitia, getMilitiaById, type MilitiaSearchResult, type MilitiaListItem } from '@/api/militia'
import { exportCsv } from '@/utils/csv-export'
import { todayInVietnam } from '@/lib/dates'
import i18n from '@/i18n'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { MilitiaEditModal } from '@/components/militia/MilitiaEditModal'

// ─── Filter options ───────────────────────────────────────────────────────────

interface FilterOption {
  value: string
  label: TranslationKey
}

const STATUS_OPTIONS: readonly FilterOption[] = [
  { value: '', label: 'militia.list.filters.allStatuses' },
  { value: 'active', label: 'militia.status.active' },
  { value: 'reserve', label: 'militia.status.reserve' },
  { value: 'inactive', label: 'militia.status.inactive' },
  { value: 'leave', label: 'militia.status.leave' },
]

const UNIT_OPTIONS: readonly FilterOption[] = [
  { value: '', label: 'militia.list.filters.allUnits' },
  { value: 'KP1', label: 'militia.list.units.kp1' },
  { value: 'KP2', label: 'militia.list.units.kp2' },
  { value: 'KP3', label: 'militia.list.units.kp3' },
  { value: 'KP4', label: 'militia.list.units.kp4' },
  { value: 'KP5', label: 'militia.list.units.kp5' },
  { value: 'KP6', label: 'militia.list.units.kp6' },
]

const STATUS_DISPLAY: Readonly<Record<string, { label: TranslationKey; className: string }>> = {
  active:   { label: 'militia.status.active',   className: 'bg-green-100 text-green-700' },
  reserve:  { label: 'militia.status.reserve',  className: 'bg-yellow-100 text-yellow-700' },
  inactive: { label: 'militia.status.inactive', className: 'bg-gray-100 text-gray-600' },
  leave:    { label: 'militia.status.leave',    className: 'bg-blue-100 text-blue-700' },
}

const UNKNOWN_STATUS_CLASS = 'bg-gray-100 text-gray-600'

/** The status text: its label, or the raw value for a status this screen does not know */
function statusText(status: string): string {
  const display = STATUS_DISPLAY[status]
  return display ? i18n.t(display.label) : status
}

const TABLE_COLUMNS: readonly TranslationKey[] = [
  'militia.list.columns.index',
  'militia.list.columns.code',
  'militia.list.columns.fullName',
  'militia.list.columns.unit',
  'militia.list.columns.phone',
  'militia.list.columns.email',
  'militia.list.columns.status',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-[#E2E8F0]">
          {Array.from({ length: 7 }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div className="h-4 animate-pulse bg-[#E2E8F0] rounded w-3/4" />
            </td>
          ))}
          <td className="px-6 py-4">
            <div className="flex justify-center gap-2">
              <div className="h-8 w-8 animate-pulse bg-[#E2E8F0] rounded-lg" />
              <div className="h-8 w-8 animate-pulse bg-[#E2E8F0] rounded-lg" />
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  )
}

function FilterSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: readonly FilterOption[]
}) {
  const { t } = useTranslation()
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none w-full pl-3 pr-8 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white cursor-pointer text-[#0F172A]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{t(o.label)}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
    </div>
  )
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportMilitiaCsv(items: MilitiaSearchResult[]) {
  const headers = [
    i18n.t('militia.list.columns.code'),
    i18n.t('militia.list.columns.fullName'),
    i18n.t('militia.list.columns.unit'),
    i18n.t('militia.list.columns.rank'),
    i18n.t('militia.list.columns.phone'),
    i18n.t('militia.list.columns.status'),
  ]
  const rows = items.map((m) => [
    m.militiaCode ?? m.id,
    m.fullName,
    m.unitCode,
    m.rank ?? '',
    m.phone ?? '',
    statusText(m.status),
  ])
  exportCsv(headers, rows, `danh-sach-dqtv-${todayInVietnam()}.csv`)
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MilitiaListProps {
  onViewProfile?: (id: string) => void
}

const LIMIT = 10

export function MilitiaList({ onViewProfile }: MilitiaListProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage]               = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [unitFilter, setUnitFilter]     = useState('')
  const [editTarget, setEditTarget]     = useState<MilitiaListItem | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(searchInput)
      setPage(1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [statusFilter, unitFilter])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['militia-list', debouncedQ, statusFilter, unitFilter, page],
    queryFn: () => searchMilitia({
      q: debouncedQ || undefined,
      status: statusFilter || undefined,
      unitCode: unitFilter || undefined,
      page,
      limit: LIMIT,
    }),
    placeholderData: (prev) => prev,
  })

  // Separate query for export — fetch all matching rows (max 1000)
  const { refetch: fetchAllForExport, isFetching: isExporting } = useQuery({
    queryKey: ['militia-export', debouncedQ, statusFilter, unitFilter],
    queryFn: () => searchMilitia({
      q: debouncedQ || undefined,
      status: statusFilter || undefined,
      unitCode: unitFilter || undefined,
      page: 1,
      limit: 1000,
    }),
    enabled: false,
  })

  async function handleExport() {
    const result = await fetchAllForExport()
    if (result.data?.data) exportMilitiaCsv(result.data.data)
  }

  const items      = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const startIndex = (page - 1) * LIMIT
  const isFiltered = Boolean(debouncedQ || statusFilter || unitFilter)

  const pageButtons = (() => {
    const pages: number[] = []
    const start = Math.max(1, page - 2)
    const end   = Math.min(totalPages, start + 4)
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  })()

  function handleViewProfile(id: string) {
    if (onViewProfile) {
      onViewProfile(id)
    } else {
      navigate(`/militia/${id}`)
    }
  }

  return (
    <>
    <div className="space-y-6" data-testid="militia-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('militia.list.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('militia.list.header.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#64748B] rounded-lg hover:bg-[#F8FAFC] flex items-center gap-2 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <FileDown size={16} />
            {t(isExporting ? 'common.actions.exporting' : 'common.actions.export')}
          </button>
          <button
            onClick={() => navigate('/militia/new')}
            className="bg-[#2E7D32] text-white hover:bg-[#1B5E20] rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            data-testid="add-militia-btn"
          >
            <Plus size={16} />
            {t('militia.list.header.add')}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-[#C62828]" />
          <h3 className="text-sm font-semibold text-[#0F172A]">{t('militia.list.filters.title')}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="militia-search" className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">
              {t('common.actions.search')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" size={16} />
              <input
                id="militia-search"
                type="text"
                data-testid="militia-search-input"
                placeholder={t('militia.list.filters.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A] placeholder-[#64748B]"
              />
            </div>
          </div>
          <div>
            <label htmlFor="militia-unit-filter" className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">
              {t('militia.list.filters.unit')}
            </label>
            <FilterSelect id="militia-unit-filter" value={unitFilter} onChange={setUnitFilter} options={UNIT_OPTIONS} />
          </div>
          <div>
            <label htmlFor="militia-status-filter" className="block text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">
              {t('militia.list.filters.status')}
            </label>
            <FilterSelect id="militia-status-filter" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {describeApiError(error, { fallback: 'militia.list.load.error' })}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <tr>
                {TABLE_COLUMNS.map((column) => (
                  <th key={column} className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">
                    {t(column)}
                  </th>
                ))}
                <th className="px-6 py-3 text-center text-xs font-medium text-[#64748B] uppercase tracking-wide">
                  {t('militia.list.columns.actions')}
                </th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton />
            ) : items.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={8}>
                    <div className="py-16 flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-[#F8FAFC] rounded-full flex items-center justify-center mb-4 border border-[#E2E8F0]">
                        <Users size={28} className="text-[#64748B]" />
                      </div>
                      <p className="text-sm font-medium text-[#0F172A] mb-1">
                        {t(isFiltered ? 'militia.list.empty.noMatch' : 'militia.list.empty.noData')}
                      </p>
                      <p className="text-xs text-[#64748B]">
                        {t(isFiltered ? 'militia.list.empty.noMatchHint' : 'militia.list.empty.noDataHint')}
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-[#E2E8F0]">
                {items.map((militia, index) => {
                  const display = STATUS_DISPLAY[militia.status]
                  return (
                    <tr key={militia.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-6 py-4 text-sm text-[#64748B]">{startIndex + index + 1}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-[#1F3A5F]">{militia.militiaCode ?? militia.id}</td>
                      <td className="px-6 py-4 text-sm font-medium text-[#0F172A]">{militia.fullName}</td>
                      <td className="px-6 py-4 text-sm text-[#64748B]">{militia.unitCode}</td>
                      <td className="px-6 py-4 text-sm text-[#64748B]">{militia.phone ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-[#64748B]">{militia.email ?? '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${display?.className ?? UNKNOWN_STATUS_CLASS}`}>
                          {display ? t(display.label) : militia.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewProfile(militia.id)}
                            className="p-2 hover:bg-red-50 text-[#64748B] hover:text-[#C62828] rounded-lg transition-colors"
                            title={t('common.actions.view')}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => getMilitiaById(militia.id).then(setEditTarget)}
                            className="p-2 hover:bg-red-50 text-[#64748B] hover:text-[#C62828] rounded-lg transition-colors"
                            title={t('common.actions.edit')}
                          >
                            <Edit size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            )}
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
          <div className="text-sm text-[#64748B]" data-testid="militia-page-summary">
            {total > 0 ? (
              <Trans
                i18nKey="militia.list.pagination.range"
                values={{ from: startIndex + 1, to: Math.min(startIndex + LIMIT, total), total }}
                components={{ strong: <span className="font-semibold text-[#0F172A]" /> }}
              />
            ) : (
              t('militia.list.pagination.none')
            )}
          </div>
          <div className="flex gap-2">
            <button
              data-testid="prev-page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-[#E2E8F0] rounded-lg bg-white text-sm font-medium text-[#64748B] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F8FAFC] transition-colors"
            >
              {t('militia.list.pagination.previous')}
            </button>
            {pageButtons.map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  page === p
                    ? 'bg-[#C62828] text-white'
                    : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              data-testid="next-page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-[#E2E8F0] rounded-lg bg-white text-sm font-medium text-[#64748B] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F8FAFC] transition-colors"
            >
              {t('militia.list.pagination.next')}
            </button>
          </div>
        </div>
      </div>
    </div>

    {editTarget && (
      <MilitiaEditModal
        open
        id={editTarget.id}
        profile={editTarget}
        onClose={() => setEditTarget(null)}
      />
    )}
    </>
  )
}

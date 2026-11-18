import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, Search, ChevronLeft, ChevronRight,
  PlusCircle, Edit3, Trash2, LogIn, LogOut, Eye, Download,
} from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useTranslation } from 'react-i18next'
import { auditApi } from '@/api/audit'
import { useRbac } from '@/hooks/useRbac'
import { describeApiError } from '@/lib/api-error'
import { downloadExcelReport } from '@/utils/export-utils'

// Actions are `${METHOD}:${entityType}` (audit interceptor); style them by their verb
const ACTION_ICONS: Record<string, React.ElementType> = {
  POST:   PlusCircle,
  CREATE: PlusCircle,
  PUT:    Edit3,
  PATCH:  Edit3,
  UPDATE: Edit3,
  DELETE: Trash2,
  LOGIN:  LogIn,
  LOGOUT: LogOut,
  READ:   Eye,
  VIEW:   Eye,
}

const CREATE_STYLE = { badge: 'bg-green-100 text-[#2E7D32]', icon: 'text-[#2E7D32]' }
const UPDATE_STYLE = { badge: 'bg-blue-100 text-blue-700', icon: 'text-blue-600' }
const READ_STYLE = { badge: 'bg-yellow-100 text-yellow-700', icon: 'text-yellow-600' }

const ACTION_COLORS: Record<string, { badge: string; icon: string }> = {
  POST:   CREATE_STYLE,
  CREATE: CREATE_STYLE,
  PUT:    UPDATE_STYLE,
  PATCH:  UPDATE_STYLE,
  UPDATE: UPDATE_STYLE,
  DELETE: { badge: 'bg-red-100 text-[#C62828]',   icon: 'text-[#C62828]' },
  LOGIN:  { badge: 'bg-purple-100 text-purple-700', icon: 'text-purple-600' },
  LOGOUT: { badge: 'bg-gray-100 text-[#64748B]',  icon: 'text-[#64748B]' },
  READ:   READ_STYLE,
  VIEW:   READ_STYLE,
}

const DEFAULT_STYLE = { badge: 'bg-gray-100 text-[#64748B]', icon: 'text-[#64748B]' }

const actionVerb = (action: string) => action.split(':')[0].toUpperCase()

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '∅'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// "field: before → after" for up to three changed fields
function summarizeChange(before: unknown, after: unknown): string | null {
  const b = isRecord(before) ? before : {}
  const a = isRecord(after) ? after : {}
  const changed = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (key) => JSON.stringify(b[key]) !== JSON.stringify(a[key]),
  )
  if (changed.length === 0) return null
  const shown = changed.slice(0, 3).map((key) => `${key}: ${formatValue(b[key])} → ${formatValue(a[key])}`)
  return shown.join('; ') + (changed.length > 3 ? '; …' : '')
}

export function ActivityLogPage() {
  const { t } = useTranslation()
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo]     = useState('')
  const [exportAction, setExportAction] = useState('')
  const [isExporting, setIsExporting]   = useState(false)
  const { hasRole } = useRbac()
  // GET /audit/export is system_admin only
  const isAdmin = hasRole('system_admin')
  const LIMIT = 20

  async function handleExport() {
    if (!exportFrom || !exportTo) {
      toast.error(t('audit.activityLog.export.rangeRequired'))
      return
    }
    toast.warning(t('audit.activityLog.export.sensitiveWarning'))
    try {
      await downloadExcelReport(
        () => auditApi.exportXlsx({ from: exportFrom, to: exportTo, action: exportAction }),
        `nhat-ky-kiem-toan-${exportFrom}-${exportTo}.xlsx`,
        () => setIsExporting(true),
        () => setIsExporting(false),
      )
    } catch (err) {
      // GET /audit/export codes (audit.controller.ts exportAuditLog): errors.audit.export.<code>
      toast.error(describeApiError(err, { scope: 'audit.export', fallback: 'audit.activityLog.export.error' }))
    }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn: () => auditApi.list({ page, limit: LIMIT, search }),
    placeholderData: (prev) => prev,
  })

  const entries    = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="activity-log-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">{t('audit.activityLog.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('audit.activityLog.header.subtitle')}</p>
        </div>
        {isAdmin && (
          <button
            onClick={handleExport}
            disabled={isExporting}
            data-testid="export-audit-btn"
            className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            {isExporting ? t('common.actions.exporting') : t('audit.activityLog.export.button')}
          </button>
        )}
      </div>

      {/* Export filter (admin only) */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
          <p className="text-sm font-medium text-[#0F172A] mb-3">{t('audit.activityLog.export.filterTitle')}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label htmlFor="export-from" className="text-sm text-[#64748B]">{t('audit.activityLog.export.from')}</label>
              <input
                id="export-from"
                type="date"
                value={exportFrom}
                onChange={e => setExportFrom(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                data-testid="export-from"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="export-to" className="text-sm text-[#64748B]">{t('audit.activityLog.export.to')}</label>
              <input
                id="export-to"
                type="date"
                value={exportTo}
                min={exportFrom || undefined}
                onChange={e => setExportTo(e.target.value)}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                data-testid="export-to"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="export-action" className="text-sm text-[#64748B]">{t('audit.activityLog.export.action')}</label>
              {/* Matched exactly by the server, e.g. PATCH:militia */}
              <input
                id="export-action"
                type="text"
                value={exportAction}
                onChange={e => setExportAction(e.target.value)}
                placeholder={t('audit.activityLog.export.actionPlaceholder')}
                className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" size={18} />
            <input
              type="text"
              placeholder={t('audit.activityLog.search.placeholder')}
              aria-label={t('audit.activityLog.search.label')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-[#1F3A5F] text-sm text-[#0F172A]"
              data-testid="audit-search"
            />
          </div>
        </div>
      </div>

      {isError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
          {t('audit.activityLog.list.loadError')}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[#64748B] text-sm">{t('common.states.loading')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('audit.activityLog.table.time')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('audit.activityLog.table.actor')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('audit.activityLog.table.action')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('audit.activityLog.table.entity')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('audit.activityLog.table.details')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('audit.activityLog.table.ip')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#64748B]">
                        <FileText size={32} className="mx-auto mb-2 text-[#E2E8F0]" />
                        {t('audit.activityLog.list.empty')}
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => {
                      const verb = actionVerb(entry.action)
                      const actionStyle = ACTION_COLORS[verb] ?? DEFAULT_STYLE
                      const ActionIcon = ACTION_ICONS[verb] ?? FileText
                      const change = summarizeChange(entry.beforeJson, entry.afterJson)
                      return (
                        <tr key={entry.id} data-testid={`audit-row-${entry.id}`} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-6 py-3 text-sm text-[#64748B] whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-6 py-3 text-sm font-medium text-[#0F172A]">
                            {entry.actorName ?? (entry.actorId ? entry.actorId : t('audit.activityLog.list.systemActor'))}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1.5">
                              <ActionIcon size={13} className={actionStyle.icon} aria-hidden="true" />
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionStyle.badge}`}>
                                {entry.action}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm text-[#64748B]">{entry.entityType ?? t('common.states.none')}</td>
                          <td className="px-6 py-3 text-sm text-[#64748B] max-w-xs truncate" title={change ?? undefined}>{change ?? t('common.states.none')}</td>
                          <td className="px-6 py-3 text-xs text-[#64748B] font-mono">{entry.ipAddress ?? t('common.states.none')}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]">
                <Trans
                  t={t}
                  i18nKey="audit.activityLog.list.total"
                  values={{ total }}
                  components={{ strong: <span className="font-medium text-[#0F172A]" /> }}
                />
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label={t('common.pagination.previous')}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-[#0F172A] font-medium">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

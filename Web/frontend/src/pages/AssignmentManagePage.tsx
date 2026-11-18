import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trans, useTranslation } from 'react-i18next'
import { Search, Plus, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  getAssignments,
  createAssignment,
  removeAssignment,
  getCaOfficers,
  getAvailableDqtv,
  type UserRow,
} from '@/api/assignments'
import { useRbac } from '@/hooks/useRbac'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'

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

// DD/MM/YYYY, or null when there is no valid day
function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function roleBadgeKey(role: string): TranslationKey {
  if (role === 'ca_officer' || role === 'police_ward') return 'users.assignments.roleBadge.ward'
  if (role === 'police_area' || role === 'ca_area') return 'users.assignments.roleBadge.area'
  return 'users.assignments.roleBadge.other'
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
  const { t } = useTranslation()
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

  // One POST per member; allSettled never rejects, so every outcome arrives in onSuccess
  const addMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((dqtvUserId) => createAssignment(caUserId, dqtvUserId)),
      )
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      return { succeeded: results.length - failures.length, failed: failures.length, firstFailure: failures[0]?.reason }
    },
    onSuccess: ({ succeeded, failed, firstFailure }) => {
      if (succeeded > 0) toast.success(t('users.assignments.add.success', { count: succeeded }))
      if (failed > 0) {
        const reason = describeApiError(firstFailure, {
          scope: 'assignments.create',
          fallback: 'users.assignments.add.reasonFallback',
        })
        toast.error(t('users.assignments.add.partialError', { count: failed, reason }))
      }
      // A failure usually means the list is stale (e.g. already assigned elsewhere): refresh either way
      queryClient.invalidateQueries({ queryKey: ['assignments', caUserId] })
      queryClient.invalidateQueries({ queryKey: ['ca-officers'] })
      onAdded()
      onClose()
    },
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
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const submitLabel = addMutation.isPending
    ? t('users.assignments.add.pending')
    : selected.size > 0
      ? t('users.assignments.add.submitCount', { count: selected.size })
      : t('users.assignments.add.submit')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] rounded-t-xl">
          <h2 id={titleId} className="text-lg font-semibold text-[#0F172A]">
            {t('users.assignments.add.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[#E2E8F0] text-[#64748B] transition-colors"
            aria-label={t('common.actions.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-[#E2E8F0]">
          <p className="text-sm text-[#64748B] mb-2">
            <Trans
              t={t}
              i18nKey="users.assignments.add.assignee"
              values={{ name: caName }}
              components={{ strong: <strong className="text-[#0F172A]" /> }}
            />
          </p>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              ref={firstRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('users.assignments.add.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />
              ))}
            </div>
          ) : available.length === 0 ? (
            <p className="text-sm text-[#64748B] py-4 text-center">
              {debouncedSearch ? t('users.assignments.add.noResults') : t('users.assignments.add.allAssigned')}
            </p>
          ) : (
            available.map((m) => {
              // CreateAssignmentDto.dqtvUserId is a required UUID: a member without an account cannot be assigned
              const userId = m.userId
              const hintId = `dqtv-no-account-${m.id}`
              return (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 py-2.5 rounded-lg px-2 transition-colors ${
                    userId ? 'cursor-pointer hover:bg-[#F8FAFC]' : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={userId !== null && selected.has(userId)}
                    disabled={userId === null}
                    aria-describedby={userId === null ? hintId : undefined}
                    onChange={() => {
                      if (userId !== null) toggle(userId)
                    }}
                    className="w-4 h-4 accent-[#C62828]"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-[#0F172A]">{m.fullName}</span>
                    {userId === null && (
                      <span id={hintId} className="block text-xs text-[#64748B]">
                        {t('users.assignments.add.noAccount')}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-[#64748B]">{m.unitCode}</span>
                </label>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] rounded-b-xl">
          <button
            onClick={onClose}
            className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            data-testid="add-dqtv-submit"
            disabled={selected.size === 0 || addMutation.isPending}
            onClick={() => addMutation.mutate(Array.from(selected))}
            className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AssignmentManagePage ──────────────────────────────────────

export function AssignmentManagePage() {
  const { t } = useTranslation()
  const { can, hasRole, user } = useRbac()
  const [selectedCa, setSelectedCa] = useState<UserRow | null>(null)
  const [caSearch, setCaSearch] = useState('')
  const [caPage, setCaPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const debouncedCaSearch = useDebounce(caSearch, 300)
  const CA_PAGE_SIZE = 10
  const queryClient = useQueryClient()

  // GET /admin/users (the officer list) is system_admin/office_staff only, and GET /assignments
  // answers every CA role with its own list (assignments.service.ts listByCa): only a system
  // admin picks an officer; every other viewer is the officer
  const canPickOfficer = hasRole('system_admin')
  // POST and DELETE /assignments — assignments.controller.ts
  const canManage = can.manageAssignments
  const self: UserRow | null =
    !canPickOfficer && user ? { id: user.id, fullName: user.fullName, role: user.role ?? '', unitScope: user.unitScope } : null
  const officer = canPickOfficer ? selectedCa : self

  const {
    data: caOfficers = [],
    isLoading: caLoading,
    isError: caError,
    error: caLoadError,
  } = useQuery({
    queryKey: ['ca-officers'],
    queryFn: getCaOfficers,
    enabled: canPickOfficer,
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
    error: assignLoadError,
  } = useQuery({
    queryKey: ['assignments', officer?.id],
    queryFn: () => getAssignments(officer!.id),
    enabled: !!officer,
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeAssignment(id),
    onSuccess: () => {
      toast.success(t('users.assignments.remove.success'))
      setDeletingId(null)
    },
    onError: (err) =>
      toast.error(describeApiError(err, { scope: 'assignments.remove', fallback: 'users.assignments.remove.error' })),
    // Refresh either way: a failed removal usually means the list is stale
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', officer?.id] })
      queryClient.invalidateQueries({ queryKey: ['ca-officers'] })
    },
  })

  const handleCaSelect = useCallback((ca: UserRow) => {
    setSelectedCa(ca)
    setDeletingId(null)
  }, [])

  return (
    <div data-testid="assignment-manage-page" className="p-6 space-y-6 bg-[#F8FAFC] min-h-full">
      {/* Heading */}
      <div>
        <p className="text-xs text-[#64748B] mb-1">{t('users.assignments.page.breadcrumb')}</p>
        <h1 className="text-2xl font-bold text-[#0F172A]">{t('users.assignments.page.title')}</h1>
      </div>

      {/* Mobile guard */}
      <div className="md:hidden bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="text-sm text-amber-800">{t('users.assignments.page.desktopOnly')}</p>
      </div>

      {/* Main split panel (desktop only) */}
      <div className="hidden md:flex gap-0 border border-[#E2E8F0] rounded-xl bg-white overflow-hidden min-h-[560px]">
        {/* Left panel — CA list (35%), for a system admin only */}
        {canPickOfficer && (
          <div className="w-[35%] border-r border-[#E2E8F0] flex flex-col">
            <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">{t('users.assignments.officers.heading')}</p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  aria-label={t('users.assignments.officers.searchLabel')}
                  value={caSearch}
                  onChange={(e) => { setCaSearch(e.target.value); setCaPage(1) }}
                  placeholder={t('users.assignments.officers.searchPlaceholder')}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-[#0F172A]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {caLoading ? (
                <div className="space-y-1 p-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-13 bg-[#F8FAFC] rounded animate-pulse" />
                  ))}
                </div>
              ) : caError ? (
                <div role="alert" className="m-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-[#C62828]">
                  <p className="font-medium">{t('users.assignments.officers.loadError')}</p>
                  <p className="mt-0.5">
                    {describeApiError(caLoadError, { scope: 'admin', fallback: 'users.assignments.page.retryLater' })}
                  </p>
                </div>
              ) : paged.length === 0 ? (
                <p className="text-sm text-[#64748B] text-center py-8">{t('users.assignments.officers.empty')}</p>
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
                          ? 'border-[#C62828] bg-red-50'
                          : 'border-transparent hover:bg-[#F8FAFC]'
                      }`}
                      style={{ minHeight: 52 }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: isSelected ? '#C62828' : '#1F3A5F' }}
                      >
                        {initials(ca.fullName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-[#C62828]' : 'text-[#0F172A]'}`}>{ca.fullName}</p>
                        <p className="text-xs text-[#64748B]">{t(roleBadgeKey(ca.role))}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* CA pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC]">
                <button
                  onClick={() => setCaPage((p) => Math.max(1, p - 1))}
                  disabled={caPage === 1}
                  className="p-1.5 rounded hover:bg-[#E2E8F0] disabled:opacity-40 transition-colors"
                  aria-label={t('common.pagination.previous')}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-[#64748B]">{caPage} / {totalPages}</span>
                <button
                  onClick={() => setCaPage((p) => Math.min(totalPages, p + 1))}
                  disabled={caPage === totalPages}
                  className="p-1.5 rounded hover:bg-[#E2E8F0] disabled:opacity-40 transition-colors"
                  aria-label={t('common.pagination.next')}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Right panel — assignments (65%, the whole width for an officer viewing their own) */}
        <div className="flex-1 flex flex-col">
          {!officer ? (
            <div className="flex-1 flex items-center justify-center text-[#64748B]">
              <p className="text-sm">{t('users.assignments.officers.pickPrompt')}</p>
            </div>
          ) : (
            <>
              {!canPickOfficer && (
                <p className="px-6 py-3 text-sm text-blue-800 bg-blue-50 border-b border-blue-100">
                  {t('users.assignments.self.notice')}
                </p>
              )}

              {/* Right panel header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <div>
                  <p className="font-semibold text-[#0F172A]">{officer.fullName}</p>
                  <p className="text-xs text-[#64748B]">{t(roleBadgeKey(officer.role))}</p>
                </div>
                <div className="flex items-center gap-3">
                  {!assignLoading && !assignError && (
                    <span className="text-sm text-[#64748B]">
                      {t('users.assignments.list.count', { count: assignments.length })}
                    </span>
                  )}
                  {canManage && (
                    <button
                      data-testid="add-dqtv-btn"
                      onClick={() => setShowAddModal(true)}
                      className="flex items-center gap-1.5 bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-3 py-1.5 text-sm transition-colors"
                    >
                      <Plus size={16} />
                      {t('users.assignments.list.addButton')}
                    </button>
                  )}
                </div>
              </div>

              {/* Right panel body */}
              <div className="flex-1 overflow-y-auto">
                {assignLoading ? (
                  <div className="space-y-3 p-6">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 bg-[#F8FAFC] rounded animate-pulse" />
                    ))}
                  </div>
                ) : assignError ? (
                  <div role="alert" className="m-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-[#C62828]">
                    <p>{t('users.assignments.list.loadError')}</p>
                    <p className="mt-0.5">
                      {/* listByCa refuses with 403 forbidden, which the error table does not hold */}
                      {describeApiError(assignLoadError, {
                        scope: 'assignments.list',
                        statuses: { 403: 'errors.assignments.list.insufficient_role' },
                        fallback: 'users.assignments.page.retryLater',
                      })}
                    </p>
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
                    <p className="text-sm text-[#64748B]">{t('users.assignments.list.empty')}</p>
                    {canManage && (
                      <button
                        data-testid="add-dqtv-empty-btn"
                        onClick={() => setShowAddModal(true)}
                        className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm transition-colors"
                      >
                        {t('users.assignments.list.addNow')}
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                        <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.assignments.list.columns.name')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.assignments.list.columns.unit')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.assignments.list.columns.assignedAt')}</th>
                        {canManage && <th className="px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => {
                        const isDeleting = deletingId === a.id
                        return (
                          <tr
                            key={a.id}
                            data-testid={`assignment-row-${a.id}`}
                            className={`border-b border-[#E2E8F0] transition-colors ${isDeleting ? 'bg-red-50' : 'hover:bg-[#F8FAFC]'}`}
                          >
                            <td className="px-6 py-3 font-medium text-[#0F172A]">{a.dqtvFullName}</td>
                            <td className="px-4 py-3 text-[#64748B]">{a.dqtvUnitCode}</td>
                            <td className="px-4 py-3 text-[#64748B]">{formatDate(a.assignedAt) ?? t('common.states.none')}</td>
                            {canManage && (
                              <td className="px-4 py-3">
                                {isDeleting ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      data-testid={`confirm-delete-${a.id}`}
                                      onClick={() => removeMutation.mutate(a.id)}
                                      disabled={removeMutation.isPending}
                                      className="px-2 py-1 text-xs text-white bg-[#C62828] rounded hover:bg-[#A91D1D] disabled:opacity-50 transition-colors"
                                    >
                                      {t('users.assignments.remove.confirm')}
                                    </button>
                                    <button
                                      onClick={() => setDeletingId(null)}
                                      className="px-2 py-1 text-xs text-[#64748B] border border-[#E2E8F0] rounded hover:bg-[#F8FAFC] transition-colors"
                                    >
                                      {t('common.actions.cancel')}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    data-testid={`delete-btn-${a.id}`}
                                    onClick={() => setDeletingId(a.id)}
                                    aria-label={t('users.assignments.remove.label', { name: a.dqtvFullName })}
                                    className="p-2 text-[#64748B] hover:text-[#C62828] hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </td>
                            )}
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
      {showAddModal && officer && canManage && (
        <AddDqtvModal
          caUserId={officer.id}
          caName={officer.fullName}
          onClose={() => setShowAddModal(false)}
          onAdded={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}

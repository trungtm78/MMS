import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRbac } from '@/hooks/useRbac'
import client from '@/api/client'
import type { TranslationKey } from '@/i18n/types'
import { describeApiError } from '@/lib/api-error'
import { Users, Plus, ChevronDown, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'

/** organization-unit.entity.ts as GET /organization/structure answers it */
interface OrganizationUnit {
  id: string
  type: 'tieu_doi' | 'trung_doi' | 'dai_doi'
  name: string
  commanderId: string | null
  parentId: string | null
  capacity: number
  // Not sent today. A backend count may add it: a number, or BIGINT text from COUNT(*)
  memberCount?: number | string | null
  // Not sent today either: the entity holds only commanderId
  commanderName?: string | null
  // One level deep today (relations: ['children']); rendered to whatever depth arrives
  children?: OrganizationUnit[]
}

const TYPE_LABELS = {
  dai_doi: 'organization.unitType.dai_doi',
  trung_doi: 'organization.unitType.trung_doi',
  tieu_doi: 'organization.unitType.tieu_doi',
} as const satisfies Record<OrganizationUnit['type'], TranslationKey>

// Largest to smallest, the order of the type select
const UNIT_TYPES: readonly OrganizationUnit['type'][] = ['dai_doi', 'trung_doi', 'tieu_doi']

const TYPE_BADGE_CLASS: Record<OrganizationUnit['type'], string> = {
  dai_doi: 'bg-red-100 text-[#C62828]',
  trung_doi: 'bg-blue-100 text-blue-700',
  tieu_doi: 'bg-purple-100 text-purple-700',
}

const INPUT_CLASS = 'w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#C62828]/30'

/** The unit's member count, or null when the structure does not carry one */
function memberCountOf(unit: OrganizationUnit): number | null {
  if (unit.memberCount === undefined || unit.memberCount === null) return null
  const count = Number(unit.memberCount)
  return Number.isFinite(count) ? count : null
}

function CapacityBar({ actual, capacity }: { actual: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((actual / capacity) * 100)) : 0
  const isOk = actual >= capacity
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[80px]">
        <div
          className={`h-2 rounded-full transition-all ${isOk ? 'bg-[#2E7D32]' : 'bg-[#C62828]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold ${isOk ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>
        {actual}/{capacity}
      </span>
    </div>
  )
}

function UnitCard({ unit, depth = 0 }: { unit: OrganizationUnit; depth?: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(depth < 1)
  const children = unit.children ?? []
  const hasChildren = children.length > 0
  const members = memberCountOf(unit)

  return (
    <div className={`bg-white rounded-xl border border-[#E2E8F0] overflow-hidden ${depth > 0 ? 'ml-6' : ''}`}>
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors"
        onClick={() => hasChildren && setExpanded((e) => !e)}
        data-testid={`unit-card-${unit.id}`}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={16} className="text-[#64748B] shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-[#64748B] shrink-0" />
          )
        ) : (
          <div className="w-4 shrink-0" />
        )}
        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${TYPE_BADGE_CLASS[unit.type]}`}>
          {t(TYPE_LABELS[unit.type])}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0F172A]">{unit.name}</p>
          {unit.commanderName && (
            <p className="text-xs text-[#64748B]">{t('organization.tree.unit.commander', { name: unit.commanderName })}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {members === null ? (
            // Without a member count there is no ratio to draw: the capacity alone
            <>
              <p className="text-xs font-semibold text-[#0F172A]">{unit.capacity}</p>
              <p className="text-xs text-[#64748B]">{t('organization.tree.unit.noMemberCount')}</p>
            </>
          ) : (
            <CapacityBar actual={members} capacity={unit.capacity} />
          )}
          <p className="text-xs text-[#64748B] mt-0.5">{t('organization.tree.unit.capacity')}</p>
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="border-t border-[#F1F5F9] p-4 space-y-3">
          {children.map((child) => (
            <UnitCard key={child.id} unit={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface AddUnitForm {
  type: OrganizationUnit['type']
  name: string
  capacity: string
}

function AddUnitModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AddUnitForm>({
    type: 'tieu_doi',
    name: '',
    capacity: '',
  })

  const createMutation = useMutation({
    // POST /organization/units — CreateUnitDto; the global ValidationPipe refuses any other
    // property, so only what this form asks is sent
    mutationFn: (data: AddUnitForm) =>
      client
        .post('/organization/units', {
          type: data.type,
          name: data.name.trim(),
          capacity: parseInt(data.capacity, 10),
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success(t('organization.addUnit.submit.success'))
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      onClose()
    },
    onError: (err) =>
      toast.error(
        describeApiError(err, {
          statuses: { 403: 'errors.common.forbidden' },
          fallback: 'organization.addUnit.submit.error',
        }),
      ),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error(t('organization.addUnit.validation.nameRequired'))
    if (!form.capacity || parseInt(form.capacity, 10) <= 0) return toast.error(t('organization.addUnit.validation.capacityInvalid'))
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">{t('organization.addUnit.form.title')}</h2>
          <button onClick={onClose} aria-label={t('common.actions.close')} className="text-[#64748B] hover:text-[#0F172A]">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="unit-type" className="block text-sm font-medium text-[#0F172A] mb-1">{t('organization.addUnit.fields.type')}</label>
            <select
              id="unit-type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as OrganizationUnit['type'] }))}
              className={INPUT_CLASS}
            >
              {UNIT_TYPES.map((type) => (
                <option key={type} value={type}>{t(TYPE_LABELS[type])}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="unit-name" className="block text-sm font-medium text-[#0F172A] mb-1">
              {t('organization.addUnit.fields.name')} <span className="text-[#C62828]" aria-hidden="true">*</span>
            </label>
            <input
              id="unit-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('organization.addUnit.placeholders.name')}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="unit-capacity" className="block text-sm font-medium text-[#0F172A] mb-1">
              {t('organization.addUnit.fields.capacity')} <span className="text-[#C62828]" aria-hidden="true">*</span>
            </label>
            <input
              id="unit-capacity"
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              placeholder={t('organization.addUnit.placeholders.capacity')}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC]"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {t(createMutation.isPending ? 'common.actions.saving' : 'organization.addUnit.form.action')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function OrganizationPage() {
  const { can } = useRbac()
  // GET /organization/structure @Roles; unit changes are system_admin only
  if (!can.viewOrganization) return <Navigate to="/forbidden" replace />
  return <OrganizationContent canManageUnits={can.manageOrganizationUnits} />
}

function OrganizationContent({ canManageUnits }: { canManageUnits: boolean }) {
  const { t } = useTranslation()
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: units = [], isLoading, isError, refetch } = useQuery<OrganizationUnit[]>({
    queryKey: ['organization'],
    queryFn: () => client.get('/organization/structure').then((r) => r.data),
  })

  const totalCapacity = units.reduce((sum, u) => sum + u.capacity, 0)
  // A total over some units only would read as the real strength: none until every unit has a count
  const counts = units.map(memberCountOf)
  const totalMembers = counts.every((count): count is number => count !== null)
    ? counts.reduce((sum, count) => sum + count, 0)
    : null

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="organization-page">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <Users size={24} className="text-[#C62828]" />
              {t('organization.page.header.title')}
            </h1>
            <p className="text-sm text-[#64748B] mt-1">{t('organization.page.header.subtitle')}</p>
          </div>
          {canManageUnits && (
            <button
              onClick={() => setShowAddModal(true)}
              data-testid="add-unit-btn"
              className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Plus size={16} />
              {t('organization.addUnit.form.action')}
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">{t('organization.page.summary.capacity')}</p>
            <p className="text-3xl font-bold text-[#0F172A]" data-testid="summary-capacity">{totalCapacity}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">{t('organization.page.summary.members')}</p>
            <p
              className={`text-3xl font-bold ${
                totalMembers === null ? 'text-[#64748B]' : totalMembers >= totalCapacity ? 'text-[#2E7D32]' : 'text-[#C62828]'
              }`}
              data-testid="summary-members"
            >
              {totalMembers === null ? t('common.states.none') : totalMembers}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <p className="text-xs text-[#64748B] uppercase tracking-wide mb-1">{t('organization.page.summary.units')}</p>
            <p className="text-3xl font-bold text-[#0F172A]" data-testid="summary-units">{units.length}</p>
          </div>
        </div>

        {/* Tree */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-[#E2E8F0] p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : isError ? (
          // A failed load is not an empty structure
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
            <p role="alert" className="text-sm text-[#C62828]">
              {t('organization.tree.load.error')}{' '}
              <button type="button" onClick={() => refetch()} className="font-medium underline">
                {t('common.actions.retry')}
              </button>
            </p>
          </div>
        ) : units.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
            <Users size={40} className="mx-auto mb-3 text-[#64748B]" />
            <p className="text-[#64748B]">{t('organization.tree.empty.title')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {units.map((unit) => (
              <UnitCard key={unit.id} unit={unit} />
            ))}
          </div>
        )}
      </div>

      {canManageUnits && showAddModal && <AddUnitModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}

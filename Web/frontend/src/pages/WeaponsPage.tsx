// Vũ khí & trang thiết bị (Web/backend/src/weapons): the register of active weapons, their
// allocations, and the kiểm kê — recorded as a counted number or weapon by weapon — with the
// history of past checks. Every endpoint admits WEAPON_STAFF_ROLES (can.manageWeapons).
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckSquare, Download, Plus, Shield } from 'lucide-react'
import { toast } from 'sonner'
import {
  MAX_CONFIRMED_COUNT,
  MAX_INVENTORY_NOTES,
  WEAPON_CONDITIONS,
  WEAPON_FIELD_MAX,
  checklistBody,
  countBody,
  hasWardScope,
  markOf,
  parseConfirmedCount,
  weaponKeys,
  weaponsApi,
  type ChecklistMark,
  type ChecklistMarks,
  type CreateWeaponBody,
  type InventoryCheckDetail,
  type InventoryCheckRecord,
  type InventoryItemRecord,
  type RecordInventoryBody,
  type WeaponCondition,
  type WeaponRecord,
} from '@/api/weapons'
import { FormAlert, FormField } from '@/components/forms/FormField'
import { Dialog } from '@/components/ui/Dialog'
import { useRbac } from '@/hooks/useRbac'
import { describeApiError, parseApiError } from '@/lib/api-error'
import { firstDayOfYearInVietnam, formatCalendarDate, todayInVietnam } from '@/lib/dates'
import { cn } from '@/lib/utils'

const conditionKey = (code: WeaponCondition) => `weapons.codes.conditions.${code}` as const

const CONDITION_BADGE: Readonly<Record<WeaponCondition, string>> = {
  good: 'bg-green-100 text-[#2E7D32]',
  damaged: 'bg-red-100 text-[#C62828]',
  maintenance: 'bg-yellow-100 text-yellow-700',
}

const PRIMARY_BUTTON =
  'rounded-lg bg-[#C62828] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#A91D1D] disabled:opacity-50'
const SECONDARY_BUTTON =
  'rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50'
const TABLE_CARD = 'overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white'
const TH = 'px-5 py-4 text-left text-xs font-semibold uppercase text-[#64748B]'
const TD = 'px-5 py-4 text-sm'
const ROW = 'border-b border-[#F1F5F9] hover:bg-[#F8FAFC]'

type Errors<F extends string> = Partial<Record<F, string>>

function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl border border-[#E2E8F0] bg-white" />
      ))}
    </div>
  )
}

function LoadError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[#C62828]">
      {message}
    </p>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-xl border border-[#E2E8F0] bg-white p-12 text-center text-sm text-[#64748B]">{message}</p>
}

function ConditionBadge({ condition }: { condition: WeaponCondition }) {
  const { t } = useTranslation()
  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', CONDITION_BADGE[condition])}>
      {t(conditionKey(condition))}
    </span>
  )
}

function DialogActions({
  onCancel,
  pending,
  disabled = false,
  idleLabel,
  pendingLabel,
}: {
  onCancel: () => void
  pending: boolean
  disabled?: boolean
  idleLabel: string
  pendingLabel: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} disabled={pending} className={SECONDARY_BUTTON}>
        {t('common.actions.cancel')}
      </button>
      <button type="submit" disabled={pending || disabled} className={PRIMARY_BUTTON}>
        {pending ? pendingLabel : idleLabel}
      </button>
    </div>
  )
}

// ── Danh mục ────────────────────────────────────────────────────────────────────

type WeaponField = 'type' | 'serialNumber' | 'acquiredAt' | 'storageLocation'

const EMPTY_WEAPON: CreateWeaponBody = {
  type: '',
  serialNumber: '',
  acquiredAt: '',
  condition: 'good',
  storageLocation: '',
}

function CreateWeaponDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<CreateWeaponBody>(EMPTY_WEAPON)
  const [errors, setErrors] = useState<Errors<WeaponField>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (body: CreateWeaponBody) => weaponsApi.create(body),
    onSuccess: () => {
      toast.success(t('weapons.catalog.create.submit.success'))
      void queryClient.invalidateQueries({ queryKey: weaponKeys.register })
      void queryClient.invalidateQueries({ queryKey: weaponKeys.report })
      onClose()
    },
    onError: (err) =>
      setFormError(
        describeApiError(err, {
          // serial_number_already_exists is the only conflict POST /weapons answers
          statuses: { 409: 'weapons.catalog.create.submit.duplicateSerial' },
          fallback: 'weapons.catalog.create.submit.error',
        }),
      ),
  })

  const update = (patch: Partial<CreateWeaponBody>, field: WeaponField | null) => {
    setDraft((current) => ({ ...current, ...patch }))
    if (field) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const body: CreateWeaponBody = {
      type: draft.type.trim(),
      serialNumber: draft.serialNumber.trim(),
      acquiredAt: draft.acquiredAt,
      condition: draft.condition,
      storageLocation: draft.storageLocation.trim(),
    }
    // CreateWeaponDto requires every one of these
    const found: Errors<WeaponField> = {}
    if (!body.type) found.type = t('weapons.catalog.create.validation.typeRequired')
    if (!body.serialNumber) found.serialNumber = t('weapons.catalog.create.validation.serialNumberRequired')
    if (!body.acquiredAt) found.acquiredAt = t('weapons.catalog.create.validation.acquiredAtRequired')
    if (!body.storageLocation) found.storageLocation = t('weapons.catalog.create.validation.storageLocationRequired')
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0) {
      toast.error(t('weapons.catalog.create.validation.summary'))
      return
    }
    create.mutate(body)
  }

  const pending = create.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }} title={t('weapons.catalog.create.dialog.title')} busy={pending}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="weapon-type" label={t('weapons.catalog.create.fields.type')} required error={errors.type}>
            {(control) => (
              <input
                {...control}
                type="text"
                maxLength={WEAPON_FIELD_MAX.type}
                placeholder={t('weapons.catalog.create.fields.typePlaceholder')}
                value={draft.type}
                onChange={(e) => update({ type: e.target.value }, 'type')}
              />
            )}
          </FormField>
          <FormField id="weapon-serial" label={t('weapons.catalog.create.fields.serialNumber')} required error={errors.serialNumber}>
            {(control) => (
              <input
                {...control}
                type="text"
                maxLength={WEAPON_FIELD_MAX.serialNumber}
                placeholder={t('weapons.catalog.create.fields.serialNumberPlaceholder')}
                value={draft.serialNumber}
                onChange={(e) => update({ serialNumber: e.target.value }, 'serialNumber')}
              />
            )}
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="weapon-condition" label={t('weapons.catalog.create.fields.condition')} required>
            {(control) => (
              <select {...control} value={draft.condition} onChange={(e) => update({ condition: e.target.value as WeaponCondition }, null)}>
                {WEAPON_CONDITIONS.map((code) => (
                  <option key={code} value={code}>{t(conditionKey(code))}</option>
                ))}
              </select>
            )}
          </FormField>
          <FormField id="weapon-acquired-at" label={t('weapons.catalog.create.fields.acquiredAt')} required error={errors.acquiredAt}>
            {(control) => (
              <input {...control} type="date" value={draft.acquiredAt} onChange={(e) => update({ acquiredAt: e.target.value }, 'acquiredAt')} />
            )}
          </FormField>
        </div>
        <FormField id="weapon-storage" label={t('weapons.catalog.create.fields.storageLocation')} required error={errors.storageLocation}>
          {(control) => (
            <input
              {...control}
              type="text"
              maxLength={WEAPON_FIELD_MAX.storageLocation}
              placeholder={t('weapons.catalog.create.fields.storageLocationPlaceholder')}
              value={draft.storageLocation}
              onChange={(e) => update({ storageLocation: e.target.value }, 'storageLocation')}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          idleLabel={t('weapons.catalog.create.submit.idle')}
          pendingLabel={t('weapons.catalog.create.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

const CATALOG_COLUMNS = ['serialNumber', 'type', 'condition', 'storageLocation', 'responsiblePerson', 'acquiredAt'] as const

function WeaponCatalogTab() {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const weapons = useQuery({ queryKey: weaponKeys.register, queryFn: weaponsApi.list })
  const none = t('common.states.none')

  let content: ReactNode
  if (weapons.isPending) content = <LoadingRows label={t('weapons.catalog.list.loading')} />
  else if (weapons.isError) content = <LoadError message={describeApiError(weapons.error, { fallback: 'weapons.catalog.list.error' })} />
  else if (weapons.data.length === 0) content = <EmptyState message={t('weapons.catalog.list.empty')} />
  else {
    content = (
      <div className={TABLE_CARD}>
        <table className="w-full">
          <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <tr>
              {CATALOG_COLUMNS.map((column) => (
                <th key={column} scope="col" className={TH}>{t(`weapons.catalog.table.${column}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weapons.data.map((w) => (
              <tr key={w.id} className={ROW} data-testid={`weapon-row-${w.id}`}>
                <td className={cn(TD, 'font-mono text-[#0F172A]')}>{w.serialNumber}</td>
                <td className={cn(TD, 'text-[#0F172A]')}>{w.type}</td>
                <td className={TD}><ConditionBadge condition={w.condition} /></td>
                <td className={cn(TD, 'text-[#64748B]')}>{w.storageLocation}</td>
                <td className={cn(TD, 'text-[#0F172A]')}>{w.responsiblePersonName ?? none}</td>
                <td className={cn(TD, 'text-[#64748B]')}>{formatCalendarDate(w.acquiredAt, none)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setAdding(true)} data-testid="add-weapon-btn" className={cn(PRIMARY_BUTTON, 'flex items-center gap-2')}>
          <Plus size={16} aria-hidden="true" />
          {t('weapons.catalog.list.addButton')}
        </button>
      </div>
      {content}
      {adding && <CreateWeaponDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

// ── Log cấp phát ────────────────────────────────────────────────────────────────

const LOG_COLUMNS = ['issuedAt', 'weapon', 'recipient', 'purpose', 'returnedAt'] as const

function AllocationLogTab() {
  const { t } = useTranslation()
  // One request: each row names its weapon and recipient, in the server's newest-first order
  const allocations = useQuery({ queryKey: weaponKeys.allocations, queryFn: weaponsApi.allocations })

  if (allocations.isPending) return <LoadingRows label={t('weapons.log.list.loading')} />
  if (allocations.isError) {
    return <LoadError message={describeApiError(allocations.error, { fallback: 'weapons.log.list.error' })} />
  }
  if (allocations.data.length === 0) return <EmptyState message={t('weapons.log.list.empty')} />

  return (
    <div className={TABLE_CARD}>
      <table className="w-full">
        <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
          <tr>
            {LOG_COLUMNS.map((column) => (
              <th key={column} scope="col" className={TH}>{t(`weapons.log.table.${column}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allocations.data.map((log) => (
            <tr key={log.id} className={ROW} data-testid={`allocation-row-${log.id}`}>
              <td className={cn(TD, 'text-[#64748B]')}>{formatCalendarDate(log.issuedAt)}</td>
              <td className="px-5 py-4">
                <p className="text-sm text-[#0F172A]">{log.weaponType}</p>
                <p className="font-mono text-xs text-[#64748B]">{log.weaponSerialNumber}</p>
              </td>
              <td className="px-5 py-4">
                <p className="text-sm text-[#0F172A]">{log.recipientName}</p>
                <p className="font-mono text-xs text-[#64748B]">{log.recipientCode}</p>
              </td>
              <td className={cn(TD, 'text-[#64748B]')}>{log.purpose}</td>
              <td className={cn(TD, 'text-[#64748B]')}>
                {log.returnedAt ? formatCalendarDate(log.returnedAt) : t('weapons.log.row.notReturned')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Kiểm kê ─────────────────────────────────────────────────────────────────────

/** A discrepancy with its sign: +1 surplus, -1 missing */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function DiscrepancyBadge({ value }: { value: number }) {
  const { t } = useTranslation()
  const badge = 'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold'
  if (value < 0) return <span className={cn(badge, 'bg-red-100 text-[#C62828]')}>{t('weapons.inventory.discrepancy.missing', { amount: -value })}</span>
  if (value > 0) return <span className={cn(badge, 'bg-yellow-100 text-yellow-700')}>{t('weapons.inventory.discrepancy.surplus', { amount: value })}</span>
  return <span className={cn(badge, 'bg-green-100 text-[#2E7D32]')}>{t('weapons.inventory.discrepancy.match')}</span>
}

/** Expected against confirmed, the discrepancy and the weapons marked not found */
function CheckSummary({ check }: { check: InventoryCheckDetail }) {
  const { t } = useTranslation()
  const missingSerials = check.items.filter((item) => item.found === false).map((item) => item.serialNumber)
  const { discrepancy } = check

  let verdict: ReactNode
  if (discrepancy < 0) {
    verdict = <p className="font-semibold text-[#C62828]">{t('weapons.inventory.summary.missing', { amount: -discrepancy })}</p>
  } else if (discrepancy > 0) {
    verdict = <p className="font-semibold text-yellow-700">{t('weapons.inventory.summary.surplus', { amount: discrepancy })}</p>
  } else verdict = <p className="font-semibold text-[#2E7D32]">{t('weapons.inventory.summary.match')}</p>

  const figures = [
    ['expected', check.expectedCount, 'text-[#0F172A]'],
    ['confirmed', check.confirmedCount, 'text-[#0F172A]'],
    ['discrepancy', signed(discrepancy), discrepancy < 0 ? 'text-[#C62828]' : discrepancy > 0 ? 'text-yellow-700' : 'text-[#2E7D32]'],
  ] as const

  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-3 gap-3">
        {figures.map(([name, value, tone]) => (
          <div key={name} data-testid={`check-summary-${name}`} className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
            <dt className="text-xs text-[#64748B]">{t(`weapons.inventory.summary.${name}`)}</dt>
            <dd className={cn('text-2xl font-bold', tone)}>{value}</dd>
          </div>
        ))}
      </dl>
      {verdict}
      {check.missingCount > 0 && (
        <p className="text-[#C62828]">
          {t('weapons.inventory.summary.notFound', { amount: check.missingCount, serials: missingSerials.join(', ') })}
        </p>
      )}
      {check.notes && (
        <div>
          <p className="text-xs text-[#64748B]">{t('weapons.inventory.summary.notes')}</p>
          <p className="whitespace-pre-line text-[#0F172A]">{check.notes}</p>
        </div>
      )}
    </div>
  )
}

type RecordMode = 'count' | 'checklist'
const RECORD_MODES: readonly RecordMode[] = ['count', 'checklist']

function Checklist({
  register,
  marks,
  onMark,
  onMarkAll,
}: {
  register: readonly WeaponRecord[]
  marks: ChecklistMarks
  onMark: (weapon: WeaponRecord, mark: ChecklistMark) => void
  onMarkAll: () => void
}) {
  const { t } = useTranslation()
  const none = t('common.states.none')
  const found = register.filter((weapon) => markOf(marks, weapon).found).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <output data-testid="inventory-found-count" className="text-sm font-semibold text-[#0F172A]">
          {t('weapons.inventory.checklist.foundCount', { found, total: register.length })}
        </output>
        {register.length > 0 && (
          <button type="button" onClick={onMarkAll} className={SECONDARY_BUTTON}>
            {t('weapons.inventory.checklist.markAll')}
          </button>
        )}
      </div>
      {register.length === 0 ? (
        <EmptyState message={t('weapons.inventory.checklist.empty')} />
      ) : (
        <div className={TABLE_CARD}>
          <table className="w-full">
            <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
              <tr>
                {(['found', 'serialNumber', 'type', 'storageLocation', 'condition', 'observedCondition'] as const).map((column) => (
                  <th key={column} scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase text-[#64748B]">
                    {t(`weapons.inventory.checklist.table.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {register.map((weapon) => {
                const mark = markOf(marks, weapon)
                return (
                  <tr key={weapon.id} data-testid={`inventory-item-${weapon.id}`} className="border-b border-[#F1F5F9]">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label={t('weapons.inventory.checklist.foundLabel', { serial: weapon.serialNumber })}
                        checked={mark.found}
                        onChange={(e) => onMark(weapon, { ...mark, found: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-sm text-[#0F172A]">{weapon.serialNumber}</td>
                    <td className="px-3 py-2 text-sm text-[#0F172A]">{weapon.type}</td>
                    <td className="px-3 py-2 text-sm text-[#64748B]">{weapon.storageLocation}</td>
                    <td className="px-3 py-2"><ConditionBadge condition={weapon.condition} /></td>
                    <td className="px-3 py-2 text-sm">
                      {mark.found ? (
                        <select
                          aria-label={t('weapons.inventory.checklist.observedLabel', { serial: weapon.serialNumber })}
                          className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-sm"
                          value={mark.observedCondition}
                          onChange={(e) => onMark(weapon, { ...mark, observedCondition: e.target.value as WeaponCondition })}
                        >
                          {WEAPON_CONDITIONS.map((code) => (
                            <option key={code} value={code}>{t(conditionKey(code))}</option>
                          ))}
                        </select>
                      ) : (
                        none
                      )}
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

function RecordInventoryDialog({ onClose, onRecorded }: { onClose: () => void; onRecorded: (check: InventoryCheckDetail) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // The checklist lists the active weapons; a 409 refetches them so it is rebuilt
  const register = useQuery({ queryKey: weaponKeys.register, queryFn: weaponsApi.list })
  const [mode, setMode] = useState<RecordMode>('count')
  const [countInput, setCountInput] = useState('')
  const [countError, setCountError] = useState<string | undefined>(undefined)
  const [marks, setMarks] = useState<Record<string, ChecklistMark>>({})
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const record = useMutation({
    mutationFn: (body: RecordInventoryBody) => weaponsApi.recordInventory(body),
    onSuccess: (check) => {
      toast.success(t('weapons.inventory.record.submit.success'))
      void queryClient.invalidateQueries({ queryKey: weaponKeys.checks })
      onRecorded(check)
    },
    onError: (err) => {
      // inventory_register_changed: the active weapons changed meanwhile
      if (parseApiError(err).status === 409) void queryClient.invalidateQueries({ queryKey: weaponKeys.register })
      setFormError(
        describeApiError(err, {
          scope: 'weapons.inventory',
          statuses: { 403: 'weapons.inventory.record.submit.forbidden' },
          fallback: 'weapons.inventory.record.submit.error',
        }),
      )
    },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (mode === 'count') {
      const parsed = parseConfirmedCount(countInput)
      if ('error' in parsed) {
        setCountError(
          t(parsed.error === 'required' ? 'weapons.inventory.record.validation.countRequired' : 'weapons.inventory.record.validation.countInvalid'),
        )
        return
      }
      record.mutate(countBody(parsed.value, notes))
    } else if (register.isSuccess) {
      record.mutate(checklistBody(register.data, marks, notes))
    }
  }

  const markAll = () => {
    const weapons = register.data ?? []
    setMarks((current) => ({
      ...current,
      ...Object.fromEntries(weapons.map((weapon) => [weapon.id, { ...markOf(current, weapon), found: true }])),
    }))
  }

  let checklist: ReactNode = null
  if (mode === 'checklist') {
    if (register.isPending) checklist = <LoadingRows label={t('weapons.inventory.checklist.loading')} />
    else if (register.isError) {
      checklist = <LoadError message={describeApiError(register.error, { fallback: 'weapons.inventory.checklist.error' })} />
    } else {
      checklist = (
        <Checklist
          register={register.data}
          marks={marks}
          onMark={(weapon, mark) => setMarks((current) => ({ ...current, [weapon.id]: mark }))}
          onMarkAll={markAll}
        />
      )
    }
  }

  const pending = record.isPending

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={t('weapons.inventory.record.dialog.title')}
      busy={pending}
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-[#0F172A]">{t('weapons.inventory.record.mode.legend')}</legend>
          <div className="flex flex-wrap gap-4">
            {RECORD_MODES.map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm text-[#0F172A]">
                <input
                  type="radio"
                  name="inventory-mode"
                  value={code}
                  checked={mode === code}
                  onChange={() => {
                    setMode(code)
                    setFormError(null)
                  }}
                />
                {t(`weapons.inventory.record.mode.${code}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {mode === 'count' && (
          <FormField
            id="inventory-confirmed-count"
            label={t('weapons.inventory.record.fields.confirmedCount')}
            required
            hint={register.isSuccess ? t('weapons.inventory.record.fields.confirmedCountHint', { total: register.data.length }) : undefined}
            error={countError}
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_CONFIRMED_COUNT}
                step={1}
                value={countInput}
                onChange={(e) => {
                  setCountInput(e.target.value)
                  setCountError(undefined)
                }}
              />
            )}
          </FormField>
        )}
        {checklist}
        <FormField id="inventory-notes" label={t('weapons.inventory.record.fields.notes')}>
          {(control) => (
            <textarea
              {...control}
              className={cn(control.className, 'resize-none')}
              rows={3}
              maxLength={MAX_INVENTORY_NOTES}
              placeholder={t('weapons.inventory.record.fields.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </FormField>
        <DialogActions
          onCancel={onClose}
          pending={pending}
          disabled={mode === 'checklist' && !register.isSuccess}
          idleLabel={t('weapons.inventory.record.submit.idle')}
          pendingLabel={t('weapons.inventory.record.submit.pending')}
        />
      </form>
    </Dialog>
  )
}

function ItemResult({ found }: { found: boolean | null }) {
  const { t } = useTranslation()
  if (found === true) return <span className="font-medium text-[#2E7D32]">{t('weapons.inventory.detail.result.found')}</span>
  if (found === false) return <span className="font-semibold text-[#C62828]">{t('weapons.inventory.detail.result.missing')}</span>
  return <span className="text-[#94A3B8]">{t('weapons.inventory.detail.result.notItemised')}</span>
}

function ObservedCondition({ item }: { item: InventoryItemRecord }) {
  const { t } = useTranslation()
  if (item.found !== true) return <>{t('common.states.none')}</>
  const observed = item.observedCondition ?? item.condition
  if (observed === item.condition) return <>{t(conditionKey(observed))}</>
  return (
    <span className="font-medium text-yellow-700">
      {t('weapons.inventory.detail.conditionChanged', { from: t(conditionKey(item.condition)), to: t(conditionKey(observed)) })}
    </span>
  )
}

const DETAIL_COLUMNS = ['serialNumber', 'type', 'storageLocation', 'holder', 'condition', 'result', 'observedCondition'] as const

function InventoryCheckDialog({ record, onClose }: { record: InventoryCheckRecord; onClose: () => void }) {
  const { t } = useTranslation()
  const none = t('common.states.none')
  const detail = useQuery({ queryKey: weaponKeys.check(record.id), queryFn: () => weaponsApi.getInventoryCheck(record.id) })

  let content: ReactNode
  if (detail.isPending) content = <LoadingRows label={t('weapons.inventory.detail.loading')} />
  else if (detail.isError) {
    content = <LoadError message={describeApiError(detail.error, { scope: 'weapons.inventory', fallback: 'weapons.inventory.detail.error' })} />
  } else {
    content = (
      <div className="space-y-4">
        <CheckSummary check={detail.data} />
        {detail.data.items.length === 0 ? (
          <EmptyState message={t('weapons.inventory.detail.empty')} />
        ) : (
          <div className={TABLE_CARD}>
            <table className="w-full">
              <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
                <tr>
                  {DETAIL_COLUMNS.map((column) => (
                    <th key={column} scope="col" className="px-3 py-3 text-left text-xs font-semibold uppercase text-[#64748B]">
                      {t(`weapons.inventory.detail.table.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.data.items.map((item) => (
                  <tr key={item.weaponId} data-testid={`inventory-check-item-${item.weaponId}`} className="border-b border-[#F1F5F9] text-sm">
                    <td className="px-3 py-2 font-mono text-[#0F172A]">{item.serialNumber}</td>
                    <td className="px-3 py-2 text-[#0F172A]">{item.weaponType}</td>
                    <td className="px-3 py-2 text-[#64748B]">{item.storageLocation}</td>
                    <td className="px-3 py-2 text-[#64748B]">{item.holderName ?? none}</td>
                    <td className="px-3 py-2"><ConditionBadge condition={item.condition} /></td>
                    <td className="px-3 py-2"><ItemResult found={item.found} /></td>
                    <td className="px-3 py-2"><ObservedCondition item={item} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={t('weapons.inventory.detail.title', { date: formatCalendarDate(record.checkDate) })}
      description={t('weapons.inventory.detail.description', { name: record.performedByName })}
      className="max-w-4xl"
    >
      {content}
    </Dialog>
  )
}

const HISTORY_COLUMNS = ['checkDate', 'performedBy', 'expected', 'confirmed', 'discrepancy', 'itemised', 'notes'] as const

function InventoryHistory() {
  const { t } = useTranslation()
  const none = t('common.states.none')
  // The Vietnamese year so far
  const [from, setFrom] = useState(firstDayOfYearInVietnam)
  const [to, setTo] = useState(todayInVietnam)
  const [viewing, setViewing] = useState<InventoryCheckRecord | null>(null)
  // YYYY-MM-DD strings compare in calendar order (the rule of the backend assertDateRange)
  const rangeInvalid = Boolean(from && to && from > to)
  const filters = { from, to }
  const checks = useQuery({
    queryKey: weaponKeys.checkList(filters),
    queryFn: () => weaponsApi.listInventoryChecks(filters),
    enabled: !rangeInvalid,
  })

  let content: ReactNode = null
  if (rangeInvalid) content = null
  else if (checks.isPending) content = <LoadingRows label={t('weapons.inventory.history.load.loading')} />
  else if (checks.isError) {
    content = <LoadError message={describeApiError(checks.error, { scope: 'weapons.inventory', fallback: 'weapons.inventory.history.load.error' })} />
  } else if (checks.data.length === 0) content = <EmptyState message={t('weapons.inventory.history.load.empty')} />
  else {
    content = (
      <div className={TABLE_CARD}>
        <table className="w-full">
          <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
            <tr>
              {HISTORY_COLUMNS.map((column) => (
                <th key={column} scope="col" className={TH}>{t(`weapons.inventory.history.table.${column}`)}</th>
              ))}
              <th scope="col" className={TH}><span className="sr-only">{t('weapons.inventory.history.table.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {checks.data.map((check) => (
              <tr key={check.id} className={ROW} data-testid={`inventory-check-row-${check.id}`}>
                <td className={cn(TD, 'whitespace-nowrap text-[#0F172A]')}>{formatCalendarDate(check.checkDate)}</td>
                <td className={cn(TD, 'text-[#0F172A]')}>{check.performedByName}</td>
                <td className={cn(TD, 'text-[#0F172A]')}>{check.expectedCount}</td>
                <td className={cn(TD, 'text-[#0F172A]')}>{check.confirmedCount}</td>
                <td className={TD}>
                  <div className="flex items-center gap-2">
                    <span className={cn('font-semibold', check.discrepancy === 0 ? 'text-[#0F172A]' : 'text-[#C62828]')}>
                      {signed(check.discrepancy)}
                    </span>
                    <DiscrepancyBadge value={check.discrepancy} />
                  </div>
                </td>
                <td className={cn(TD, 'text-[#64748B]')}>
                  {check.verifiedCount > 0
                    ? t('weapons.inventory.history.row.itemised', { verified: check.verifiedCount, total: check.itemCount, missing: check.missingCount })
                    : t('weapons.inventory.history.row.countOnly')}
                </td>
                <td className={cn(TD, 'max-w-xs truncate text-[#64748B]')}>{check.notes ?? none}</td>
                <td className={TD}>
                  <button type="button" onClick={() => setViewing(check)} className="text-sm font-medium text-[#C62828] hover:underline">
                    {t('common.actions.view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 className="text-sm font-semibold text-[#0F172A]">{t('weapons.inventory.history.heading')}</h3>
        <div className="flex flex-wrap items-start gap-4">
          <FormField id="inventory-history-from" label={t('common.filters.from')}>
            {(control) => <input {...control} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </FormField>
          <FormField
            id="inventory-history-to"
            label={t('common.filters.to')}
            error={rangeInvalid ? t('weapons.inventory.history.filters.rangeInvalid') : undefined}
          >
            {(control) => <input {...control} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
          </FormField>
        </div>
      </div>
      {content}
      {viewing && <InventoryCheckDialog record={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}

const REPORT_COLUMNS = ['type', 'serialNumber', 'condition', 'storageLocation', 'responsiblePerson', 'currentHolder', 'overdue'] as const

function InventoryTab() {
  const { t } = useTranslation()
  const { user } = useRbac()
  const none = t('common.states.none')
  const [recording, setRecording] = useState(false)
  const [result, setResult] = useState<InventoryCheckDetail | null>(null)
  const [exporting, setExporting] = useState(false)

  const weapons = useQuery({ queryKey: weaponKeys.register, queryFn: weaponsApi.list })
  const report = useQuery({ queryKey: weaponKeys.report, queryFn: weaponsApi.inventoryReport })
  const register = weapons.data ?? []
  const rows = report.data ?? []
  // weapon-inventory.service.ts record refuses accounts limited to a unit (ward_scope_required)
  const wardScope = hasWardScope(user)

  const cards = [
    ['good', register.filter((w) => w.condition === 'good').length, 'text-[#2E7D32]'],
    ['maintenance', register.filter((w) => w.condition === 'maintenance').length, 'text-yellow-600'],
    ['damaged', register.filter((w) => w.condition === 'damaged').length, 'text-[#C62828]'],
    ['overdue', rows.filter((row) => row.overdue).length, rows.some((row) => row.overdue) ? 'text-orange-600' : 'text-[#64748B]'],
  ] as const

  const handleExport = async () => {
    setExporting(true)
    try {
      const file = await weaponsApi.exportInventory()
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = `KiemKe_VuKhi_${todayInVietnam()}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(
        describeApiError(err, { statuses: { 403: 'weapons.inventory.export.forbidden' }, fallback: 'weapons.inventory.export.error' }),
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map(([name, value, tone]) => (
          <div key={name} data-testid={`inventory-card-${name}`} className="rounded-xl border border-[#E2E8F0] bg-white p-5 text-center">
            <p className={cn('text-3xl font-bold', tone)}>{value}</p>
            <p className="mt-1 text-sm text-[#64748B]">{t(`weapons.inventory.cards.${name}`)}</p>
          </div>
        ))}
      </div>

      {report.isError && (
        <LoadError message={describeApiError(report.error, { fallback: 'weapons.inventory.report.error' })} />
      )}
      {rows.length > 0 && (
        <div className={TABLE_CARD}>
          <table className="w-full">
            <thead className="border-b-2 border-[#E2E8F0] bg-[#F8FAFC]">
              <tr>
                {REPORT_COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-5 py-3 text-left text-xs font-medium uppercase text-[#64748B]">
                    {t(`weapons.inventory.report.table.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`inventory-report-row-${row.id}`}
                  className={cn('border-b border-[#F1F5F9] transition-colors', row.overdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-[#F8FAFC]')}
                >
                  <td className="px-5 py-3 text-sm text-[#0F172A]">{row.weaponType}</td>
                  <td className="px-5 py-3 font-mono text-sm text-[#64748B]">{row.serialNumber}</td>
                  <td className="px-5 py-3 text-sm"><ConditionBadge condition={row.condition} /></td>
                  <td className="px-5 py-3 text-sm text-[#64748B]">{row.storageLocation}</td>
                  <td className="px-5 py-3 text-sm text-[#0F172A]">{row.responsiblePersonName ?? none}</td>
                  <td className="px-5 py-3 text-sm text-[#64748B]">{row.currentHolder ?? none}</td>
                  <td className="px-5 py-3">
                    {row.overdue && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-[#C62828]">
                        {t('weapons.inventory.report.overdueBadge')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#0F172A]">{t('weapons.inventory.record.heading')}</h3>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            data-testid="export-inventory-btn"
            className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:border-[#C62828] hover:text-[#C62828] disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            {exporting ? t('common.actions.exporting') : t('weapons.inventory.export.button')}
          </button>
        </div>
        <p data-testid="inventory-register-total" className="text-sm text-[#64748B]">
          {t('weapons.inventory.record.registerTotal')} <strong className="text-[#0F172A]">{register.length}</strong>
        </p>
        {!wardScope && (
          <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            {t('errors.weapons.inventory.ward_scope_required')}
          </p>
        )}
        <button
          type="button"
          onClick={() => setRecording(true)}
          disabled={!wardScope}
          data-testid="confirm-inventory-btn"
          className="flex items-center gap-2 rounded-lg bg-[#2E7D32] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B5E20] disabled:opacity-50"
        >
          <CheckSquare size={16} aria-hidden="true" />
          {t('weapons.inventory.record.open')}
        </button>
        {result && (
          <section role="status" data-testid="inventory-result" className="space-y-3 rounded-lg border border-[#E2E8F0] p-4">
            <h4 className="text-sm font-semibold text-[#0F172A]">
              {t('weapons.inventory.result.title', { date: formatCalendarDate(result.checkDate) })}
            </h4>
            <CheckSummary check={result} />
          </section>
        )}
      </section>

      <InventoryHistory />

      {recording && (
        <RecordInventoryDialog
          onClose={() => setRecording(false)}
          onRecorded={(check) => {
            setResult(check)
            setRecording(false)
          }}
        />
      )}
    </div>
  )
}

type TabId = 'catalog' | 'log' | 'inventory'
const TABS: readonly TabId[] = ['catalog', 'log', 'inventory']

export function WeaponsPage() {
  const { t } = useTranslation()
  const { can } = useRbac()
  const [activeTab, setActiveTab] = useState<TabId>('catalog')

  // weapons.controller.ts and weapon-inventory.controller.ts: WEAPON_STAFF_ROLES
  if (!can.manageWeapons) return <Navigate to="/forbidden" replace />

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6" data-testid="weapons-page">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0F172A]">
            <Shield size={24} aria-hidden="true" className="text-[#C62828]" />
            {t('weapons.page.header.title')}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">{t('weapons.page.header.subtitle')}</p>
        </div>

        <div role="tablist" aria-label={t('weapons.page.tabs.label')} className="flex w-fit gap-1 rounded-xl border border-[#E2E8F0] bg-white p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`weapons-tab-${tab}`}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab ? 'bg-[#C62828] text-white' : 'text-[#64748B] hover:bg-[#F8FAFC]',
              )}
            >
              {t(`weapons.page.tabs.${tab}`)}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {activeTab === 'catalog' && <WeaponCatalogTab />}
          {activeTab === 'log' && <AllocationLogTab />}
          {activeTab === 'inventory' && <InventoryTab />}
        </div>
      </div>
    </div>
  )
}

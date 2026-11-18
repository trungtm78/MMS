// Vũ khí & trang thiết bị — Web/backend/src/weapons: the register (GET/POST /weapons), the
// allocations, the inventory report and its export, and the kiểm kê records of
// weapon-inventory.controller.ts. The condition codes copy weapon-inventory-codes.ts; screens
// label them from the locale file (weapons.codes.conditions.*).
import { withJsonErrorBody } from '@/lib/api-error'
import { heldRoles } from '@/lib/roles'
import client from './client'

// weapon-inventory-codes.ts WEAPON_CONDITIONS (weapons and inventory items tables)
export const WEAPON_CONDITIONS = ['good', 'damaged', 'maintenance'] as const
export type WeaponCondition = (typeof WEAPON_CONDITIONS)[number]

// weapon-item.entity.ts status; GET /weapons answers the active weapons only
export type WeaponStatus = 'active' | 'retired' | 'maintenance'

// weapons.service.ts WeaponListItem (GET /weapons row)
export interface WeaponRecord {
  id: string
  type: string
  serialNumber: string
  /** DATE column, YYYY-MM-DD */
  acquiredAt: string
  condition: WeaponCondition
  storageLocation: string
  responsiblePersonId: string | null
  /** Name of the member responsible for the weapon */
  responsiblePersonName: string | null
  status: WeaponStatus
  createdAt: string
  updatedAt: string
}

// create-weapon.dto.ts CreateWeaponDto (the ValidationPipe whitelists these properties)
export interface CreateWeaponBody {
  serialNumber: string
  type: string
  acquiredAt: string
  condition: WeaponCondition
  storageLocation: string
}

// create-weapon.dto.ts @Length maxima
export const WEAPON_FIELD_MAX = { serialNumber: 100, type: 100, storageLocation: 200 } as const

// weapons.service.ts AllocationListItem (GET /weapons/allocations row, newest first): the
// allocation names its weapon and recipient, so no per-row lookup is needed
export interface AllocationRecord {
  id: string
  weaponId: string
  /** militia_profiles.id of the member holding the weapon */
  recipientId: string
  issuedAt: string
  purpose: string
  returnedAt: string | null
  createdAt: string
  weaponSerialNumber: string
  weaponType: string
  recipientName: string
  recipientCode: string
}

// weapons.service.ts getInventoryReport row: the active weapons with their current holder
export interface InventoryReportRow {
  id: string
  weaponType: string
  serialNumber: string
  condition: WeaponCondition
  storageLocation: string
  acquiredAt: string | null
  status: WeaponStatus
  responsiblePersonName: string | null
  currentHolder: string | null
  issuedAt: string | null
  returnedAt: string | null
  /** Issued more than 180 days ago and not returned */
  overdue: boolean
}

// record-inventory.dto.ts RecordInventoryDto limits
export const MAX_CONFIRMED_COUNT = 100_000
export const MAX_INVENTORY_NOTES = 2000

// record-inventory.dto.ts InventoryItemDto
export interface InventoryItemInput {
  weaponId: string
  found: boolean
  /** Only for a weapon that was found */
  observedCondition?: WeaponCondition
}

// record-inventory.dto.ts RecordInventoryDto — items, when given, list every active weapon
export interface RecordInventoryBody {
  confirmedCount: number
  notes?: string
  items?: InventoryItemInput[]
}

// weapon-inventory.service.ts InventoryCheckRecord
export interface InventoryCheckRecord {
  id: string
  /** YYYY-MM-DD */
  checkDate: string
  performedBy: string
  performedByName: string
  /** Active weapons on record when the check was saved */
  expectedCount: number
  confirmedCount: number
  /** confirmedCount − expectedCount: negative when weapons are missing */
  discrepancy: number
  notes: string | null
  /** Weapons in the snapshot (every active weapon at the time) */
  itemCount: number
  /** Snapshot weapons the checker marked found or not found */
  verifiedCount: number
  missingCount: number
  createdAt: string
}

// weapon-inventory.service.ts InventoryItemRecord
export interface InventoryItemRecord {
  weaponId: string
  weaponType: string
  serialNumber: string
  condition: WeaponCondition
  storageLocation: string
  holderMilitiaId: string | null
  holderName: string | null
  /** null when the check was not itemised */
  found: boolean | null
  observedCondition: WeaponCondition | null
}

export interface InventoryCheckDetail extends InventoryCheckRecord {
  items: InventoryItemRecord[]
}

// record-inventory.dto.ts InventoryQueryDto
export interface InventoryFilters {
  from?: string
  to?: string
}

export type ConfirmedCountInput = { value: number } | { error: 'required' | 'invalid' }

/** Reads the counted number as RecordInventoryDto accepts it: an integer from 0 to 100 000 */
export function parseConfirmedCount(raw: string): ConfirmedCountInput {
  const text = raw.trim()
  if (!text) return { error: 'required' }
  if (!/^\d+$/.test(text)) return { error: 'invalid' }
  const value = Number(text)
  return value <= MAX_CONFIRMED_COUNT ? { value } : { error: 'invalid' }
}

function notesOf(notes: string): Pick<RecordInventoryBody, 'notes'> {
  const trimmed = notes.trim()
  return trimmed ? { notes: trimmed } : {}
}

/** A check recorded as a counted number */
export function countBody(confirmedCount: number, notes: string): RecordInventoryBody {
  return { confirmedCount, ...notesOf(notes) }
}

/** How the checker marked one weapon of the checklist */
export interface ChecklistMark {
  found: boolean
  observedCondition: WeaponCondition
}

export type ChecklistMarks = Readonly<Partial<Record<string, ChecklistMark>>>

/** The mark of a weapon: not found, and seen in its recorded condition, until the checker says otherwise */
export function markOf(marks: ChecklistMarks, weapon: Pick<WeaponRecord, 'id' | 'condition'>): ChecklistMark {
  return marks[weapon.id] ?? { found: false, observedCondition: weapon.condition }
}

/**
 * A check recorded weapon by weapon. weapon-inventory.service.ts record requires the items to
 * list every active weapon exactly, observedCondition only on found weapons, and confirmedCount
 * to equal the found count.
 */
export function checklistBody(
  register: readonly Pick<WeaponRecord, 'id' | 'condition'>[],
  marks: ChecklistMarks,
  notes: string,
): RecordInventoryBody {
  const items = register.map((weapon): InventoryItemInput => {
    const mark = markOf(marks, weapon)
    return mark.found
      ? { weaponId: weapon.id, found: true, observedCondition: mark.observedCondition }
      : { weaponId: weapon.id, found: false }
  })
  return { confirmedCount: items.filter((item) => item.found).length, ...notesOf(notes), items }
}

// common/constants/roles.ts WIDE_SCOPE_ROLES and AREA_SCOPED_ROLES
const WIDE_SCOPE_ROLES: ReadonlySet<string> = new Set(['system_admin', 'police_ward'])
const AREA_SCOPED_ROLES: ReadonlySet<string> = new Set(['police_area', 'ca_area', 'ca_officer'])

export interface ScopedUser {
  role?: string | null
  roles?: readonly string[] | null
  unitScope: string | null
}

/**
 * Whether the account covers the whole ward, which weapon-inventory.service.ts record requires
 * (effectiveUnit(actor) === null in common/access/unit-scope.ts).
 */
export function hasWardScope(user: ScopedUser | null | undefined): boolean {
  if (!user) return false
  if (heldRoles(user).some((role) => WIDE_SCOPE_ROLES.has(role))) return true
  if (user.unitScope) return false
  return !(user.role && AREA_SCOPED_ROLES.has(user.role))
}

export const weaponKeys = {
  register: ['weapons'] as const,
  allocations: ['weapon-allocations'] as const,
  report: ['weapons-inventory-report'] as const,
  checks: ['weapon-inventory-checks'] as const,
  checkList: (filters: InventoryFilters) => ['weapon-inventory-checks', 'list', filters] as const,
  check: (id: string) => ['weapon-inventory-checks', 'detail', id] as const,
}

export const weaponsApi = {
  // GET /weapons — the active weapons
  list: async (): Promise<WeaponRecord[]> => (await client.get<WeaponRecord[]>('/weapons')).data,

  // POST /weapons — 409 serial_number_already_exists
  create: async (body: CreateWeaponBody): Promise<WeaponRecord> => (await client.post<WeaponRecord>('/weapons', body)).data,

  // GET /weapons/allocations — newest first, each naming its weapon and recipient
  allocations: async (): Promise<AllocationRecord[]> => (await client.get<AllocationRecord[]>('/weapons/allocations')).data,

  // GET /weapons/inventory-report
  inventoryReport: async (): Promise<InventoryReportRow[]> =>
    (await client.get<InventoryReportRow[]>('/weapons/inventory-report')).data,

  // GET /weapons/export — xlsx; an error body arrives as a Blob and is decoded for its code
  exportInventory: async (): Promise<Blob> => {
    try {
      return (await client.get<Blob>('/weapons/export', { responseType: 'blob' })).data
    } catch (err) {
      throw await withJsonErrorBody(err)
    }
  },

  // POST /weapons/inventory — the saved check with its snapshot of the register
  recordInventory: async (body: RecordInventoryBody): Promise<InventoryCheckDetail> =>
    (await client.post<InventoryCheckDetail>('/weapons/inventory', body)).data,

  // GET /weapons/inventory?from&to (YYYY-MM-DD), newest first
  listInventoryChecks: async ({ from, to }: InventoryFilters): Promise<InventoryCheckRecord[]> =>
    (
      await client.get<InventoryCheckRecord[]>('/weapons/inventory', {
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
      })
    ).data,

  // GET /weapons/inventory/:id — 404 inventory_check_not_found
  getInventoryCheck: async (id: string): Promise<InventoryCheckDetail> =>
    (await client.get<InventoryCheckDetail>(`/weapons/inventory/${id}`)).data,
}

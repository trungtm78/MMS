import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checklistBody,
  countBody,
  hasWardScope,
  parseConfirmedCount,
  weaponsApi,
  type AllocationRecord,
  type InventoryCheckDetail,
  type WeaponRecord,
} from './weapons'

// Only the HTTP layer is replaced
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

// Web/backend/src/weapons/entities/weapon-item.entity.ts
const weapon: WeaponRecord = {
  id: '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01',
  type: 'Súng trường',
  serialNumber: 'SN-001',
  acquiredAt: '2020-01-01',
  condition: 'good',
  storageLocation: 'Kho 1',
  responsiblePersonId: null,
  responsiblePersonName: null,
  status: 'active',
  createdAt: '2020-01-02T03:00:00.000Z',
  updatedAt: '2020-01-02T03:00:00.000Z',
}

// Web/backend/src/weapons/weapon-inventory.service.ts InventoryCheckDetail
const detail: InventoryCheckDetail = {
  id: 'c1',
  checkDate: '2026-09-10',
  performedBy: 'u1',
  performedByName: 'Lê Văn C',
  expectedCount: 1,
  confirmedCount: 1,
  discrepancy: 0,
  notes: null,
  itemCount: 1,
  verifiedCount: 1,
  missingCount: 0,
  createdAt: '2026-09-10T02:00:00.000Z',
  items: [
    {
      weaponId: weapon.id,
      weaponType: 'Súng trường',
      serialNumber: 'SN-001',
      condition: 'good',
      storageLocation: 'Kho 1',
      holderMilitiaId: null,
      holderName: null,
      found: true,
      observedCondition: 'good',
    },
  ],
}

describe('weaponsApi', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('reads the active weapons from GET /weapons', async () => {
    api.get.mockResolvedValue({ data: [weapon] })
    await expect(weaponsApi.list()).resolves.toStrictEqual([weapon])
    expect(api.get).toHaveBeenCalledWith('/weapons')
  })

  it('adds a weapon with POST /weapons', async () => {
    api.post.mockResolvedValue({ data: weapon })
    const body = { type: 'Súng trường', serialNumber: 'SN-001', acquiredAt: '2020-01-01', condition: 'good', storageLocation: 'Kho 1' } as const
    await expect(weaponsApi.create(body)).resolves.toStrictEqual(weapon)
    expect(api.post).toHaveBeenCalledWith('/weapons', body)
  })

  it('reads the allocations, each naming its weapon and recipient, from GET /weapons/allocations', async () => {
    // weapons.service.ts AllocationListItem
    const allocation: AllocationRecord = {
      id: 'al1',
      weaponId: weapon.id,
      recipientId: 'm1',
      issuedAt: '2026-04-01T00:00:00.000Z',
      purpose: 'Tuần tra',
      returnedAt: null,
      createdAt: '2026-04-01T00:00:00.000Z',
      weaponSerialNumber: 'SN-001',
      weaponType: 'Súng trường',
      recipientName: 'Nguyễn B',
      recipientCode: 'DQ-001',
    }
    api.get.mockResolvedValue({ data: [allocation] })
    await expect(weaponsApi.allocations()).resolves.toStrictEqual([allocation])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/weapons/allocations')
  })

  it('offers no per-member lookup: allocations carry the recipient', () => {
    expect(Object.keys(weaponsApi)).not.toContain('recipient')
  })

  it('reads the inventory report from GET /weapons/inventory-report', async () => {
    api.get.mockResolvedValue({ data: [] })
    await expect(weaponsApi.inventoryReport()).resolves.toStrictEqual([])
    expect(api.get).toHaveBeenCalledWith('/weapons/inventory-report')
  })

  it('records a check with POST /weapons/inventory and returns it with its snapshot', async () => {
    api.post.mockResolvedValue({ data: detail })
    const body = { confirmedCount: 1, items: [{ weaponId: weapon.id, found: true, observedCondition: 'good' as const }] }
    await expect(weaponsApi.recordInventory(body)).resolves.toStrictEqual(detail)
    expect(api.post).toHaveBeenCalledWith('/weapons/inventory', body)
  })

  it('lists the checks of a date range from GET /weapons/inventory', async () => {
    api.get.mockResolvedValue({ data: [] })
    await weaponsApi.listInventoryChecks({ from: '2026-01-01', to: '2026-09-14' })
    expect(api.get).toHaveBeenCalledWith('/weapons/inventory', { params: { from: '2026-01-01', to: '2026-09-14' } })
  })

  it('leaves blank dates out of the check filter', async () => {
    api.get.mockResolvedValue({ data: [] })
    await weaponsApi.listInventoryChecks({ from: '', to: '2026-09-14' })
    expect(api.get).toHaveBeenCalledWith('/weapons/inventory', { params: { to: '2026-09-14' } })
  })

  it('reads one check with its snapshot from GET /weapons/inventory/:id', async () => {
    api.get.mockResolvedValue({ data: detail })
    await expect(weaponsApi.getInventoryCheck('c1')).resolves.toStrictEqual(detail)
    expect(api.get).toHaveBeenCalledWith('/weapons/inventory/c1')
  })

  it('downloads the inventory export as a blob', async () => {
    const file = new Blob(['xlsx'])
    api.get.mockResolvedValue({ data: file })
    await expect(weaponsApi.exportInventory()).resolves.toBe(file)
    expect(api.get).toHaveBeenCalledWith('/weapons/export', { responseType: 'blob' })
  })

  it('decodes the JSON error body of a failed export so its code can be read', async () => {
    const body = { code: 'E003', message: 'forbidden', statusCode: 403 }
    api.get.mockRejectedValue({ isAxiosError: true, request: {}, response: { status: 403, data: new Blob([JSON.stringify(body)]) } })
    await expect(weaponsApi.exportInventory()).rejects.toMatchObject({ response: { status: 403, data: body } })
  })
})

describe('parseConfirmedCount', () => {
  // record-inventory.dto.ts: @IsInt() @Min(0) @Max(100_000)
  it.each([
    ['0', { value: 0 }],
    ['12', { value: 12 }],
    [' 7 ', { value: 7 }],
    ['007', { value: 7 }],
    ['100000', { value: 100000 }],
    ['', { error: 'required' }],
    ['   ', { error: 'required' }],
    ['1.5', { error: 'invalid' }],
    ['-1', { error: 'invalid' }],
    ['1e3', { error: 'invalid' }],
    ['100001', { error: 'invalid' }],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseConfirmedCount(raw)).toStrictEqual(expected)
  })
})

describe('inventory bodies', () => {
  const register = [
    { id: 'w1', condition: 'good' },
    { id: 'w2', condition: 'maintenance' },
    { id: 'w3', condition: 'damaged' },
  ] as const

  it('lists every active weapon, gives the observed condition of found weapons only and counts the found ones', () => {
    const marks = {
      w1: { found: true, observedCondition: 'damaged' },
      w2: { found: false, observedCondition: 'maintenance' },
    } as const
    expect(checklistBody(register, marks, '  Đủ số  ')).toStrictEqual({
      confirmedCount: 1,
      notes: 'Đủ số',
      items: [
        { weaponId: 'w1', found: true, observedCondition: 'damaged' },
        { weaponId: 'w2', found: false },
        { weaponId: 'w3', found: false },
      ],
    })
  })

  it('records an empty register as nothing found', () => {
    expect(checklistBody([], {}, '')).toStrictEqual({ confirmedCount: 0, items: [] })
  })

  it('sends a counted number with its notes, leaving blank notes out', () => {
    expect(countBody(5, '   ')).toStrictEqual({ confirmedCount: 5 })
    expect(countBody(5, ' Thiếu 1 ')).toStrictEqual({ confirmedCount: 5, notes: 'Thiếu 1' })
  })
})

describe('hasWardScope', () => {
  // weapon-inventory.service.ts record: effectiveUnit(actor) must be null (unit-scope.ts)
  it.each([
    ['a system admin, whatever the unit scope', { role: 'system_admin', roles: ['system_admin'], unitScope: 'KP1' }, true],
    ['a ward police officer, whatever the unit scope', { role: 'police_ward', roles: ['police_ward'], unitScope: 'KP1' }, true],
    ['office staff without a unit scope', { role: 'office_staff', roles: ['office_staff'], unitScope: null }, true],
    ['office staff limited to a unit', { role: 'office_staff', roles: ['office_staff'], unitScope: 'KP1' }, false],
    ['a unit-limited account that also holds a wide role', { role: 'office_staff', roles: ['office_staff', 'police_ward'], unitScope: 'KP1' }, true],
    ['an area role without a unit scope', { role: 'ca_officer', roles: ['ca_officer'], unitScope: null }, false],
    ['nobody signed in', null, false],
  ])('%s: %s', (_, user, expected) => {
    expect(hasWardScope(user)).toBe(expected)
  })
})

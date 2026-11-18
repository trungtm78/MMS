// Role catalogue shared with the backend (Web/backend/src/common/constants/roles.ts)
import { describe, it, expect } from 'vitest'
import {
  ROLE_CODES,
  ROLE_PRIORITY,
  ROLE_LABEL_KEYS,
  heldRoles,
  roleLabel,
  roleRank,
  sortRolesByPriority,
} from './roles'

// Copied verbatim from the backend constants; a change there must be mirrored here
const BACKEND_ROLE_CODES = [
  'system_admin',
  'ubnd_leader',
  'police_ward',
  'police_area',
  'office_staff',
  'dqtv',
  'ca_officer',
  'ca_ward',
  'ca_area',
  'dqtv_member',
]
const BACKEND_ROLE_PRIORITY = [
  'system_admin',
  'police_ward',
  'ca_ward',
  'ubnd_leader',
  'police_area',
  'ca_area',
  'ca_officer',
  'office_staff',
  'dqtv',
  'dqtv_member',
]

describe('role catalogue', () => {
  it('knows every backend role code', () => {
    expect([...ROLE_CODES].sort()).toEqual([...BACKEND_ROLE_CODES].sort())
  })

  it('orders roles exactly like the backend ROLE_PRIORITY', () => {
    expect([...ROLE_PRIORITY]).toEqual(BACKEND_ROLE_PRIORITY)
  })

  it('labels every role with its Vietnamese catalogue name (migration 023)', () => {
    for (const code of BACKEND_ROLE_CODES) {
      expect(ROLE_LABEL_KEYS[code as keyof typeof ROLE_LABEL_KEYS]).toBe(`roles.labels.${code}`)
    }
    expect(BACKEND_ROLE_CODES.map((code) => roleLabel(code))).toEqual([
      'Quản trị hệ thống',
      'Lãnh đạo UBND',
      'Công an phường',
      'Công an khu vực',
      'Nhân viên văn phòng',
      'Dân quân tự vệ',
      'Cán bộ công an',
      'Công an phường (CA)',
      'Công an khu vực (CA)',
      'Thành viên DQTV',
    ])
  })

  it('shows an unknown role code as-is', () => {
    expect(roleLabel('future_role')).toBe('future_role')
    expect(roleLabel(null)).toBe('—')
  })
})

describe('roleRank', () => {
  it('ranks higher privilege first', () => {
    expect(roleRank('system_admin')).toBe(0)
    expect(roleRank('ca_ward')).toBeLessThan(roleRank('ubnd_leader'))
    expect(roleRank('dqtv')).toBeLessThan(roleRank('dqtv_member'))
  })

  it('ranks unknown codes below every known role', () => {
    expect(roleRank('future_role')).toBe(BACKEND_ROLE_PRIORITY.length)
  })
})

describe('sortRolesByPriority', () => {
  it('removes duplicates and sorts unknown codes last, alphabetically', () => {
    expect(sortRolesByPriority(['dqtv', 'zeta', 'system_admin', 'dqtv', 'alpha'])).toEqual([
      'system_admin',
      'dqtv',
      'alpha',
      'zeta',
    ])
  })
})

describe('heldRoles', () => {
  it('returns every assigned role, highest priority first', () => {
    expect(heldRoles({ role: 'police_ward', roles: ['office_staff', 'police_ward'] })).toEqual([
      'police_ward',
      'office_staff',
    ])
  })

  it('falls back to the primary role when roles is absent (tokens issued before the claim)', () => {
    expect(heldRoles({ role: 'office_staff' })).toEqual(['office_staff'])
  })

  it('keeps a primary role that is missing from roles, like the backend holdsAnyRole', () => {
    expect(heldRoles({ role: 'dqtv', roles: ['ca_officer'] })).toEqual(['ca_officer', 'dqtv'])
  })

  it('returns no roles for a missing user or a user without roles', () => {
    expect(heldRoles(null)).toEqual([])
    expect(heldRoles(undefined)).toEqual([])
    expect(heldRoles({ role: null, roles: [] })).toEqual([])
  })
})

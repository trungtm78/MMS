// Phase 2: Unit tests for useRbac hook
// US-W001 AC-2: RBAC permissions + scope enforcement
import { describe, test, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock useAuth to avoid full auth context setup
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/contexts/AuthContext'
import { useRbac } from './useRbac'
import type { User } from '@/types'

const makeUser = (role: User['role'], unitScope: string | null = null): User => ({
  id: 1,
  username: 'testuser',
  fullName: 'Test User',
  role,
  unitScope,
  email: 'test@test.com',
  phone: '0123456789',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

describe('useRbac', () => {
  // --- hasRole tests ---
  describe('hasRole', () => {
    test('test_us001_happy_admin_has_system_admin_role', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('system_admin'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasRole('system_admin')).toBe(true)
    })

    test('test_us001_happy_dqtv_has_dqtv_role', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('dqtv'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasRole('dqtv')).toBe(true)
    })

    test('test_us001_validation_dqtv_does_not_have_admin_role', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('dqtv'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasRole('system_admin')).toBe(false)
    })

    test('test_us001_validation_null_user_returns_false', () => {
      vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasRole('system_admin')).toBe(false)
    })
  })

  // --- hasMinRole tests ---
  describe('hasMinRole', () => {
    test('test_us001_happy_police_ward_min_police_area', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_ward'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasMinRole('police_area')).toBe(true)
    })

    test('test_us001_happy_dqtv_min_dqtv', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('dqtv'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasMinRole('dqtv')).toBe(true)
    })

    test('test_us001_validation_dqtv_below_police_area', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('dqtv'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasMinRole('police_area')).toBe(false)
    })

    test('test_us001_validation_null_user_min_role_false', () => {
      vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.hasMinRole('dqtv')).toBe(false)
    })
  })

  // --- canAccessUnit tests (boundary + scope enforcement) ---
  describe('canAccessUnit', () => {
    // Boundary: CA Phường (unitScope=null) → full access
    test('test_us001_boundary_police_ward_null_scope_full_access', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_ward', null), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.canAccessUnit('KP1')).toBe(true)
      expect(result.current.canAccessUnit('KP6')).toBe(true)
    })

    // US-W001 AC-2: CA KV1 can only access KP1
    test('test_us001_boundary_police_area_kp1_can_access_kp1', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_area', 'KP1'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.canAccessUnit('KP1')).toBe(true)
    })

    // US-W001 NP-07: CA KV1 cannot access KP2
    test('test_us001_boundary_police_area_kp1_cannot_access_kp2', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_area', 'KP1'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.canAccessUnit('KP2')).toBe(false)
    })

    // Null user → false
    test('test_us001_validation_null_user_canAccessUnit_false', () => {
      vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.canAccessUnit('KP1')).toBe(false)
    })
  })

  // --- can.* permission tests ---
  describe('can permissions', () => {
    test('test_us002_happy_admin_can_manageUsers', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('system_admin'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.manageUsers).toBe(true)
    })

    test('test_us002_validation_police_ward_cannot_manageUsers', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_ward'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.manageUsers).toBe(false)
    })

    test('test_us008_happy_dqtv_can_sendSos', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('dqtv'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.sendSos).toBe(true)
    })

    test('test_us008_validation_office_staff_cannot_sendSos', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('office_staff'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.sendSos).toBe(false)
    })

    test('test_us012_happy_police_ward_can_viewAuditLog', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_ward'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.viewAuditLog).toBe(true)
    })

    test('test_us012_validation_office_staff_cannot_viewAuditLog', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('office_staff'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.viewAuditLog).toBe(false)
    })

    // Boundary: police_ward can close period; police_area cannot
    test('test_us006_boundary_police_ward_can_closeAttendancePeriod', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_ward'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.closeAttendancePeriod).toBe(true)
    })

    test('test_us006_boundary_police_area_cannot_closeAttendancePeriod', () => {
      vi.mocked(useAuth).mockReturnValue({ user: makeUser('police_area'), isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() })
      const { result } = renderHook(() => useRbac())
      expect(result.current.can.closeAttendancePeriod).toBe(false)
    })
  })
})

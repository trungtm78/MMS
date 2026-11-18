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
import { ROLE_CODES } from '@/lib/roles'
import type { User, UserRole } from '@/types'

const makeUser = (role: User['role'], unitScope: string | null = null, roles?: UserRole[]): User => ({
  id: '5b1f8f7e-2f7a-4c1a-9d0e-000000000001',
  username: 'testuser',
  fullName: 'Test User',
  role,
  ...(roles ? { roles } : {}),
  unitScope,
  email: 'test@test.com',
  phone: '0123456789',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

function signIn(user: User | null) {
  vi.mocked(useAuth).mockReturnValue({ user, isAuthenticated: !!user, isLoading: false, notice: null, clearNotice: vi.fn(), login: vi.fn(), completeSignIn: vi.fn(), endSession: vi.fn(), logout: vi.fn() })
  return renderHook(() => useRbac()).result
}

describe('useRbac', () => {
  // --- hasRole tests ---
  describe('hasRole', () => {
    test('test_us001_happy_admin_has_system_admin_role', () => {
      expect(signIn(makeUser('system_admin')).current.hasRole('system_admin')).toBe(true)
    })

    test('test_us001_happy_dqtv_has_dqtv_role', () => {
      expect(signIn(makeUser('dqtv')).current.hasRole('dqtv')).toBe(true)
    })

    test('test_us001_validation_dqtv_does_not_have_admin_role', () => {
      expect(signIn(makeUser('dqtv')).current.hasRole('system_admin')).toBe(false)
    })

    test('test_us001_validation_null_user_returns_false', () => {
      expect(signIn(null).current.hasRole('system_admin')).toBe(false)
    })

    test.each(ROLE_CODES)('recognises the backend role code %s', (code) => {
      expect(signIn(makeUser(code)).current.hasRole(code)).toBe(true)
    })

    test('is true when any of the roles the user holds matches, not only the primary one', () => {
      const result = signIn(makeUser('police_ward', null, ['police_ward', 'office_staff']))
      expect(result.current.hasRole('office_staff')).toBe(true)
      expect(result.current.hasRole('dqtv', 'office_staff')).toBe(true)
      expect(result.current.hasRole('system_admin')).toBe(false)
    })

    test('falls back to the primary role when the roles claim is absent', () => {
      const result = signIn(makeUser('ca_officer'))
      expect(result.current.hasRole('ca_officer')).toBe(true)
      expect(result.current.roles).toEqual(['ca_officer'])
    })

    test('exposes every held role, highest priority first', () => {
      const result = signIn(makeUser('ca_ward', null, ['dqtv_member', 'ca_ward']))
      expect(result.current.role).toBe('ca_ward')
      expect(result.current.roles).toEqual(['ca_ward', 'dqtv_member'])
    })
  })

  // --- hasMinRole tests ---
  describe('hasMinRole', () => {
    test('test_us001_happy_police_ward_min_police_area', () => {
      expect(signIn(makeUser('police_ward')).current.hasMinRole('police_area')).toBe(true)
    })

    test('test_us001_happy_dqtv_min_dqtv', () => {
      expect(signIn(makeUser('dqtv')).current.hasMinRole('dqtv')).toBe(true)
    })

    test('test_us001_validation_dqtv_below_police_area', () => {
      expect(signIn(makeUser('dqtv')).current.hasMinRole('police_area')).toBe(false)
    })

    test('test_us001_validation_null_user_min_role_false', () => {
      expect(signIn(null).current.hasMinRole('dqtv')).toBe(false)
    })

    // Backend ROLE_PRIORITY: system_admin > police_ward > ca_ward > ubnd_leader > police_area
    //                      > ca_area > ca_officer > office_staff > dqtv > dqtv_member
    test.each([
      ['ca_ward', 'ubnd_leader', true],
      ['ca_ward', 'police_ward', false],
      ['ca_area', 'police_area', false],
      ['ca_area', 'ca_officer', true],
      ['ca_officer', 'office_staff', true],
      ['dqtv_member', 'dqtv', false],
      ['dqtv', 'dqtv_member', true],
    ] as const)('%s meets minimum %s: %s', (role, min, expected) => {
      expect(signIn(makeUser(role)).current.hasMinRole(min)).toBe(expected)
    })

    test('uses the highest role the user holds', () => {
      const result = signIn(makeUser('office_staff', null, ['office_staff', 'police_area']))
      expect(result.current.hasMinRole('police_area')).toBe(true)
    })

    test('never ranks an unknown role code above a known one', () => {
      const result = signIn({ ...makeUser('dqtv_member'), role: 'future_role' as UserRole })
      expect(result.current.hasMinRole('dqtv_member')).toBe(false)
    })
  })

  // --- canAccessUnit tests (boundary + scope enforcement) ---
  describe('canAccessUnit', () => {
    // Boundary: CA Phường (unitScope=null) → full access
    test('test_us001_boundary_police_ward_null_scope_full_access', () => {
      const result = signIn(makeUser('police_ward', null))
      expect(result.current.canAccessUnit('KP1')).toBe(true)
      expect(result.current.canAccessUnit('KP6')).toBe(true)
    })

    // US-W001 AC-2: CA KV1 can only access KP1
    test('test_us001_boundary_police_area_kp1_can_access_kp1', () => {
      expect(signIn(makeUser('police_area', 'KP1')).current.canAccessUnit('KP1')).toBe(true)
    })

    // US-W001 NP-07: CA KV1 cannot access KP2
    test('test_us001_boundary_police_area_kp1_cannot_access_kp2', () => {
      expect(signIn(makeUser('police_area', 'KP1')).current.canAccessUnit('KP2')).toBe(false)
    })

    // Null user → false
    test('test_us001_validation_null_user_canAccessUnit_false', () => {
      expect(signIn(null).current.canAccessUnit('KP1')).toBe(false)
    })
  })

  // --- can.* permission tests ---
  describe('can permissions', () => {
    test('test_us002_happy_admin_can_manageUsers', () => {
      expect(signIn(makeUser('system_admin')).current.can.manageUsers).toBe(true)
    })

    test('test_us002_validation_police_ward_cannot_manageUsers', () => {
      expect(signIn(makeUser('police_ward')).current.can.manageUsers).toBe(false)
    })

    test('test_us008_happy_dqtv_can_sendSos', () => {
      expect(signIn(makeUser('dqtv')).current.can.sendSos).toBe(true)
    })

    test('dqtv_member can send SOS too', () => {
      expect(signIn(makeUser('dqtv_member')).current.can.sendSos).toBe(true)
    })

    test('test_us008_validation_office_staff_cannot_sendSos', () => {
      expect(signIn(makeUser('office_staff')).current.can.sendSos).toBe(false)
    })

    test('test_us012_happy_police_ward_can_viewAuditLog', () => {
      expect(signIn(makeUser('police_ward')).current.can.viewAuditLog).toBe(true)
    })

    test('test_us012_validation_office_staff_cannot_viewAuditLog', () => {
      expect(signIn(makeUser('office_staff')).current.can.viewAuditLog).toBe(false)
    })

    // Boundary: police_ward can close period; police_area cannot
    test('test_us006_boundary_police_ward_can_closeAttendancePeriod', () => {
      expect(signIn(makeUser('police_ward')).current.can.closeAttendancePeriod).toBe(true)
    })

    test('test_us006_boundary_police_area_cannot_closeAttendancePeriod', () => {
      expect(signIn(makeUser('police_area')).current.can.closeAttendancePeriod).toBe(false)
    })

    test('a permission granted through a secondary role applies', () => {
      const result = signIn(makeUser('office_staff', null, ['office_staff', 'police_area']))
      expect(result.current.can.viewAuditLog).toBe(true)
      expect(result.current.can.approveLeave).toBe(true)
    })

    // Each table mirrors a backend @Roles list for all 10 role codes
    const matrix = (allowed: readonly UserRole[]) =>
      ROLE_CODES.map((code) => [code, allowed.includes(code)] as const)

    // exemption.controller.ts @Roles on POST /exemptions and PATCH /exemptions/:id/review
    test.each(matrix(['system_admin', 'police_ward', 'ca_ward', 'office_staff']))(
      'decideExemption for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.decideExemption).toBe(expected)
      },
    )

    // exemption.controller.ts class-level @Roles on GET /exemptions
    test.each(matrix(['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'office_staff']))(
      'viewExemptions for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewExemptions).toBe(expected)
      },
    )

    // audit.controller.ts class-level @Roles
    test.each(matrix(['system_admin', 'police_ward', 'police_area']))('viewAuditLog for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.viewAuditLog).toBe(expected)
    })

    // leave.service.ts REVIEWER_ROLES (PATCH /leave/:id/review, PUT /approvals/:id/*)
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer']))(
      'approveLeave for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.approveLeave).toBe(expected)
      },
    )

    // admin.controller.ts class-level @Roles (/admin/users)
    test.each(matrix(['system_admin', 'office_staff']))('manageUsers for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageUsers).toBe(expected)
    })

    // organization.controller.ts GET /organization/structure
    test.each(matrix(['system_admin', 'office_staff', 'police_ward', 'police_area']))(
      'viewOrganization for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewOrganization).toBe(expected)
      },
    )

    // organization.controller.ts POST/PATCH/DELETE /organization/units
    test.each(matrix(['system_admin']))('manageOrganizationUnits for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageOrganizationUnits).toBe(expected)
    })

    // recruitment.controller.ts GET /recruitment/applications
    test.each(matrix(['system_admin', 'office_staff', 'police_ward', 'ca_officer']))(
      'viewRecruitment for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewRecruitment).toBe(expected)
      },
    )

    // recruitment.controller.ts POST and PATCH /recruitment/applications
    test.each(matrix(['system_admin', 'office_staff', 'police_ward']))('manageRecruitment for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageRecruitment).toBe(expected)
    })

    // weapons.controller.ts class-level @Roles
    test.each(matrix(['system_admin', 'office_staff', 'police_ward']))('manageWeapons for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageWeapons).toBe(expected)
    })

    // training.service.ts MANAGER_ROLES (create/update/delete training records)
    test.each(matrix(['system_admin', 'police_ward', 'police_area']))('manageTraining for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageTraining).toBe(expected)
    })

    // rewards.roles.ts REWARD_STAFF_ROLES: POST /rewards, POST /discipline, PATCH /discipline/:id/appeal/decision
    // (also GET /militia/rewards-report and /militia/rewards-export)
    test.each(matrix(['system_admin', 'police_ward', 'office_staff']))('manageRewards for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageRewards).toBe(expected)
    })

    // assignments.controller.ts:28,39 POST and DELETE /assignments (GET is viewAssignments)
    test.each(matrix(['system_admin']))('manageAssignments for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageAssignments).toBe(expected)
    })

    // settings.controller.ts:23 KPI_TARGET_READER_ROLES: GET /settings/kpi-targets (PUT stays system_admin)
    test.each(matrix(['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff']))(
      'viewKpiTargets for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewKpiTargets).toBe(expected)
      },
    )

    // attendance.controller.ts:150 GET /attendance/timesheet (DQTV members read their own row)
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'office_staff', 'ca_officer', 'dqtv', 'dqtv_member']))(
      'viewTimesheet for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewTimesheet).toBe(expected)
      },
    )

    // rewards.roles.ts REWARD_READER_ROLES: GET /rewards, GET /discipline, PATCH /discipline/:id/appeal
    test.each(matrix(['system_admin', 'police_ward', 'office_staff', 'dqtv', 'dqtv_member']))(
      'viewRewards for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewRewards).toBe(expected)
      },
    )

    // assignments.controller.ts GET /assignments
    test.each(matrix(['system_admin', 'ca_officer', 'police_ward', 'police_area']))(
      'viewAssignments for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewAssignments).toBe(expected)
      },
    )

    // militia.service.ts MILITIA_STAFF_ROLES (GET /militia)
    test.each(
      matrix(['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff']),
    )('manageMilitia for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageMilitia).toBe(expected)
    })

    // gps.controller.ts @Roles on the tracking read endpoints
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer']))(
      'viewGps for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewGps).toBe(expected)
      },
    )

    // sos.controller.ts @Roles on PATCH /sos/:id/status
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer']))(
      'resolveSos for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.resolveSos).toBe(expected)
      },
    )

    // tasks.controller.ts @Roles on POST /tasks
    test.each(matrix(['system_admin', 'office_staff', 'ca_officer']))('createTask for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.createTask).toBe(expected)
    })

    // payroll.controller.ts class-level @Roles
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'office_staff']))('viewPayroll for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.viewPayroll).toBe(expected)
    })

    // attendance.controller.ts:89 class-level @Roles (GET/POST /attendance)
    test.each(matrix(['system_admin', 'office_staff', 'ca_officer']))('manageAttendance for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageAttendance).toBe(expected)
    })

    // attendance.controller.ts:98 GET /attendance/summary
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'office_staff']))(
      'viewAttendanceSummary for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewAttendanceSummary).toBe(expected)
      },
    )

    // tasks.controller.ts:154 GET /tasks
    test.each(matrix(['system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv']))('viewTasks for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.viewTasks).toBe(expected)
    })

    // sos.controller.ts:58 class-level @Roles (GET /sos)
    test.each(
      matrix(['dqtv_member', 'dqtv', 'ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'office_staff', 'system_admin']),
    )('viewSos for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.viewSos).toBe(expected)
    })

    // dashboard.controller.ts:31,49 (compliance, mau-03-bc), training.controller.ts:60 (compliance-report)
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'office_staff']))(
      'viewComplianceReports for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewComplianceReports).toBe(expected)
      },
    )

    // kpi.controller.ts:125 GET /kpi/summary-report
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'office_staff']))('viewKpiReport for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.viewKpiReport).toBe(expected)
    })

    // official-documents.controller.ts:63 class-level @Roles
    test.each(matrix(['system_admin', 'police_ward', 'police_area', 'office_staff', 'ca_officer']))(
      'viewOfficialDocuments for %s is %s',
      (role, expected) => {
        expect(signIn(makeUser(role)).current.can.viewOfficialDocuments).toBe(expected)
      },
    )

    // militia.service.ts MILITIA_READER_ROLES (GET /militia/:id)
    test.each(
      matrix(['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff', 'dqtv', 'dqtv_member']),
    )('viewMilitiaProfile for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.viewMilitiaProfile).toBe(expected)
    })

    // militia.controller.ts:266 POST /militia/quick-create
    test.each(matrix(['system_admin', 'office_staff', 'ca_officer']))('createMilitia for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.createMilitia).toBe(expected)
    })

    // admin.controller.ts:107,119 /admin/system-settings
    test.each(matrix(['system_admin']))('manageSystemSettings for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageSystemSettings).toBe(expected)
    })

    // devices.controller.ts:28 JwtAuthGuard only: every user manages their own sessions
    test.each(matrix(ROLE_CODES))('manageDevices for %s is %s', (role, expected) => {
      expect(signIn(makeUser(role)).current.can.manageDevices).toBe(expected)
    })
  })
})

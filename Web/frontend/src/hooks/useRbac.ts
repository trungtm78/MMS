// US-W001 AC-2: Role-based access control hook
// US-W002: Menu filtering by role
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_CODES, ROLE_PRIORITY, heldRoles, roleRank } from '@/lib/roles'
import type { UserRole } from '@/types'

// Highest privilege first — identical to the backend ROLE_PRIORITY
export const ROLE_HIERARCHY: readonly UserRole[] = ROLE_PRIORITY

/**
 * Roles granted each permission. Where a screen calls a specific backend endpoint the list is
 * that endpoint's @Roles (file named beside it), so the UI never offers what the API refuses.
 * A user holding several roles gets a permission when any of them is listed.
 */
export const PERMISSION_ROLES = {
  // /admin/users — admin.controller.ts class-level @Roles (office_staff may only assign the
  // roles AdminService.OFFICE_STAFF_ASSIGNABLE_ROLES lists)
  manageUsers: ['system_admin', 'office_staff'],
  // GET /militia, /militia/search — militia.service.ts MILITIA_STAFF_ROLES
  manageMilitia: ['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff'],
  // GET /militia/:id — militia.service.ts MILITIA_READER_ROLES (staff + the members themselves)
  viewMilitiaProfile: ['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff', 'dqtv', 'dqtv_member'],
  // POST /militia/quick-create — militia.controller.ts:266
  createMilitia: ['system_admin', 'office_staff', 'ca_officer'],
  // GET /tasks, GET /tasks/:id — tasks.controller.ts:154,179
  viewTasks: ['system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv'],
  // POST /tasks — tasks.controller.ts:165
  createTask: ['system_admin', 'office_staff', 'ca_officer'],
  // PATCH /leave/:id/review and PUT /approvals/:id/* — leave.service.ts REVIEWER_ROLES
  // (CA officers only for the DQTV assigned to them)
  approveLeave: ['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer'],
  // GET /organization/structure, GET /organization/units/:id — organization.controller.ts
  viewOrganization: ['system_admin', 'office_staff', 'police_ward', 'police_area'],
  // POST/PATCH/DELETE /organization/units, PATCH /organization/positions — organization.controller.ts
  manageOrganizationUnits: ['system_admin'],
  // GET /recruitment/applications(/:id) — recruitment.controller.ts
  viewRecruitment: ['system_admin', 'office_staff', 'police_ward', 'ca_officer'],
  // training.service.ts MANAGER_ROLES: create, update and delete training records
  manageTraining: ['system_admin', 'police_ward', 'police_area'],
  // rewards.roles.ts REWARD_STAFF_ROLES: POST /rewards, POST /discipline,
  // PATCH /discipline/:id/appeal/decision (also GET /militia/rewards-report and /rewards-export)
  manageRewards: ['system_admin', 'police_ward', 'office_staff'],
  // rewards.roles.ts REWARD_READER_ROLES: GET /rewards, GET /discipline, PATCH /discipline/:id/appeal
  // (DQTV members read and appeal only the decisions issued against them)
  viewRewards: ['system_admin', 'police_ward', 'office_staff', 'dqtv', 'dqtv_member'],
  // GET /assignments — assignments.controller.ts
  viewAssignments: ['system_admin', 'ca_officer', 'police_ward', 'police_area'],
  // POST and DELETE /assignments — assignments.controller.ts:28,39
  manageAssignments: ['system_admin'],
  // GET/POST /attendance — attendance.controller.ts:89 class-level @Roles
  manageAttendance: ['system_admin', 'office_staff', 'ca_officer'],
  // GET /attendance/summary and /attendance/export — attendance.controller.ts:98,119
  viewAttendanceSummary: ['system_admin', 'police_ward', 'police_area', 'office_staff'],
  closeAttendancePeriod: ['system_admin', 'police_ward'],
  // GET /attendance/timesheet — attendance.controller.ts:150 (DQTV members read their own row)
  viewTimesheet: ['system_admin', 'police_ward', 'police_area', 'office_staff', 'ca_officer', 'dqtv', 'dqtv_member'],
  // GET /settings/kpi-targets — settings.controller.ts:23 KPI_TARGET_READER_ROLES (PUT is manageSystemSettings)
  viewKpiTargets: ['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff'],
  // payroll.controller.ts class-level @Roles
  viewPayroll: ['system_admin', 'police_ward', 'police_area', 'office_staff'],
  // POST /payroll/periods/:id/lock inherits the payroll.controller.ts class-level @Roles
  closePayrollPeriod: ['system_admin', 'police_ward', 'police_area', 'office_staff'],
  viewAllPayroll: ['system_admin', 'ubnd_leader', 'police_ward'],
  // GET /audit, /audit-logs — audit.controller.ts
  viewAuditLog: ['system_admin', 'police_ward', 'police_area'],
  // GET /gps tracking reads — gps.controller.ts
  viewGps: ['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer'],
  // Militia members raising an SOS (POST /sos)
  sendSos: ['dqtv', 'dqtv_member'],
  // GET /sos — sos.controller.ts:58 class-level @Roles
  viewSos: ['dqtv_member', 'dqtv', 'ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'office_staff', 'system_admin'],
  // PATCH /sos/:id/status — sos.controller.ts
  resolveSos: ['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer'],
  viewReports: ['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader'],
  // GET /dashboard/compliance, GET /reports/mau-03-bc (dashboard.controller.ts:31,49) and
  // GET /training/compliance-report (training.controller.ts:60)
  viewComplianceReports: ['system_admin', 'police_ward', 'police_area', 'office_staff'],
  // GET /kpi/summary-report — kpi.controller.ts:125
  viewKpiReport: ['system_admin', 'police_ward', 'police_area', 'office_staff'],
  // /official-documents — official-documents.controller.ts:63 class-level @Roles
  viewOfficialDocuments: ['system_admin', 'police_ward', 'police_area', 'office_staff', 'ca_officer'],
  // /devices — devices.controller.ts:28 JwtAuthGuard only: everyone manages their own sessions
  manageDevices: ROLE_CODES,
  // /admin/system-settings — admin.controller.ts:107,119
  manageSystemSettings: ['system_admin'],
  // weapons.controller.ts class-level @Roles
  manageWeapons: ['system_admin', 'office_staff', 'police_ward'],
  // POST and PATCH /recruitment/applications — recruitment.controller.ts
  manageRecruitment: ['system_admin', 'office_staff', 'police_ward'],
  // GET /exemptions — exemption.controller.ts class-level @Roles
  viewExemptions: ['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'office_staff'],
  // POST /exemptions, PATCH /exemptions/:id/review — exemption.controller.ts
  decideExemption: ['system_admin', 'police_ward', 'ca_ward', 'office_staff'],
} as const satisfies Record<string, readonly UserRole[]>

export type Permission = keyof typeof PERMISSION_ROLES

export function useRbac() {
  const { user } = useAuth()
  // Every role held (primary + roles claim), highest priority first
  const roles = heldRoles(user)
  const role = user?.role ?? (roles[0] as UserRole | undefined) ?? null

  function hasRole(...allowed: readonly UserRole[]): boolean {
    return roles.some((held) => (allowed as readonly string[]).includes(held))
  }

  // True when the most privileged role held ranks at or above minRole in ROLE_PRIORITY
  function hasMinRole(minRole: UserRole): boolean {
    const threshold = roleRank(minRole)
    return roles.some((held) => roleRank(held) <= threshold)
  }

  // Unit scope enforcement: CA KV can only see their own unit
  function canAccessUnit(unitScope: string | null | undefined): boolean {
    if (!user) return false
    if (user.unitScope === null) return true // full ward access
    if (!unitScope) return true
    return user.unitScope === unitScope
  }

  const granted = Object.fromEntries(
    Object.entries(PERMISSION_ROLES).map(([permission, allowed]) => [permission, hasRole(...allowed)]),
  ) as Record<Permission, boolean>

  const can = {
    ...granted,
    manageOwnSessions: true, // any authenticated user
  } as const

  return { role, roles, user, can, hasRole, hasMinRole, canAccessUnit }
}

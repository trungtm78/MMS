// US-W001 AC-2: Role-based access control hook
// US-W002: Menu filtering by role
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/types'

// Role hierarchy (higher index = higher privilege)
const ROLE_HIERARCHY: UserRole[] = [
  'dqtv',
  'office_staff',
  'police_area',
  'ubnd_leader',
  'police_ward',
  'system_admin',
]

export function useRbac() {
  const { user } = useAuth()
  const role = user?.role ?? null

  function hasRole(...roles: UserRole[]): boolean {
    if (!role) return false
    return roles.includes(role)
  }

  function hasMinRole(minRole: UserRole): boolean {
    if (!role) return false
    return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(minRole)
  }

  // Unit scope enforcement: CA KV can only see their own unit
  function canAccessUnit(unitScope: string | null | undefined): boolean {
    if (!user) return false
    if (user.unitScope === null) return true // full ward access
    if (!unitScope) return true
    return user.unitScope === unitScope
  }

  // Permissions
  const can = {
    manageUsers: hasRole('system_admin'),
    manageMilitia: hasMinRole('office_staff'),
    createTask: hasMinRole('police_area'),
    approveLeave: hasMinRole('police_area'),
    manageAttendance: hasMinRole('office_staff'),
    closeAttendancePeriod: hasMinRole('police_ward'),
    viewPayroll: hasMinRole('office_staff'),
    closePayrollPeriod: hasMinRole('police_ward'),
    viewAllPayroll: hasRole('system_admin', 'ubnd_leader', 'police_ward'),
    viewAuditLog: hasRole('system_admin', 'police_ward'),
    viewGps: hasMinRole('police_area'),
    sendSos: hasRole('dqtv'),
    resolveSos: hasMinRole('police_area'),
    viewReports: hasMinRole('ubnd_leader'),
    manageDevices: hasRole('system_admin'),
    manageOwnSessions: true, // any authenticated user
  } as const

  return { role, user, can, hasRole, hasMinRole, canAccessUnit }
}

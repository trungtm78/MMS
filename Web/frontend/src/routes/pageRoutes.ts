// Every page of the signed-in app: its path, the permission of the endpoint it loads (checked
// before the page renders; null = any signed-in user) and the page itself, code-split so each
// page downloads the first time its route is opened
import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { Permission } from '@/hooks/useRbac'

type LazyPage = LazyExoticComponent<ComponentType>

function page<K extends string>(load: () => Promise<{ [P in K]: ComponentType }>, name: K): LazyPage {
  return lazy(async () => ({ default: (await load())[name] }))
}

export interface PageRoute {
  path: string
  permission: Permission | null
  Page: LazyPage
  /** Pages that are a bare form get the page padding here */
  layout?: 'padded' | 'panel'
}

const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage')

export const PAGE_ROUTES: readonly PageRoute[] = [
  { path: '/dashboard', permission: null, Page: DashboardPage },
  { path: '/tasks/list', permission: 'viewTasks', Page: page(() => import('@/pages/TaskListPage'), 'TaskListPage') },
  { path: '/tasks/*', permission: 'createTask', Page: page(() => import('@/components/tasks/TaskCreateForm'), 'TaskCreateForm'), layout: 'padded' },
  { path: '/attendance/*', permission: 'manageAttendance', Page: page(() => import('@/components/attendance/AttendanceForm'), 'AttendanceForm'), layout: 'padded' },
  { path: '/users/new', permission: 'manageUsers', Page: page(() => import('@/components/users/UserForm'), 'UserForm'), layout: 'padded' },
  { path: '/users/*', permission: 'manageUsers', Page: page(() => import('@/pages/UserManagementPage'), 'UserManagementPage') },
  { path: '/payroll/*', permission: 'viewPayroll', Page: page(() => import('@/pages/PayrollPage'), 'PayrollPage') },
  { path: '/militia/search', permission: 'manageMilitia', Page: page(() => import('@/pages/MilitiaSearchPage'), 'MilitiaSearchPage') },
  { path: '/militia/new', permission: 'createMilitia', Page: page(() => import('@/components/militia/MilitiaCreateForm'), 'MilitiaCreateForm'), layout: 'panel' },
  { path: '/militia/:id', permission: 'viewMilitiaProfile', Page: page(() => import('@/pages/MilitiaProfilePage'), 'MilitiaProfilePage') },
  { path: '/militia', permission: 'manageMilitia', Page: page(() => import('@/components/militia/MilitiaList'), 'MilitiaList') },
  { path: '/settings/profile', permission: null, Page: page(() => import('@/pages/SettingsProfilePage'), 'SettingsProfilePage') },
  { path: '/settings/password', permission: null, Page: page(() => import('@/pages/SettingsPasswordPage'), 'SettingsPasswordPage') },
  { path: '/settings/notifications', permission: null, Page: page(() => import('@/pages/SettingsNotificationsPage'), 'SettingsNotificationsPage') },
  { path: '/settings/chitieu', permission: 'viewKpiTargets', Page: page(() => import('@/pages/SettingsChiTieuPage'), 'SettingsChiTieuPage') },
  { path: '/settings/system', permission: 'manageSystemSettings', Page: page(() => import('@/pages/SettingsSystemPage'), 'SettingsSystemPage') },
  { path: '/compliance', permission: 'viewComplianceReports', Page: page(() => import('@/pages/ComplianceDashboardPage'), 'ComplianceDashboardPage') },
  { path: '/reports/training-compliance', permission: 'viewComplianceReports', Page: page(() => import('@/pages/TrainingComplianceReportPage'), 'TrainingComplianceReportPage') },
  { path: '/reports/roster', permission: 'manageMilitia', Page: page(() => import('@/pages/RosterReportPage'), 'RosterReportPage') },
  { path: '/reports/attendance-summary', permission: 'viewAttendanceSummary', Page: page(() => import('@/pages/AttendanceSummaryReportPage'), 'AttendanceSummaryReportPage') },
  { path: '/reports/rewards-discipline', permission: 'manageRewards', Page: page(() => import('@/pages/RewardsDisciplineReportPage'), 'RewardsDisciplineReportPage') },
  { path: '/reports/attendance', permission: 'manageAttendance', Page: page(() => import('@/pages/AttendanceReportPage'), 'AttendanceReportPage') },
  { path: '/reports/tasks', permission: 'viewTasks', Page: page(() => import('@/pages/TaskReportPage'), 'TaskReportPage') },
  { path: '/reports/custom', permission: 'viewComplianceReports', Page: page(() => import('@/pages/CustomReportPage'), 'CustomReportPage') },
  { path: '/kpi/dashboard', permission: 'viewKpiReport', Page: page(() => import('@/pages/ChiTieuDashboardPage'), 'ChiTieuDashboardPage') },
  { path: '/audit', permission: 'viewAuditLog', Page: page(() => import('@/pages/ActivityLogPage'), 'ActivityLogPage') },
  { path: '/approvals', permission: 'approveLeave', Page: page(() => import('@/pages/ApprovalsPage'), 'ApprovalsPage') },
  { path: '/timesheet', permission: 'viewTimesheet', Page: page(() => import('@/pages/TimesheetPage'), 'TimesheetPage') },
  { path: '/docs', permission: null, Page: page(() => import('@/pages/DocumentationPage'), 'DocumentationPage') },
  { path: '/assignments', permission: 'viewAssignments', Page: page(() => import('@/pages/AssignmentManagePage'), 'AssignmentManagePage') },
  { path: '/documents', permission: 'viewOfficialDocuments', Page: page(() => import('@/pages/OfficialDocumentsPage'), 'OfficialDocumentsPage') },
  { path: '/chat', permission: null, Page: page(() => import('@/pages/ChatPage'), 'ChatPage') },
  { path: '/gps', permission: 'viewGps', Page: page(() => import('@/pages/GPSTrackingPage'), 'GPSTrackingPage') },
  { path: '/leave', permission: null, Page: page(() => import('@/pages/LeavePage'), 'LeavePage') },
  { path: '/sos', permission: 'viewSos', Page: page(() => import('@/pages/SOSPage'), 'SOSPage') },
  { path: '/notifications', permission: null, Page: page(() => import('@/pages/NotificationsPage'), 'NotificationsPage') },
  { path: '/devices', permission: null, Page: page(() => import('@/pages/DeviceSessionsPage'), 'DeviceSessionsPage') },
  { path: '/organization', permission: 'viewOrganization', Page: page(() => import('@/pages/OrganizationPage'), 'OrganizationPage') },
  { path: '/weapons', permission: 'manageWeapons', Page: page(() => import('@/pages/WeaponsPage'), 'WeaponsPage') },
  { path: '/recruitment', permission: 'viewRecruitment', Page: page(() => import('@/pages/RecruitmentPage'), 'RecruitmentPage') },
  { path: '/exemptions', permission: 'viewExemptions', Page: page(() => import('@/pages/ExemptionPage'), 'ExemptionPage') },
  { path: '/training', permission: 'manageTraining', Page: page(() => import('@/pages/TrainingPlanPage'), 'TrainingPlanPage') },
  { path: '/rewards', permission: 'viewRewards', Page: page(() => import('@/pages/RewardsManagePage'), 'RewardsManagePage') },
  // Legacy system_admin area (was ProtectedRoute requiredRoles={['system_admin']})
  { path: '/admin/*', permission: 'manageSystemSettings', Page: DashboardPage },
]

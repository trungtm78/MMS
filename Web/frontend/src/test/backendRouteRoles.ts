// Who may open each screen, written out from the backend @Roles of the endpoint the screen
// loads (file:line beside each entry). Tests compare the sidebar and the route guards with this
// table, so a permission that drifts from the backend fails a test.
import type { UserRole } from '@/types'

export const ALL_ROLES: readonly UserRole[] = [
  'system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area',
  'ca_area', 'ca_officer', 'office_staff', 'dqtv', 'dqtv_member',
]
const MILITIA_STAFF: readonly UserRole[] = [
  'system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff',
]
const REPORT_READERS: readonly UserRole[] = ['system_admin', 'police_ward', 'police_area', 'office_staff']
const ATTENDANCE: readonly UserRole[] = ['system_admin', 'office_staff', 'ca_officer']
const TASK_READERS: readonly UserRole[] = ['system_admin', 'office_staff', 'ca_officer', 'dqtv_member', 'dqtv']
const LEAVE_REVIEWERS: readonly UserRole[] = ['system_admin', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer']
const REWARDS: readonly UserRole[] = ['system_admin', 'police_ward', 'office_staff']
const SYSTEM_ADMIN: readonly UserRole[] = ['system_admin']

export interface ScreenRoles {
  roles: readonly UserRole[]
  source: string
}

/** Sidebar entries, by AppRoute */
export const SIDEBAR_ROUTE_ROLES: Readonly<Record<string, ScreenRoles>> = {
  'militia-list': { roles: MILITIA_STAFF, source: 'militia.controller.ts:167 GET /militia' },
  organization: { roles: REPORT_READERS, source: 'organization.controller.ts:29 GET /organization/structure' },
  recruitment: { roles: ['system_admin', 'office_staff', 'police_ward', 'ca_officer'], source: 'recruitment.controller.ts:21' },
  exemptions: {
    roles: ['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'office_staff'],
    source: 'exemption.controller.ts:32-40',
  },
  tasks: { roles: TASK_READERS, source: 'tasks.controller.ts:154 GET /tasks' },
  attendance: { roles: ATTENDANCE, source: 'attendance.controller.ts:89' },
  timesheet: {
    roles: ['system_admin', 'police_ward', 'police_area', 'office_staff', 'ca_officer', 'dqtv', 'dqtv_member'],
    source: 'attendance.controller.ts:150 GET /attendance/timesheet',
  },
  payroll: { roles: REPORT_READERS, source: 'payroll.controller.ts:58' },
  leave: { roles: ALL_ROLES, source: 'leave.controller.ts:41-66 JwtAuthGuard only' },
  approvals: { roles: LEAVE_REVIEWERS, source: 'leave.service.ts:57-64 REVIEWER_ROLES' },
  sos: {
    roles: ['dqtv_member', 'dqtv', 'ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'office_staff', 'system_admin'],
    source: 'sos.controller.ts:58',
  },
  notifications: { roles: ALL_ROLES, source: 'notifications.controller.ts:33 ROLE_CODES' },
  'gps-tracking': {
    roles: ['ca_officer', 'police_ward', 'police_area', 'ca_ward', 'ca_area', 'system_admin'],
    source: 'gps.controller.ts:63 GET /gps/live',
  },
  training: { roles: ['system_admin', 'police_ward', 'police_area'], source: 'training.roles.ts TRAINING_MANAGER_ROLES (training-plans.controller.ts:37)' },
  'compliance-dashboard': { roles: REPORT_READERS, source: 'dashboard.controller.ts:31 GET /dashboard/compliance' },
  'report-training-compliance': { roles: REPORT_READERS, source: 'training.controller.ts:60' },
  'report-roster': { roles: MILITIA_STAFF, source: 'militia.controller.ts:167 GET /militia' },
  'report-attendance-summary': { roles: REPORT_READERS, source: 'attendance.controller.ts:98' },
  'report-rewards-discipline': { roles: REWARDS, source: 'militia.controller.ts:114' },
  reports: { roles: ATTENDANCE, source: 'attendance.controller.ts:89 GET /attendance' },
  'kpi-dashboard': { roles: REPORT_READERS, source: 'kpi-dashboard.controller.ts:27 GET /kpi/dashboard, kpi.controller.ts:125 GET /kpi/summary-report' },
  'official-documents': {
    roles: ['system_admin', 'police_ward', 'police_area', 'office_staff', 'ca_officer'],
    source: 'official-documents.controller.ts:63',
  },
  chat: { roles: ALL_ROLES, source: 'chat.controller.ts:54 ROLE_CODES' },
  'user-management': { roles: ['system_admin', 'office_staff'], source: 'admin.controller.ts:40' },
  assignments: { roles: ['system_admin', 'ca_officer', 'police_ward', 'police_area'], source: 'assignments.controller.ts:53' },
  'device-sessions': { roles: ALL_ROLES, source: 'devices.controller.ts:28 JwtAuthGuard only (own sessions)' },
  'audit-log': { roles: ['system_admin', 'police_ward', 'police_area'], source: 'audit.controller.ts:33' },
  weapons: { roles: ['system_admin', 'office_staff', 'police_ward'], source: 'weapons.controller.ts:14' },
  rewards: {
    roles: ['system_admin', 'police_ward', 'office_staff', 'dqtv', 'dqtv_member'],
    source: 'rewards.roles.ts:13 REWARD_READER_ROLES (GET /rewards, GET /discipline)',
  },
}

/** Every page route of App.tsx, by path */
export const PAGE_PATH_ROLES: Readonly<Record<string, ScreenRoles>> = {
  '/dashboard': { roles: ALL_ROLES, source: 'dashboard.controller.ts:19 JwtAuthGuard only' },
  '/tasks/list': SIDEBAR_ROUTE_ROLES.tasks,
  '/tasks/*': { roles: ['system_admin', 'office_staff', 'ca_officer'], source: 'tasks.controller.ts:165 POST /tasks' },
  '/attendance/*': SIDEBAR_ROUTE_ROLES.attendance,
  '/users/new': SIDEBAR_ROUTE_ROLES['user-management'],
  '/users/*': SIDEBAR_ROUTE_ROLES['user-management'],
  '/payroll/*': SIDEBAR_ROUTE_ROLES.payroll,
  '/militia/search': { roles: MILITIA_STAFF, source: 'militia.controller.ts:208 GET /militia/search' },
  '/militia/new': { roles: ['system_admin', 'office_staff', 'ca_officer'], source: 'militia.controller.ts:266 POST /militia/quick-create' },
  '/militia/:id': { roles: [...MILITIA_STAFF, 'dqtv', 'dqtv_member'], source: 'militia.controller.ts:256 MILITIA_READER_ROLES' },
  '/militia': SIDEBAR_ROUTE_ROLES['militia-list'],
  '/settings/profile': { roles: ALL_ROLES, source: 'users.controller.ts:26 JwtAuthGuard only' },
  '/settings/password': { roles: ALL_ROLES, source: 'users.controller.ts:43 JwtAuthGuard only' },
  '/settings/notifications': { roles: ALL_ROLES, source: 'settings.controller.ts:64,71 ROLE_CODES (own preferences)' },
  '/settings/chitieu': {
    roles: ['system_admin', 'police_ward', 'ca_ward', 'ubnd_leader', 'police_area', 'ca_area', 'ca_officer', 'office_staff'],
    source: 'settings.controller.ts:23 KPI_TARGET_READER_ROLES (GET /settings/kpi-targets; PUT is system_admin)',
  },
  '/settings/system': { roles: SYSTEM_ADMIN, source: 'admin.controller.ts:107,119' },
  '/compliance': SIDEBAR_ROUTE_ROLES['compliance-dashboard'],
  '/reports/training-compliance': SIDEBAR_ROUTE_ROLES['report-training-compliance'],
  '/reports/roster': SIDEBAR_ROUTE_ROLES['report-roster'],
  '/reports/attendance-summary': SIDEBAR_ROUTE_ROLES['report-attendance-summary'],
  '/reports/rewards-discipline': SIDEBAR_ROUTE_ROLES['report-rewards-discipline'],
  '/reports/attendance': SIDEBAR_ROUTE_ROLES.reports,
  '/reports/tasks': { roles: TASK_READERS, source: 'tasks.controller.ts:175 GET /tasks/report' },
  '/reports/custom': { roles: REPORT_READERS, source: 'custom-reports.controller.ts:20 GET /reports/custom, dashboard.controller.ts:49 GET /reports/mau-03-bc' },
  '/kpi/dashboard': SIDEBAR_ROUTE_ROLES['kpi-dashboard'],
  '/audit': SIDEBAR_ROUTE_ROLES['audit-log'],
  '/approvals': SIDEBAR_ROUTE_ROLES.approvals,
  '/timesheet': SIDEBAR_ROUTE_ROLES.timesheet,
  '/docs': { roles: ALL_ROLES, source: 'static help' },
  '/assignments': SIDEBAR_ROUTE_ROLES.assignments,
  '/documents': SIDEBAR_ROUTE_ROLES['official-documents'],
  '/chat': SIDEBAR_ROUTE_ROLES.chat,
  '/gps': SIDEBAR_ROUTE_ROLES['gps-tracking'],
  '/leave': SIDEBAR_ROUTE_ROLES.leave,
  '/sos': SIDEBAR_ROUTE_ROLES.sos,
  '/notifications': SIDEBAR_ROUTE_ROLES.notifications,
  '/devices': SIDEBAR_ROUTE_ROLES['device-sessions'],
  '/organization': SIDEBAR_ROUTE_ROLES.organization,
  '/weapons': SIDEBAR_ROUTE_ROLES.weapons,
  '/recruitment': SIDEBAR_ROUTE_ROLES.recruitment,
  '/exemptions': SIDEBAR_ROUTE_ROLES.exemptions,
  '/training': SIDEBAR_ROUTE_ROLES.training,
  '/rewards': SIDEBAR_ROUTE_ROLES.rewards,
  '/admin/*': { roles: SYSTEM_ADMIN, source: 'admin.controller.ts:107 (system_admin area)' },
}

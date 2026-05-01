// Main application router
// US-W001: Route-level auth guard + role-based redirects
// US-SS-06..09: Routes for SmartSelect demo screens
import { memo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SocketProvider } from '@/contexts/SocketContext'
import { LoginPage } from '@/components/auth/LoginPage'
import { ProtectedRoute, ForbiddenPage } from '@/components/layout/ProtectedRoute'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { GlobalFooter } from '@/components/layout/GlobalFooter'
import { DashboardPage } from '@/pages/DashboardPage'
import { TaskCreateForm } from '@/components/tasks/TaskCreateForm'
import { AttendanceForm } from '@/components/attendance/AttendanceForm'
import { PayrollPage } from '@/pages/PayrollPage'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { UserForm } from '@/components/users/UserForm'
import { TaskListPage } from '@/pages/TaskListPage'
import { MilitiaSearchPage } from '@/pages/MilitiaSearchPage'
import { MilitiaList } from '@/components/militia/MilitiaList'
import { MilitiaCreateForm } from '@/components/militia/MilitiaCreateForm'
import { SettingsProfilePage } from '@/pages/SettingsProfilePage'
import { SettingsPasswordPage } from '@/pages/SettingsPasswordPage'
import { AttendanceReportPage } from '@/pages/AttendanceReportPage'
import { MilitiaProfilePage } from '@/pages/MilitiaProfilePage'
import { SettingsNotificationsPage } from '@/pages/SettingsNotificationsPage'
import { SettingsChiTieuPage } from '@/pages/SettingsChiTieuPage'
import { SettingsSystemPage } from '@/pages/SettingsSystemPage'
import { TaskReportPage } from '@/pages/TaskReportPage'
import { CustomReportPage } from '@/pages/CustomReportPage'
import { ChiTieuDashboardPage } from '@/pages/ChiTieuDashboardPage'
import { ActivityLogPage } from '@/pages/ActivityLogPage'
import { ApprovalsPage } from '@/pages/ApprovalsPage'
import { TimesheetPage } from '@/pages/TimesheetPage'
import { DocumentationPage } from '@/pages/DocumentationPage'
import { AssignmentManagePage } from '@/pages/AssignmentManagePage'
import { OfficialDocumentsPage } from '@/pages/OfficialDocumentsPage'
import { ChatPage } from '@/pages/ChatPage'
import { GPSTrackingPage } from '@/pages/GPSTrackingPage'
import { LeavePage } from '@/pages/LeavePage'
import { SOSPage } from '@/pages/SOSPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { DeviceSessionsPage } from '@/pages/DeviceSessionsPage'
import { OrganizationPage } from '@/pages/OrganizationPage'
import { WeaponsPage } from '@/pages/WeaponsPage'
import { RecruitmentPage } from '@/pages/RecruitmentPage'
import { ExemptionPage } from '@/pages/ExemptionPage'
import { TrainingPlanPage } from '@/pages/TrainingPlanPage'
import { RewardsManagePage } from '@/pages/RewardsManagePage'
import { ComplianceDashboardPage } from '@/pages/ComplianceDashboardPage'
import { TrainingComplianceReportPage } from '@/pages/TrainingComplianceReportPage'
import { RosterReportPage } from '@/pages/RosterReportPage'
import { AttendanceSummaryReportPage } from '@/pages/AttendanceSummaryReportPage'
import { RewardsDisciplineReportPage } from '@/pages/RewardsDisciplineReportPage'
import type { AppRoute } from '@/components/layout/Sidebar'
import { QuickActionsWidget } from '@/components/layout/QuickActionsWidget'

// F8: memoize layout shell components so they don't re-render on route changes
const MemoSidebar = memo(Sidebar)
const MemoHeader  = memo(Header)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

/** Map URL pathname to the AppRoute enum used by Sidebar for active highlight */
function pathToAppRoute(pathname: string): AppRoute {
  if (pathname.startsWith('/tasks')) return 'tasks'
  if (pathname.startsWith('/attendance') || pathname.startsWith('/timesheet')) return 'attendance'
  if (pathname.startsWith('/users')) return 'user-management'
  if (pathname.startsWith('/payroll')) return 'payroll'
  if (pathname.startsWith('/militia')) return 'militia-list'
  if (pathname.startsWith('/approvals')) return 'approvals'
  if (pathname.startsWith('/assignments')) return 'assignments'
  if (pathname.startsWith('/compliance')) return 'compliance-dashboard'
  if (pathname === '/reports/training-compliance') return 'report-training-compliance'
  if (pathname === '/reports/roster') return 'report-roster'
  if (pathname === '/reports/attendance-summary') return 'report-attendance-summary'
  if (pathname === '/reports/rewards-discipline') return 'report-rewards-discipline'
  if (pathname.startsWith('/reports') || pathname.startsWith('/kpi') || pathname.startsWith('/audit')) return 'reports'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/gps')) return 'gps-tracking'
  if (pathname.startsWith('/leave')) return 'leave'
  if (pathname.startsWith('/sos')) return 'sos'
  if (pathname.startsWith('/notifications')) return 'notifications'
  if (pathname.startsWith('/devices')) return 'device-sessions'
  if (pathname.startsWith('/organization')) return 'organization'
  if (pathname.startsWith('/weapons')) return 'weapons'
  if (pathname.startsWith('/recruitment')) return 'recruitment'
  if (pathname.startsWith('/exemptions')) return 'exemptions'
  if (pathname.startsWith('/training')) return 'training'
  if (pathname.startsWith('/rewards')) return 'rewards'
  if (pathname.startsWith('/documents')) return 'official-documents'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/docs')) return 'help'
  if (pathname.startsWith('/admin')) return 'dashboard'
  return 'dashboard'
}

function AppShell() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const currentRoute = pathToAppRoute(location.pathname)

  // onNavigate translates AppRoute back to a URL path for React Router navigation
  const handleNavigate = (route: AppRoute) => {
    const routeMap: Record<AppRoute, string> = {
      'dashboard':          '/dashboard',
      'militia-list':       '/militia',
      'militia-search':     '/militia/search',
      'user-management':    '/users',
      'tasks':              '/tasks/list',
      'attendance':         '/attendance',
      'leave':              '/leave',
      'sos':                '/sos',
      'gps-tracking':       '/gps',
      'payroll':            '/payroll',
      'audit-log':          '/audit',
      'notifications':      '/notifications',
      'device-sessions':    '/devices',
      'reports':            '/reports/attendance',
      'approvals':          '/approvals',
      'timesheet':          '/timesheet',
      'kpi-dashboard':      '/kpi/dashboard',
      'assignments':        '/assignments',
      'official-documents': '/documents',
      'chat':               '/chat',
      'settings':           '/settings/profile',
      'help':               '/docs',
      'organization':       '/organization',
      'weapons':            '/weapons',
      'recruitment':        '/recruitment',
      'exemptions':         '/exemptions',
      'training':           '/training',
      'rewards':            '/rewards',
      'compliance-dashboard':         '/compliance',
      'report-training-compliance':   '/reports/training-compliance',
      'report-roster':                '/reports/roster',
      'report-attendance-summary':    '/reports/attendance-summary',
      'report-rewards-discipline':    '/reports/rewards-discipline',
    }
    navigate(routeMap[route] ?? '/dashboard')
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      <MemoSidebar
        current={currentRoute}
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        <MemoHeader
          onMenuToggle={() => setSidebarOpen(o => !o)}
        />
        <main className="flex-1 overflow-y-auto pt-20 flex flex-col">
          <div className="flex-1 flex flex-col">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tasks/list" element={<TaskListPage />} />
            <Route path="/tasks/*" element={<div className="p-6"><TaskCreateForm /></div>} />
            <Route path="/attendance/*" element={<div className="p-6"><AttendanceForm /></div>} />
            <Route path="/users/new" element={<div className="p-6"><UserForm /></div>} />
            <Route path="/users/*" element={<UserManagementPage />} />
            <Route path="/payroll/*" element={<PayrollPage />} />
            <Route path="/militia/search" element={<MilitiaSearchPage />} />
            {/* /militia/new MUST precede /militia/:id — React Router matches top-to-bottom */}
            <Route path="/militia/new" element={
              <ProtectedRoute requiredRoles={['system_admin', 'office_staff', 'ca_officer'] as import('@/types').UserRole[]}>
                <div className="p-6 space-y-6 bg-[#F8FAFC]"><MilitiaCreateForm /></div>
              </ProtectedRoute>
            } />
            <Route path="/militia/:id" element={<MilitiaProfilePage />} />
            <Route path="/militia" element={<MilitiaList />} />
            <Route path="/settings/profile" element={<SettingsProfilePage />} />
            <Route path="/settings/password" element={<SettingsPasswordPage />} />
            <Route path="/settings/notifications" element={<SettingsNotificationsPage />} />
            <Route path="/settings/chitieu" element={<SettingsChiTieuPage />} />
            <Route path="/settings/system" element={<SettingsSystemPage />} />
            <Route path="/compliance" element={<ComplianceDashboardPage />} />
            <Route path="/reports/training-compliance" element={<TrainingComplianceReportPage />} />
            <Route path="/reports/roster" element={<RosterReportPage />} />
            <Route path="/reports/attendance-summary" element={<AttendanceSummaryReportPage />} />
            <Route path="/reports/rewards-discipline" element={<RewardsDisciplineReportPage />} />
            <Route path="/reports/attendance" element={<AttendanceReportPage />} />
            <Route path="/reports/tasks" element={<TaskReportPage />} />
            <Route path="/reports/custom" element={<CustomReportPage />} />
            <Route path="/kpi/dashboard" element={<ChiTieuDashboardPage />} />
            <Route path="/audit" element={<ActivityLogPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/timesheet" element={<TimesheetPage />} />
            <Route path="/docs" element={<DocumentationPage />} />
            <Route path="/assignments" element={<AssignmentManagePage />} />
            <Route path="/documents" element={<OfficialDocumentsPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/gps" element={<GPSTrackingPage />} />
            <Route path="/leave" element={<LeavePage />} />
            <Route path="/sos" element={<SOSPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/devices" element={<DeviceSessionsPage />} />
            <Route path="/organization" element={<OrganizationPage />} />
            <Route path="/weapons" element={<WeaponsPage />} />
            <Route path="/recruitment" element={<RecruitmentPage />} />
            <Route path="/exemptions" element={<ExemptionPage />} />
            <Route path="/training" element={<TrainingPlanPage />} />
            <Route path="/rewards" element={<RewardsManagePage />} />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute requiredRoles={['system_admin']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </div>
          <GlobalFooter />
        </main>
      </div>
      <QuickActionsWidget />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <SocketProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forbidden" element={<ForbiddenPage />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              />
            </Routes>
            <Toaster position="top-right" richColors />
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

// Main application router
// US-W001: Route-level auth guard + role-based redirects
// US-SS-06..09: Routes for SmartSelect demo screens
import { memo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SocketProvider } from '@/contexts/SocketContext'
import { LoginPage } from '@/components/auth/LoginPage'
import { ProtectedRoute, ForbiddenPage } from '@/components/layout/ProtectedRoute'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { DashboardPage } from '@/pages/DashboardPage'
import { TaskCreateForm } from '@/components/tasks/TaskCreateForm'
import { AttendanceForm } from '@/components/attendance/AttendanceForm'
import { UserForm } from '@/components/users/UserForm'
import { PayrollKpiFilter } from '@/components/payroll/PayrollKpiFilter'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { TaskListPage } from '@/pages/TaskListPage'
import { MilitiaSearchPage } from '@/pages/MilitiaSearchPage'
import { MilitiaList } from '@/components/militia/MilitiaList'
import { SettingsProfilePage } from '@/pages/SettingsProfilePage'
import { SettingsPasswordPage } from '@/pages/SettingsPasswordPage'
import { AttendanceReportPage } from '@/pages/AttendanceReportPage'
import type { AppRoute } from '@/components/layout/Sidebar'

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
  if (pathname.startsWith('/attendance')) return 'attendance'
  if (pathname.startsWith('/users')) return 'user-management'
  if (pathname.startsWith('/payroll')) return 'payroll'
  if (pathname.startsWith('/militia/search')) return 'militia-list'
  if (pathname.startsWith('/militia')) return 'militia-list'
  if (pathname.startsWith('/admin')) return 'dashboard'
  return 'dashboard'
}

function AppShell() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const currentRoute = pathToAppRoute(location.pathname)

  // onNavigate translates AppRoute back to a URL path for React Router navigation
  const handleNavigate = (route: AppRoute) => {
    const routeMap: Record<AppRoute, string> = {
      'dashboard': '/dashboard',
      'militia-list': '/militia',
      'user-management': '/users',
      'tasks': '/tasks',
      'attendance': '/attendance',
      'leave': '/leave',
      'sos': '/sos',
      'gps-tracking': '/gps',
      'payroll': '/payroll',
      'audit-log': '/audit',
      'notifications': '/notifications',
      'device-sessions': '/devices',
      'reports': '/reports',
    }
    navigate(routeMap[route] ?? '/dashboard')
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <MemoSidebar current={currentRoute} onNavigate={handleNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden pl-64">
        <MemoHeader />
        <main className="flex-1 overflow-y-auto pt-16">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tasks/list" element={<TaskListPage />} />
            <Route path="/tasks/*" element={<div className="p-6"><TaskCreateForm /></div>} />
            <Route path="/attendance/*" element={<div className="p-6"><AttendanceForm /></div>} />
            <Route path="/users/*" element={<UserManagementPage />} />
            <Route path="/payroll/*" element={<div className="p-6"><PayrollKpiFilter /></div>} />
            <Route path="/militia/search" element={<MilitiaSearchPage />} />
            <Route path="/militia" element={<MilitiaList />} />
            <Route path="/settings/profile" element={<SettingsProfilePage />} />
            <Route path="/settings/password" element={<SettingsPasswordPage />} />
            <Route path="/reports/attendance" element={<AttendanceReportPage />} />
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
        </main>
      </div>
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

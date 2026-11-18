// Main application router
// US-W001: Route-level auth guard + role-based redirects
// Pages are code-split (routes/pageRoutes.ts) and guarded by the permission of the endpoint they load
import { memo, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { AuthProvider } from '@/contexts/AuthProvider'
import { SocketProvider } from '@/contexts/SocketContext'
import { LoginPage } from '@/components/auth/LoginPage'
import { ProtectedRoute, ForbiddenPage } from '@/components/layout/ProtectedRoute'
import { RequirePermission } from '@/components/layout/RequirePermission'
import { RouteBoundary } from '@/components/layout/RouteBoundary'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { GlobalFooter } from '@/components/layout/GlobalFooter'
import type { AppRoute } from '@/components/layout/Sidebar'
import { QuickActionsWidget } from '@/components/layout/QuickActionsWidget'
import { PAGE_ROUTES, type PageRoute } from '@/routes/pageRoutes'

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

const LAYOUT_CLASS: Record<NonNullable<PageRoute['layout']>, string> = {
  padded: 'p-6',
  panel: 'p-6 space-y-6 bg-[#F8FAFC]',
}

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
            {PAGE_ROUTES.map(({ path, permission, Page, layout }) => (
              <Route
                key={path}
                path={path}
                element={
                  <RequirePermission permission={permission}>
                    {/* Keyed by route so an error on one page is cleared by opening another */}
                    <RouteBoundary key={path}>
                      {layout ? (
                        <div className={LAYOUT_CLASS[layout]}>
                          <Page />
                        </div>
                      ) : (
                        <Page />
                      )}
                    </RouteBoundary>
                  </RequirePermission>
                }
              />
            ))}
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

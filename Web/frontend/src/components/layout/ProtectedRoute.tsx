// US-W001 AC-2: Route guard — redirect to login if not authenticated
// US-W001 NP-06: Forbidden page if role insufficient
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useRbac } from '@/hooks/useRbac'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRoles?: UserRole[]
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { t } = useTranslation()
  const { isAuthenticated, isLoading } = useAuth()
  const { hasRole } = useRbac()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-slate-500">{t('common.states.loading')}</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && !hasRole(...requiredRoles)) {
    return <ForbiddenPage />
  }

  return <>{children}</>
}

// US-W001 NP-06: ForbiddenPage — shown when role insufficient or scope violation
export function ForbiddenPage() {
  const { t } = useTranslation()
  return (
    <div
      data-testid="forbidden-page"
      className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center"
    >
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
        <span className="text-red-500 text-4xl">🚫</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-800">{t('layout.forbidden.page.title')}</h2>
      <p className="text-slate-500 max-w-sm">
        {t('layout.forbidden.page.description')}
      </p>
    </div>
  )
}

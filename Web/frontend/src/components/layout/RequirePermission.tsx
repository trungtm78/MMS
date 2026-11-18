// Route guard: a role without the permission of the page's endpoint is sent to /forbidden
// before the page (and its code chunk) loads
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useRbac, type Permission } from '@/hooks/useRbac'

interface RequirePermissionProps {
  /** null: every signed-in user */
  permission: Permission | null
  children: ReactNode
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { can } = useRbac()
  if (permission !== null && !can[permission]) return <Navigate to="/forbidden" replace />
  return <>{children}</>
}

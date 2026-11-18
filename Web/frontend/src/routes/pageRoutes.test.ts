import { describe, it, expect } from 'vitest'
import { PAGE_ROUTES } from './pageRoutes'
import { PERMISSION_ROLES } from '@/hooks/useRbac'
import { ALL_ROLES, PAGE_PATH_ROLES } from '@/test/backendRouteRoles'

const sorted = (roles: readonly string[]) => [...roles].sort()

describe('page routes', () => {
  it('guards every page of the app and no page is missing from the backend table', () => {
    expect(sorted(PAGE_ROUTES.map((r) => r.path))).toEqual(sorted(Object.keys(PAGE_PATH_ROLES)))
  })

  // One mapping per path: the route guard admits exactly the roles of the endpoint the page loads
  it.each(Object.entries(PAGE_PATH_ROLES))('%s admits exactly the roles of its endpoint', (path, { roles, source }) => {
    const route = PAGE_ROUTES.find((r) => r.path === path)
    expect(route, `${path} is not routed`).toBeDefined()
    const admitted = route!.permission === null ? ALL_ROLES : PERMISSION_ROLES[route!.permission]
    expect({ path, source, roles: sorted(admitted) }).toEqual({ path, source, roles: sorted(roles) })
  })
})

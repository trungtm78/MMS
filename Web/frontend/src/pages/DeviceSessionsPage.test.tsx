import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock useRbac
vi.mock('@/hooks/useRbac', () => ({
  useRbac: () => ({ can: { manageDevices: false }, role: 'dqtv', hasRole: vi.fn(), hasMinRole: vi.fn(), canAccessUnit: vi.fn() })
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { fullName: 'Test', role: 'dqtv' }, isAuthenticated: true, logout: vi.fn() })
}))

import { DeviceSessionsPage } from './DeviceSessionsPage'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('DeviceSessionsPage', () => {
  it('redirects non-admin to /forbidden', () => {
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/devices']}>
          <DeviceSessionsPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
    // Navigate component renders nothing when redirected — check no device table
    expect(screen.queryByTestId('device-sessions-page')).not.toBeInTheDocument()
  })
})

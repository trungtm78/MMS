import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { OrganizationPage } from './OrganizationPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageMilitia: true } }) }))

const mockUnits = [
  { id: 'u1', type: 'dai_doi', name: 'Đại đội 1', capacity: 100, memberCount: 85, children: [
    { id: 'u2', type: 'trung_doi', name: 'Trung đội 1', capacity: 30, memberCount: 28, children: [] },
  ]},
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('OrganizationPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockUnits })
  })

  it('renders heading', async () => {
    wrap(<OrganizationPage />)
    await waitFor(() => expect(screen.getByTestId('organization-page')).toBeInTheDocument())
    expect(screen.getByText(/Cơ cấu tổ chức/)).toBeInTheDocument()
  })

  it('renders unit cards after load', async () => {
    wrap(<OrganizationPage />)
    await waitFor(() => expect(screen.getByTestId('unit-card-u1')).toBeInTheDocument())
    expect(screen.getByText('Đại đội 1')).toBeInTheDocument()
  })

  it('shows add unit button', async () => {
    wrap(<OrganizationPage />)
    await waitFor(() => expect(screen.getByTestId('add-unit-btn')).toBeInTheDocument())
  })

  it('redirects non-managers to /forbidden', () => {
    vi.doMock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageMilitia: false } }) }))
  })
})

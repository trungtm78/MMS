import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { RecruitmentPage } from './RecruitmentPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageMilitia: true } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'system_admin', fullName: 'Admin' } }) }))

const mockApps = [
  { id: 'a1', name: 'Nguyễn Văn X', status: 'new', phone: '0901234567', address: 'KP1', age: 25, applyDate: '2026-04-01' },
  { id: 'a2', name: 'Trần Thị Y', status: 'approved', phone: '0912345678', address: 'KP2', age: 23, applyDate: '2026-04-10' },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('RecruitmentPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockApps })
  })

  it('renders page', async () => {
    wrap(<RecruitmentPage />)
    await waitFor(() => expect(screen.getByTestId('recruitment-page')).toBeInTheDocument())
  })

  it('shows applicant names after load', async () => {
    wrap(<RecruitmentPage />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn X')).toBeInTheDocument())
    expect(screen.getByText('Trần Thị Y')).toBeInTheDocument()
  })

  it('shows create application button', async () => {
    wrap(<RecruitmentPage />)
    await waitFor(() => expect(screen.getByTestId('create-application-btn')).toBeInTheDocument())
  })
})

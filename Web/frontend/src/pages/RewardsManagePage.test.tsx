import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { RewardsManagePage } from './RewardsManagePage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageMilitia: true } }) }))

const mockRewards = [
  { id: 'r1', militiaId: 'm1', militiaName: 'Nguyễn Văn A', type: 'chien_si_thi_dua', title: 'Chiến sĩ thi đua', issuedDate: '2026-03-15', level: 'xa', createdAt: '2026-03-15T00:00:00Z' },
]
const mockDiscipline: never[] = []

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('RewardsManagePage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockImplementation((url: string) => {
      if (url.includes('/discipline')) return Promise.resolve({ data: mockDiscipline })
      return Promise.resolve({ data: mockRewards })
    })
  })

  it('renders page', async () => {
    wrap(<RewardsManagePage />)
    await waitFor(() => expect(screen.getByTestId('rewards-page')).toBeInTheDocument())
  })

  it('shows reward records after load', async () => {
    wrap(<RewardsManagePage />)
    await waitFor(() => expect(screen.getByTestId('reward-row-r1')).toBeInTheDocument())
  })

  it('shows create reward button', async () => {
    wrap(<RewardsManagePage />)
    await waitFor(() => expect(screen.getByTestId('create-reward-btn')).toBeInTheDocument())
  })

  it('shows create discipline button', async () => {
    wrap(<RewardsManagePage />)
    await waitFor(() => expect(screen.getByTestId('tab-discipline')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('tab-discipline'))
    await waitFor(() => expect(screen.getByTestId('create-discipline-btn')).toBeInTheDocument())
  })
})

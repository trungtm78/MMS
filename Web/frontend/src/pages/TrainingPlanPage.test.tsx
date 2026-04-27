import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TrainingPlanPage } from './TrainingPlanPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageMilitia: true } }) }))

const mockPlans = [
  { id: 'tp1', year: 2026, type: 'Chiến đấu cơ bản', requiredDays: 15, completedDays: 10, status: 'active' },
]
const mockSessions = [
  { id: 'ts1', planId: 'tp1', name: 'Đợt 1 năm 2026', type: 'military', startDate: '2026-06-01', endDate: '2026-06-15', location: 'Thao trường', daysCount: 15, status: 'upcoming' },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('TrainingPlanPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockImplementation((url: string) => {
      if (url.includes('/training/sessions')) return Promise.resolve({ data: mockSessions })
      return Promise.resolve({ data: mockPlans })
    })
  })

  it('renders page', async () => {
    wrap(<TrainingPlanPage />)
    await waitFor(() => expect(screen.getByTestId('training-page')).toBeInTheDocument())
  })

  it('shows training plans after load', async () => {
    wrap(<TrainingPlanPage />)
    await waitFor(() => expect(screen.getByText('Chiến đấu cơ bản')).toBeInTheDocument())
  })

  it('shows create plan button', async () => {
    wrap(<TrainingPlanPage />)
    await waitFor(() => expect(screen.getByTestId('create-plan-btn')).toBeInTheDocument())
  })

  it('shows session rows', async () => {
    wrap(<TrainingPlanPage />)
    await waitFor(() => expect(screen.getByTestId('training-tab-sessions')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('training-tab-sessions'))
    await waitFor(() => expect(screen.getByTestId('session-row-ts1')).toBeInTheDocument())
  })
})

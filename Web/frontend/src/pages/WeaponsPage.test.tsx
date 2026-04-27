import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { WeaponsPage } from './WeaponsPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageWeapons: true, manageMilitia: true }, hasMinRole: () => true }) }))

const mockWeapons = [
  { id: 'w1', type: 'Súng trường', serialNumber: 'SN-001', acquiredAt: '2020-01-01', condition: 'good', storageLocation: 'Kho 1', responsiblePersonName: 'Trần A' },
]
const mockAllocations = [
  { id: 'al1', weaponId: 'w1', weaponType: 'Súng trường', serialNumber: 'SN-001', allocatedTo: 'u1', allocatedToName: 'Nguyễn B', purpose: 'Tuần tra', allocatedAt: '2026-04-01T00:00:00Z' },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('WeaponsPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockImplementation((url: string) => {
      if (url.includes('/weapons/allocations')) return Promise.resolve({ data: mockAllocations })
      return Promise.resolve({ data: mockWeapons })
    })
  })

  it('renders page', async () => {
    wrap(<WeaponsPage />)
    await waitFor(() => expect(screen.getByTestId('weapons-page')).toBeInTheDocument())
  })

  it('shows weapons tab', async () => {
    wrap(<WeaponsPage />)
    await waitFor(() => expect(screen.getByTestId('weapons-tab-catalog')).toBeInTheDocument())
  })

  it('shows weapon rows after load', async () => {
    wrap(<WeaponsPage />)
    await waitFor(() => expect(screen.getByTestId('weapon-row-w1')).toBeInTheDocument())
  })

  it('shows add weapon button', async () => {
    wrap(<WeaponsPage />)
    await waitFor(() => expect(screen.getByTestId('add-weapon-btn')).toBeInTheDocument())
  })

  it('switches to allocation log tab', async () => {
    wrap(<WeaponsPage />)
    await waitFor(() => expect(screen.getByTestId('weapons-tab-log')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('weapons-tab-log'))
    await waitFor(() => expect(screen.getByText('Nguyễn B')).toBeInTheDocument())
  })
})

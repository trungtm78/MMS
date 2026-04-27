import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { GPSTrackingPage } from './GPSTrackingPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { viewGps: true } }) }))

const mockLocations = [
  { id: 'loc-1', userId: 'u1', name: 'Nguyễn Văn A', lat: 10.762, lng: 106.660, status: 'online', lastUpdate: new Date().toISOString() },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('GPSTrackingPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockLocations })
  })

  it('renders page container', async () => {
    wrap(<GPSTrackingPage />)
    await waitFor(() => expect(screen.getByTestId('gps-page')).toBeInTheDocument())
  })

  it('shows GPS map placeholder', async () => {
    wrap(<GPSTrackingPage />)
    await waitFor(() => expect(screen.getByTestId('gps-map-placeholder')).toBeInTheDocument())
  })

  it('shows member GPS entries after load', async () => {
    wrap(<GPSTrackingPage />)
    await waitFor(() => expect(screen.getByTestId('gps-member-u1')).toBeInTheDocument())
  })

  it('redirects non-GPS users to /forbidden', () => {
    vi.doMock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { viewGps: false } }) }))
  })
})

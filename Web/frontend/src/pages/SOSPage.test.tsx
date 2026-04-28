import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SOSPage } from './SOSPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockAlerts = [
  { id: 'sos-1', reportedBy: 'u1', reportedByName: 'Nguyễn Văn A', location: 'KP1', createdAt: new Date().toISOString(), status: 'active' },
  { id: 'sos-2', reportedBy: 'u2', reportedByName: 'Trần Thị B', location: 'KP2', createdAt: new Date().toISOString(), status: 'resolved' },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SOSPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockAlerts })
    vi.mocked(apiClient.default.patch).mockResolvedValue({ data: {} })
  })

  it('renders heading', () => {
    wrap(<SOSPage />)
    expect(screen.getByText('Cảnh báo SOS')).toBeInTheDocument()
  })

  it('shows alert list after load', async () => {
    wrap(<SOSPage />)
    await waitFor(() => expect(screen.getByTestId('sos-alert-sos-1')).toBeInTheDocument())
    expect(screen.getByTestId('sos-alert-sos-2')).toBeInTheDocument()
  })

  it('shows active alert count badge', async () => {
    wrap(<SOSPage />)
    await waitFor(() => expect(screen.getByText('1 cảnh báo đang hoạt động')).toBeInTheDocument())
  })

  it('shows resolve button for active alerts only', async () => {
    wrap(<SOSPage />)
    await waitFor(() => expect(screen.getByTestId('resolve-sos-sos-1')).toBeInTheDocument())
    expect(screen.queryByTestId('resolve-sos-sos-2')).not.toBeInTheDocument()
  })

  it('shows empty state when no alerts', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: [] })
    wrap(<SOSPage />)
    await waitFor(() => expect(screen.getByText('Không có cảnh báo nào')).toBeInTheDocument())
  })

  it('calls PATCH /sos/:id/resolve when resolve clicked', async () => {
    wrap(<SOSPage />)
    await waitFor(() => expect(screen.getByTestId('resolve-sos-sos-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('resolve-sos-sos-1'))
    await waitFor(() => expect(vi.mocked(apiClient.default.patch)).toHaveBeenCalledWith('/sos/sos-1/resolve'))
  })
})

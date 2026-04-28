import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LeavePage } from './LeavePage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({
  useRbac: () => ({ can: { manageAttendance: false } }),
}))

const mockLeaves = [
  { id: 'l1', type: 'phep_nam', startDate: '2026-05-01', endDate: '2026-05-03', reason: 'Nghỉ cá nhân', status: 'pending', createdAt: '2026-04-27T10:00:00Z' },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LeavePage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockLeaves })
  })

  it('renders heading', () => {
    wrap(<LeavePage />)
    expect(screen.getByText('Quản lý nghỉ phép')).toBeInTheDocument()
  })

  it('shows "Đơn của tôi" tab', () => {
    wrap(<LeavePage />)
    expect(screen.getByTestId('tab-my-leaves')).toBeInTheDocument()
  })

  it('does not show approve tab for non-managers', () => {
    wrap(<LeavePage />)
    expect(screen.queryByTestId('tab-approve')).not.toBeInTheDocument()
  })

  it('shows leave records after load', async () => {
    wrap(<LeavePage />)
    await waitFor(() => expect(screen.getByText('Phép năm')).toBeInTheDocument())
  })

  it('shows create button on my-leaves tab', async () => {
    wrap(<LeavePage />)
    await waitFor(() => expect(screen.getByTestId('create-leave-btn')).toBeInTheDocument())
  })

  it('opens create modal when create button clicked', async () => {
    wrap(<LeavePage />)
    await waitFor(() => expect(screen.getByTestId('create-leave-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('create-leave-btn'))
    expect(screen.getByTestId('leave-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('leave-submit-btn')).toBeInTheDocument()
  })

  it('shows empty state when no leaves', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: [] })
    wrap(<LeavePage />)
    await waitFor(() => expect(screen.getByText('Bạn chưa có đơn nghỉ phép nào')).toBeInTheDocument())
  })
})

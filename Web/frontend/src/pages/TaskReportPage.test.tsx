import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskReportPage } from './TaskReportPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
}))

const mockStats = {
  totalTasks: 42, completed: 30, inProgress: 8, overdue: 3, cancelled: 1,
  byType: [{ type: 'patrol', count: 15 }],
  byMonth: [{ month: '2026-04', completed: 30, total: 42 }],
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('TaskReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockStats })
  })

  it('renders heading after load', async () => {
    wrap(<TaskReportPage />)
    await waitFor(() => {
      expect(screen.getByText('Báo Cáo Nhiệm Vụ')).toBeInTheDocument()
    })
  })

  it('renders total task count after load', async () => {
    wrap(<TaskReportPage />)
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })

  it('shows error message when API fails', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue(new Error('Network error'))
    wrap(<TaskReportPage />)
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải báo cáo/)).toBeInTheDocument()
    })
  })
})

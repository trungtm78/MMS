import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChiTieuDashboardPage } from './ChiTieuDashboardPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadialBarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadialBar: () => null,
}))

const mockDashboard = {
  period: 'Q2-2026',
  metrics: [
    { name: 'Điểm danh', current: 95, target: 100, unit: '%' },
    { name: 'Nhiệm vụ', current: 18, target: 20, unit: 'NV' },
  ],
  trend: [{ month: '2026-03', score: 8.2 }, { month: '2026-04', score: 8.7 }],
  teamRanking: [{ name: 'Nguyễn Văn A', score: 9.1 }],
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ChiTieuDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockDashboard })
  })

  it('renders heading after load', async () => {
    wrap(<ChiTieuDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Bảng Chỉ Tiêu KPI')).toBeInTheDocument()
    })
  })

  it('renders metric cards after load', async () => {
    wrap(<ChiTieuDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Điểm danh')).toBeInTheDocument()
      expect(screen.getByTestId('chitieu-dashboard-page')).toBeInTheDocument()
    })
  })

  it('shows period in subtitle', async () => {
    wrap(<ChiTieuDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText(/Q2-2026/)).toBeInTheDocument()
    })
  })

  it('shows error when API fails', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue(new Error('fail'))
    wrap(<ChiTieuDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải dữ liệu KPI/)).toBeInTheDocument()
    })
  })
})

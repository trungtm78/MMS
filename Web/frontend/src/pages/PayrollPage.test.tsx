import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PayrollPage } from './PayrollPage'
import * as payrollApiModule from '@/api/payroll'

vi.mock('@/api/payroll', () => ({
  payrollApi: {
    listPeriods: vi.fn(),
    listKpi: vi.fn(),
    lockPeriod: vi.fn(),
    adjustKpi: vi.fn(),
    reopenPeriod: vi.fn(),
  },
}))

const mockPeriods = [
  { id: 'p1', month: 4, year: 2026, status: 'review' as const, lockedBy: null, lockedAt: null, createdAt: '2026-04-01' },
]
const mockKpi = {
  data: [
    { id: 'k1', militiaId: 'm1', militiaName: 'Nguyễn Văn A', periodId: 'p1', attendanceDays: 22, taskCompleted: 8, taskTotal: 10, score: 88, adjustedScore: null, adjustmentNote: null, adjustedBy: null },
  ],
  total: 1, page: 1, limit: 100,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('PayrollPage', () => {
  beforeEach(() => {
    vi.mocked(payrollApiModule.payrollApi.listPeriods).mockResolvedValue(mockPeriods)
    vi.mocked(payrollApiModule.payrollApi.listKpi).mockResolvedValue(mockKpi)
  })

  it('renders heading', () => {
    wrap(<PayrollPage />)
    expect(screen.getByText('Bảng Lương & KPI')).toBeInTheDocument()
  })

  it('shows militia name after load', async () => {
    wrap(<PayrollPage />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    })
  })

  it('shows period label', async () => {
    wrap(<PayrollPage />)
    await waitFor(() => {
      expect(screen.getByText('Tháng 4/2026')).toBeInTheDocument()
    })
  })

  it('does NOT render coming-soon banner', () => {
    wrap(<PayrollPage />)
    expect(screen.queryByTestId('coming-soon-banner')).not.toBeInTheDocument()
  })
})

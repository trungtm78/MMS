import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AttendanceSummaryReportPage } from './AttendanceSummaryReportPage'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import * as apiClient from '@/api/client'

const mockData = {
  data: [
    {
      id: '1',
      fullName: 'Nguyễn Văn A',
      militiaCode: 'DQTV-001',
      unitCode: 'KP1',
      totalDays: 20,
      onTime: 18,
      late: 2,
      absent: 0,
      attendanceRate: 90,
    },
    {
      id: '2',
      fullName: 'Trần Thị B',
      militiaCode: 'DQTV-002',
      unitCode: 'KP2',
      totalDays: 20,
      onTime: 12,
      late: 1,
      absent: 7,
      attendanceRate: 65,
    },
    {
      id: '3',
      fullName: 'Lê Văn C',
      militiaCode: 'DQTV-003',
      unitCode: 'KP1',
      totalDays: 20,
      onTime: 8,
      late: 2,
      absent: 10,
      attendanceRate: 50,
    },
  ],
  total: 3,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('AttendanceSummaryReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockData })
  })

  it('renders page container', () => {
    wrap(<AttendanceSummaryReportPage />)
    expect(screen.getByTestId('attendance-summary-page')).toBeInTheDocument()
  })

  it('renders table with rows', async () => {
    wrap(<AttendanceSummaryReportPage />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    })
  })

  it('shows all required columns', async () => {
    wrap(<AttendanceSummaryReportPage />)
    await waitFor(() => {
      expect(screen.getByText('STT')).toBeInTheDocument()
      expect(screen.getAllByText('Họ tên').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Mã DQTV').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Đơn vị').length).toBeGreaterThan(0)
      expect(screen.getByText('Tổng ngày')).toBeInTheDocument()
      expect(screen.getByText('Đúng giờ')).toBeInTheDocument()
      expect(screen.getByText('Trễ')).toBeInTheDocument()
      expect(screen.getByText('Vắng')).toBeInTheDocument()
      expect(screen.getByText('% Có mặt')).toBeInTheDocument()
    })
  })

  it('% >= 80 is green', async () => {
    wrap(<AttendanceSummaryReportPage />)
    await waitFor(() => {
      const pct = screen.getByTestId('pct-DQTV-001')
      expect(pct.className).toContain('text-[#2E7D32]')
    })
  })

  it('% 60-79 is yellow', async () => {
    wrap(<AttendanceSummaryReportPage />)
    await waitFor(() => {
      const pct = screen.getByTestId('pct-DQTV-002')
      expect(pct.className).toContain('text-yellow-600')
    })
  })

  it('% < 60 is red', async () => {
    wrap(<AttendanceSummaryReportPage />)
    await waitFor(() => {
      const pct = screen.getByTestId('pct-DQTV-003')
      expect(pct.className).toContain('text-[#C62828]')
    })
  })

  it('rows are sorted ascending by attendance rate', async () => {
    wrap(<AttendanceSummaryReportPage />)
    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      // rows[0] = header, rows[1] = first data row
      // Lowest rate (50%) should appear first
      expect(rows[1]).toHaveTextContent('Lê Văn C')
    })
  })

  it('export button is present', async () => {
    wrap(<AttendanceSummaryReportPage />)
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).toBeInTheDocument()
    })
  })

  it('date range inputs exist', () => {
    wrap(<AttendanceSummaryReportPage />)
    expect(screen.getByTestId('date-from')).toBeInTheDocument()
    expect(screen.getByTestId('date-to')).toBeInTheDocument()
  })
})

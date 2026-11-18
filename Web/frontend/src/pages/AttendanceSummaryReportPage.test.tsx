import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AttendanceSummaryReportPage } from './AttendanceSummaryReportPage'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import * as apiClient from '@/api/client'

// Shape returned by GET /attendance/summary (AttendanceService.getAttendanceSummary):
// a plain array. Deliberately not in rate order so the page's own sort is exercised.
const mockData = [
  {
    militiaId: '1',
    militiaName: 'Nguyễn Văn A',
    militiaCode: 'DQTV-001',
    unitCode: 'KP1',
    totalDays: 20,
    onTimeDays: 18,
    lateDays: 2,
    absentDays: 0,
    attendancePct: 90,
  },
  {
    militiaId: '2',
    militiaName: 'Trần Thị B',
    militiaCode: 'DQTV-002',
    unitCode: 'KP2',
    totalDays: 20,
    onTimeDays: 13,
    lateDays: 1,
    absentDays: 6,
    attendancePct: 65,
  },
  {
    militiaId: '3',
    militiaName: 'Lê Văn C',
    militiaCode: 'DQTV-003',
    unitCode: 'KP1',
    totalDays: 20,
    onTimeDays: 10,
    lateDays: 0,
    absentDays: 10,
    attendancePct: 50,
  },
]

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

  it('explains a failed load', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue(new Error('boom'))
    wrap(<AttendanceSummaryReportPage />)
    expect(await screen.findByText('Không thể tải báo cáo điểm danh.')).toBeInTheDocument()
  })

  it('shows an empty table and nothing to export when nobody has attendance in the range', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: [] })
    wrap(<AttendanceSummaryReportPage />)
    expect(await screen.findByText('Không có dữ liệu')).toBeInTheDocument()
    expect(screen.getByTestId('export-btn')).toHaveTextContent('Xuất báo cáo')
    expect(screen.getByTestId('export-btn')).toBeDisabled()
  })

  it('filters by ward', async () => {
    const user = userEvent.setup()
    wrap(<AttendanceSummaryReportPage />)

    const select = screen.getByTestId('unit-filter')
    expect(within(select).getByRole('option', { name: 'Tất cả' })).toHaveValue('')
    expect(within(select).getByRole('option', { name: 'Khu phố 6' })).toHaveValue('KP6')
    await user.selectOptions(select, 'KP2')

    await waitFor(() =>
      expect(apiClient.default.get).toHaveBeenCalledWith('/attendance/summary', {
        params: expect.objectContaining({ unitCode: 'KP2' }),
      }),
    )
  })

  describe('default range', () => {
    const tz = process.env.TZ
    afterEach(() => {
      vi.useRealTimers()
      process.env.TZ = tz
    })

    // A browser in Vietnam at 01:30 on 1 September (18:30 UTC on 31 August)
    it('covers the current Vietnamese month', async () => {
      process.env.TZ = 'Asia/Ho_Chi_Minh'
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-31T18:30:00.000Z'))
      wrap(<AttendanceSummaryReportPage />)

      expect(screen.getByTestId('date-from')).toHaveValue('2026-09-01')
      expect(screen.getByTestId('date-to')).toHaveValue('2026-09-30')
      await waitFor(() =>
        expect(apiClient.default.get).toHaveBeenCalledWith('/attendance/summary', {
          params: { from: '2026-09-01', to: '2026-09-30', unitCode: undefined },
        }),
      )
    })
  })
})

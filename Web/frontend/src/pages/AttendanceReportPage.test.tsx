import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AttendanceReportPage } from './AttendanceReportPage'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          { id: 'a1', militiaId: 'm1', militiaName: 'Nguyễn Văn A', militiaCode: 'DQTV001', workDate: '2026-04-18', status: 'checked_in', checkinAt: '2026-04-18T07:00:00Z', checkoutAt: null, workHours: null, source: 'manual' },
          { id: 'a2', militiaId: 'm2', militiaName: 'Trần Thị B', militiaCode: 'DQTV002', workDate: '2026-04-18', status: 'absent', checkinAt: null, checkoutAt: null, workHours: null, source: 'manual' },
        ],
        total: 2,
        page: 1,
        limit: 20,
      },
    }),
  },
}))

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('AttendanceReportPage', () => {
  it('renders page with date filter', () => {
    renderWithQuery(<AttendanceReportPage />)
    expect(screen.getByTestId('date-filter')).toBeInTheDocument()
    expect(screen.getByText('Báo Cáo Điểm Danh')).toBeInTheDocument()
  })

  it('renders attendance table with data', async () => {
    renderWithQuery(<AttendanceReportPage />)
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getByText('DQTV001')).toBeInTheDocument()
  })

  it('shows stats for present and absent counts', async () => {
    renderWithQuery(<AttendanceReportPage />)
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getAllByText('Có mặt').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vắng mặt').length).toBeGreaterThan(0)
  })

  it('renders export button', () => {
    renderWithQuery(<AttendanceReportPage />)
    expect(screen.getByTestId('export-btn')).toBeInTheDocument()
    expect(screen.getByText('Xuất Excel')).toBeInTheDocument()
  })

  it('export button is not disabled on initial render', () => {
    renderWithQuery(<AttendanceReportPage />)
    expect(screen.getByTestId('export-btn')).not.toBeDisabled()
  })
})

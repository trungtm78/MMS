import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimesheetPage } from './TimesheetPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))

const mockTimesheet = {
  userId: 'u1',
  fullName: 'Nguyễn Văn A',
  weekLabel: 'Tháng 4/2026',
  days: [
    { date: '2026-04-14', status: 'present', checkIn: '07:30', checkOut: '17:00' },
    { date: '2026-04-15', status: 'present', checkIn: '07:45', checkOut: '17:00' },
    { date: '2026-04-16', status: 'absent' },
    { date: '2026-04-17', status: 'present', checkIn: '07:30', checkOut: '17:00' },
    { date: '2026-04-18', status: 'leave' },
    { date: '2026-04-19', status: null },
    { date: '2026-04-20', status: null },
  ],
  summary: { present: 3, absent: 1, leave: 1 },
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('TimesheetPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockTimesheet })
  })

  it('renders heading', () => {
    wrap(<TimesheetPage />)
    expect(screen.getByTestId('timesheet-page')).toBeInTheDocument()
    expect(screen.getByText('Bảng Chấm Công')).toBeInTheDocument()
  })

  it('renders month and year selects', () => {
    wrap(<TimesheetPage />)
    expect(screen.getByTestId('month-select')).toBeInTheDocument()
    expect(screen.getByTestId('year-select')).toBeInTheDocument()
  })

  it('renders summary cards after load', async () => {
    wrap(<TimesheetPage />)
    await waitFor(() => {
      expect(screen.getByText('Ngày có mặt')).toBeInTheDocument()
    })
  })

  it('month select is interactive', async () => {
    wrap(<TimesheetPage />)
    const select = screen.getByTestId('month-select')
    expect(select).toBeInTheDocument()
    await userEvent.selectOptions(select, '3')
    expect((select as HTMLSelectElement).value).toBe('3')
  })
})

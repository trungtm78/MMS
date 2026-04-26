import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimesheetPage } from './TimesheetPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))

const mockTimesheet = {
  userId: 'u1',
  fullName: 'Nguyễn Văn A',
  weekLabel: 'Tuần 14/04 – 20/04/2026',
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

  it('renders week label after load', async () => {
    wrap(<TimesheetPage />)
    await waitFor(() => {
      expect(screen.getByText(/Tuần 14\/04/)).toBeInTheDocument()
    })
  })

  it('renders prev/next week nav buttons', () => {
    wrap(<TimesheetPage />)
    expect(screen.getByTestId('prev-week')).toBeInTheDocument()
    expect(screen.getByTestId('next-week')).toBeInTheDocument()
  })

  it('prev-week button is interactive', () => {
    wrap(<TimesheetPage />)
    const btn = screen.getByTestId('prev-week')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    // no throw = button click handled without crashing
  })
})

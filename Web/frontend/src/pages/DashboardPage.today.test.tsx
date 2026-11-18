import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from './DashboardPage'
import { todayInVietnam } from '@/lib/dates'

// The DQTV hero card of the dashboard reads today's attendance from GET /attendance/timesheet
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'dqtv', fullName: 'Nguyễn Văn Dân' } }) }))
vi.mock('@/hooks/useSocket', () =>({ useSocket: () => ({ isConnected: true, activeSosAlerts: [] }) }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: {}, role: 'dqtv' }) }))
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const stats = { totalMilitia: 0, activeToday: 0, pendingTasks: 2, pendingApprovals: 0, activeSosAlerts: 0 }

// attendance/timesheet.ts TimesheetDay
interface TimesheetDay {
  date: string
  status: 'present' | 'late' | 'early_leave' | 'absent' | 'leave' | null
  checkIn: string | null
  checkOut: string | null
  workHours: number | null
  onLeave: boolean
}

function day(date: string, overrides: Partial<TimesheetDay> = {}): TimesheetDay {
  return { date, status: null, checkIn: null, checkOut: null, workHours: null, onLeave: false, ...overrides }
}

/** GET /attendance/timesheet answer (attendance.service.ts getTimesheet): the member's own row, or none */
function timesheet(date: string, days: TimesheetDay[] | null) {
  return {
    from: date,
    to: date,
    unitCode: null,
    dates: [date],
    data: days
      ? [{
          militiaId: 'militia-1',
          userId: 'user-1',
          fullName: 'Nguyễn Văn Dân',
          militiaCode: 'DQTV-001',
          unitCode: 'KP1',
          unitName: 'Khu phố 1',
          days,
          totals: { present: 0, late: 0, earlyLeave: 0, absent: 0, leave: 0, unrecorded: 0 },
        }]
      : [],
    total: days ? 1 : 0,
    page: 1,
    limit: 20,
  }
}

function answer(page: ReturnType<typeof timesheet>) {
  api.get.mockImplementation((url: string) =>
    url === '/attendance/timesheet' ? Promise.resolve({ data: page }) : Promise.resolve({ data: stats }),
  )
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const expectTimesheetRequestFor = (date: string) =>
  waitFor(() => expect(api.get).toHaveBeenCalledWith('/attendance/timesheet', { params: { from: date, to: date } }))

/** Waits until the stats have arrived, the other query answered on the same tick */
async function settled() {
  const tasks = screen.getByText('Nhiệm vụ đang thực hiện').closest('div') as HTMLElement
  await within(tasks).findByText('2')
}

describe('DashboardPage today for a DQTV member', () => {
  const tz = process.env.TZ
  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = tz
    api.get.mockReset()
  })

  // 18:30 UTC on 31 August is 01:30 on Tuesday 1 September in Vietnam (still Monday 31 August in Los Angeles)
  it('asks for the Vietnamese day and shows its attendance with check-in and check-out times', async () => {
    process.env.TZ = 'America/Los_Angeles'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-31T18:30:00.000Z'))
    answer(timesheet('2026-09-01', [day('2026-09-01', { status: 'present', checkIn: '07:55', checkOut: '17:05', workHours: 9.2 })]))
    wrap()

    const heading = screen.getByRole('heading', { name: /^Hôm nay/ })
    expect(heading).toHaveTextContent('1/9/2026')
    await expectTimesheetRequestFor('2026-09-01')
    const attendance = (await screen.findByText('Có mặt')).closest('div') as HTMLElement
    expect(within(attendance).getByText('Điểm danh')).toBeInTheDocument()
    expect(within(attendance).getByText('Vào ca 07:55 · Ra ca 17:05')).toBeInTheDocument()
  })

  it('labels the hero card for the member', async () => {
    answer(timesheet(todayInVietnam(), []))
    wrap()
    expect(screen.getByText('Nhiệm vụ và lịch làm việc của bạn')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Hôm nay — / })).toBeInTheDocument()
    expect(screen.getByText('Cập nhật thực tế')).toBeInTheDocument()
    expect(screen.getByText('Ca trực tiếp theo')).toBeInTheDocument()
    await settled()
  })

  it.each([
    ['late', 'Đi muộn'],
    ['early_leave', 'Về sớm'],
    ['absent', 'Vắng mặt'],
    ['leave', 'Nghỉ phép'],
  ] as const)('shows today\'s status %s as "%s"', async (status, label) => {
    const today = todayInVietnam()
    answer(timesheet(today, [day(today, { status, onLeave: status === 'leave' })]))
    wrap()
    await expectTimesheetRequestFor(today)
    const attendance = (await screen.findByText(label)).closest('div') as HTMLElement
    expect(within(attendance).getByText('Điểm danh')).toBeInTheDocument()
  })

  it('shows a dash for the check-out of a member still on shift', async () => {
    const today = todayInVietnam()
    answer(timesheet(today, [day(today, { status: 'late', checkIn: '08:20' })]))
    wrap()
    expect(await screen.findByText('Vào ca 08:20 · Ra ca —')).toBeInTheDocument()
  })

  it('reads "Chưa chấm" when today has no record yet', async () => {
    const today = todayInVietnam()
    answer(timesheet(today, [day(today)]))
    wrap()
    await expectTimesheetRequestFor(today)
    await settled()
    expect(screen.getByText('Chưa chấm')).toBeInTheDocument()
    expect(screen.queryByText(/^Vào ca/)).not.toBeInTheDocument()
  })

  it('reads "Chưa chấm" when the timesheet has no row for the member', async () => {
    const today = todayInVietnam()
    answer(timesheet(today, null))
    wrap()
    await expectTimesheetRequestFor(today)
    await settled()
    expect(screen.getByText('Chưa chấm')).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimesheetPage } from './TimesheetPage'

// Only the HTTP layer is replaced
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

// GET /attendance/timesheet (Web/backend/src/attendance/attendance.service.ts TimesheetPage,
// timesheet.ts TimesheetRow / TimesheetDay / TimesheetTotals)
type DayStatus = 'present' | 'late' | 'early_leave' | 'absent' | 'leave' | null

interface Day {
  date: string
  status: DayStatus
  /** HH:MM in Vietnam */
  checkIn: string | null
  checkOut: string | null
  workHours: number | null
  onLeave: boolean
}

interface Totals {
  present: number
  late: number
  earlyLeave: number
  absent: number
  leave: number
  unrecorded: number
}

interface Row {
  militiaId: string
  userId: string | null
  fullName: string
  militiaCode: string
  unitCode: string
  unitName: string
  days: Day[]
  totals: Totals
}

interface Answer {
  from: string
  to: string
  unitCode: string | null
  dates: string[]
  data: Row[]
  total: number
  page: number
  limit: number
}

const monthDates = (month: string, days: number) =>
  Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)

const APRIL = monthDates('2026-04', 30)

const NO_TOTALS: Totals = { present: 0, late: 0, earlyLeave: 0, absent: 0, leave: 0, unrecorded: 0 }

const day = (date: string, patch: Partial<Day> = {}): Day => ({
  date,
  status: null,
  checkIn: null,
  checkOut: null,
  workHours: null,
  onLeave: false,
  ...patch,
})

const member = (militiaId: string, patch: Partial<Row> = {}): Row => ({
  militiaId,
  userId: `user-${militiaId}`,
  fullName: 'Nguyễn Văn A',
  militiaCode: 'DQTV001',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
  days: APRIL.map((date) => day(date)),
  totals: NO_TOTALS,
  ...patch,
})

const answer = (data: Row[], patch: Partial<Answer> = {}): Answer => ({
  from: APRIL[0],
  to: APRIL[APRIL.length - 1],
  unitCode: null,
  dates: APRIL,
  data,
  total: data.length,
  page: 1,
  limit: 10,
  ...patch,
})

// GET /units/search rows (users.service.ts UnitSearchItem)
const units = [{ id: 'unit-2', code: 'KP2', name: 'Khu phố 2', type: 'neighborhood', parentCode: 'PD' }]

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = { timesheet: answer([]), timesheetError: null as unknown }

const timesheetCalls = () =>
  api.get.mock.calls
    .filter(([url]) => url === '/attendance/timesheet')
    .map(([, config]) => (config as { params: Record<string, unknown> }).params)

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('TimesheetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 10:00 on 15 April 2026 in Vietnam
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-04-15T03:00:00.000Z'))
    server.timesheet = answer([member('m1')])
    server.timesheetError = null
    api.get.mockImplementation((url: string) => {
      if (url === '/units/search') return Promise.resolve({ data: units })
      if (url === '/attendance/timesheet') {
        return server.timesheetError ? Promise.reject(server.timesheetError) : Promise.resolve({ data: server.timesheet })
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders heading', () => {
    wrap(<TimesheetPage />)
    expect(screen.getByTestId('timesheet-page')).toBeInTheDocument()
    expect(screen.getByText('Bảng Chấm Công')).toBeInTheDocument()
  })

  it('shows a loading text until the timesheet arrives', () => {
    wrap(<TimesheetPage />)
    expect(screen.getByText('Đang tải dữ liệu...')).toBeInTheDocument()
  })

  describe('calendar month', () => {
    const tz = process.env.TZ
    afterEach(() => {
      process.env.TZ = tz
    })

    // 18:30 UTC on 30 April is 01:30 on 1 May in Vietnam, and still 30 April in Los Angeles
    it('asks for the current Vietnamese month (month=YYYY-MM) and marks today in Vietnam', async () => {
      process.env.TZ = 'America/Los_Angeles'
      vi.setSystemTime(new Date('2026-04-30T18:30:00.000Z'))
      const may = monthDates('2026-05', 31)
      server.timesheet = answer([member('m1', { days: may.map((date) => day(date)) })], {
        from: may[0],
        to: may[30],
        dates: may,
      })
      wrap(<TimesheetPage />)

      expect(screen.getByTestId('month-select')).toHaveValue('5')
      expect(screen.getByTestId('year-select')).toHaveValue('2026')
      expect(screen.getByText('Tháng 5/2026')).toBeInTheDocument()
      const sheet = within(await screen.findByTestId('timesheet-row-m1'))
      const first = sheet.getByTestId('day-2026-05-01')
      expect(first).toHaveTextContent('1')
      expect(first).toHaveAttribute('aria-current', 'date')
      expect(sheet.getByTestId('day-2026-05-02')).not.toHaveAttribute('aria-current')
      // 1 May 2026 is a Friday: four empty cells before it in a week starting on Monday
      expect(sheet.getAllByTestId('day-blank')).toHaveLength(4)
      expect(timesheetCalls()).toEqual([{ month: '2026-05', page: 1, limit: 10 }])
    })
  })

  it('labels each day: status, check-in and check-out times as sent, work hours and approved leave', async () => {
    const marked: Record<string, Partial<Day>> = {
      '2026-04-14': { status: 'present', checkIn: '07:30', checkOut: '17:00', workHours: 8.5 },
      '2026-04-15': { status: 'late', checkIn: '08:10' },
      '2026-04-16': { status: 'early_leave', checkIn: '07:30', checkOut: '15:00' },
      '2026-04-17': { status: 'absent' },
      '2026-04-20': { status: 'leave', onLeave: true },
      // What was recorded wins over approved leave, which still marks the day
      '2026-04-21': { status: 'present', checkIn: '07:45', onLeave: true },
      '2026-04-22': { checkOut: '17:00' },
    }
    server.timesheet = answer([member('m1', { days: APRIL.map((date) => day(date, marked[date])) })])
    wrap(<TimesheetPage />)

    const sheet = within(await screen.findByTestId('timesheet-row-m1'))
    expect(sheet.getByText('Thứ 2')).toBeInTheDocument()
    expect(sheet.getByText('CN')).toBeInTheDocument()
    // 1 April 2026 is a Wednesday
    expect(sheet.getAllByTestId('day-blank')).toHaveLength(2)

    const present = sheet.getByTestId('day-2026-04-14')
    expect(present).toHaveTextContent('Có mặt')
    expect(present).toHaveTextContent('07:30 – 17:00')
    expect(present).toHaveTextContent('8.5 giờ')
    const late = sheet.getByTestId('day-2026-04-15')
    expect(late).toHaveTextContent('Đi trễ')
    expect(late).toHaveTextContent('08:10')
    expect(late).not.toHaveTextContent('–')
    const earlyLeave = sheet.getByTestId('day-2026-04-16')
    expect(earlyLeave).toHaveTextContent('Về sớm')
    expect(earlyLeave).toHaveTextContent('07:30 – 15:00')
    expect(sheet.getByTestId('day-2026-04-17')).toHaveTextContent('Vắng')
    const leave = sheet.getByTestId('day-2026-04-20')
    expect(leave).toHaveTextContent('Nghỉ phép')
    expect(leave).not.toHaveTextContent('Có đơn nghỉ phép')
    const recordedOnLeave = sheet.getByTestId('day-2026-04-21')
    expect(recordedOnLeave).toHaveTextContent('Có mặt')
    expect(recordedOnLeave).toHaveTextContent('Có đơn nghỉ phép')
    expect(sheet.getByTestId('day-2026-04-22')).toHaveTextContent('— – 17:00')
    const unrecorded = sheet.getByTestId('day-2026-04-23')
    expect(unrecorded).toHaveTextContent('—')
    expect(unrecorded).not.toHaveTextContent('giờ')
  })

  it('shows the member and the totals of the month', async () => {
    server.timesheet = answer([
      member('m1', {
        fullName: 'Trần Thị B',
        militiaCode: 'DQTV002',
        unitName: 'Khu phố 3',
        totals: { present: 18, late: 2, earlyLeave: 1, absent: 1, leave: 2, unrecorded: 3 },
      }),
    ])
    wrap(<TimesheetPage />)

    const sheet = within(await screen.findByTestId('timesheet-row-m1'))
    expect(sheet.getByText('Trần Thị B')).toBeInTheDocument()
    expect(sheet.getByText('DQTV002 · Khu phố 3')).toBeInTheDocument()
    expect(sheet.getByTestId('total-present')).toHaveTextContent(/^Có mặt\s*18$/)
    expect(sheet.getByTestId('total-late')).toHaveTextContent(/^Đi trễ\s*2$/)
    expect(sheet.getByTestId('total-earlyLeave')).toHaveTextContent(/^Về sớm\s*1$/)
    expect(sheet.getByTestId('total-absent')).toHaveTextContent(/^Vắng\s*1$/)
    expect(sheet.getByTestId('total-leave')).toHaveTextContent(/^Nghỉ phép\s*2$/)
    expect(sheet.getByTestId('total-unrecorded')).toHaveTextContent(/^Chưa chấm công\s*3$/)
  })

  it('shows a militia member only their own timesheet, on a single page', async () => {
    wrap(<TimesheetPage />)

    expect(await screen.findByTestId('timesheet-row-m1')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^timesheet-row-/)).toHaveLength(1)
    expect(screen.getByText('Trang 1/1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
  })

  it('pages through the members the caller may see', async () => {
    server.timesheet = answer([member('m1'), member('m2', { fullName: 'Lê Văn C', militiaCode: 'DQTV003' })], { total: 12 })
    const user = userEvent.setup()
    wrap(<TimesheetPage />)

    expect(await screen.findByTestId('timesheet-row-m2')).toHaveTextContent('Lê Văn C')
    expect(screen.getByText('Tổng 12 thành viên')).toBeInTheDocument()
    expect(screen.getByText('Trang 1/2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => expect(timesheetCalls()).toContainEqual({ month: '2026-04', page: 2, limit: 10 }))
    expect(await screen.findByText('Trang 2/2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(await screen.findByText('Trang 1/2')).toBeInTheDocument()
  })

  it('narrows the timesheet to a unit and back to every unit', async () => {
    // The unit KP2 has its own member
    const serve = api.get.getMockImplementation()
    api.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) =>
      url === '/attendance/timesheet' && config?.params?.unitCode === 'KP2'
        ? Promise.resolve({
            data: answer([member('m2', { fullName: 'Lê Văn C', unitCode: 'KP2', unitName: 'Khu phố 2' })], { unitCode: 'KP2' }),
          })
        : serve?.(url, config),
    )
    const user = userEvent.setup()
    wrap(<TimesheetPage />)
    await screen.findByTestId('timesheet-row-m1')

    const input = screen.getByPlaceholderText('Tất cả đơn vị...')
    expect(screen.getByText('Đơn vị')).toBeInTheDocument()
    await user.click(input)
    await user.type(input, 'Khu')
    // GET /units/search runs once SmartSelect's debounce has passed
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/units/search', { params: { q: 'Khu', limit: 20 } }))
    await user.click(await screen.findByRole('option', { name: /Khu phố 2/ }))

    expect(await screen.findByTestId('timesheet-row-m2')).toHaveTextContent('Lê Văn C')
    expect(screen.queryByTestId('timesheet-row-m1')).not.toBeInTheDocument()
    expect(timesheetCalls()).toContainEqual({ month: '2026-04', unitCode: 'KP2', page: 1, limit: 10 })

    await user.click(screen.getByTestId('smart-select-timesheet-unit-clear'))

    expect(await screen.findByTestId('timesheet-row-m1')).toBeInTheDocument()
    expect(screen.queryByTestId('timesheet-row-m2')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Tất cả đơn vị...')).toBeInTheDocument()
  })

  it('asks for the chosen month from its first page', async () => {
    server.timesheet = answer([member('m1')], { total: 30 })
    const user = userEvent.setup()
    wrap(<TimesheetPage />)
    await screen.findByTestId('timesheet-row-m1')
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(timesheetCalls()).toContainEqual({ month: '2026-04', page: 2, limit: 10 }))

    await user.selectOptions(screen.getByTestId('month-select'), '12')
    await waitFor(() => expect(timesheetCalls()).toContainEqual({ month: '2026-12', page: 1, limit: 10 }))
    await user.selectOptions(screen.getByTestId('year-select'), '2025')

    expect(screen.getByRole('option', { name: 'Tháng 12' })).toHaveValue('12')
    expect(screen.getByText('Tháng 12/2025')).toBeInTheDocument()
    await waitFor(() => expect(timesheetCalls()).toContainEqual({ month: '2025-12', page: 1, limit: 10 }))
  })

  it('says when nobody is in the caller’s scope', async () => {
    server.timesheet = answer([])
    wrap(<TimesheetPage />)
    expect(await screen.findByText('Không có thành viên nào trong phạm vi này.')).toBeInTheDocument()
  })

  it.each([
    [400, 'invalid_month', 'Tháng không hợp lệ. Vui lòng chọn lại tháng.'],
    [403, 'no_unit_scope', 'Tài khoản của bạn chưa được gán đơn vị quản lý. Vui lòng liên hệ quản trị viên.'],
    [500, 'internal_error', 'Không thể tải bảng chấm công. Vui lòng thử lại.'],
  ])('explains HTTP %i %s', async (status, code, message) => {
    server.timesheetError = httpError(status, code)
    wrap(<TimesheetPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })
})

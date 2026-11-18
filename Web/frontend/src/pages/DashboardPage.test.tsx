import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, matchPath } from 'react-router-dom'
import { DashboardPage } from './DashboardPage'
import * as apiClient from '@/api/client'
import type { SosLiveAlert } from '@/contexts/socketContextValue'
import { PAGE_ROUTES } from '@/routes/pageRoutes'

const mockNavigate = vi.fn()

// Mutable per test: the signed-in user, their role and the live SOS alerts
const session = vi.hoisted(() => ({
  user: { role: 'system_admin', fullName: 'Admin', unitScope: null as string | null },
  rbac: { can: { manageMilitia: true, manageAttendance: true }, role: undefined as string | undefined },
  alerts: [] as SosLiveAlert[],
}))

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: session.user }) }))
vi.mock('@/hooks/useSocket', () => ({ useSocket: () => ({ isConnected: true, activeSosAlerts: session.alerts }) }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => session.rbac }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
// The charts expose the points they were given, so a test can read what would be drawn
vi.mock('recharts', () => ({
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-testid="task-chart" data-points={JSON.stringify(data)}>{children}</div>
  ),
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-testid="area-chart" data-points={JSON.stringify(data)}>{children}</div>
  ),
  Line: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockStats = { totalMilitia: 120, activeToday: 85, pendingTasks: 12, pendingApprovals: 3, activeSosAlerts: 0 }

// GET /dashboard/charts: twelve months and the units in scope
const mockCharts = {
  year: 2026,
  tasks: Array.from({ length: 12 }, (_, i) =>
    i === 8 ? { month: 9, assigned: 16, completed: 6, overdue: 2 } : { month: i + 1, assigned: 0, completed: 0, overdue: 0 },
  ),
  areas: [
    { unitCode: 'KP1', unitName: 'Khu phố 1', headcount: 8 },
    { unitCode: 'KP2', unitName: 'Khu phố 2', headcount: 6 },
  ],
}

const chartPoints = async (testId: string) =>
  JSON.parse((await screen.findByTestId(testId)).getAttribute('data-points') ?? '[]') as unknown[]

/** A live alert as useSocket gives it: the sos:new payload (sos.service.ts announce) plus receivedAt */
function liveAlert(overrides: Partial<SosLiveAlert> = {}): SosLiveAlert {
  return {
    id: 'sos-1',
    code: 'SOS-20260914-A1B2C3',
    incidentType: 'fire',
    severity: 'urgent',
    title: 'Cháy nhà dân tại tổ 5',
    // 09:05 on 14 September in Vietnam
    receivedAt: '2026-09-14T02:05:00.000Z',
    ...overrides,
  }
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockReset()
    vi.mocked(apiClient.default.get).mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/dashboard/charts' ? mockCharts : mockStats }),
    )
    mockNavigate.mockClear()
    session.user = { role: 'system_admin', fullName: 'Admin', unitScope: null }
    session.rbac = { can: { manageMilitia: true, manageAttendance: true }, role: undefined }
    session.alerts = [liveAlert()]
  })

  it('renders dashboard container', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
  })

  it('shows totalMilitia stat after load', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('120')).toBeInTheDocument())
  })

  it('shows SOS alert section', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getAllByTestId('sos-alert-section').length).toBeGreaterThan(0))
  })

  it('shows pending tasks count', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument())
  })

  it('greets the user and labels the stat cards, charts and quick actions', async () => {
    wrap(<DashboardPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Xin chào, Admin' })).toBeInTheDocument()
    // The other stat cards appear once the stats have loaded
    expect(await screen.findByText('Nhiệm vụ đang chờ')).toBeInTheDocument()
    expect(screen.getByText('Tổng DQTV đang hoạt động')).toBeInTheDocument()
    expect(screen.getByText('Chấm công hôm nay')).toBeInTheDocument()
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.getByText('SOS chưa xử lý')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tỷ lệ hoàn thành công việc' })).toBeInTheDocument()
    expect(screen.getByText('Theo tháng — năm 2026')).toBeInTheDocument()
    expect(screen.getByText('Giao')).toBeInTheDocument()
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument()
    expect(screen.getByText('Trễ hạn')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Phân bố DQTV theo Khu phố' })).toBeInTheDocument()
    expect(screen.getByText('Tổng quân số hiện tại')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thao tác nhanh' })).toBeInTheDocument()
    expect(screen.getByText('Truy cập nhanh các chức năng')).toBeInTheDocument()
  })

  it('offers the report years and follows the chosen one in the chart subtitle', async () => {
    wrap(<DashboardPage />)
    const period = screen.getByRole('combobox')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Năm 2026', 'Năm 2025', 'Năm 2024'])
    await userEvent.selectOptions(period, '2025')
    expect(screen.getByText('Theo tháng — năm 2025')).toBeInTheDocument()
  })

  it('shows no trend next to the counters, since nothing measures one', async () => {
    wrap(<DashboardPage />)
    await screen.findByText('120')
    expect(screen.queryByText('so với tháng trước')).not.toBeInTheDocument()
    expect(screen.queryByText('so với hôm qua')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument()
  })

  it('draws the task chart from the monthly counts of the chosen year', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(apiClient.default.get).toHaveBeenCalledWith('/dashboard/charts', { params: { year: 2026 } }))
    await waitFor(async () => expect(await chartPoints('task-chart')).toHaveLength(12))
    const points = await chartPoints('task-chart')
    expect(points[0]).toEqual({ month: 'T1', assigned: 0, completed: 0, overdue: 0 })
    expect(points[8]).toEqual({ month: 'T9', assigned: 16, completed: 6, overdue: 2 })
  })

  it('draws the headcount of each unit in scope by its name', async () => {
    wrap(<DashboardPage />)
    await waitFor(async () =>
      expect(await chartPoints('area-chart')).toEqual([
        { name: 'Khu phố 1', count: 8 },
        { name: 'Khu phố 2', count: 6 },
      ]),
    )
  })

  it('asks for the charts of the year picked', async () => {
    wrap(<DashboardPage />)
    await userEvent.selectOptions(screen.getByRole('combobox'), '2025')
    await waitFor(() => expect(apiClient.default.get).toHaveBeenCalledWith('/dashboard/charts', { params: { year: 2025 } }))
  })

  it('draws empty charts until the counts arrive', () => {
    vi.mocked(apiClient.default.get).mockImplementation(() => new Promise(() => {}))
    wrap(<DashboardPage />)
    expect(screen.getByTestId('task-chart')).toHaveAttribute('data-points', '[]')
    expect(screen.getByTestId('area-chart')).toHaveAttribute('data-points', '[]')
  })

  it('reloads the stats with "Làm mới"', async () => {
    wrap(<DashboardPage />)
    await screen.findByText('120')
    const statsCalls = () => vi.mocked(apiClient.default.get).mock.calls.filter(([url]) => url === '/dashboard/stats').length
    const before = statsCalls()
    await userEvent.click(screen.getByRole('button', { name: 'Làm mới' }))
    await waitFor(() => expect(statsCalls()).toBe(before + 1))
  })

  describe('live SOS alerts', () => {
    it('counts the new alerts in the banner and the alerts card', () => {
      wrap(<DashboardPage />)
      expect(screen.getByRole('heading', { name: '1 cảnh báo SOS chưa xử lý' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Cảnh báo SOS' })).toBeInTheDocument()
      expect(screen.getByText('1 mới')).toBeInTheDocument()
    })

    it('describes each alert by title, code, incident type, severity and the Vietnamese time it arrived', () => {
      const tz = process.env.TZ
      process.env.TZ = 'America/Los_Angeles'
      try {
        wrap(<DashboardPage />)
        // The banner and the alerts card list the same alert
        const items = screen.getAllByTestId('sos-alert-sos-1')
        expect(items).toHaveLength(2)
        for (const item of items) {
          expect(within(item).getByText('Cháy nhà dân tại tổ 5')).toBeInTheDocument()
          expect(within(item).getByText('SOS-20260914-A1B2C3 · Cháy nổ')).toBeInTheDocument()
          expect(within(item).getByText('09:05 14/09/2026')).toBeInTheDocument()
          expect(within(item).getByText('Khẩn cấp')).toBeInTheDocument()
        }
        // Every live alert is new: no status badge, and nothing read from fields the payload lacks
        expect(screen.queryByText('Chưa xử lý')).not.toBeInTheDocument()
        expect(screen.queryByText(/undefined|Invalid Date/)).not.toBeInTheDocument()
      } finally {
        process.env.TZ = tz
      }
    })

    it.each([
      ['urgent', 'Khẩn cấp'],
      ['high', 'Cao'],
      ['medium', 'Trung bình'],
      ['low', 'Thấp'],
    ] as const)('labels the %s severity', (severity, label) => {
      session.alerts = [liveAlert({ id: 'sos-2', severity })]
      wrap(<DashboardPage />)
      expect(screen.getAllByTestId('sos-severity-badge-sos-2').map((badge) => badge.textContent)).toEqual([label, label])
    })

    it.each([
      ['sos', 'SOS'],
      ['security', 'An ninh trật tự'],
      ['fire', 'Cháy nổ'],
      ['medical', 'Y tế'],
      ['accident', 'Tai nạn'],
      ['utility', 'Sự cố hạ tầng'],
      ['other', 'Khác'],
    ] as const)('names the %s incident type', (incidentType, label) => {
      session.alerts = [liveAlert({ id: 'sos-3', code: 'SOS-20260914-ZZ9999', incidentType })]
      wrap(<DashboardPage />)
      expect(screen.getAllByText(`SOS-20260914-ZZ9999 · ${label}`)).toHaveLength(2)
    })

    it('says there is no SOS alert when none is active', () => {
      session.alerts = []
      wrap(<DashboardPage />)
      expect(screen.getByText('Không có cảnh báo SOS nào')).toBeInTheDocument()
      // No "n mới" badge next to the card title
      expect(screen.queryByText(/^\d+ mới$/)).not.toBeInTheDocument()
    })
  })

  describe('role subtitle', () => {
    it.each([
      ['police_ward', 'Tổng quan toàn phường'],
      ['office_staff', 'Quản lý hành chính'],
      ['system_admin', 'Bảng điều khiển hệ thống'],
      ['ubnd_leader', 'Báo cáo tổng hợp'],
    ])('%s reads "%s"', (role, subtitle) => {
      session.rbac = { ...session.rbac, role }
      wrap(<DashboardPage />)
      expect(screen.getByText(subtitle)).toBeInTheDocument()
    })

    it('names the area of an area police officer', () => {
      session.rbac = { ...session.rbac, role: 'police_area' }
      session.user = { ...session.user, unitScope: 'KP3' }
      wrap(<DashboardPage />)
      expect(screen.getByText('Khu vực: KP3')).toBeInTheDocument()
    })

    it('is empty for a role without a subtitle', () => {
      session.rbac = { ...session.rbac, role: 'ca_officer' }
      wrap(<DashboardPage />)
      const greeting = screen.getByRole('heading', { level: 1 })
      expect(greeting.nextElementSibling).toHaveTextContent(/^$/)
    })
  })

  // Quick actions navigation — FIX A
  describe('quick actions navigation', () => {
    it('clicking "Giao việc mới" navigates to /tasks/new', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Giao việc mới/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/tasks/new')
    })

    it('clicking "Thêm DQTV" navigates to /recruitment', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Thêm DQTV/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/recruitment')
    })

    // There is no /reports page: creating a report is the custom report builder
    it('clicking "Tạo báo cáo" navigates to /reports/custom', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Tạo báo cáo/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/reports/custom')
    })

    it('clicking "Xem GPS" navigates to /gps', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Xem GPS/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/gps')
    })

    it('sends every quick action to a page route that is declared', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      for (const name of [/Giao việc mới/i, /Thêm DQTV/i, /Tạo báo cáo/i, /Xem GPS/i]) {
        await userEvent.click(screen.getByRole('button', { name }))
      }
      const targets = mockNavigate.mock.calls.map(([target]) => String(target))
      expect(targets).toHaveLength(4)
      const undeclared = targets.filter((target) => !PAGE_ROUTES.some(({ path }) => matchPath(path, target) !== null))
      expect(undeclared).toEqual([])
    })
  })
})

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChiTieuDashboardPage } from './ChiTieuDashboardPage'
import { todayInVietnam } from '@/lib/dates'

// Only the HTTP layer, the toasts and the signed-in user are replaced: useRbac, recharts and the page run for real
const api = vi.hoisted(() => ({ get: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// jsdom has no ResizeObserver (recharts' ResponsiveContainer needs one) and no object URLs
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
})
afterAll(() => {
  vi.unstubAllGlobals()
})

const PERIOD_SEP = '5d7c2f1e-8a3b-4c6d-9e0f-1a2b3c4d5e6f'
const PERIOD_AUG = '6e8d3a2f-9b4c-4d7e-8f1a-2b3c4d5e6f70'

type Metric = {
  key: string
  name: string
  unit: string
  comparison: 'min' | 'max'
  window: { from: string; to: string }
  current: number | null
  target: number
  met: boolean
  membersMeeting: number
  memberCount: number
}

// Web/backend/src/kpi/kpi-dashboard.service.ts metrics()
const metric = (patch: Partial<Metric> & Pick<Metric, 'key'>): Metric => ({
  name: 'Ngày chấm công',
  unit: 'ngày',
  comparison: 'min',
  window: { from: '2026-09-01', to: '2026-09-30' },
  current: 21.5,
  target: 20,
  met: true,
  membersMeeting: 7,
  memberCount: 10,
  ...patch,
})

// Web/backend/src/kpi/kpi-dashboard.service.ts getDashboard()
const dashboard = (patch: Record<string, unknown> = {}) => ({
  period: { year: 2026, month: 9, label: '09/2026', from: '2026-09-01', to: '2026-09-30', periodId: null },
  unitCode: null,
  generatedAt: '2026-09-14T02:00:00.000Z',
  memberCount: 10,
  evaluatedCount: 8,
  notEvaluatedCount: 2,
  coverageRate: 80,
  averageScore: 78.4,
  distribution: [
    { grade: 'excellent', label: 'Xuất sắc', minScore: 90, count: 2, pct: 25 },
    { grade: 'good', label: 'Tốt', minScore: 75, count: 3, pct: 37.5 },
    { grade: 'fair', label: 'Khá', minScore: 60, count: 2, pct: 25 },
    { grade: 'needs_improvement', label: 'Cần cải thiện', minScore: 0, count: 1, pct: 12.5 },
  ],
  recommendations: [
    { recommendation: 'reward', label: 'Khen thưởng', count: 2 },
    { recommendation: 'maintain', label: 'Duy trì', count: 5 },
    { recommendation: 'training', label: 'Bồi dưỡng thêm', count: 0 },
    { recommendation: 'warning', label: 'Nhắc nhở', count: 1 },
    { recommendation: 'discipline', label: 'Xem xét kỷ luật', count: 0 },
  ],
  byUnit: [
    { unitCode: 'KV-A', unitName: 'Khu vực A', memberCount: 6, evaluatedCount: 5, averageScore: 81.2 },
    { unitCode: 'KV-B', unitName: 'Khu vực B', memberCount: 4, evaluatedCount: 3, averageScore: 58.4 },
    { unitCode: 'KV-C', unitName: 'Khu vực C', memberCount: 2, evaluatedCount: 0, averageScore: null },
  ],
  top: [
    { militiaId: 'm1', userId: 'u1', fullName: 'Nguyễn Văn An', militiaCode: 'DQ-1', unitCode: 'KV-A', score: 95, grade: 'excellent', gradeLabel: 'Xuất sắc' },
  ],
  bottom: [
    { militiaId: 'm9', userId: 'u9', fullName: 'Lê Văn Cường', militiaCode: 'DQ-9', unitCode: 'KV-B', score: 55.5, grade: 'needs_improvement', gradeLabel: 'Cần cải thiện' },
  ],
  trend: [4, 5, 6, 7, 8, 9].map((month) => ({
    year: 2026,
    month,
    averageScore: month === 4 ? null : 70 + month,
    evaluatedCount: month === 4 ? 0 : 8,
    label: `2026-0${month}`,
  })),
  targets: {
    minAttendanceDays: 20,
    minTasksCompleted: 5,
    maxOverdueTasks: 1,
    minTrainingHours: 40,
    evaluationPeriod: 'monthly',
    effectiveFrom: '2026-01-01',
    updatedAt: '2026-01-01T01:00:00.000Z',
    updatedBy: { id: 'a1', fullName: 'Quản trị hệ thống' },
    isDefault: false,
  },
  metrics: [
    metric({ key: 'attendanceDays' }),
    metric({ key: 'tasksCompleted', name: 'Nhiệm vụ hoàn thành', unit: 'nhiệm vụ', current: 4.2, target: 5, met: false, membersMeeting: 3 }),
    metric({ key: 'overdueTasks', name: 'Nhiệm vụ quá hạn', unit: 'nhiệm vụ', comparison: 'max', current: 0.8, target: 1, met: true, membersMeeting: 9 }),
    metric({ key: 'trainingHours', name: 'Giờ huấn luyện', unit: 'giờ', window: { from: '2026-01-01', to: '2026-12-31' }, current: 44, target: 40, met: true, membersMeeting: 6 }),
  ],
  ...patch,
})

// Web/backend/src/payroll/payroll.service.ts listPeriods (GET /payroll/periods answers the rows)
const PERIODS = [
  { id: PERIOD_SEP, month: 9, year: 2026, status: 'open', lockedBy: null, lockedAt: null, createdAt: '2026-09-01T01:00:00.000Z' },
  { id: PERIOD_AUG, month: 8, year: 2026, status: 'locked', lockedBy: 'a1', lockedAt: '2026-09-02T01:00:00.000Z', createdAt: '2026-08-01T01:00:00.000Z' },
]

// Web/backend/src/kpi/kpi.service.ts KpiSummaryItem: components and supervisorScore on the 0-10
// scale with two decimals, total on the 100-point scale with one; all JSON numbers (ROUND over
// NUMERIC, pg-types.ts), rank and rankInUnit converted from BIGINT by the service
const SUMMARY = [
  { militiaId: 'm1', name: 'Nguyễn Văn An', code: 'DQ-1', unit: 'Khu vực A', attendanceScore: 8.75, taskScore: 8.5, disciplineScore: 9, attitudeScore: 8, supervisorScore: 8.53, total: 85.3, rank: 1, rankInUnit: 1, xepLoai: 'Tốt' },
  { militiaId: 'm2', name: 'Trần Văn Bình', code: 'DQ-2', unit: 'Khu vực B', attendanceScore: null, taskScore: null, disciplineScore: null, attitudeScore: null, supervisorScore: null, total: null, rank: 2, rankInUnit: 1, xepLoai: 'Cần cải thiện' },
]

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = {
  dashboard: dashboard() as Record<string, unknown>,
  periods: PERIODS as unknown[],
  summary: SUMMARY as unknown[],
}

const callsTo = (url: string) => api.get.mock.calls.filter(([called]) => called === url)
const lastCallTo = (url: string) => {
  const calls = callsTo(url)
  return calls[calls.length - 1]
}

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/kpi/dashboard']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/kpi/dashboard" element={<ChiTieuDashboardPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function openReportTab(user: User) {
  await user.click(await screen.findByRole('tab', { name: 'Báo cáo KPI' }))
}

const [CURRENT_YEAR, CURRENT_MONTH] = todayInVietnam().split('-').map(Number)

describe('ChiTieuDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-answers; a test that stops early must not leave one behind
    api.get.mockReset()
    signInAs('office_staff')
    server.dashboard = dashboard()
    server.periods = PERIODS
    server.summary = SUMMARY
    api.get.mockImplementation((url: string) => {
      if (url === '/kpi/dashboard') return Promise.resolve({ data: server.dashboard })
      if (url === '/payroll/periods') return Promise.resolve({ data: server.periods })
      if (url === '/kpi/summary-report') return Promise.resolve({ data: server.summary })
      if (url === '/kpi/export') return Promise.resolve({ data: new Blob(['xlsx']) })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  // kpi-dashboard.controller.ts and kpi.controller.ts: system_admin, police_ward, police_area, office_staff
  describe('access', () => {
    it.each(['system_admin', 'police_ward', 'police_area', 'office_staff'])('opens for %s', async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByRole('heading', { name: 'Bảng Chỉ Tiêu KPI' })).toBeInTheDocument()
      expect(await screen.findByTestId('kpi-metric-attendanceDays')).toBeInTheDocument()
    })

    it.each(['ca_officer', 'dqtv', 'ubnd_leader'])('sends %s to the forbidden page', async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('dashboard', () => {
    it('asks for the current Vietnamese month and shows its label', async () => {
      wrap()

      expect(await screen.findByText('Theo dõi hiệu suất so với chỉ tiêu — kỳ 09/2026')).toBeInTheDocument()
      expect(lastCallTo('/kpi/dashboard')).toEqual(['/kpi/dashboard', { params: { year: CURRENT_YEAR, month: CURRENT_MONTH } }])
      expect(screen.getByRole('combobox', { name: 'Năm' })).toHaveValue(String(CURRENT_YEAR))
      expect(screen.getByRole('combobox', { name: 'Tháng' })).toHaveValue(String(CURRENT_MONTH))
    })

    it('shows a loading state, then the subtitle without a period until the answer comes', async () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      wrap()

      expect(await screen.findByRole('status', { name: 'Đang tải dữ liệu KPI...' })).toBeInTheDocument()
      expect(screen.getByText('Theo dõi hiệu suất so với chỉ tiêu')).toBeInTheDocument()
    })

    it('reloads for the chosen year, month and unit', async () => {
      const user = userEvent.setup()
      wrap()
      await screen.findByTestId('kpi-metric-attendanceDays')

      await user.selectOptions(screen.getByRole('combobox', { name: 'Năm' }), String(CURRENT_YEAR - 1))
      await user.selectOptions(screen.getByRole('combobox', { name: 'Tháng' }), '3')
      await waitFor(() =>
        expect(lastCallTo('/kpi/dashboard')).toEqual(['/kpi/dashboard', { params: { year: CURRENT_YEAR - 1, month: 3 } }]),
      )

      await user.type(screen.getByRole('textbox', { name: 'Mã đơn vị' }), '  KV-A ')
      await user.click(screen.getByRole('button', { name: 'Lọc' }))
      await waitFor(() =>
        expect(lastCallTo('/kpi/dashboard')).toEqual(['/kpi/dashboard', { params: { year: CURRENT_YEAR - 1, month: 3, unitCode: 'KV-A' } }]),
      )
    })

    it('offers the current year and the four before it, and every month', async () => {
      wrap()
      await screen.findByTestId('kpi-metric-attendanceDays')

      const years = within(screen.getByRole('combobox', { name: 'Năm' })).getAllByRole('option').map((o) => o.textContent)
      expect(years).toEqual([0, 1, 2, 3, 4].map((back) => String(CURRENT_YEAR - back)))
      const months = within(screen.getByRole('combobox', { name: 'Tháng' })).getAllByRole('option').map((o) => o.textContent)
      expect(months).toHaveLength(12)
      expect(months[0]).toBe('Tháng 1')
      expect(months[11]).toBe('Tháng 12')
    })

    it('shows the members, the coverage and the average score', async () => {
      wrap()

      const summary = within(await screen.findByTestId('kpi-summary'))
      expect(summary.getByText('10')).toBeInTheDocument()
      expect(summary.getByText('2 chưa được đánh giá')).toBeInTheDocument()
      expect(summary.getByText('80%')).toBeInTheDocument()
      expect(summary.getByText('8/10 thành viên đã được đánh giá')).toBeInTheDocument()
      expect(summary.getByText('78,4')).toBeInTheDocument()
    })

    it('says an average is missing instead of showing zero when nobody was evaluated', async () => {
      server.dashboard = dashboard({ memberCount: 0, evaluatedCount: 0, notEvaluatedCount: 0, coverageRate: 0, averageScore: null })
      wrap()

      const summary = within(await screen.findByTestId('kpi-summary'))
      expect(summary.getByText('0%')).toBeInTheDocument()
      expect(summary.getByText('Chưa có dữ liệu')).toBeInTheDocument()
    })

    describe('metric cards', () => {
      it('reads a met minimum as progress towards the target', async () => {
        wrap()

        const card = await screen.findByTestId('kpi-metric-attendanceDays')
        expect(card).toHaveAttribute('data-state', 'met')
        expect(within(card).getByText('Ngày chấm công')).toBeInTheDocument()
        expect(within(card).getByText('21,5')).toBeInTheDocument()
        expect(within(card).getByText('/ 20 ngày')).toBeInTheDocument()
        expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        expect(within(card).getByText('100% chỉ tiêu')).toBeInTheDocument()
        expect(within(card).getByText('✓ Đạt')).toBeInTheDocument()
        expect(within(card).getByText('7/10 thành viên đạt')).toBeInTheDocument()
      })

      it('never rounds a missed minimum up to the full target', async () => {
        server.dashboard = dashboard({
          metrics: [metric({ key: 'tasksCompleted', name: 'Nhiệm vụ hoàn thành', unit: 'nhiệm vụ', current: 4.99, target: 5, met: false, membersMeeting: 3 })],
        })
        wrap()

        const card = await screen.findByTestId('kpi-metric-tasksCompleted')
        expect(card).toHaveAttribute('data-state', 'not-met')
        expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '99')
        expect(within(card).getByText('99% chỉ tiêu')).toBeInTheDocument()
        expect(within(card).getByText('— Chưa đạt')).toBeInTheDocument()
      })

      it('reads a maximum as lower is better', async () => {
        server.dashboard = dashboard({
          metrics: [
            metric({ key: 'overdueTasks', name: 'Nhiệm vụ quá hạn', unit: 'nhiệm vụ', comparison: 'max', current: 0.8, target: 1, met: true, membersMeeting: 9 }),
            metric({ key: 'overdueTasksOver', name: 'Nhiệm vụ quá hạn (vượt)', unit: 'nhiệm vụ', comparison: 'max', current: 2, target: 1, met: false, membersMeeting: 4 }),
          ],
        })
        wrap()

        const within1 = within(await screen.findByTestId('kpi-metric-overdueTasks'))
        expect(screen.getByTestId('kpi-metric-overdueTasks')).toHaveAttribute('data-state', 'met')
        expect(within1.getByText('/ tối đa 1 nhiệm vụ')).toBeInTheDocument()
        expect(within1.getByText('Càng thấp càng tốt')).toBeInTheDocument()
        expect(within1.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        expect(within1.getByText('✓ Đạt')).toBeInTheDocument()

        const over = screen.getByTestId('kpi-metric-overdueTasksOver')
        expect(over).toHaveAttribute('data-state', 'not-met')
        expect(within(over).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
        expect(within(over).getByText('50% chỉ tiêu')).toBeInTheDocument()
        expect(within(over).getByText('— Chưa đạt')).toBeInTheDocument()
      })

      it('handles a target of zero without dividing by it', async () => {
        server.dashboard = dashboard({
          metrics: [
            metric({ key: 'zeroMin', comparison: 'min', current: 0, target: 0, met: true }),
            metric({ key: 'zeroMax', comparison: 'max', current: 0.5, target: 0, met: false }),
            metric({ key: 'zeroMaxMet', comparison: 'max', current: 0, target: 0, met: true }),
          ],
        })
        wrap()

        const zeroMin = await screen.findByTestId('kpi-metric-zeroMin')
        expect(within(zeroMin).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        const zeroMax = screen.getByTestId('kpi-metric-zeroMax')
        expect(within(zeroMax).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
        expect(within(zeroMax).getByText('0% chỉ tiêu')).toBeInTheDocument()
        expect(within(screen.getByTestId('kpi-metric-zeroMaxMet')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
        for (const card of [zeroMin, zeroMax, screen.getByTestId('kpi-metric-zeroMaxMet')]) {
          expect(card.textContent).not.toMatch(/NaN|Infinity/)
        }
      })

      it('says there is no data when the current value is missing', async () => {
        server.dashboard = dashboard({ metrics: [metric({ key: 'attendanceDays', current: null, met: false, membersMeeting: 0 })] })
        wrap()

        const card = await screen.findByTestId('kpi-metric-attendanceDays')
        expect(card).toHaveAttribute('data-state', 'no-data')
        expect(within(card).getByText('Chưa có dữ liệu')).toBeInTheDocument()
        expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
        expect(within(card).queryByText(/chỉ tiêu$/)).not.toBeInTheDocument()
        expect(card.textContent).not.toMatch(/NaN|Infinity|null/)
      })
    })

    it('shows the targets in force and their evaluation period', async () => {
      wrap()

      const targets = within(await screen.findByRole('region', { name: 'Chỉ tiêu áp dụng' }))
      expect(targets.getByText('Kỳ đánh giá: Tháng')).toBeInTheDocument()
      expect(targets.getByText('Áp dụng từ 01/01/2026')).toBeInTheDocument()
    })

    it.each([
      ['quarterly', 'Kỳ đánh giá: Quý'],
      ['yearly', 'Kỳ đánh giá: Năm'],
    ])('names the %s evaluation period and default targets', async (evaluationPeriod, text) => {
      server.dashboard = dashboard({
        targets: { ...dashboard().targets, evaluationPeriod, effectiveFrom: null, updatedAt: null, updatedBy: null, isDefault: true },
      })
      wrap()

      const targets = within(await screen.findByRole('region', { name: 'Chỉ tiêu áp dụng' }))
      expect(targets.getByText(text)).toBeInTheDocument()
      expect(targets.getByText('Chỉ tiêu mặc định')).toBeInTheDocument()
    })

    it('lists the trend month by month and leaves months without scores as gaps', async () => {
      wrap()

      const table = await screen.findByRole('table', { name: 'Xu hướng điểm KPI' })
      const rows = within(table).getAllByRole('row').slice(1)
      const cells = rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))
      expect(cells[0]).toEqual(['04/2026', 'Chưa có dữ liệu', '0'])
      expect(cells[5]).toEqual(['09/2026', '79', '8'])
      expect(cells).toHaveLength(6)
    })

    it('says so when no month of the trend has a score', async () => {
      server.dashboard = dashboard({
        trend: [8, 9].map((month) => ({ year: 2026, month, averageScore: null, evaluatedCount: 0, label: `2026-0${month}` })),
      })
      wrap()

      const trend = within(await screen.findByRole('region', { name: 'Xu hướng điểm KPI' }))
      expect(trend.getByText('Chưa có điểm KPI trong giai đoạn này')).toBeInTheDocument()
      expect(trend.queryByRole('table')).not.toBeInTheDocument()
    })

    it('ranks the units in the order the server sends', async () => {
      wrap()

      await screen.findByTestId('kpi-unit-KV-A')
      expect(screen.getAllByTestId(/^kpi-unit-/).map((row) => row.getAttribute('data-testid'))).toEqual([
        'kpi-unit-KV-A',
        'kpi-unit-KV-B',
        'kpi-unit-KV-C',
      ])
      const first = within(screen.getByTestId('kpi-unit-KV-A'))
      expect(first.getByText('Khu vực A')).toBeInTheDocument()
      expect(first.getByText('81,2')).toBeInTheDocument()
      expect(first.getByText('5/6 đã đánh giá')).toBeInTheDocument()
      expect(first.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '81')
      expect(screen.getByTestId('kpi-unit-KV-B')).toHaveAttribute('data-grade', 'needs_improvement')
      expect(screen.getByTestId('kpi-unit-KV-A')).toHaveAttribute('data-grade', 'good')
      const unscored = within(screen.getByTestId('kpi-unit-KV-C'))
      expect(unscored.getByText('Chưa có dữ liệu')).toBeInTheDocument()
      expect(unscored.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('shows the best and the weakest members with their grade', async () => {
      wrap()

      const top = within(await screen.findByRole('region', { name: 'Thành viên dẫn đầu' }))
      expect(top.getByText('Nguyễn Văn An')).toBeInTheDocument()
      expect(top.getByText('DQ-1 · KV-A')).toBeInTheDocument()
      expect(top.getByText('95')).toBeInTheDocument()
      expect(top.getByText('Xuất sắc')).toBeInTheDocument()

      const bottom = within(screen.getByRole('region', { name: 'Thành viên cần cải thiện' }))
      expect(bottom.getByText('Lê Văn Cường')).toBeInTheDocument()
      expect(bottom.getByText('55,5')).toBeInTheDocument()
      expect(bottom.getByText('Cần cải thiện')).toBeInTheDocument()
    })

    it('says so when there is no unit and no evaluated member', async () => {
      server.dashboard = dashboard({ byUnit: [], top: [], bottom: [] })
      wrap()

      expect(within(await screen.findByRole('region', { name: 'Xếp hạng đơn vị' })).getByText('Chưa có dữ liệu đơn vị')).toBeInTheDocument()
      expect(within(screen.getByRole('region', { name: 'Thành viên dẫn đầu' })).getByText('Chưa có thành viên được đánh giá')).toBeInTheDocument()
      expect(within(screen.getByRole('region', { name: 'Thành viên cần cải thiện' })).getByText('Chưa có thành viên được đánh giá')).toBeInTheDocument()
    })

    it('shows the distribution by grade and the recommendations', async () => {
      wrap()

      const distribution = within(await screen.findByRole('region', { name: 'Phân bố xếp loại' }))
      const good = within(distribution.getByTestId('kpi-grade-good'))
      expect(good.getByText('Tốt')).toBeInTheDocument()
      expect(good.getByText('Từ 75 điểm')).toBeInTheDocument()
      expect(good.getByText('3 người · 37,5%')).toBeInTheDocument()
      expect(good.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38')

      const recommendations = within(screen.getByRole('region', { name: 'Đề xuất sau đánh giá' }))
      expect(within(recommendations.getByTestId('kpi-recommendation-maintain')).getByText('Duy trì')).toBeInTheDocument()
      expect(within(recommendations.getByTestId('kpi-recommendation-maintain')).getByText('5')).toBeInTheDocument()
      expect(recommendations.getAllByTestId(/^kpi-recommendation-/)).toHaveLength(5)
    })

    it.each([
      [403, 'no_unit_scope', 'Tài khoản của bạn chưa được gán đơn vị quản lý.'],
      [500, 'Internal server error', 'Không thể tải dữ liệu KPI.'],
    ])('explains %i %s', async (status, code, message) => {
      api.get.mockImplementation((url: string) =>
        url === '/kpi/dashboard' ? Promise.reject(httpError(status, code)) : Promise.resolve({ data: [] }),
      )
      wrap()

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    })
  })

  describe('KPI report', () => {
    it('offers the payroll periods and waits for one before asking for the report', async () => {
      const user = userEvent.setup()
      wrap()
      await openReportTab(user)

      const period = await screen.findByRole('combobox', { name: 'Kỳ lương' })
      await waitFor(() =>
        expect(within(period).getAllByRole('option').map((o) => o.textContent)).toEqual(['-- Chọn kỳ lương --', 'Tháng 09/2026', 'Tháng 08/2026']),
      )
      expect(screen.getByText('Chọn kỳ lương để xem báo cáo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeDisabled()
      expect(callsTo('/kpi/summary-report')).toHaveLength(0)
    })

    it('lists GET /kpi/summary-report for the chosen period and unit', async () => {
      const user = userEvent.setup()
      wrap()
      await openReportTab(user)

      await user.selectOptions(await screen.findByRole('combobox', { name: 'Kỳ lương' }), PERIOD_SEP)
      const row = within(await screen.findByTestId('kpi-report-row-m1'))
      expect(row.getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
        'Nguyễn Văn An', 'DQ-1', 'Khu vực A', '8,75', '8,5', '9', '8', '8,53', '85,3', 'Tốt',
      ])
      expect(screen.getByTestId('kpi-report-row-m1')).toHaveAttribute('data-grade', 'good')
      expect(within(screen.getByTestId('kpi-report-row-m2')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
        'Trần Văn Bình', 'DQ-2', 'Khu vực B', '—', '—', '—', '—', '—', '—', 'Chưa đánh giá',
      ])
      expect(lastCallTo('/kpi/summary-report')).toEqual(['/kpi/summary-report', { params: { periodId: PERIOD_SEP } }])
      expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
        'Họ tên', 'Mã', 'Đơn vị', 'Chuyên cần', 'Nhiệm vụ', 'Kỷ luật', 'Thái độ', 'Chỉ huy', 'Tổng', 'Xếp loại',
      ])

      await user.type(screen.getByRole('textbox', { name: 'Mã đơn vị' }), 'KV-B')
      await user.click(screen.getByRole('button', { name: 'Lọc' }))
      await waitFor(() =>
        expect(lastCallTo('/kpi/summary-report')).toEqual(['/kpi/summary-report', { params: { periodId: PERIOD_SEP, unitCode: 'KV-B' } }]),
      )
    })

    it('says the period has no KPI data and keeps the export disabled', async () => {
      server.summary = []
      const user = userEvent.setup()
      wrap()
      await openReportTab(user)

      await user.selectOptions(await screen.findByRole('combobox', { name: 'Kỳ lương' }), PERIOD_AUG)
      expect(await screen.findByText('Không có dữ liệu KPI')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeDisabled()
    })

    it('shows a loading state while the report loads', async () => {
      api.get.mockImplementation((url: string) =>
        url === '/kpi/summary-report' ? new Promise(() => {}) : Promise.resolve({ data: url === '/payroll/periods' ? PERIODS : server.dashboard }),
      )
      const user = userEvent.setup()
      wrap()
      await openReportTab(user)

      await user.selectOptions(await screen.findByRole('combobox', { name: 'Kỳ lương' }), PERIOD_SEP)
      expect(await screen.findByRole('status', { name: 'Đang tải báo cáo KPI...' })).toBeInTheDocument()
    })

    it.each([
      [404, 'period_not_found', 'Không tìm thấy kỳ lương đã chọn.'],
      [403, 'no_unit_scope', 'Tài khoản của bạn chưa được gán đơn vị quản lý.'],
      [500, 'Internal server error', 'Không thể tải báo cáo KPI.'],
    ])('explains a report that cannot be loaded: %i %s', async (status, code, message) => {
      api.get.mockImplementation((url: string) => {
        if (url === '/kpi/summary-report') return Promise.reject(httpError(status, code))
        return Promise.resolve({ data: url === '/payroll/periods' ? PERIODS : server.dashboard })
      })
      const user = userEvent.setup()
      wrap()
      await openReportTab(user)

      await user.selectOptions(await screen.findByRole('combobox', { name: 'Kỳ lương' }), PERIOD_SEP)
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    })

    it('says when the payroll periods cannot be loaded or do not exist yet', async () => {
      api.get.mockImplementation((url: string) =>
        url === '/payroll/periods' ? Promise.reject(httpError(500, 'Internal server error')) : Promise.resolve({ data: server.dashboard }),
      )
      const user = userEvent.setup()
      wrap()
      await openReportTab(user)
      expect(await screen.findByText('Không thể tải danh sách kỳ lương.')).toBeInTheDocument()
    })

    it('says there is no payroll period yet', async () => {
      server.periods = []
      const user = userEvent.setup()
      wrap()
      await openReportTab(user)
      expect(await screen.findByText('Chưa có kỳ lương nào.')).toBeInTheDocument()
    })

    describe('export', () => {
      const downloads: string[] = []

      beforeEach(() => {
        downloads.length = 0
        URL.createObjectURL = vi.fn(() => 'blob:kpi-report')
        URL.revokeObjectURL = vi.fn()
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record(this: HTMLAnchorElement) {
          downloads.push(this.download)
        })
      })

      async function exportReport(user: User) {
        await openReportTab(user)
        await user.selectOptions(await screen.findByRole('combobox', { name: 'Kỳ lương' }), PERIOD_SEP)
        await screen.findByTestId('kpi-report-row-m1')
        await user.click(screen.getByRole('button', { name: 'Xuất Excel' }))
      }

      it('downloads GET /kpi/export as an Excel file named after the period', async () => {
        const user = userEvent.setup()
        wrap()
        await exportReport(user)

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã xuất báo cáo KPI'))
        expect(lastCallTo('/kpi/export')).toEqual(['/kpi/export', { params: { periodId: PERIOD_SEP }, responseType: 'blob' }])
        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
        expect(downloads).toEqual(['BaoCaoKPI_2026-09.xlsx'])
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:kpi-report')
      })

      it.each([
        [
          'reads the JSON code out of a blob error body',
          { isAxiosError: true, request: {}, response: { status: 404, data: new Blob([JSON.stringify({ code: 'E004', message: 'period_not_found', statusCode: 404 })], { type: 'application/json' }) } },
          'Không tìm thấy kỳ lương đã chọn.',
        ],
        ['falls back on a server failure', httpError(500, 'Internal server error'), 'Không thể xuất báo cáo KPI'],
      ])('%s', async (_, failure, message) => {
        const listed = api.get.getMockImplementation()
        api.get.mockImplementation((url: string, config?: unknown) =>
          url === '/kpi/export' ? Promise.reject(failure) : listed!(url, config),
        )
        const user = userEvent.setup()
        wrap()
        await exportReport(user)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
        expect(downloads).toEqual([])
        expect(toast.success).not.toHaveBeenCalled()
      })

      it('shows the export in progress and blocks a second click', async () => {
        let finish: (value: { data: Blob }) => void = () => {}
        const listed = api.get.getMockImplementation()
        api.get.mockImplementation((url: string, config?: unknown) =>
          url === '/kpi/export' ? new Promise((resolve) => { finish = resolve }) : listed!(url, config),
        )
        const user = userEvent.setup()
        wrap()
        await exportReport(user)

        expect(await screen.findByRole('button', { name: 'Đang xuất...' })).toBeDisabled()
        finish({ data: new Blob(['xlsx']) })
        expect(await screen.findByRole('button', { name: 'Xuất Excel' })).toBeEnabled()
        expect(callsTo('/kpi/export')).toHaveLength(1)
      })
    })
  })
})

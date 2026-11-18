import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TrainingPlanPage } from './TrainingPlanPage'

// Only the HTTP layer and the signed-in user are replaced: useRbac, the dialogs and the toasts run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// A timezone behind UTC, where `new Date('2026-06-01')` reads as 31 May
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

// Web/backend/src/training/training-plans.service.ts TrainingPlanRecord
const plan = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  year: 2026,
  type: 'military',
  typeLabel: 'Quân sự',
  title: 'Huấn luyện quân sự năm 2026' as string | null,
  requiredDays: 15,
  completedDays: 5,
  scheduledDays: 10,
  sessionCount: 2,
  status: 'active',
  unitCode: 'KP1' as string | null,
  unitName: 'Khu phố 1' as string | null,
  createdBy: 'u1',
  createdAt: '2026-01-05T02:00:00.000Z',
  updatedAt: '2026-01-10T02:00:00.000Z',
  activatedAt: '2026-01-10T02:00:00.000Z' as string | null,
  completedAt: null as string | null,
  ...patch,
})

// training-plans.service.ts TrainingSessionRecord (attendancePercent only once attendance is recorded)
const trainingSession = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  planId: 'p1',
  name: 'Đợt 1 năm 2026',
  type: 'military',
  typeLabel: 'Quân sự',
  startDate: '2026-10-01',
  endDate: '2026-10-15',
  location: 'Thao trường',
  daysCount: 15,
  status: 'upcoming',
  planYear: 2026,
  planStatus: 'active',
  unitCode: 'KP1' as string | null,
  unitName: 'Khu phố 1' as string | null,
  recordedCount: 0,
  attendedCount: 0,
  createdBy: 'u1',
  createdAt: '2026-02-01T02:00:00.000Z',
  ...patch,
})

// training-plans.service.ts SessionMember
const member = (id: string, name: string, militiaCode: string, attended: boolean | null) => ({
  id,
  name,
  militiaCode,
  unitCode: 'KP1',
  attended,
})

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = {
  plans: [] as ReturnType<typeof plan>[],
  sessions: [] as Record<string, unknown>[],
  members: [] as ReturnType<typeof member>[],
}

function defaultPlans() {
  return [
    plan('p1'),
    plan('p2', {
      type: 'political',
      typeLabel: 'Chính trị',
      title: null,
      requiredDays: 7.5,
      completedDays: 0,
      scheduledDays: 0,
      sessionCount: 0,
      status: 'draft',
      unitCode: null,
      unitName: null,
      activatedAt: null,
    }),
    plan('p3', {
      year: 2025,
      type: 'fire',
      typeLabel: 'Phòng cháy, chữa cháy',
      title: 'PCCC 2025',
      requiredDays: 5,
      completedDays: 5,
      scheduledDays: 5,
      sessionCount: 1,
      status: 'completed',
      unitCode: 'KP2',
      unitName: 'Khu phố 2',
      completedAt: '2025-12-20T02:00:00.000Z',
    }),
  ]
}

function defaultSessions() {
  const ts2 = trainingSession('ts2', {
    name: 'Đợt 2 năm 2026',
    startDate: '2026-09-01',
    endDate: '2026-09-20',
    location: 'Sân vận động phường',
    daysCount: 10,
    status: 'ongoing',
    recordedCount: 10,
    attendedCount: 8,
    attendancePercent: 80,
  })
  const ts3 = trainingSession('ts3', {
    planId: 'p2',
    name: 'Học tập chính trị',
    type: 'political',
    typeLabel: 'Chính trị',
    startDate: '2026-03-02',
    endDate: '2026-03-03',
    location: 'Hội trường UBND',
    daysCount: 1.5,
    status: 'completed',
    planStatus: 'draft',
    unitCode: null,
    unitName: null,
  })
  return [trainingSession('ts1'), ts2, ts3]
}

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/training']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/training" element={<TrainingPlanPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
        <Toaster theme="light" />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

type User = ReturnType<typeof userEvent.setup>

const loads = (url: string) => api.get.mock.calls.filter(([called]) => called === url).length
const optionLabels = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent)

async function openTab(user: User, tab: 'plans' | 'sessions' | 'stats') {
  await user.click(await screen.findByTestId(`training-tab-${tab}`))
}

async function openCreatePlan(user: User) {
  await user.click(await screen.findByTestId('create-plan-btn'))
  return screen.findByRole('dialog', { name: 'Kế hoạch huấn luyện mới' })
}

async function openCreateSession(user: User) {
  await openTab(user, 'sessions')
  await user.click(await screen.findByTestId('create-session-btn'))
  const dialog = await screen.findByRole('dialog', { name: 'Đợt huấn luyện mới' })
  const select = within(dialog).getByLabelText(/^Kế hoạch/)
  await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1))
  return dialog
}

interface SessionInput {
  plan: string
  name: string
  start: string
  end: string
  location: string
  days: string
}

async function fillSession(user: User, dialog: HTMLElement, patch: Partial<SessionInput> = {}) {
  const input: SessionInput = {
    plan: 'p1',
    name: 'Đợt 3 năm 2026',
    start: '2026-11-02',
    end: '2026-11-06',
    location: 'Thao trường phường',
    days: '4.5',
    ...patch,
  }
  const field = (label: RegExp) => within(dialog).getByLabelText(label)
  if (input.plan) await user.selectOptions(field(/^Kế hoạch/), input.plan)
  if (input.name) await user.type(field(/^Tên đợt/), input.name)
  fireEvent.change(field(/^Ngày bắt đầu/), { target: { value: input.start } })
  fireEvent.change(field(/^Ngày kết thúc/), { target: { value: input.end } })
  if (input.location) await user.type(field(/^Địa điểm/), input.location)
  fireEvent.change(field(/^Số ngày huấn luyện/), { target: { value: input.days } })
}

async function openAttendance(user: User, sessionId: string, sessionName: string) {
  await openTab(user, 'sessions')
  await user.click(await screen.findByTestId(`attendance-btn-${sessionId}`))
  return screen.findByRole('dialog', { name: `Điểm danh – ${sessionName}` })
}

describe('TrainingPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-answers; a test that stops early must not leave one behind
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    signInAs('police_area')
    server.plans = defaultPlans()
    server.sessions = defaultSessions()
    server.members = [
      member('m1', 'Nguyễn Văn A', 'DQ-001', true),
      member('m2', 'Trần Văn B', 'DQ-002', false),
      member('m3', 'Lê Văn C', 'DQ-003', null),
    ]
    api.get.mockImplementation((url: string) => {
      if (url === '/training/plans') return Promise.resolve({ data: server.plans })
      if (url === '/training/sessions') return Promise.resolve({ data: server.sessions })
      const roster = /^\/training\/sessions\/([^/]+)\/members$/.exec(url)
      if (roster) {
        return server.sessions.some((s) => s.id === roster[1])
          ? Promise.resolve({ data: server.members })
          : Promise.reject(httpError(404, 'training_session_not_found'))
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    api.post.mockImplementation((url: string, body: Record<string, unknown>) => {
      if (url === '/training/plans') return Promise.resolve({ data: plan('new', { ...body, status: 'draft' }) })
      if (url === '/training/sessions') return Promise.resolve({ data: trainingSession('new', body) })
      return Promise.resolve({ data: trainingSession('ts2') })
    })
    api.patch.mockImplementation((url: string, body: { status: string }) => {
      const id = /^\/training\/plans\/([^/]+)\/status$/.exec(url)?.[1]
      server.plans = server.plans.map((p) => (p.id === id ? { ...p, status: body.status } : p))
      return Promise.resolve({ data: server.plans.find((p) => p.id === id) })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // training.roles.ts TRAINING_MANAGER_ROLES = system_admin, police_ward, police_area
  describe('access', () => {
    it('renders the page', async () => {
      wrap()
      expect(await screen.findByTestId('training-page')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Kế hoạch huấn luyện' })).toBeInTheDocument()
    })

    it.each(['system_admin', 'police_ward', 'police_area'])('opens for the training manager %s', async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByTestId('training-page')).toBeInTheDocument()
      expect(await screen.findByTestId('create-plan-btn')).toBeInTheDocument()
    })

    it.each(['office_staff', 'ca_ward', 'ca_officer', 'ubnd_leader', 'dqtv_member'])(
      'sends %s, who may not manage training, to the forbidden page',
      async (role) => {
        signInAs(role)
        wrap()
        expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
        expect(api.get).not.toHaveBeenCalled()
      },
    )
  })

  describe('plans', () => {
    it('lists GET /training/plans with the backend type label, title, unit, days and status', async () => {
      wrap()

      const row = within(await screen.findByTestId('plan-row-p1'))
      expect(row.getByText('2026')).toBeInTheDocument()
      expect(row.getByText('Quân sự')).toBeInTheDocument()
      expect(row.getByText('Huấn luyện quân sự năm 2026')).toBeInTheDocument()
      expect(row.getByText('Khu phố 1')).toBeInTheDocument()
      expect(row.getByText('Quy định 15 ngày')).toBeInTheDocument()
      expect(row.getByText('Đã lên lịch 10 · Hoàn thành 5 (33%)')).toBeInTheDocument()
      expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
      expect(row.getByText('2')).toBeInTheDocument()
      expect(row.getByText('Đang thực hiện')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/training/plans', { params: {} })
    })

    it('shows a ward-wide plan without a title, with half days', async () => {
      wrap()

      const row = within(await screen.findByTestId('plan-row-p2'))
      expect(row.getByText('Chính trị')).toBeInTheDocument()
      expect(row.getByText('—')).toBeInTheDocument()
      expect(row.getByText('Toàn phường')).toBeInTheDocument()
      expect(row.getByText('Quy định 7,5 ngày')).toBeInTheDocument()
      expect(row.getByText('Đã lên lịch 0 · Hoàn thành 0 (0%)')).toBeInTheDocument()
      expect(row.getByText('Nháp')).toBeInTheDocument()
    })

    it('offers the next status only: Triển khai for a draft, Hoàn thành for an active plan, nothing once completed', async () => {
      wrap()

      const draft = within(await screen.findByTestId('plan-row-p2'))
      expect(draft.getByRole('button', { name: 'Triển khai' })).toBeInTheDocument()
      expect(draft.queryByRole('button', { name: 'Hoàn thành' })).not.toBeInTheDocument()

      const active = within(screen.getByTestId('plan-row-p1'))
      expect(active.getByRole('button', { name: 'Hoàn thành' })).toBeInTheDocument()
      expect(active.queryByRole('button', { name: 'Triển khai' })).not.toBeInTheDocument()

      const completed = within(screen.getByTestId('plan-row-p3'))
      expect(completed.getByText('Hoàn thành')).toBeInTheDocument()
      expect(completed.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows an empty state', async () => {
      server.plans = []
      wrap()
      expect(await screen.findByText('Chưa có kế hoạch nào')).toBeInTheDocument()
    })

    it.each([
      [403, 'insufficient_role', 'Bạn không có quyền quản lý kế hoạch huấn luyện.'],
      [500, 'Internal server error', 'Không thể tải danh sách kế hoạch huấn luyện.'],
    ])('explains a plan list that cannot be loaded (%i %s)', async (status, code, message) => {
      api.get.mockImplementation(() => Promise.reject(httpError(status, code)))
      wrap()
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
    })

    describe('create', () => {
      it('offers the five training type codes with their labels', async () => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openCreatePlan(user)
        expect(optionLabels(within(dialog).getByLabelText(/^Loại huấn luyện/))).toEqual([
          '-- Chọn loại huấn luyện --',
          'Quân sự',
          'Chính trị',
          'Phòng cháy, chữa cháy',
          'Sơ cấp cứu',
          'Khác',
        ])
      })

      it('creates a draft plan with every field filled in, then reloads the plans', async () => {
        const user = userEvent.setup()
        wrap()
        await screen.findByTestId('plan-row-p1')
        const before = loads('/training/plans')

        const dialog = await openCreatePlan(user)
        fireEvent.change(within(dialog).getByLabelText(/^Năm/), { target: { value: '2027' } })
        await user.selectOptions(within(dialog).getByLabelText(/^Loại huấn luyện/), 'first_aid')
        await user.type(within(dialog).getByLabelText(/^Tên kế hoạch/), '  Sơ cấp cứu ban đầu  ')
        fireEvent.change(within(dialog).getByLabelText(/^Số ngày quy định/), { target: { value: '2.5' } })
        await user.type(within(dialog).getByLabelText(/^Mã đơn vị/), ' KP1 ')
        await user.click(within(dialog).getByRole('button', { name: 'Tạo kế hoạch' }))

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
        expect(api.post.mock.calls[0][0]).toBe('/training/plans')
        expect(api.post.mock.calls[0][1]).toStrictEqual({
          year: 2027,
          type: 'first_aid',
          requiredDays: 2.5,
          title: 'Sơ cấp cứu ban đầu',
          unitCode: 'KP1',
        })
        expect(await screen.findByText('Đã tạo kế hoạch huấn luyện')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(loads('/training/plans')).toBeGreaterThan(before))
      })

      it('sends only the optional fields that were filled in', async () => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openCreatePlan(user)
        await user.selectOptions(within(dialog).getByLabelText(/^Loại huấn luyện/), 'military')
        fireEvent.change(within(dialog).getByLabelText(/^Số ngày quy định/), { target: { value: '15' } })
        await user.type(within(dialog).getByLabelText(/^Tên kế hoạch/), '   ')
        await user.click(within(dialog).getByRole('button', { name: 'Tạo kế hoạch' }))

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
        expect(Object.keys(api.post.mock.calls[0][1] as object).sort()).toEqual(['requiredDays', 'type', 'year'])
        expect((api.post.mock.calls[0][1] as { requiredDays: number }).requiredDays).toBe(15)
      })

      it('says which required fields are missing and sends nothing', async () => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openCreatePlan(user)
        fireEvent.change(within(dialog).getByLabelText(/^Năm/), { target: { value: '' } })
        await user.click(within(dialog).getByRole('button', { name: 'Tạo kế hoạch' }))

        expect(within(dialog).getByTestId('plan-year-error')).toHaveTextContent('Năm phải là số nguyên từ 2000 đến 2100')
        expect(within(dialog).getByTestId('plan-type-error')).toHaveTextContent('Vui lòng chọn loại huấn luyện')
        expect(within(dialog).getByTestId('plan-required-days-error')).toHaveTextContent('Vui lòng nhập số ngày quy định')
        expect(api.post).not.toHaveBeenCalled()

        await user.selectOptions(within(dialog).getByLabelText(/^Loại huấn luyện/), 'fire')
        expect(within(dialog).queryByTestId('plan-type-error')).not.toBeInTheDocument()
      })

      // CreateTrainingPlanDto: year 2000–2100 whole; requiredDays 0.5–365 with at most one decimal
      it.each([
        ['1999', '15', 'plan-year-error', 'Năm phải là số nguyên từ 2000 đến 2100'],
        ['2026.5', '15', 'plan-year-error', 'Năm phải là số nguyên từ 2000 đến 2100'],
        ['2101', '15', 'plan-year-error', 'Năm phải là số nguyên từ 2000 đến 2100'],
        ['2026', '0.4', 'plan-required-days-error', 'Số ngày quy định phải từ 0,5 đến 365 và có tối đa một chữ số thập phân'],
        ['2026', '1.25', 'plan-required-days-error', 'Số ngày quy định phải từ 0,5 đến 365 và có tối đa một chữ số thập phân'],
        ['2026', '365.5', 'plan-required-days-error', 'Số ngày quy định phải từ 0,5 đến 365 và có tối đa một chữ số thập phân'],
      ])('refuses year %s with %s required days before sending', async (year, days, errorId, message) => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openCreatePlan(user)
        fireEvent.change(within(dialog).getByLabelText(/^Năm/), { target: { value: year } })
        await user.selectOptions(within(dialog).getByLabelText(/^Loại huấn luyện/), 'military')
        fireEvent.change(within(dialog).getByLabelText(/^Số ngày quy định/), { target: { value: days } })
        await user.click(within(dialog).getByRole('button', { name: 'Tạo kế hoạch' }))

        expect(within(dialog).getByTestId(errorId)).toHaveTextContent(message)
        expect(api.post).not.toHaveBeenCalled()
      })

      it.each([
        [409, 'training_plan_exists', 'Đã có kế hoạch huấn luyện cùng năm, cùng loại cho đơn vị này.'],
        [400, 'unit_not_found', 'Mã đơn vị không tồn tại.'],
        [403, 'unit_scope_violation', 'Đơn vị nằm ngoài phạm vi quản lý của bạn.'],
        [500, 'Internal server error', 'Không thể tạo kế hoạch'],
      ])('explains %i %s in the form', async (status, code, message) => {
        api.post.mockRejectedValueOnce(httpError(status, code))
        const user = userEvent.setup()
        wrap()
        await screen.findByTestId('plan-row-p1')
        const before = loads('/training/plans')

        const dialog = await openCreatePlan(user)
        await user.selectOptions(within(dialog).getByLabelText(/^Loại huấn luyện/), 'military')
        fireEvent.change(within(dialog).getByLabelText(/^Số ngày quy định/), { target: { value: '15' } })
        await user.click(within(dialog).getByRole('button', { name: 'Tạo kế hoạch' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
        // An existing plan is shown by reloading the list
        if (status === 409) await waitFor(() => expect(loads('/training/plans')).toBeGreaterThan(before))
        else expect(loads('/training/plans')).toBe(before)
      })

      it('closes the form without sending on cancel', async () => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openCreatePlan(user)
        await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(api.post).not.toHaveBeenCalled()
      })
    })

    describe('status', () => {
      it('activates a draft plan after confirmation and shows its new status', async () => {
        const user = userEvent.setup()
        wrap()

        await user.click(within(await screen.findByTestId('plan-row-p2')).getByRole('button', { name: 'Triển khai' }))
        const confirm = await screen.findByRole('alertdialog', { name: 'Triển khai kế hoạch huấn luyện?' })
        expect(confirm).toHaveAccessibleDescription(
          'Kế hoạch Chính trị năm 2026 – Toàn phường sẽ chuyển sang Đang thực hiện. Khi đó có thể điểm danh các đợt huấn luyện đã bắt đầu.',
        )
        await user.click(within(confirm).getByRole('button', { name: 'Triển khai' }))

        await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/training/plans/p2/status', { status: 'active' }))
        expect(await screen.findByText('Đã triển khai kế hoạch huấn luyện')).toBeInTheDocument()
        await waitFor(() => expect(within(screen.getByTestId('plan-row-p2')).getByText('Đang thực hiện')).toBeInTheDocument())
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })

      it('completes an active plan after confirmation', async () => {
        const user = userEvent.setup()
        wrap()

        await user.click(within(await screen.findByTestId('plan-row-p1')).getByRole('button', { name: 'Hoàn thành' }))
        const confirm = await screen.findByRole('alertdialog', { name: 'Hoàn thành kế hoạch huấn luyện?' })
        expect(confirm).toHaveAccessibleDescription(
          'Kế hoạch Quân sự năm 2026 – Khu phố 1 sẽ chuyển sang Hoàn thành. Sau đó không thể thêm đợt huấn luyện hoặc điểm danh.',
        )
        await user.click(within(confirm).getByRole('button', { name: 'Hoàn thành' }))

        await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/training/plans/p1/status', { status: 'completed' }))
        expect(await screen.findByText('Đã hoàn thành kế hoạch huấn luyện')).toBeInTheDocument()
        await waitFor(() => expect(within(screen.getByTestId('plan-row-p1')).queryByRole('button')).not.toBeInTheDocument())
      })

      it('changes nothing when the confirmation is cancelled', async () => {
        const user = userEvent.setup()
        wrap()

        await user.click(within(await screen.findByTestId('plan-row-p2')).getByRole('button', { name: 'Triển khai' }))
        const confirm = await screen.findByRole('alertdialog')
        await user.click(within(confirm).getByRole('button', { name: 'Hủy' }))

        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
        expect(api.patch).not.toHaveBeenCalled()
      })

      it('reloads the plans when the status changed meanwhile', async () => {
        const user = userEvent.setup()
        wrap()
        const row = within(await screen.findByTestId('plan-row-p2'))
        // Someone else activated the plan after the list was loaded
        server.plans = server.plans.map((p) => (p.id === 'p2' ? { ...p, status: 'active' } : p))
        api.patch.mockRejectedValueOnce(httpError(409, 'invalid_status_transition'))

        await user.click(row.getByRole('button', { name: 'Triển khai' }))
        await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Triển khai' }))

        expect(await screen.findByText('Không thể chuyển kế hoạch sang trạng thái này. Danh sách đã được cập nhật.')).toBeInTheDocument()
        await waitFor(() => expect(within(screen.getByTestId('plan-row-p2')).getByRole('button', { name: 'Hoàn thành' })).toBeInTheDocument())
      })

      it.each([
        [403, 'training_plan_not_managed', 'Kế hoạch này không thuộc phạm vi bạn quản lý.'],
        [404, 'training_plan_not_found', 'Không tìm thấy kế hoạch huấn luyện.'],
        [403, 'insufficient_role', 'Bạn không có quyền quản lý kế hoạch huấn luyện.'],
        [500, 'Internal server error', 'Không thể cập nhật trạng thái kế hoạch'],
      ])('explains %i %s without reloading the list', async (status, code, message) => {
        api.patch.mockRejectedValueOnce(httpError(status, code))
        const user = userEvent.setup()
        wrap()
        const row = within(await screen.findByTestId('plan-row-p1'))
        const before = loads('/training/plans')

        await user.click(row.getByRole('button', { name: 'Hoàn thành' }))
        await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Hoàn thành' }))

        expect(await screen.findByText(message)).toBeInTheDocument()
        expect(loads('/training/plans')).toBe(before)
      })
    })
  })

  describe('sessions', () => {
    it('shows session rows with the type label, calendar-day dates, status and plan', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'sessions')

      const row = within(await screen.findByTestId('session-row-ts1'))
      expect(row.getByText('Đợt 1 năm 2026')).toBeInTheDocument()
      expect(row.getByText('Kế hoạch 2026 · Khu phố 1')).toBeInTheDocument()
      expect(row.getByText('Quân sự')).toBeInTheDocument()
      expect(row.getByText('01/10/2026')).toBeInTheDocument()
      expect(row.getByText('15/10/2026')).toBeInTheDocument()
      expect(row.getByText('Thao trường')).toBeInTheDocument()
      expect(row.getByText('15')).toBeInTheDocument()
      expect(row.getByText('Sắp diễn ra')).toBeInTheDocument()
      expect(row.getByText('—')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/training/sessions', { params: {} })
    })

    it('shows the attendance once it has been recorded, and the other statuses', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'sessions')

      const ongoing = within(await screen.findByTestId('session-row-ts2'))
      expect(ongoing.getByText('Đang diễn ra')).toBeInTheDocument()
      expect(ongoing.getByText('8/10 có mặt')).toBeInTheDocument()
      expect(ongoing.getByText('80%')).toBeInTheDocument()

      const finished = within(screen.getByTestId('session-row-ts3'))
      expect(finished.getByText('Đã kết thúc')).toBeInTheDocument()
      expect(finished.getByText('Chính trị')).toBeInTheDocument()
      expect(finished.getByText('Kế hoạch 2026 · Toàn phường')).toBeInTheDocument()
      expect(finished.getByText('1,5')).toBeInTheDocument()
    })

    it('shows an empty state', async () => {
      server.sessions = []
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'sessions')
      expect(await screen.findByText('Chưa có đợt huấn luyện nào')).toBeInTheDocument()
    })

    it('explains a session list that cannot be loaded', async () => {
      const listed = api.get.getMockImplementation()
      api.get.mockImplementation((url: string) =>
        url === '/training/sessions' ? Promise.reject(httpError(500, 'Internal server error')) : listed!(url),
      )
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'sessions')
      expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách đợt huấn luyện.')
    })

    describe('create', () => {
      it('offers the plans that are not completed, labelled by year, type, unit and title', async () => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openCreateSession(user)
        expect(optionLabels(within(dialog).getByLabelText(/^Kế hoạch/))).toEqual([
          '-- Chọn kế hoạch --',
          '2026 · Quân sự · Khu phố 1 · Huấn luyện quân sự năm 2026',
          '2026 · Chính trị · Toàn phường',
        ])
      })

      it('says when no plan can take a session', async () => {
        server.plans = [plan('p3', { status: 'completed' })]
        const user = userEvent.setup()
        wrap()
        await openTab(user, 'sessions')

        await user.click(await screen.findByTestId('create-session-btn'))
        const dialog = await screen.findByRole('dialog', { name: 'Đợt huấn luyện mới' })
        expect(await within(dialog).findByText('Chưa có kế hoạch nháp hoặc đang thực hiện. Hãy tạo kế hoạch trước.')).toBeInTheDocument()
      })

      it('creates a session in the chosen plan, then reloads sessions and plans', async () => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openCreateSession(user)
        const sessionsBefore = loads('/training/sessions')
        const plansBefore = loads('/training/plans')

        await fillSession(user, dialog)
        expect(within(dialog).getByText('Trong năm 2026 của kế hoạch.')).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', { name: 'Tạo đợt huấn luyện' }))

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
        expect(api.post.mock.calls[0][0]).toBe('/training/sessions')
        expect(api.post.mock.calls[0][1]).toStrictEqual({
          planId: 'p1',
          name: 'Đợt 3 năm 2026',
          startDate: '2026-11-02',
          endDate: '2026-11-06',
          location: 'Thao trường phường',
          daysCount: 4.5,
        })
        expect(await screen.findByText('Đã tạo đợt huấn luyện')).toBeInTheDocument()
        await waitFor(() => expect(loads('/training/sessions')).toBeGreaterThan(sessionsBefore))
        expect(loads('/training/plans')).toBeGreaterThan(plansBefore)
      })

      it('accepts as many training days as the span has, one-day sessions included', async () => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openCreateSession(user)

        await fillSession(user, dialog, { plan: 'p2', start: '2026-12-31', end: '2026-12-31', days: '1' })
        await user.click(within(dialog).getByRole('button', { name: 'Tạo đợt huấn luyện' }))

        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
        expect(api.post.mock.calls[0][1]).toMatchObject({ planId: 'p2', startDate: '2026-12-31', endDate: '2026-12-31', daysCount: 1 })
      })

      it('says which required fields are missing and sends nothing', async () => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openCreateSession(user)

        await user.click(within(dialog).getByRole('button', { name: 'Tạo đợt huấn luyện' }))

        expect(within(dialog).getByTestId('session-plan-error')).toHaveTextContent('Vui lòng chọn kế hoạch')
        expect(within(dialog).getByTestId('session-name-error')).toHaveTextContent('Vui lòng nhập tên đợt huấn luyện')
        expect(within(dialog).getByTestId('session-start-date-error')).toHaveTextContent('Vui lòng chọn ngày bắt đầu')
        expect(within(dialog).getByTestId('session-end-date-error')).toHaveTextContent('Vui lòng chọn ngày kết thúc')
        expect(within(dialog).getByTestId('session-location-error')).toHaveTextContent('Vui lòng nhập địa điểm')
        expect(within(dialog).getByTestId('session-days-count-error')).toHaveTextContent('Vui lòng nhập số ngày huấn luyện')
        expect(api.post).not.toHaveBeenCalled()

        await user.type(within(dialog).getByLabelText(/^Tên đợt/), 'Đợt 4')
        expect(within(dialog).queryByTestId('session-name-error')).not.toBeInTheDocument()
      })

      // training-plans.service.ts createSession, checked in the same order before sending
      it.each([
        [{ start: '2026-11-06', end: '2026-11-02', days: '1' }, 'session-end-date-error', 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.'],
        [{ start: '2026-11-02', end: '2026-11-06', days: '5.5' }, 'session-days-count-error', 'Số ngày huấn luyện vượt quá số ngày của đợt.'],
        [{ start: '2025-12-29', end: '2026-01-02', days: '3' }, 'session-start-date-error', 'Đợt huấn luyện phải nằm trong năm của kế hoạch.'],
        [{ start: '2026-12-29', end: '2027-01-02', days: '3' }, 'session-end-date-error', 'Đợt huấn luyện phải nằm trong năm của kế hoạch.'],
        [{ days: '0.4' }, 'session-days-count-error', 'Số ngày huấn luyện phải từ 0,5 đến 366 và có tối đa một chữ số thập phân'],
        [{ days: '2.25' }, 'session-days-count-error', 'Số ngày huấn luyện phải từ 0,5 đến 366 và có tối đa một chữ số thập phân'],
      ])('refuses %o before sending', async (patch, errorId, message) => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openCreateSession(user)

        await fillSession(user, dialog, patch)
        await user.click(within(dialog).getByRole('button', { name: 'Tạo đợt huấn luyện' }))

        expect(within(dialog).getByTestId(errorId)).toHaveTextContent(message)
        expect(api.post).not.toHaveBeenCalled()
      })

      it.each([
        [409, 'training_plan_completed', 'Kế hoạch đã hoàn thành nên không thể thêm đợt huấn luyện.'],
        [403, 'training_plan_not_managed', 'Kế hoạch này không thuộc phạm vi bạn quản lý.'],
        [404, 'training_plan_not_found', 'Không tìm thấy kế hoạch huấn luyện.'],
        [400, 'session_outside_plan_year', 'Đợt huấn luyện phải nằm trong năm của kế hoạch.'],
        [500, 'Internal server error', 'Không thể tạo đợt huấn luyện'],
      ])('explains %i %s in the form', async (status, code, message) => {
        api.post.mockRejectedValueOnce(httpError(status, code))
        const user = userEvent.setup()
        wrap()
        const dialog = await openCreateSession(user)
        const before = loads('/training/plans')

        await fillSession(user, dialog)
        await user.click(within(dialog).getByRole('button', { name: 'Tạo đợt huấn luyện' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
        // A plan completed meanwhile leaves the choices: reload them
        if (status === 409) await waitFor(() => expect(loads('/training/plans')).toBeGreaterThan(before))
        else expect(loads('/training/plans')).toBe(before)
      })
    })

    describe('attendance', () => {
      it('lists the roster with each member’s recorded answer and counts those present', async () => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        expect(dialog).toHaveAccessibleDescription('01/09/2026 – 20/09/2026 · Sân vận động phường')
        expect(await within(dialog).findByRole('checkbox', { name: 'Nguyễn Văn A' })).toBeChecked()
        expect(within(dialog).getByRole('checkbox', { name: 'Trần Văn B' })).not.toBeChecked()
        expect(within(dialog).getByRole('checkbox', { name: 'Lê Văn C' })).not.toBeChecked()
        expect(within(within(dialog).getByTestId('member-row-m1')).getByText('Có mặt')).toBeInTheDocument()
        expect(within(within(dialog).getByTestId('member-row-m2')).getByText('Vắng')).toBeInTheDocument()
        expect(within(within(dialog).getByTestId('member-row-m3')).getByText('Chưa điểm danh')).toBeInTheDocument()
        expect(within(within(dialog).getByTestId('member-row-m3')).getByText('DQ-003')).toBeInTheDocument()
        expect(within(dialog).getByText('1/3 có mặt')).toBeInTheDocument()
        expect(within(dialog).getByText('1 người chưa điểm danh sẽ được lưu là vắng.')).toBeInTheDocument()
        expect(api.get).toHaveBeenCalledWith('/training/sessions/ts2/members')
      })

      it('saves the full roster, a member not yet recorded as absent, then reloads the sessions', async () => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        await user.click(await within(dialog).findByRole('checkbox', { name: 'Trần Văn B' }))
        expect(within(dialog).getByText('2/3 có mặt')).toBeInTheDocument()
        const before = loads('/training/sessions')

        await user.click(within(dialog).getByRole('button', { name: 'Lưu điểm danh' }))

        await waitFor(() =>
          expect(api.post).toHaveBeenCalledWith('/training/sessions/ts2/attendance', {
            attendance: [
              { memberId: 'm1', attended: true },
              { memberId: 'm2', attended: true },
              { memberId: 'm3', attended: false },
            ],
          }),
        )
        expect(await screen.findByText('Đã lưu điểm danh')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(loads('/training/sessions')).toBeGreaterThan(before))
      })

      it('marks everyone present, then clears everyone', async () => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        await within(dialog).findByRole('checkbox', { name: 'Lê Văn C' })

        await user.click(within(dialog).getByRole('button', { name: 'Đánh dấu tất cả có mặt' }))
        expect(within(dialog).getByText('3/3 có mặt')).toBeInTheDocument()
        expect(within(dialog).queryByText(/chưa điểm danh sẽ được lưu/)).not.toBeInTheDocument()
        for (const box of within(dialog).getAllByRole('checkbox')) expect(box).toBeChecked()

        await user.click(within(dialog).getByRole('button', { name: 'Bỏ chọn tất cả' }))
        expect(within(dialog).getByText('0/3 có mặt')).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', { name: 'Lưu điểm danh' }))
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
        expect(api.post.mock.calls[0][1]).toStrictEqual({
          attendance: [
            { memberId: 'm1', attended: false },
            { memberId: 'm2', attended: false },
            { memberId: 'm3', attended: false },
          ],
        })
      })

      it.each([
        ['ts1', 'Đợt 1 năm 2026', 'Đợt huấn luyện chưa bắt đầu nên chưa thể điểm danh.'],
        ['ts3', 'Học tập chính trị', 'Chỉ điểm danh được khi kế hoạch đang thực hiện.'],
      ])('explains why %s cannot take attendance and offers no saving', async (id, name, reason) => {
        const user = userEvent.setup()
        wrap()

        const dialog = await openAttendance(user, id, name)
        expect(within(dialog).getByText(reason)).toBeInTheDocument()
        expect(await within(dialog).findByRole('checkbox', { name: 'Nguyễn Văn A' })).toBeDisabled()
        expect(within(dialog).queryByRole('button', { name: 'Lưu điểm danh' })).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'Đánh dấu tất cả có mặt' })).not.toBeInTheDocument()
      })

      it('says when the roster is empty and saves nothing', async () => {
        server.members = []
        const user = userEvent.setup()
        wrap()

        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        expect(await within(dialog).findByText('Không có thành viên')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Lưu điểm danh' })).toBeDisabled()
      })

      it('explains a roster that cannot be loaded', async () => {
        const listed = api.get.getMockImplementation()
        api.get.mockImplementation((url: string) =>
          url.endsWith('/members') ? Promise.reject(httpError(500, 'Internal server error')) : listed!(url),
        )
        const user = userEvent.setup()
        wrap()

        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không thể tải danh sách thành viên.')
        expect(within(dialog).getByRole('button', { name: 'Lưu điểm danh' })).toBeDisabled()
      })

      it.each([
        [409, 'training_session_not_started', 'Đợt huấn luyện chưa bắt đầu nên chưa thể điểm danh.'],
        [404, 'militia_not_found', 'Có thành viên không thuộc đợt huấn luyện này. Vui lòng tải lại danh sách.'],
        [404, 'training_session_not_found', 'Không tìm thấy đợt huấn luyện.'],
        [500, 'Internal server error', 'Không thể lưu điểm danh'],
      ])('explains %i %s in the dialog', async (status, code, message) => {
        api.post.mockRejectedValueOnce(httpError(status, code))
        const user = userEvent.setup()
        wrap()
        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        await within(dialog).findByRole('checkbox', { name: 'Nguyễn Văn A' })

        await user.click(within(dialog).getByRole('button', { name: 'Lưu điểm danh' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      })

      it('reloads the sessions after a conflict and stops offering to save once the plan is no longer active', async () => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        await within(dialog).findByRole('checkbox', { name: 'Nguyễn Văn A' })
        // The plan was completed after the list was loaded
        server.sessions = server.sessions.map((s) => (s.id === 'ts2' ? { ...s, planStatus: 'completed' } : s))
        api.post.mockRejectedValueOnce(httpError(409, 'training_plan_not_active'))

        await user.click(within(dialog).getByRole('button', { name: 'Lưu điểm danh' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Chỉ điểm danh được khi kế hoạch đang thực hiện.')
        await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Lưu điểm danh' })).not.toBeInTheDocument())
        expect(within(dialog).getByRole('checkbox', { name: 'Nguyễn Văn A' })).toBeDisabled()
      })

      it('reloads the roster when a member is no longer on it', async () => {
        const user = userEvent.setup()
        wrap()
        const dialog = await openAttendance(user, 'ts2', 'Đợt 2 năm 2026')
        await within(dialog).findByRole('checkbox', { name: 'Lê Văn C' })
        server.members = server.members.filter((m) => m.id !== 'm3')
        api.post.mockRejectedValueOnce(httpError(404, 'militia_not_found'))

        await user.click(within(dialog).getByRole('button', { name: 'Lưu điểm danh' }))

        expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
        await waitFor(() => expect(within(dialog).queryByRole('checkbox', { name: 'Lê Văn C' })).not.toBeInTheDocument())
      })
    })
  })

  describe('stats', () => {
    function statsPlans() {
      return [
        // NUMERIC days arrive as JSON numbers (pg-types.ts NUMERIC parser, ::float8 casts), half days included
        plan('s1', { requiredDays: 15, scheduledDays: 10.5, completedDays: 5.5 }),
        plan('s2', { type: 'political', typeLabel: 'Chính trị', title: null, requiredDays: 10, scheduledDays: 4, completedDays: 4, status: 'draft', unitCode: null, unitName: null }),
        plan('s3', { requiredDays: 12.5, scheduledDays: 12, completedDays: 12, status: 'completed', unitCode: 'KP2', unitName: 'Khu phố 2' }),
        plan('s4', { year: 2025, type: 'fire', typeLabel: 'Phòng cháy, chữa cháy', requiredDays: 5, scheduledDays: 5, completedDays: 5, status: 'completed' }),
      ]
    }

    it('defaults to the current year in Vietnam, not in the browser timezone', async () => {
      // 17:30 UTC on 31 December is already 1 January 2026 in Vietnam, still 2025 in Los Angeles
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2025-12-31T17:30:00Z'))
      expect(new Date().getFullYear()).toBe(2025)
      server.plans = statsPlans()
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'stats')

      const year = await screen.findByLabelText('Năm thống kê')
      expect(year).toHaveValue('2026')
      expect(optionLabels(year)).toEqual(['2026', '2025'])
      expect(await screen.findByText('Hoàn thành năm 2026')).toBeInTheDocument()
    })

    it('adds up the plans of the year by type and by unit', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-14T03:00:00Z'))
      server.plans = statsPlans()
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'stats')

      const summary = within(await screen.findByTestId('stats-summary'))
      expect(summary.getByText('Hoàn thành năm 2026')).toBeInTheDocument()
      expect(summary.getByTestId('stats-total-plans')).toHaveTextContent('3')
      expect(summary.getByTestId('stats-total-required')).toHaveTextContent('37,5')
      expect(summary.getByTestId('stats-total-scheduled')).toHaveTextContent('26,5')
      expect(summary.getByTestId('stats-total-completed')).toHaveTextContent('21,5')
      expect(summary.getByTestId('stats-total-rate')).toHaveTextContent('57%')
      expect(summary.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '57')

      const military = within(screen.getByTestId('stats-type-military'))
      expect(military.getByText('Quân sự')).toBeInTheDocument()
      expect(military.getAllByRole('cell').map((c) => c.textContent)).toEqual(['Quân sự', '2', '27,5', '22,5', '17,5', '64%'])
      expect(within(screen.getByTestId('stats-type-political')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
        'Chính trị', '1', '10', '4', '4', '40%',
      ])
      expect(screen.queryByTestId('stats-type-fire')).not.toBeInTheDocument()

      expect(within(screen.getByTestId('stats-unit-ward')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
        'Toàn phường', '1', '10', '4', '4', '40%',
      ])
      expect(within(screen.getByTestId('stats-unit-KP1')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
        'Khu phố 1', '1', '15', '10,5', '5,5', '37%',
      ])
      expect(within(screen.getByTestId('stats-unit-KP2')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
        'Khu phố 2', '1', '12,5', '12', '12', '96%',
      ])

      await user.selectOptions(screen.getByLabelText('Năm thống kê'), '2025')
      expect(within(screen.getByTestId('stats-type-fire')).getAllByRole('cell').map((c) => c.textContent)).toEqual([
        'Phòng cháy, chữa cháy', '1', '5', '5', '5', '100%',
      ])
      expect(screen.queryByTestId('stats-type-military')).not.toBeInTheDocument()
    })

    it('keeps the legal training requirement and says when the year has no plan', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-14T03:00:00Z'))
      server.plans = [plan('s4', { year: 2025 })]
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'stats')

      expect(await screen.findByText('Chưa có kế hoạch cho năm 2026')).toBeInTheDocument()
      expect(screen.getByText('Quy định huấn luyện (Thông tư 56/2020/TT-BQP)')).toBeInTheDocument()
      expect(screen.getByText('Năm đầu (Dân quân mới)')).toBeInTheDocument()
      expect(screen.getByText('15 ngày')).toBeInTheDocument()
      expect(screen.getByText('7–12 ngày')).toBeInTheDocument()
      expect(screen.queryByTestId('stats-summary')).not.toBeInTheDocument()
    })

    it('explains plans that cannot be loaded', async () => {
      api.get.mockImplementation(() => Promise.reject(httpError(500, 'Internal server error')))
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'stats')
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải danh sách kế hoạch huấn luyện.'))
    })
  })
})

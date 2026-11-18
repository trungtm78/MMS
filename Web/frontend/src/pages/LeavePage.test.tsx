import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LeavePage } from './LeavePage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({
  user: { id: 'me', role: 'dqtv_member', roles: ['dqtv_member'], unitScope: 'KP1' } as Record<string, unknown>,
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
// Real useRbac: the approve tab follows the backend leave REVIEWER_ROLES
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// Web/backend/src/leave/leave.service.ts LeaveRequest / LeaveBalance
const leave = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  code: `LEAVE-20260427-${id.toUpperCase()}`,
  requesterId: 'me',
  requesterName: 'Nguyễn Văn Tôi',
  leaveTypeId: 'lt-annual',
  leaveTypeName: 'Phép năm',
  fromDate: '2026-05-01',
  toDate: '2026-05-03',
  isHalfDay: false,
  halfDayPeriod: null,
  reason: 'Nghỉ cá nhân',
  replacementId: null,
  status: 'pending',
  totalDays: 3,
  createdAt: '2026-04-27T10:00:00.000Z',
  updatedAt: '2026-04-27T10:00:00.000Z',
  // The latest decision; null while nobody decided the request
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  ...patch,
})

// GET /leave-balances rows (leave.service.ts getLeaveBalances), newest year first. The DECIMAL(4,1)
// day columns arrive as JSON numbers (Web/backend/src/database/pg-types.ts). A type with a yearly
// limit gets its row once a request or an approval of that year created it; a type without one has a
// row only when an operator allocated it.
const balances = [
  { leaveTypeId: 'lt-annual', leaveTypeName: 'Nghỉ phép năm', totalDays: 12, usedDays: 2, remainingDays: 10, year: 2026 },
  { leaveTypeId: 'lt-annual', leaveTypeName: 'Nghỉ phép năm', totalDays: 12, usedDays: 8, remainingDays: 4, year: 2025 },
]

const REPLACEMENT_ID = '7d2a6f0e-1b3c-4d5e-8f90-123456789abc'

// GET /users/search rows (Web/backend/src/users/users.service.ts UserSearchItem): active people the
// caller may reach, never the caller
const users = [
  { id: REPLACEMENT_ID, username: 'tvb', fullName: 'Trần Văn Bảo', role: 'dqtv_member', roles: ['dqtv_member'], status: 'active' },
]

// GET /leave/types rows (leave.service.ts LeaveType): types of the default catalogue (migration 033),
// active ones ordered by name. A null maxDaysPerYear (sick, maternity, unpaid) draws on no balance.
const leaveTypes = [
  { id: 'lt-unpaid', code: 'unpaid', name: 'Nghỉ không lương', description: 'Theo thỏa thuận với đơn vị', maxDaysPerYear: null, requiresDocument: false, isPaid: false },
  { id: 'lt-sick', code: 'sick', name: 'Nghỉ ốm', description: 'Cần giấy chứng nhận của cơ sở khám bệnh, chữa bệnh', maxDaysPerYear: null, requiresDocument: true, isPaid: true },
  { id: 'lt-annual', code: 'annual', name: 'Nghỉ phép năm', description: 'Nghỉ hằng năm hưởng nguyên lương', maxDaysPerYear: 12, requiresDocument: false, isPaid: true },
  { id: 'lt-bereavement', code: 'bereavement', name: 'Nghỉ tang', description: 'Cha, mẹ, vợ hoặc chồng, con chết', maxDaysPerYear: 3, requiresDocument: false, isPaid: true },
]

const httpError = (status: number, message: string, extra: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status, ...extra } },
})

type ListParams = { status?: string; mine?: boolean; page?: number; limit?: number }

const server = {
  rows: [] as ReturnType<typeof leave>[],
  types: leaveTypes as typeof leaveTypes,
  balances: balances as typeof balances,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  return client
}

// ApprovalsPage caches GET /approvals under ['approvals', tab]
const APPROVALS_KEY = ['approvals', 'pending']
const approvalsInvalidated = (client: QueryClient) => client.getQueryState(APPROVALS_KEY)?.isInvalidated === true

const leaveListCalls = (match: (params: ListParams) => boolean) =>
  api.get.mock.calls.filter(([url, config]) => url === '/leave' && match((config as { params: ListParams }).params)).length

type User = ReturnType<typeof userEvent.setup>

async function openCreateForm(user: User) {
  await user.click(await screen.findByTestId('create-leave-btn'))
  return screen.findByRole('dialog', { name: 'Tạo đơn nghỉ phép' })
}

async function fillLeave(user: User, fields: { type?: string; from?: string; to?: string; reason?: string }) {
  if (fields.type) {
    const select = screen.getByTestId('leave-type-select')
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1))
    await user.selectOptions(select, fields.type)
  }
  // Date inputs are set directly, as user-event cannot type into type="date" reliably
  if (fields.from) fireEvent.change(screen.getByTestId('leave-start-date'), { target: { value: fields.from } })
  if (fields.to) fireEvent.change(screen.getByTestId('leave-end-date'), { target: { value: fields.to } })
  if (fields.reason) await user.type(screen.getByTestId('leave-reason'), fields.reason)
}

const lastPostBody = () => api.post.mock.calls.at(-1)?.[1] as Record<string, unknown>

// GET /leave answers 500 until the returned function restores the normal answers
function failLeaveList() {
  const serve = api.get.getMockImplementation()
  api.get.mockImplementation((url: string, config?: unknown) =>
    url === '/leave' ? Promise.reject(httpError(500, 'internal_error')) : serve?.(url, config),
  )
  return () => {
    if (serve) api.get.mockImplementation(serve)
  }
}

describe('LeavePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    // 10:00 on 27 April 2026 in Vietnam: a request without dates yet counts on the 2026 balances
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-04-27T03:00:00.000Z'))
    session.user = { id: 'me', role: 'dqtv_member', roles: ['dqtv_member'], unitScope: 'KP1' }
    server.rows = [leave('l1')]
    server.types = leaveTypes
    server.balances = balances
    api.get.mockImplementation((url: string, config?: { params?: ListParams }) => {
      const params = config?.params ?? {}
      if (url === '/leave-balances') return Promise.resolve({ data: server.balances })
      if (url === '/leave/types') return Promise.resolve({ data: server.types })
      if (url === '/users/search') return Promise.resolve({ data: users })
      if (url === '/leave') {
        const rows = server.rows
          .filter((r) => !params.status || r.status === params.status)
          .filter((r) => !params.mine || r.requesterId === 'me')
        return Promise.resolve({ data: { data: rows, total: rows.length, page: 1, limit: 100 } })
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    api.post.mockResolvedValue({ data: leave('l9') })
    api.patch.mockResolvedValue({ data: undefined })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders heading', () => {
    wrap(<LeavePage />)
    expect(screen.getByText('Quản lý nghỉ phép')).toBeInTheDocument()
  })

  it('shows "Đơn của tôi" tab', () => {
    wrap(<LeavePage />)
    expect(screen.getByTestId('tab-my-leaves')).toBeInTheDocument()
  })

  it('does not show the approve tab to roles that cannot review leave', () => {
    wrap(<LeavePage />)
    expect(screen.queryByTestId('tab-approve')).not.toBeInTheDocument()
  })

  // leave.service.ts REVIEWER_ROLES now includes the CA roles
  it.each(['police_area', 'ca_ward', 'ca_area', 'ca_officer'])('shows the approve tab to the leave reviewer %s', (role) => {
    session.user = { id: 'me', role, roles: [role], unitScope: 'KP1' }
    wrap(<LeavePage />)
    expect(screen.getByTestId('tab-approve')).toBeInTheDocument()
  })

  describe('my requests', () => {
    it('lists them from GET /leave?mine=true with the backend fields', async () => {
      wrap(<LeavePage />)

      const row = within(await screen.findByTestId('leave-row-l1'))
      expect(row.getByText('Phép năm')).toBeInTheDocument()
      expect(row.getByText('01/05/2026 – 03/05/2026')).toBeInTheDocument()
      expect(row.getByText('Chờ duyệt')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/leave', { params: { page: 1, limit: 100, mine: true } })
    })

    it('asks the server for the caller’s own requests also when the caller is a reviewer', async () => {
      session.user = { id: 'me', role: 'police_area', roles: ['police_area'], unitScope: 'KP1' }
      server.rows = [leave('l1'), leave('l2', { requesterId: 'someone-else', requesterName: 'Trần Văn B', leaveTypeName: 'Nghỉ ốm' })]
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(screen.getByTestId('tab-my-leaves'))

      expect(await screen.findByTestId('leave-row-l1')).toBeInTheDocument()
      expect(screen.queryByTestId('leave-row-l2')).not.toBeInTheDocument()
      expect(leaveListCalls((p) => p.mine === true)).toBeGreaterThan(0)
    })

    it('shows a half-day request with its period', async () => {
      server.rows = [leave('l1', { fromDate: '2026-05-04', toDate: '2026-05-04', isHalfDay: true, halfDayPeriod: 'afternoon', totalDays: 0.5 })]
      wrap(<LeavePage />)

      const row = within(await screen.findByTestId('leave-row-l1'))
      expect(row.getByText('04/05/2026 · Buổi chiều')).toBeInTheDocument()
    })

    it('shows empty state when no leaves', async () => {
      server.rows = []
      wrap(<LeavePage />)
      expect(await screen.findByText('Bạn chưa có đơn nghỉ phép nào')).toBeInTheDocument()
    })

    it('cancels a pending request with PATCH /leave/:id/cancel', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(await screen.findByTestId('cancel-leave-btn-l1'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/leave/l1/cancel'))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã hủy đơn xin nghỉ'))
    })

    it('marks the approvals list stale after cancelling', async () => {
      const user = userEvent.setup()
      const client = wrap(<LeavePage />)
      client.setQueryData(APPROVALS_KEY, [])

      await user.click(await screen.findByTestId('cancel-leave-btn-l1'))

      await waitFor(() => expect(approvalsInvalidated(client)).toBe(true))
    })

    it('explains a request that was decided meanwhile (409) and refreshes the list', async () => {
      api.patch.mockRejectedValueOnce(httpError(409, 'leave_request_not_pending'))
      const user = userEvent.setup()
      wrap(<LeavePage />)
      await screen.findByTestId('leave-row-l1')
      const before = leaveListCalls((p) => p.mine === true)

      await user.click(screen.getByTestId('cancel-leave-btn-l1'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Đơn này đã được xử lý trước đó. Danh sách đã được cập nhật.'))
      await waitFor(() => expect(leaveListCalls((p) => p.mine === true)).toBeGreaterThan(before))
    })
  })

  describe('create request', () => {
    it('offers the leave types', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await openCreateForm(user)

      const select = screen.getByTestId('leave-type-select')
      await waitFor(() => expect(within(select).getByRole('option', { name: /Nghỉ phép năm/ })).toBeInTheDocument())
      expect(within(select).getByRole('option', { name: /Nghỉ ốm/ })).toHaveValue('lt-sick')
    })

    it('posts only the CreateLeaveDto fields that were filled in', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06', reason: 'Việc gia đình' })
      await user.click(screen.getByTestId('leave-submit-btn'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][0]).toBe('/leave')
      expect(lastPostBody()).toStrictEqual({ leaveTypeId: 'lt-annual', fromDate: '2026-05-04', toDate: '2026-05-06', reason: 'Việc gia đình' })
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tạo đơn nghỉ phép thành công'))
    })

    it('marks the approvals list stale after creating a request', async () => {
      const user = userEvent.setup()
      const client = wrap(<LeavePage />)
      client.setQueryData(APPROVALS_KEY, [])

      await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06', reason: 'Việc gia đình' })
      await user.click(screen.getByTestId('leave-submit-btn'))

      await waitFor(() => expect(approvalsInvalidated(client)).toBe(true))
    })

    it('sends a half-day request for a single day with its period', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', reason: 'Khám bệnh' })
      await user.click(screen.getByLabelText('Nghỉ nửa ngày'))

      const end = screen.getByTestId('leave-end-date')
      expect(end).toBeDisabled()
      expect(end).toHaveValue('2026-05-04')

      await user.selectOptions(screen.getByTestId('leave-half-day-period'), 'afternoon')
      await user.click(screen.getByTestId('leave-submit-btn'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(lastPostBody()).toStrictEqual({
        leaveTypeId: 'lt-annual',
        fromDate: '2026-05-04',
        toDate: '2026-05-04',
        reason: 'Khám bệnh',
        isHalfDay: true,
        halfDayPeriod: 'afternoon',
      })
    })

    it('requires the half-day period', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', reason: 'Khám bệnh' })
      await user.click(screen.getByLabelText('Nghỉ nửa ngày'))
      await user.click(screen.getByTestId('leave-submit-btn'))

      expect(within(dialog).getByRole('alert')).toHaveTextContent('Vui lòng chọn buổi nghỉ')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('sends the chosen replacement (a user id from GET /users/search), never the requester', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06', reason: 'Việc gia đình' })
      const input = screen.getByTestId('smart-select-leave-replacement-input')
      await user.click(input)
      await user.type(input, 'Trần')

      // The search runs after SmartSelect's debounce
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/users/search', { params: { q: 'Trần', limit: 20 } }))
      expect(await screen.findByRole('option', { name: /Trần Văn Bảo/ })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Nguyễn Văn Tôi/ })).not.toBeInTheDocument()
      await user.click(screen.getByRole('option', { name: /Trần Văn Bảo/ }))
      await user.click(screen.getByTestId('leave-submit-btn'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(lastPostBody()).toStrictEqual({
        leaveTypeId: 'lt-annual',
        fromDate: '2026-05-04',
        toDate: '2026-05-06',
        reason: 'Việc gia đình',
        replacementId: REPLACEMENT_ID,
      })
    })

    // Web/backend/src/leave/leave.service.ts createLeaveRequest
    it.each([
      [400, 'invalid_date', 'Ngày nghỉ không hợp lệ. Vui lòng chọn lại ngày.'],
      [409, 'insufficient_leave_balance', 'Số ngày phép còn lại không đủ cho đơn này.'],
      [400, 'invalid_date_range_no_working_days', 'Khoảng thời gian đã chọn không có ngày làm việc.'],
      // A type retired after the form loaded its list
      [400, 'leave_type_inactive', 'Loại nghỉ phép này đã ngừng áp dụng. Vui lòng chọn loại khác.'],
    ])('explains HTTP %i %s inside the form', async (status, code, message) => {
      api.post.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06', reason: 'Việc gia đình' })
      await user.click(screen.getByTestId('leave-submit-btn'))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByRole('dialog', { name: 'Tạo đơn nghỉ phép' })).toBeInTheDocument()
    })

    it('shows validation messages next to their fields and the rest in the form message', async () => {
      api.post.mockRejectedValueOnce(
        httpError(400, 'validation_failed', {
          code: 'E001',
          errors: ['from_date must be YYYY-MM-DD', 'replacementId must be a UUID', 'property leaveType should not exist'],
        }),
      )
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06', reason: 'Việc gia đình' })
      await user.click(screen.getByTestId('leave-submit-btn'))

      expect(await within(dialog).findByTestId('leave-from-error')).toHaveTextContent('from_date must be YYYY-MM-DD')
      expect(screen.getByTestId('leave-start-date')).toHaveAttribute('aria-invalid', 'true')
      expect(within(dialog).getByTestId('leave-replacement-error')).toHaveTextContent('replacementId must be a UUID')
      expect(within(dialog).getByRole('alert')).toHaveTextContent('property leaveType should not exist')
    })
  })

  describe('approving (reviewers)', () => {
    beforeEach(() => {
      session.user = { id: 'me', role: 'police_area', roles: ['police_area'], unitScope: 'KP1' }
      server.rows = [leave('l2', { requesterId: 'u2', requesterName: 'Trần Văn B' })]
    })

    it('lists pending requests with GET /leave?status=pending', async () => {
      wrap(<LeavePage />)

      const row = within(await screen.findByTestId('approve-row-l2'))
      expect(row.getByText('Trần Văn B')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/leave', { params: { status: 'pending', page: 1, limit: 100 } })
    })

    it('approves with PATCH /leave/:id/review { action: approve }', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(await screen.findByTestId('approve-btn-l2'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/leave/l2/review', { action: 'approve' }))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã duyệt đơn'))
    })

    it('marks the approvals list stale after a decision', async () => {
      const user = userEvent.setup()
      const client = wrap(<LeavePage />)
      client.setQueryData(APPROVALS_KEY, [])

      await user.click(await screen.findByTestId('approve-btn-l2'))

      await waitFor(() => expect(approvalsInvalidated(client)).toBe(true))
    })

    it('rejects with PATCH /leave/:id/review { action: reject }', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(await screen.findByTestId('reject-btn-l2'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/leave/l2/review', { action: 'reject' }))
    })

    // Web/backend/src/leave/leave.service.ts reviewLeaveRequest
    it.each([
      [409, 'leave_request_not_pending', 'Đơn này đã được xử lý trước đó. Danh sách đã được cập nhật.'],
      [409, 'insufficient_leave_balance', 'Người đề nghị không còn đủ số ngày phép để duyệt đơn này.'],
      [403, 'cannot_review_own_request', 'Bạn không thể tự duyệt đơn nghỉ phép của chính mình.'],
    ])('explains HTTP %i %s', async (status, code, message) => {
      api.patch.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(await screen.findByTestId('approve-btn-l2'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    })

    it('refetches the pending list after a leave_request_not_pending conflict', async () => {
      api.patch.mockRejectedValueOnce(httpError(409, 'leave_request_not_pending'))
      const user = userEvent.setup()
      wrap(<LeavePage />)
      await screen.findByTestId('approve-row-l2')
      const before = leaveListCalls((p) => p.status === 'pending')

      await user.click(screen.getByTestId('approve-btn-l2'))

      await waitFor(() => expect(leaveListCalls((p) => p.status === 'pending')).toBeGreaterThan(before))
    })

    it('confirms a rejection', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(await screen.findByTestId('reject-btn-l2'))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã từ chối đơn'))
    })

    it('falls back to a generic text when the decision fails for another reason', async () => {
      api.patch.mockRejectedValueOnce(httpError(500, 'internal_error'))
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(await screen.findByTestId('approve-btn-l2'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể cập nhật trạng thái'))
    })

    it('labels the reviewer’s own requests and requesters without a name', async () => {
      server.rows = [leave('l3', { requesterId: 'me' }), leave('l4', { requesterId: 'u4', requesterName: '' })]
      wrap(<LeavePage />)

      const own = within(await screen.findByTestId('approve-row-l3'))
      expect(own.getByText('Đơn của bạn')).toBeInTheDocument()
      expect(own.getByText('Phép năm · 01/05/2026 – 03/05/2026 · 3 ngày')).toBeInTheDocument()
      expect(screen.queryByTestId('approve-btn-l3')).not.toBeInTheDocument()
      const unnamed = within(screen.getByTestId('approve-row-l4'))
      expect(unnamed.getByText('Không rõ')).toBeInTheDocument()
      expect(unnamed.getByText('?')).toBeInTheDocument()
      expect(unnamed.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument()
      expect(unnamed.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument()
    })

    it('says when no request waits for review', async () => {
      server.rows = []
      wrap(<LeavePage />)
      expect(await screen.findByText('Không có đơn nào chờ duyệt')).toBeInTheDocument()
      expect(screen.getByTestId('tab-approve')).toHaveTextContent('Duyệt đơn')
    })

    it('explains a pending list that failed to load and retries it', async () => {
      const restore = failLeaveList()
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Không thể tải danh sách đơn chờ duyệt.')
      restore()
      await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

      expect(await screen.findByTestId('approve-row-l2')).toBeInTheDocument()
    })
  })

  describe('texts of my requests and the form', () => {
    it('explains a list that failed to load and retries it', async () => {
      const restore = failLeaveList()
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Không thể tải danh sách đơn nghỉ phép.')
      restore()
      await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

      expect(await screen.findByTestId('leave-row-l1')).toBeInTheDocument()
    })

    it('shows the status and the half-day period of each request', async () => {
      const halfDay = { fromDate: '2026-05-04', toDate: '2026-05-04', isHalfDay: true, totalDays: 0.5 }
      server.rows = [
        leave('l1', { ...halfDay, status: 'approved', halfDayPeriod: 'morning' }),
        leave('l2', { ...halfDay, status: 'cancelled', halfDayPeriod: null }),
        leave('l3', { status: 'archived' }),
      ]
      wrap(<LeavePage />)

      const approved = within(await screen.findByTestId('leave-row-l1'))
      expect(approved.getByText('Đã duyệt')).toBeInTheDocument()
      expect(approved.getByText('04/05/2026 · Buổi sáng')).toBeInTheDocument()
      expect(screen.queryByTestId('cancel-leave-btn-l1')).not.toBeInTheDocument()
      const cancelled = within(screen.getByTestId('leave-row-l2'))
      expect(cancelled.getByText('Đã hủy')).toBeInTheDocument()
      expect(cancelled.getByText('04/05/2026 · Nửa ngày')).toBeInTheDocument()
      // A status the page does not know is shown as it is
      expect(within(screen.getByTestId('leave-row-l3')).getByText('archived')).toBeInTheDocument()
    })

    it('falls back to a generic text when a cancel fails for another reason', async () => {
      api.patch.mockRejectedValueOnce(httpError(500, 'internal_error'))
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await user.click(await screen.findByTestId('cancel-leave-btn-l1'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể hủy đơn nghỉ phép'))
      expect(screen.getByTestId('cancel-leave-btn-l1')).toHaveTextContent('Hủy đơn')
    })

    it('labels the form fields and closes it with Hủy', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      expect(await screen.findByTestId('create-leave-btn')).toHaveTextContent('Tạo đơn')
      const dialog = await openCreateForm(user)
      expect(within(dialog).getByText('Các trường có dấu * là bắt buộc.')).toBeInTheDocument()
      const select = within(dialog).getByTestId('leave-type-select')
      expect(await within(select).findByRole('option', { name: 'Nghỉ phép năm (còn 10 ngày, năm 2026)' })).toHaveValue('lt-annual')
      expect(within(select).getByRole('option', { name: '-- Chọn loại nghỉ --' })).toHaveValue('')
      expect(within(dialog).getByLabelText(/Ngày bắt đầu/)).toBeInTheDocument()
      expect(within(dialog).getByPlaceholderText('Nêu lý do nghỉ phép...')).toBeInTheDocument()
      expect(within(dialog).getByTestId('leave-submit-btn')).toHaveTextContent('Gửi đơn')

      await user.click(within(dialog).getByLabelText('Nghỉ nửa ngày'))
      expect(within(dialog).getByLabelText(/Ngày nghỉ/)).toBeInTheDocument()
      expect(within(dialog).getByRole('option', { name: 'Buổi sáng' })).toHaveValue('morning')
      expect(within(dialog).getByRole('option', { name: '-- Chọn buổi --' })).toHaveValue('')

      await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('lets a member without any balance yet request leave of a type with a yearly limit', async () => {
      server.balances = []
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      const select = within(dialog).getByTestId('leave-type-select')

      // The first request of the year creates the balance at the yearly limit
      expect(await within(select).findByRole('option', { name: 'Nghỉ phép năm (còn 12 ngày, năm 2026)' })).toHaveValue('lt-annual')
      expect(within(dialog).queryByText(/chưa được cấp số ngày phép/)).not.toBeInTheDocument()

      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06', reason: 'Việc gia đình' })
      await user.click(screen.getByTestId('leave-submit-btn'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(lastPostBody()).toStrictEqual({ leaveTypeId: 'lt-annual', fromDate: '2026-05-04', toDate: '2026-05-06', reason: 'Việc gia đình' })
    })

    it.each([
      ['no leave type', {}, 'Vui lòng chọn loại nghỉ'],
      ['no dates', { type: 'lt-annual' }, 'Vui lòng chọn ngày'],
      ['an end before the start', { type: 'lt-annual', from: '2026-05-06', to: '2026-05-04' }, 'Ngày bắt đầu phải trước hoặc trùng ngày kết thúc'],
      ['no reason', { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06' }, 'Vui lòng nhập lý do'],
    ])('refuses a request with %s', async (_, fields, message) => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      await fillLeave(user, fields)
      await user.click(screen.getByTestId('leave-submit-btn'))

      expect(within(dialog).getByRole('alert')).toHaveTextContent(message)
      expect(api.post).not.toHaveBeenCalled()
    })

    it.each([
      [400, 'unknown_code', 'Thông tin đơn nghỉ phép không hợp lệ. Vui lòng kiểm tra lại.'],
      [500, 'internal_error', 'Không thể tạo đơn nghỉ phép'],
    ])('explains HTTP %i %s without a specific text', async (status, code, message) => {
      api.post.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual', from: '2026-05-04', to: '2026-05-06', reason: 'Việc gia đình' })
      await user.click(screen.getByTestId('leave-submit-btn'))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    })
  })

  // T20 backend contract: users.controller.ts UserSearchQueryDto (q of 2..100 trimmed characters),
  // leave.service.ts listLeaveTypes and the review columns of every leave request
  describe('backend contract T20', () => {
    const userSearchCalls = () => api.get.mock.calls.filter(([url]) => url === '/users/search')
    const SEARCH_HINT = 'Nhập ít nhất 2 ký tự để tìm'

    it('searches replacements only once 2 characters are typed, and says so before', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      expect(within(dialog).getByText(SEARCH_HINT)).toBeInTheDocument()
      const input = within(dialog).getByTestId('smart-select-leave-replacement-input')
      await user.type(input, ' T')
      // Longer than SmartSelect's 300 ms search debounce, whose timer updates state
      await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
      expect(userSearchCalls()).toHaveLength(0)
      expect(within(dialog).getByText(SEARCH_HINT)).toBeInTheDocument()

      await user.type(input, 'r')

      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/users/search', { params: { q: 'Tr', limit: 20 } }))
      expect(userSearchCalls()).toHaveLength(1)
      await waitFor(() => expect(within(dialog).queryByText(SEARCH_HINT)).not.toBeInTheDocument())
    })

    it('offers the active leave types of GET /leave/types, with the remaining balance when there is one', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      const select = within(dialog).getByTestId('leave-type-select')

      expect(await within(select).findByRole('option', { name: 'Nghỉ tang (còn 3 ngày, năm 2026)' })).toHaveValue('lt-bereavement')
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        '-- Chọn loại nghỉ --',
        'Nghỉ không lương (Không giới hạn)',
        'Nghỉ ốm (Không giới hạn)',
        'Nghỉ phép năm (còn 10 ngày, năm 2026)',
        'Nghỉ tang (còn 3 ngày, năm 2026)',
      ])
      expect(api.get).toHaveBeenCalledWith('/leave/types')
    })

    it('shows the description and the document requirement of the chosen type', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      await fillLeave(user, { type: 'lt-sick' })

      expect(within(dialog).getByText('Cần giấy chứng nhận của cơ sở khám bệnh, chữa bệnh')).toBeInTheDocument()
      expect(within(dialog).getByText('Loại nghỉ này cần có giấy tờ kèm theo.')).toBeInTheDocument()

      await user.selectOptions(within(dialog).getByTestId('leave-type-select'), 'lt-annual')

      expect(within(dialog).getByText('Nghỉ hằng năm hưởng nguyên lương')).toBeInTheDocument()
      expect(within(dialog).queryByText('Cần giấy chứng nhận của cơ sở khám bệnh, chữa bệnh')).not.toBeInTheDocument()
      expect(within(dialog).queryByText('Loại nghỉ này cần có giấy tờ kèm theo.')).not.toBeInTheDocument()
    })

    it('says when no leave type is offered', async () => {
      server.types = []
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)

      expect(
        await within(dialog).findByText('Chưa có loại nghỉ phép nào được áp dụng. Vui lòng liên hệ cán bộ phụ trách.'),
      ).toBeInTheDocument()
    })

    it('shows who decided each request, on which day, and the note', async () => {
      server.rows = [
        leave('l1', {
          status: 'approved',
          reviewedBy: { id: 'rev-1', fullName: 'Trần Văn B' },
          // 09:00 on 1 March 2027 in Vietnam
          reviewedAt: '2027-03-01T02:00:00.000Z',
          reviewNote: 'Đồng ý, bàn giao công việc trước khi nghỉ',
        }),
        leave('l2', { status: 'rejected', reviewedBy: { id: 'rev-2', fullName: 'Lê Văn C' }, reviewedAt: null, reviewNote: null }),
        leave('l3'),
      ]
      wrap(<LeavePage />)

      expect(await screen.findByTestId('leave-review-l1')).toHaveTextContent('Đã duyệt bởi Trần Văn B ngày 01/03/2027')
      expect(
        within(screen.getByTestId('leave-row-l1')).getByText('Ý kiến người duyệt: Đồng ý, bàn giao công việc trước khi nghỉ'),
      ).toBeInTheDocument()
      const rejected = screen.getByTestId('leave-review-l2')
      expect(rejected).toHaveTextContent('Bị từ chối bởi Lê Văn C')
      expect(rejected).not.toHaveTextContent('ngày')
      expect(within(screen.getByTestId('leave-row-l2')).queryByText(/Ý kiến người duyệt/)).not.toBeInTheDocument()
      expect(screen.queryByTestId('leave-review-l3')).not.toBeInTheDocument()
    })
  })

  // T30 backend contract: leave.service.ts createLeaveRequest / yearBalance / allocatedBalance and
  // migration 033. A type with a yearly limit gets the member's balance for a year, at that limit, on
  // first use; a type without one (sick, maternity, unpaid) draws on a balance only when one was
  // allocated for the year. No request is refused for a missing balance.
  describe('backend contract T30', () => {
    const optionTexts = (select: HTMLElement) => within(select).getAllByRole('option').map((option) => option.textContent)

    it('counts the year the leave starts in: its balance, or the yearly limit before any balance', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      const select = within(dialog).getByTestId('leave-type-select')
      expect(await within(select).findByRole('option', { name: 'Nghỉ phép năm (còn 10 ngày, năm 2026)' })).toBeInTheDocument()

      fireEvent.change(within(dialog).getByTestId('leave-start-date'), { target: { value: '2025-12-29' } })
      expect(within(select).getByRole('option', { name: 'Nghỉ phép năm (còn 4 ngày, năm 2025)' })).toHaveValue('lt-annual')
      expect(within(select).getByRole('option', { name: 'Nghỉ tang (còn 3 ngày, năm 2025)' })).toHaveValue('lt-bereavement')

      fireEvent.change(within(dialog).getByTestId('leave-start-date'), { target: { value: '2027-01-04' } })
      expect(optionTexts(select)).toEqual([
        '-- Chọn loại nghỉ --',
        'Nghỉ không lương (Không giới hạn)',
        'Nghỉ ốm (Không giới hạn)',
        'Nghỉ phép năm (còn 12 ngày, năm 2027)',
        'Nghỉ tang (còn 3 ngày, năm 2027)',
      ])
    })

    it('hints the days still available for the chosen type', async () => {
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      await fillLeave(user, { type: 'lt-annual' })
      expect(within(dialog).getByTestId('leave-type-availability')).toHaveTextContent('Còn 10/12 ngày trong năm 2026.')

      await user.selectOptions(within(dialog).getByTestId('leave-type-select'), 'lt-bereavement')
      expect(within(dialog).getByTestId('leave-type-availability')).toHaveTextContent('Còn 3/3 ngày trong năm 2026.')

      await user.selectOptions(within(dialog).getByTestId('leave-type-select'), 'lt-unpaid')
      expect(within(dialog).getByTestId('leave-type-availability')).toHaveTextContent('Không giới hạn số ngày nghỉ trong năm.')
    })

    it('files leave of a type without a yearly limit whatever the balances', async () => {
      server.balances = []
      const user = userEvent.setup()
      wrap(<LeavePage />)

      await openCreateForm(user)
      await fillLeave(user, { type: 'lt-sick', from: '2026-05-04', to: '2026-05-05', reason: 'Sốt cao' })
      await user.click(screen.getByTestId('leave-submit-btn'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(lastPostBody()).toStrictEqual({ leaveTypeId: 'lt-sick', fromDate: '2026-05-04', toDate: '2026-05-05', reason: 'Sốt cao' })
    })

    it('uses a balance row for any type, the yearly limit before a row, and no bound only without both', async () => {
      // An operator allocated a 2026 sick leave balance: a type without a yearly limit draws on it
      server.balances = [
        ...balances,
        { leaveTypeId: 'lt-sick', leaveTypeName: 'Nghỉ ốm', totalDays: 30, usedDays: 5, remainingDays: 25, year: 2026 },
      ]
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      const select = within(dialog).getByTestId('leave-type-select')
      const availability = () => within(dialog).getByTestId('leave-type-availability')

      expect(await within(select).findByRole('option', { name: 'Nghỉ ốm (còn 25 ngày, năm 2026)' })).toHaveValue('lt-sick')
      expect(optionTexts(select)).toEqual([
        '-- Chọn loại nghỉ --',
        'Nghỉ không lương (Không giới hạn)', // no yearly limit, no row
        'Nghỉ ốm (còn 25 ngày, năm 2026)', // no yearly limit, a row
        'Nghỉ phép năm (còn 10 ngày, năm 2026)', // a yearly limit and a row
        'Nghỉ tang (còn 3 ngày, năm 2026)', // a yearly limit, no row yet
      ])

      await user.selectOptions(select, 'lt-sick')
      expect(availability()).toHaveTextContent('Còn 25/30 ngày trong năm 2026.')
      await user.selectOptions(select, 'lt-annual')
      expect(availability()).toHaveTextContent('Còn 10/12 ngày trong năm 2026.')
      await user.selectOptions(select, 'lt-bereavement')
      expect(availability()).toHaveTextContent('Còn 3/3 ngày trong năm 2026.')
      await user.selectOptions(select, 'lt-unpaid')
      expect(availability()).toHaveTextContent('Không giới hạn số ngày nghỉ trong năm.')

      // The sick leave balance belongs to 2026 only
      fireEvent.change(within(dialog).getByTestId('leave-start-date'), { target: { value: '2027-01-04' } })
      expect(within(select).getByRole('option', { name: 'Nghỉ ốm (Không giới hạn)' })).toHaveValue('lt-sick')
    })

    it('shows the types by name only until the balances arrive', async () => {
      const serve = api.get.getMockImplementation()
      api.get.mockImplementation((url: string, config?: unknown) =>
        url === '/leave-balances' ? new Promise<never>(() => undefined) : serve?.(url, config),
      )
      const user = userEvent.setup()
      wrap(<LeavePage />)

      const dialog = await openCreateForm(user)
      const select = within(dialog).getByTestId('leave-type-select')

      expect(await within(select).findByRole('option', { name: 'Nghỉ phép năm' })).toHaveValue('lt-annual')
      // Even a type without a yearly limit may draw on a balance row
      expect(optionTexts(select)).toEqual(['-- Chọn loại nghỉ --', 'Nghỉ không lương', 'Nghỉ ốm', 'Nghỉ phép năm', 'Nghỉ tang'])
      await user.selectOptions(select, 'lt-unpaid')
      expect(within(dialog).queryByTestId('leave-type-availability')).not.toBeInTheDocument()
    })
  })
})

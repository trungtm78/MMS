import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SOSPage } from './SOSPage'

// Only the HTTP layer, the toasts and the signed-in user are replaced: useRbac and ConfirmDialog run for real
const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// Web/backend/src/sos/sos-alerts.service.ts ALERT_SELECT row (GET /sos/alerts items)
const incident = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  code: 'SOS-20260914-A1B2C3',
  incidentType: 'sos',
  severity: 'urgent',
  title: 'Báo động khẩn cấp',
  message: 'Có đối tượng khả nghi',
  lat: 10.7512345,
  lng: 106.6212345,
  locationName: 'Khu phố 1, Phú Định',
  status: 'open',
  statusGroup: 'active',
  reporterId: 'u1',
  reporterName: 'Nguyễn Văn A',
  reporterUnitCode: 'KP1',
  assignedTo: null,
  assignedToName: null,
  resolutionNote: null,
  createdAt: minutesAgo(5),
  updatedAt: minutesAgo(5),
  resolvedAt: null,
  ...patch,
})

const resolved = incident('sos-2', {
  code: 'SOS-20260102-Z9Y8X7',
  severity: 'medium',
  title: 'Mất liên lạc',
  message: '',
  status: 'resolved',
  statusGroup: 'resolved',
  reporterId: 'u2',
  reporterName: 'Trần Thị B',
  reporterUnitCode: null,
  locationName: null,
  assignedTo: 'ca-1',
  assignedToName: 'Lê Văn Cán',
  resolutionNote: 'Đã liên lạc lại',
  createdAt: '2026-01-02T03:00:00.000Z',
  resolvedAt: '2026-01-02T20:30:00.000Z',
})

const alertPage = (data: unknown[], patch: Record<string, unknown> = {}) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  counts: { active: 1, resolved: 1 },
  ...patch,
})

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = { page: alertPage([]) as Record<string, unknown> }

const alertCalls = () => api.get.mock.calls.filter(([url]) => url === '/sos/alerts')
const lastParams = () => {
  const calls = alertCalls()
  return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
}
const actionsOf = (row: HTMLElement) =>
  within(row).queryAllByTestId(/^sos-action-/).map((button) => [button.getAttribute('data-testid'), button.textContent])

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/sos']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/sos" element={<SOSPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('SOSPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-answers; a test that stops early must not leave one behind
    api.get.mockReset()
    api.patch.mockReset()
    signInAs('police_ward')
    server.page = alertPage([incident('sos-1'), resolved])
    api.get.mockImplementation((url: string) =>
      url === '/sos/alerts' ? Promise.resolve({ data: server.page }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    )
    // sos.service.ts updateStatus RETURNING
    api.patch.mockImplementation((url: string, body: { status: string }) =>
      Promise.resolve({
        data: { id: url.split('/')[2], code: 'SOS-20260914-A1B2C3', incidentType: 'sos', severity: 'urgent', title: 'Báo động khẩn cấp', status: body.status, assignedTo: null, resolvedAt: null },
      }),
    )
  })

  // sos.controller.ts class-level @Roles
  describe('access', () => {
    it.each(['dqtv', 'dqtv_member', 'ca_officer', 'office_staff', 'system_admin'])('opens for %s', async (role) => {
      signInAs(role)
      wrap()
      expect(screen.getByRole('heading', { name: 'Cảnh báo SOS' })).toBeInTheDocument()
      expect(await screen.findByTestId('sos-alert-sos-1')).toBeInTheDocument()
    })

    it('sends a role outside the SOS readers to the forbidden page', async () => {
      signInAs('ubnd_leader')
      wrap()
      expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  describe('list', () => {
    it('asks GET /sos/alerts for every alert and keeps the server order', async () => {
      server.page = alertPage([resolved, incident('sos-1')])
      wrap()

      await screen.findByTestId('sos-alert-sos-1')
      expect(lastParams()).toEqual({ status: 'all', page: 1, limit: 20 })
      expect(screen.getAllByTestId(/^sos-alert-/).map((row) => row.getAttribute('data-testid'))).toEqual(['sos-alert-sos-2', 'sos-alert-sos-1'])
    })

    it('shows the code, the reporter, the incident, its severity, status, place and time', async () => {
      wrap()

      const row = within(await screen.findByTestId('sos-alert-sos-1'))
      expect(row.getByText('SOS-20260914-A1B2C3')).toBeInTheDocument()
      // initials of the last two words of the name
      expect(row.getByText('VA')).toBeInTheDocument()
      expect(row.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(row.getByText('Đơn vị KP1')).toBeInTheDocument()
      expect(row.getByText('Báo động khẩn cấp')).toBeInTheDocument()
      expect(row.getByText('Có đối tượng khả nghi')).toBeInTheDocument()
      expect(row.getByText('Khẩn cấp')).toBeInTheDocument()
      expect(row.getByText('Mới')).toBeInTheDocument()
      expect(row.getByText('Khu phố 1, Phú Định')).toBeInTheDocument()
      expect(row.getByText('5 phút trước')).toBeInTheDocument()
      expect(screen.getByTestId('sos-alert-sos-1')).toHaveAttribute('data-status-group', 'active')
    })

    it('shows a handled alert with its code, handler, result and day, and coordinates when the place has no name', async () => {
      wrap()

      const row = within(await screen.findByTestId('sos-alert-sos-2'))
      expect(screen.getByTestId('sos-alert-sos-2')).toHaveAttribute('data-status-group', 'resolved')
      expect(row.getByText('SOS-20260102-Z9Y8X7')).toBeInTheDocument()
      expect(row.getByText('Trung bình')).toBeInTheDocument()
      expect(row.getByText('Đã xử lý')).toBeInTheDocument()
      expect(row.getByText('10.75123, 106.62123')).toBeInTheDocument()
      expect(row.getByText('02/01/2026')).toBeInTheDocument()
      expect(row.getByText('Phụ trách: Lê Văn Cán')).toBeInTheDocument()
      expect(row.getByText('Xử lý ngày 03/01/2026')).toBeInTheDocument()
      expect(row.getByText('Kết quả: Đã liên lạc lại')).toBeInTheDocument()
    })

    it.each([
      [{ lat: null, lng: null, locationName: null }, 'Không rõ vị trí'],
      [{ createdAt: minutesAgo(-1) }, 'Vừa xong'],
      [{ createdAt: minutesAgo(125) }, '2 giờ trước'],
      [{ status: 'acknowledged', severity: 'high' }, 'Đã tiếp nhận'],
      [{ status: 'responding', severity: 'low' }, 'Đang ứng cứu'],
      [{ status: 'closed', statusGroup: 'resolved' }, 'Đã đóng'],
    ])('shows %o as %s', async (patch, text) => {
      server.page = alertPage([incident('sos-1', patch)])
      wrap()

      expect(within(await screen.findByTestId('sos-alert-sos-1')).getByText(text)).toBeInTheDocument()
    })

    it('names every severity', async () => {
      server.page = alertPage(['urgent', 'high', 'medium', 'low'].map((severity) => incident(severity, { severity })))
      wrap()

      await screen.findByTestId('sos-alert-low')
      expect(within(screen.getByTestId('sos-alert-urgent')).getByText('Khẩn cấp')).toBeInTheDocument()
      expect(within(screen.getByTestId('sos-alert-high')).getByText('Cao')).toBeInTheDocument()
      expect(within(screen.getByTestId('sos-alert-medium')).getByText('Trung bình')).toBeInTheDocument()
      expect(within(screen.getByTestId('sos-alert-low')).getByText('Thấp')).toBeInTheDocument()
    })

    it('counts the active and handled alerts of the whole scope', async () => {
      server.page = alertPage([incident('sos-1')], { counts: { active: 3, resolved: 7 } })
      wrap()

      expect(await screen.findByText('3 cảnh báo đang hoạt động')).toBeInTheDocument()
      const stats = within(screen.getByTestId('sos-stats'))
      expect(within(stats.getByTestId('sos-stat-active')).getByText('3')).toBeInTheDocument()
      expect(within(stats.getByTestId('sos-stat-resolved')).getByText('7')).toBeInTheDocument()
      expect(within(stats.getByTestId('sos-stat-total')).getByText('10')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Tất cả (10)' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: 'Đang hoạt động (3)' })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: 'Đã xử lý (7)' })).toBeInTheDocument()
    })

    it('hides the active badge when nothing is active', async () => {
      server.page = alertPage([resolved], { counts: { active: 0, resolved: 1 } })
      wrap()

      await screen.findByTestId('sos-alert-sos-2')
      expect(screen.queryByText(/cảnh báo đang hoạt động/)).not.toBeInTheDocument()
    })

    it('filters by status tab, severity and unit, back on the first page', async () => {
      server.page = alertPage([incident('sos-1')], { total: 45 })
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByRole('button', { name: 'Trang sau' }))
      await waitFor(() => expect(lastParams()).toEqual({ status: 'all', page: 2, limit: 20 }))

      await user.click(screen.getByRole('tab', { name: /^Đang hoạt động/ }))
      await waitFor(() => expect(lastParams()).toEqual({ status: 'active', page: 1, limit: 20 }))
      expect(screen.getByRole('tab', { name: /^Đang hoạt động/ })).toHaveAttribute('aria-selected', 'true')

      await user.selectOptions(screen.getByRole('combobox', { name: 'Mức độ' }), 'high')
      await waitFor(() => expect(lastParams()).toEqual({ status: 'active', severity: 'high', page: 1, limit: 20 }))

      await user.type(screen.getByRole('textbox', { name: 'Mã đơn vị' }), ' KP2 ')
      await user.click(screen.getByRole('button', { name: 'Lọc' }))
      await waitFor(() => expect(lastParams()).toEqual({ status: 'active', severity: 'high', unitCode: 'KP2', page: 1, limit: 20 }))

      await user.click(screen.getByRole('tab', { name: /^Đã xử lý/ }))
      await waitFor(() => expect(lastParams()).toEqual({ status: 'resolved', severity: 'high', unitCode: 'KP2', page: 1, limit: 20 }))
    })

    it('pages through the alerts', async () => {
      server.page = alertPage([incident('sos-1')], { total: 45 })
      const user = userEvent.setup()
      wrap()

      expect(await screen.findByText('Trang 1/3 · 45 cảnh báo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

      server.page = alertPage([incident('sos-21')], { total: 45, page: 2 })
      await user.click(screen.getByRole('button', { name: 'Trang sau' }))
      expect(await screen.findByText('Trang 2/3 · 45 cảnh báo')).toBeInTheDocument()
      expect(await screen.findByTestId('sos-alert-sos-21')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Trang trước' }))
      await waitFor(() => expect(lastParams()).toEqual({ status: 'all', page: 1, limit: 20 }))
    })

    it('shows the last page as the end', async () => {
      server.page = alertPage([incident('sos-1')], { total: 1 })
      wrap()

      expect(await screen.findByText('Trang 1/1 · 1 cảnh báo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
    })

    it('shows an empty state, and a filter hint when filters are on', async () => {
      server.page = alertPage([], { counts: { active: 0, resolved: 0 } })
      const user = userEvent.setup()
      wrap()

      expect(await screen.findByText('Không có cảnh báo nào')).toBeInTheDocument()
      expect(screen.getByText('Hệ thống đang hoạt động bình thường')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Trang sau' })).not.toBeInTheDocument()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Mức độ' }), 'urgent')
      expect(await screen.findByText('Không có cảnh báo phù hợp với bộ lọc')).toBeInTheDocument()
    })

    it('shows a loading state', async () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      wrap()

      expect(await screen.findByRole('status', { name: 'Đang tải cảnh báo SOS' })).toBeInTheDocument()
    })

    it.each([
      [403, 'no_unit_scope', 'Tài khoản của bạn chưa được gán đơn vị quản lý.'],
      [400, 'invalid_status', 'Trạng thái lọc không hợp lệ.'],
      [500, 'Internal server error', 'Không thể tải danh sách cảnh báo SOS.'],
    ])('explains %i %s and retries', async (status, code, message) => {
      api.get.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap()

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      await user.click(screen.getByRole('button', { name: 'Thử lại' }))
      expect(await screen.findByTestId('sos-alert-sos-1')).toBeInTheDocument()
    })
  })

  // PATCH /sos/:id/status: responders move an alert along incident-values.ts SOS_STATUS_TRANSITIONS
  describe('status actions', () => {
    it.each(['police_ward', 'police_area', 'ca_ward', 'ca_area', 'ca_officer', 'system_admin'])('offers %s the moves each status allows', async (role) => {
      signInAs(role)
      wrap()

      expect(await screen.findByTestId('sos-action-resolved-sos-1')).toHaveTextContent('Đánh dấu đã xử lý')
      expect(actionsOf(screen.getByTestId('sos-alert-sos-2')).map(([id]) => id)).toEqual(['sos-action-responding-sos-2', 'sos-action-closed-sos-2'])
    })

    it.each(['office_staff', 'dqtv', 'dqtv_member'])('does not offer %s any move', async (role) => {
      signInAs(role)
      wrap()

      await screen.findByTestId('sos-alert-sos-1')
      expect(screen.queryAllByTestId(/^sos-action-/)).toHaveLength(0)
    })

    it.each([
      ['open', 'active', [['acknowledged', 'Tiếp nhận'], ['responding', 'Chuyển sang đang ứng cứu'], ['resolved', 'Đánh dấu đã xử lý'], ['closed', 'Đóng cảnh báo']]],
      ['acknowledged', 'active', [['responding', 'Chuyển sang đang ứng cứu'], ['resolved', 'Đánh dấu đã xử lý'], ['closed', 'Đóng cảnh báo']]],
      ['responding', 'active', [['resolved', 'Đánh dấu đã xử lý'], ['closed', 'Đóng cảnh báo']]],
      ['resolved', 'resolved', [['responding', 'Chuyển sang đang ứng cứu'], ['closed', 'Đóng cảnh báo']]],
      ['closed', 'resolved', []],
    ])('offers a %s alert only its allowed moves', async (status, statusGroup, moves) => {
      server.page = alertPage([incident('sos-1', { status, statusGroup })])
      wrap()

      const row = await screen.findByTestId('sos-alert-sos-1')
      expect(actionsOf(row)).toEqual(moves.map(([target, label]) => [`sos-action-${target}-sos-1`, label]))
    })

    it.each([
      ['acknowledged', 'Xác nhận tiếp nhận cảnh báo', 'Cảnh báo "Báo động khẩn cấp" của Nguyễn Văn A sẽ được chuyển sang trạng thái đã tiếp nhận.', 'Đã tiếp nhận cảnh báo SOS'],
      ['responding', 'Xác nhận chuyển sang đang ứng cứu', 'Cảnh báo "Báo động khẩn cấp" của Nguyễn Văn A sẽ được chuyển sang trạng thái đang ứng cứu.', 'Đã chuyển cảnh báo sang đang ứng cứu'],
      ['resolved', 'Xác nhận đã xử lý cảnh báo', 'Cảnh báo "Báo động khẩn cấp" của Nguyễn Văn A sẽ được chuyển sang trạng thái đã xử lý.', 'Đã xử lý cảnh báo SOS'],
      ['closed', 'Xác nhận đóng cảnh báo', 'Cảnh báo "Báo động khẩn cấp" của Nguyễn Văn A sẽ được đóng và không thể mở lại.', 'Đã đóng cảnh báo SOS'],
    ])('moves an open alert to %s after confirmation and reloads the list', async (target, title, description, success) => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId(`sos-action-${target}-sos-1`))
      const dialog = await screen.findByRole('alertdialog', { name: title })
      expect(dialog).toHaveAccessibleDescription(description)
      expect(api.patch).not.toHaveBeenCalled()
      const loads = alertCalls().length

      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/sos/sos-1/status', { status: target }))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(success))
      await waitFor(() => expect(alertCalls().length).toBeGreaterThan(loads))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    })

    it('takes a resolved alert up again', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('sos-action-responding-sos-2'))
      const dialog = await screen.findByRole('alertdialog', { name: 'Xác nhận chuyển sang đang ứng cứu' })
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/sos/sos-2/status', { status: 'responding' }))
    })

    it('sends nothing when the confirmation is cancelled', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('sos-action-resolved-sos-1'))
      const dialog = await screen.findByRole('alertdialog', { name: 'Xác nhận đã xử lý cảnh báo' })
      await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(api.patch).not.toHaveBeenCalled()
    })

    it.each([
      [404, 'incident_not_found', 'Không tìm thấy cảnh báo SOS. Danh sách đã được cập nhật.', true],
      [409, 'invalid_status_transition', 'Cảnh báo này đã được xử lý hoặc đã đóng. Danh sách đã được cập nhật.', true],
      [400, 'assignee_not_found', 'Người được phân công không tồn tại hoặc đã ngừng hoạt động.', false],
      [500, 'Internal server error', 'Không thể xử lý cảnh báo', false],
    ])('explains %i %s (reloads the list: %s)', async (status, code, message, reloads) => {
      api.patch.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('sos-action-resolved-sos-1'))
      const dialog = await screen.findByRole('alertdialog', { name: 'Xác nhận đã xử lý cảnh báo' })
      const loads = alertCalls().length
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
      expect(toast.success).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      if (reloads) await waitFor(() => expect(alertCalls().length).toBeGreaterThan(loads))
      else expect(alertCalls()).toHaveLength(loads)
    })

    it.each([
      ['closed', 'Không thể đóng cảnh báo'],
      ['acknowledged', 'Không thể tiếp nhận cảnh báo'],
    ])('names the failed move to %s', async (target, message) => {
      api.patch.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId(`sos-action-${target}-sos-1`))
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xác nhận' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    })
  })
})

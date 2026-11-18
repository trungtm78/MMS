import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatCalendarDate } from '@/lib/dates'
import { ExemptionPage } from './ExemptionPage'

// Only the HTTP layer and the signed-in user are replaced: TanStack Query, useRbac,
// SmartSelect and the dialogs all run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api, getAccessToken: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true, logout: vi.fn() }),
}))

const MILITIA_ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01'

// GET /militia/search row
const militia = [
  {
    id: MILITIA_ID,
    userId: null,
    militiaCode: 'DQ-001',
    fullName: 'Trần Văn Bình',
    phone: null,
    rank: null,
    status: 'active',
    unitCode: 'KV1',
    unitName: 'Khu vực 1',
  },
]

// Build dates relative to today
function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ExemptionRecord from Web/backend/src/exemption/exemption.service.ts
function record(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    militiaId: MILITIA_ID,
    militiaName: 'Trần Văn Bình',
    militiaCode: 'DQ-001',
    unitCode: 'KV1',
    type: 'deferral',
    reason: 'Lý do hoãn nghĩa vụ',
    legalBasis: 'Điều 41 Luật DQTV',
    effectiveDate: '2025-01-01',
    expiryDate: null,
    status: 'active',
    documents: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...patch,
  }
}

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = { records: [] as unknown, failList: false }

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: 'KV1', fullName: 'Người dùng' }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/exemptions']}>
        <Routes>
          <Route path="/exemptions" element={<ExemptionPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const exemptionListCalls = () => api.get.mock.calls.filter(([url]) => url === '/exemptions').length

type User = ReturnType<typeof userEvent.setup>

async function openCreateForm(user: User) {
  await user.click(await screen.findByTestId('create-exemption-btn'))
  return screen.findByRole('dialog', { name: 'Tạo quyết định miễn/hoãn' })
}

async function chooseMilitia(user: User) {
  const input = screen.getByTestId('smart-select-exemption-militia-input')
  await user.click(input)
  await user.type(input, 'DQ-001')
  await user.click(await screen.findByRole('option', { name: /DQ-001/ }))
}

async function fillDecision(user: User, dates: { effective: string; expiry?: string }) {
  await user.type(screen.getByLabelText(/Lý do/), 'Học đại học')
  await user.type(screen.getByLabelText(/Căn cứ pháp lý/), 'Điều 12 Luật DQTV 2019')
  fireEvent.change(screen.getByLabelText(/Ngày hiệu lực/), { target: { value: dates.effective } })
  if (dates.expiry) {
    fireEvent.change(screen.getByLabelText(/Ngày hết hạn/), { target: { value: dates.expiry } })
  }
}

const submit = (user: User) => user.click(screen.getByTestId('exemption-submit'))

const revokeButton = async (recordId: string) =>
  within(await screen.findByTestId(`exemption-${recordId}`)).getByRole('button', { name: /Thu hồi quyết định/ })

describe('ExemptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued mock*Once answers; an unused one must not leak into the next test
    api.post.mockReset()
    api.patch.mockReset()
    signInAs('office_staff')
    server.failList = false
    server.records = [
      record('rec-1', { expiryDate: daysFromNow(25) }), // inside the 30-day warning window
      record('rec-2', { type: 'exemption', militiaName: 'Lê Thị Cúc', militiaCode: 'DQ-002', expiryDate: daysFromNow(60) }),
      record('rec-3', { status: 'revoked', expiryDate: daysFromNow(90) }),
    ]
    api.get.mockImplementation((url: string) => {
      if (url === '/exemptions') {
        return server.failList ? Promise.reject(httpError(500, 'Internal server error')) : Promise.resolve({ data: server.records })
      }
      if (url === '/militia/search') return Promise.resolve({ data: militia })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  describe('access (backend @Roles on /exemptions)', () => {
    it('sends roles without read access to the forbidden page', async () => {
      signInAs('ca_officer')
      renderPage()
      expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalledWith('/exemptions')
    })

    it('lets ca_ward issue decisions', async () => {
      signInAs('ca_ward')
      renderPage()
      expect(await screen.findByTestId('create-exemption-btn')).toBeInTheDocument()
    })
  })

  // expiryDate is a calendar day; "today" is the ward's day in Vietnam
  describe('days until expiry', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    // 18:30 UTC on 13 September is 01:30 on 14 September in Vietnam
    const atVietnamMorning = () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-13T18:30:00.000Z'))
    }

    it('does not warn about a decision that expired yesterday in Vietnam', async () => {
      atVietnamMorning()
      server.records = [record('rec-1', { expiryDate: '2026-09-13' })]
      renderPage()

      await screen.findByTestId('exemption-rec-1')
      expect(screen.queryByTestId('expiry-warning')).not.toBeInTheDocument()
      expect(screen.getByTestId('expiring-count')).toHaveTextContent('0')
    })

    it('warns about a decision that expires 30 calendar days from today in Vietnam', async () => {
      atVietnamMorning()
      server.records = [record('rec-1', { expiryDate: '2026-10-14' })]
      renderPage()

      expect(await within(await screen.findByTestId('exemption-rec-1')).findByTestId('expiry-warning')).toBeInTheDocument()
      expect(screen.getByTestId('expiring-count')).toHaveTextContent('1')
    })

    it('does not warn 31 calendar days ahead', async () => {
      atVietnamMorning()
      server.records = [record('rec-1', { expiryDate: '2026-10-15' })]
      renderPage()

      await screen.findByTestId('exemption-rec-1')
      expect(screen.queryByTestId('expiry-warning')).not.toBeInTheDocument()
    })
  })

  describe('list', () => {
    it('renders the plain array returned by GET /exemptions', async () => {
      renderPage()

      expect(await screen.findByTestId('exemption-rec-1')).toBeInTheDocument()
      expect(screen.getByTestId('exemption-rec-2')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/exemptions')
    })

    it('treats a response that is not an array as a failed load', async () => {
      server.records = { data: [record('rec-1')], total: 1, page: 1, limit: 20 }
      renderPage()

      expect(await screen.findByTestId('exemption-list-error')).toHaveTextContent('Không thể tải danh sách quyết định')
      expect(screen.queryByTestId('exemption-rec-1')).not.toBeInTheDocument()
    })

    it('shows an error state with a retry when the list cannot be loaded', async () => {
      const user = userEvent.setup()
      server.failList = true
      renderPage()

      const error = await screen.findByTestId('exemption-list-error')
      expect(error).toHaveAttribute('role', 'alert')
      expect(screen.queryByText('Chưa có quyết định nào')).not.toBeInTheDocument()

      server.failList = false
      await user.click(within(error).getByRole('button', { name: 'Thử lại' }))

      expect(await screen.findByTestId('exemption-rec-1')).toBeInTheDocument()
    })

    it('shows "Sắp hết hạn" only for active decisions expiring within 30 days', async () => {
      renderPage()
      await screen.findByTestId('exemption-rec-1')

      const warnings = screen.queryAllByTestId('expiry-warning')
      expect(warnings).toHaveLength(1)
      expect(within(screen.getByTestId('exemption-rec-1')).getByTestId('expiry-warning')).toBeInTheDocument()
    })

    it('identifies the militia member by name and code', async () => {
      renderPage()

      const card = within(await screen.findByTestId('exemption-rec-1'))
      expect(card.getByText('Trần Văn Bình')).toBeInTheDocument()
      expect(card.getByText(/DQ-001/)).toBeInTheDocument()
    })

    it('announces how many decisions expire soon', async () => {
      renderPage()
      expect(await screen.findByTestId('expiring-notice')).toHaveTextContent('1 quyết định sắp hết hạn')
      expect(within(screen.getByTestId('exemption-rec-1')).getByTestId('expiry-warning')).toHaveTextContent(
        /^Sắp hết hạn \(\d+ ngày\)$/,
      )
    })

    it('shows the type, legal basis and validity period of a decision', async () => {
      server.records = [
        record('rec-1', { type: 'exemption', status: 'expired', effectiveDate: '2025-01-01', expiryDate: '2025-06-30' }),
        record('rec-2', { effectiveDate: '2025-02-01', expiryDate: null }),
      ]
      renderPage()

      const expired = within(await screen.findByTestId('exemption-rec-1'))
      expect(expired.getByText('Miễn')).toBeInTheDocument()
      expect(expired.getByText('Hết hạn')).toBeInTheDocument()
      expect(expired.getByText('Căn cứ: Điều 41 Luật DQTV')).toBeInTheDocument()
      expect(screen.getByTestId('exemption-period-rec-1')).toHaveTextContent(
        `Hiệu lực: ${formatCalendarDate('2025-01-01')} – ${formatCalendarDate('2025-06-30')}`,
      )
      const open = within(screen.getByTestId('exemption-rec-2'))
      expect(open.getByText('Hoãn')).toBeInTheDocument()
      expect(open.getByText('Đang hiệu lực')).toBeInTheDocument()
      expect(screen.getByTestId('exemption-period-rec-2')).toHaveTextContent(`Hiệu lực: ${formatCalendarDate('2025-02-01')}`)
      expect(screen.getByTestId('exemption-period-rec-2')).not.toHaveTextContent('–')
    })

    it('explains a list the user may not read', async () => {
      api.get.mockImplementation((url: string) =>
        url === '/exemptions' ? Promise.reject(httpError(403, 'Forbidden resource')) : Promise.resolve({ data: militia }),
      )
      renderPage()

      expect(await screen.findByTestId('exemption-list-error')).toHaveTextContent('Bạn không có quyền xem danh sách này')
    })

    it("labels a revoked decision 'Đã thu hồi'", async () => {
      renderPage()
      expect(within(await screen.findByTestId('exemption-rec-3')).getByText('Đã thu hồi')).toBeInTheDocument()
    })

    it('offers a call to action in the empty state to users who may create', async () => {
      const user = userEvent.setup()
      server.records = []
      renderPage()

      expect(await screen.findByText('Chưa có quyết định nào')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Tạo quyết định đầu tiên' }))

      expect(await screen.findByRole('dialog', { name: 'Tạo quyết định miễn/hoãn' })).toBeInTheDocument()
    })

    it('shows the empty state without a call to action to read-only roles', async () => {
      signInAs('ubnd_leader')
      server.records = []
      renderPage()

      expect(await screen.findByText('Chưa có quyết định nào')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Tạo quyết định đầu tiên' })).not.toBeInTheDocument()
    })
  })

  // Typing into SmartSelect and the form one key at a time is slow under coverage instrumentation
  describe('create decision', { timeout: 15_000 }, () => {
    it('opens the form as a labelled modal dialog', async () => {
      const user = userEvent.setup()
      renderPage()

      const dialog = await openCreateForm(user)

      expect(dialog).toHaveAttribute('aria-modal', 'true')
      const labelledBy = dialog.getAttribute('aria-labelledby')
      expect(document.getElementById(labelledBy!)).toHaveTextContent('Tạo quyết định miễn/hoãn')
    })

    it('marks each required field with a single asterisk', async () => {
      const user = userEvent.setup()
      renderPage()

      const dialog = within(await openCreateForm(user))

      for (const label of ['Loại quyết định', 'Lý do', 'Căn cứ pháp lý', 'Ngày hiệu lực']) {
        expect(dialog.getByText(label, { exact: false, selector: 'label' })).toHaveTextContent(/\*$/)
      }
      expect(dialog.getByText('DQTV', { exact: false, selector: 'label' })).toHaveTextContent(/^DQTV\s*\*$/)
      expect(dialog.getByText('Ngày hết hạn', { exact: false, selector: 'label' })).not.toHaveTextContent('*')
      expect(dialog.getByLabelText(/Lý do/)).toBeRequired()
      expect(dialog.getByLabelText(/Căn cứ pháp lý/)).toBeRequired()
      expect(dialog.getByLabelText(/Ngày hiệu lực/)).toBeRequired()
    })

    it('posts only the fields the API accepts, with the chosen militia id', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: record('ex-new') })
      renderPage()

      await openCreateForm(user)
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01', expiry: '2027-06-30' })
      await submit(user)

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      const [url, body] = api.post.mock.calls[0] as [string, Record<string, unknown>]
      expect(url).toBe('/exemptions')
      expect(body).toStrictEqual({
        militiaId: MILITIA_ID,
        type: 'deferral',
        reason: 'Học đại học',
        legalBasis: 'Điều 12 Luật DQTV 2019',
        effectiveDate: '2026-09-01',
        expiryDate: '2027-06-30',
      })
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã tạo quyết định miễn/hoãn'))
    })

    it('closes and refreshes the list after saving', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: record('ex-new') })
      renderPage()
      await screen.findByTestId('exemption-rec-1')
      const before = exemptionListCalls()

      await openCreateForm(user)
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01' })
      await submit(user)

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(exemptionListCalls()).toBeGreaterThan(before))
    })

    it('leaves out an empty expiry date', async () => {
      const user = userEvent.setup()
      api.post.mockResolvedValueOnce({ data: record('ex-new') })
      renderPage()

      await openCreateForm(user)
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01' })
      await submit(user)

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      const body = api.post.mock.calls[0][1] as Record<string, unknown>
      expect(Object.keys(body)).not.toContain('expiryDate')
    })

    it('shows missing required fields inline, next to each field', async () => {
      const user = userEvent.setup()
      renderPage()

      const dialog = within(await openCreateForm(user))
      await submit(user)

      expect(dialog.getByTestId('smart-select-exemption-militia-error')).toHaveTextContent('Vui lòng chọn DQTV')
      expect(dialog.getByTestId('exemption-reason-error')).toHaveTextContent('Vui lòng nhập lý do')
      expect(dialog.getByTestId('exemption-legal-basis-error')).toHaveTextContent('Vui lòng nhập căn cứ pháp lý')
      expect(dialog.getByTestId('exemption-effective-date-error')).toHaveTextContent('Vui lòng chọn ngày hiệu lực')
      expect(dialog.getByLabelText(/Lý do/)).toHaveAttribute('aria-invalid', 'true')
      expect(dialog.getByLabelText(/Lý do/)).toHaveAttribute('aria-describedby', 'exemption-reason-error')
      expect(api.post).not.toHaveBeenCalled()
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('rejects an expiry date before the effective date next to the expiry field', async () => {
      const user = userEvent.setup()
      renderPage()

      const dialog = within(await openCreateForm(user))
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01', expiry: '2026-08-31' })
      await submit(user)

      expect(dialog.getByTestId('exemption-expiry-date-error')).toHaveTextContent('Ngày hết hạn phải bằng hoặc sau ngày hiệu lực')
      expect(api.post).not.toHaveBeenCalled()
    })

    // Web/backend/src/exemption/exemption.service.ts create
    it.each([
      [400, 'militia_not_found', 'smart-select-exemption-militia-error', 'Không tìm thấy DQTV đã chọn'],
      [403, 'unit_scope_violation', 'smart-select-exemption-militia-error', 'DQTV không thuộc đơn vị bạn quản lý'],
      [400, 'expiry_before_effective', 'exemption-expiry-date-error', 'Ngày hết hạn phải bằng hoặc sau ngày hiệu lực'],
      [409, 'overlapping_active_exemption', 'exemption-effective-date-error', 'DQTV đã có quyết định còn hiệu lực trùng thời gian này'],
    ])('shows the server error %i %s next to its field', async (status, code, testId, message) => {
      const user = userEvent.setup()
      api.post.mockRejectedValueOnce(httpError(status, code))
      renderPage()

      const dialog = await openCreateForm(user)
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01' })
      await submit(user)

      expect(await within(dialog).findByTestId(testId)).toHaveTextContent(message)
      expect(screen.getByRole('dialog', { name: 'Tạo quyết định miễn/hoãn' })).toBeInTheDocument()
    })

    it('shows validation messages next to their fields and the rest in the form message', async () => {
      const user = userEvent.setup()
      api.post.mockRejectedValueOnce({
        isAxiosError: true,
        request: {},
        response: {
          status: 400,
          data: {
            code: 'E001',
            message: 'validation_failed',
            errors: [
              'legalBasis must be shorter than or equal to 500 characters',
              'effectiveDate must be a YYYY-MM-DD date',
              'documents must be an array',
            ],
            statusCode: 400,
          },
        },
      })
      renderPage()

      const dialog = await openCreateForm(user)
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01' })
      await submit(user)

      expect(await within(dialog).findByTestId('exemption-legal-basis-error')).toHaveTextContent(
        'legalBasis must be shorter than or equal to 500 characters',
      )
      expect(within(dialog).getByTestId('exemption-effective-date-error')).toHaveTextContent('effectiveDate must be a YYYY-MM-DD date')
      const formError = within(dialog).getByTestId('exemption-form-error')
      expect(formError).toHaveTextContent('documents must be an array')
      expect(formError).not.toHaveTextContent('effectiveDate must be')
    })

    it.each([
      [403, 'insufficient_role', 'Bạn không có quyền thực hiện thao tác này'],
      [403, 'no_unit_scope', 'Tài khoản của bạn chưa được gán đơn vị quản lý'],
      [500, 'Internal server error', 'Không thể tạo quyết định'],
    ])('shows a server error %i %s that concerns no single field in the form', async (status, code, message) => {
      const user = userEvent.setup()
      api.post.mockRejectedValueOnce(httpError(status, code))
      renderPage()

      const dialog = await openCreateForm(user)
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01' })
      await submit(user)

      const formError = await within(dialog).findByTestId('exemption-form-error')
      expect(formError).toHaveTextContent(message)
      expect(formError).toHaveAttribute('role', 'alert')
    })

    it('cannot be cancelled or closed while saving', async () => {
      const user = userEvent.setup()
      api.post.mockReturnValueOnce(new Promise(() => {}))
      renderPage()

      const dialog = await openCreateForm(user)
      await chooseMilitia(user)
      await fillDecision(user, { effective: '2026-09-01' })
      await submit(user)

      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeDisabled())
      expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeDisabled()
      expect(screen.getByTestId('exemption-submit')).toBeDisabled()
      await user.keyboard('{Escape}')
      expect(screen.getByRole('dialog', { name: 'Tạo quyết định miễn/hoãn' })).toBeInTheDocument()
    })
  })

  describe('revoke decision', () => {
    it('is offered on active decisions to decision makers only', async () => {
      renderPage()

      expect(await revokeButton('rec-1')).toBeInTheDocument()
      expect(
        within(screen.getByTestId('exemption-rec-3')).queryByRole('button', { name: /Thu hồi/ }),
      ).not.toBeInTheDocument()
    })

    it('is hidden from read-only roles', async () => {
      signInAs('ubnd_leader')
      renderPage()
      await screen.findByTestId('exemption-rec-1')

      expect(screen.queryAllByRole('button', { name: /Thu hồi/ })).toHaveLength(0)
      expect(screen.queryByTestId('create-exemption-btn')).not.toBeInTheDocument()
    })

    it("names the member in each button's accessible name", async () => {
      renderPage()
      await screen.findByTestId('exemption-rec-1')

      expect(
        within(screen.getByTestId('exemption-rec-1')).getByRole('button', { name: 'Thu hồi quyết định hoãn của Trần Văn Bình (DQ-001)' }),
      ).toBeInTheDocument()
      expect(
        within(screen.getByTestId('exemption-rec-2')).getByRole('button', { name: 'Thu hồi quyết định miễn của Lê Thị Cúc (DQ-002)' }),
      ).toBeInTheDocument()
    })

    it('gives row actions a 44px touch target and a visible focus ring', async () => {
      renderPage()
      const button = await revokeButton('rec-1')
      expect(button.className).toMatch(/min-h-11/)
      expect(button.className).toMatch(/min-w-11/)
      expect(button.className).toMatch(/focus-visible:ring-2/)
    })

    it('asks for confirmation in an accessible in-app dialog, not window.confirm', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm')
      renderPage()

      await user.click(await revokeButton('rec-1'))

      const dialog = await screen.findByRole('alertdialog', { name: 'Thu hồi quyết định?' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAccessibleDescription(/Trần Văn Bình \(DQ-001\)/)
      await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus())
      expect(confirmSpy).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('revokes after confirmation', async () => {
      const user = userEvent.setup()
      api.patch.mockResolvedValueOnce({ data: record('rec-1', { status: 'revoked' }) })
      renderPage()

      await user.click(await revokeButton('rec-1'))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Thu hồi' }))

      await waitFor(() =>
        expect(api.patch).toHaveBeenCalledWith('/exemptions/rec-1/review', { status: 'revoked' }),
      )
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã thu hồi quyết định'))
    })

    it('does nothing on Escape and returns focus to the row button', async () => {
      const user = userEvent.setup()
      renderPage()
      const button = await revokeButton('rec-1')

      await user.click(button)
      await screen.findByRole('alertdialog')
      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      expect(api.patch).not.toHaveBeenCalled()
      await waitFor(() => expect(button).toHaveFocus())
    })

    it('shows a pending state only on the row being revoked', async () => {
      const user = userEvent.setup()
      api.patch.mockReturnValueOnce(new Promise(() => {}))
      renderPage()

      await user.click(await revokeButton('rec-1'))
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Thu hồi' }))

      const pending = await revokeButton('rec-1')
      await waitFor(() => expect(pending).toHaveAttribute('aria-disabled', 'true'))
      expect(pending).toHaveTextContent('Đang thu hồi…')
      const other = await revokeButton('rec-2')
      expect(other).not.toHaveAttribute('aria-disabled', 'true')
      expect(other).toHaveTextContent('Thu hồi')
    })

    it.each([
      [403, 'Forbidden resource', 'Bạn không có quyền thực hiện thao tác này'],
      [400, 'Bad Request', 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.'],
      [500, 'Internal server error', 'Không thể thu hồi quyết định'],
    ])('explains a failed revoke answered %i %s without a known code', async (status, message, text) => {
      const user = userEvent.setup()
      api.patch.mockRejectedValueOnce(httpError(status, message))
      renderPage()

      await user.click(await revokeButton('rec-1'))
      const dialog = await screen.findByRole('alertdialog')
      expect(dialog).toHaveAccessibleDescription(
        'Quyết định hoãn của Trần Văn Bình (DQ-001) sẽ chuyển sang trạng thái "Đã thu hồi" và không thể kích hoạt lại.',
      )
      await user.click(within(dialog).getByRole('button', { name: 'Thu hồi' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(text))
    })

    it('explains a decision that is no longer active and refreshes the list', async () => {
      const user = userEvent.setup()
      api.patch.mockRejectedValueOnce(httpError(409, 'invalid_status_transition'))
      renderPage()
      const button = await revokeButton('rec-1')
      const before = exemptionListCalls()

      await user.click(button)
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Thu hồi' }))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Quyết định đã hết hiệu lực hoặc đã bị thu hồi'),
      )
      await waitFor(() => expect(exemptionListCalls()).toBeGreaterThan(before))
    })
  })
})

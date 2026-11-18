import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActivityLogPage } from './ActivityLogPage'

const api = vi.hoisted(() => ({ get: vi.fn() }))
const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
const session = vi.hoisted(() => ({ user: { role: 'system_admin', roles: ['system_admin'] } as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))
// The browser download is skipped; the export request itself still runs
vi.mock('@/utils/export-utils', () => ({
  downloadExcelReport: vi.fn(async (fetchFn: () => Promise<Blob>, _name: string, onStart: () => void, onEnd: () => void) => {
    onStart()
    try {
      await fetchFn()
    } finally {
      onEnd()
    }
  }),
}))

// Rows of GET /audit (Web/backend/src/audit/audit.controller.ts)
const mockLogs = {
  data: [
    {
      id: 'log-1', actorId: 'u1', actorName: 'Nguyễn Văn A',
      action: 'POST:auth', entityType: 'auth', entityId: null,
      beforeJson: null, afterJson: null, ipAddress: '192.168.1.1', createdAt: '2026-04-19T08:00:00Z',
    },
    {
      id: 'log-2', actorId: null, actorName: null,
      action: 'PATCH:militia', entityType: 'militia', entityId: '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01',
      beforeJson: { phone: '0901' }, afterJson: { phone: '0902' }, ipAddress: null, createdAt: '2026-04-19T08:05:00Z',
    },
  ],
  total: 2, page: 1, limit: 20,
}

const blobError = (message: string) => ({
  isAxiosError: true,
  request: {},
  response: {
    status: 400,
    data: new Blob([JSON.stringify({ code: 'E001', message, statusCode: 400 })], { type: 'application/json' }),
  },
})

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ActivityLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.user = { role: 'system_admin', roles: ['system_admin'] }
    api.get.mockImplementation((url: string) => {
      if (url === '/audit/export') return Promise.resolve({ data: new Blob(['xlsx']) })
      return Promise.resolve({ data: mockLogs })
    })
  })

  it('renders heading', () => {
    wrap(<ActivityLogPage />)
    expect(screen.getByTestId('activity-log-page')).toBeInTheDocument()
    expect(screen.getByText('Nhật Ký Hoạt Động')).toBeInTheDocument()
  })

  it('lists entries from GET /audit using the backend field names', async () => {
    wrap(<ActivityLogPage />)

    const first = within(await screen.findByTestId('audit-row-log-1'))
    expect(first.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(first.getByText('POST:auth')).toBeInTheDocument()
    expect(first.getByText('auth')).toBeInTheDocument()
    expect(first.getByText('192.168.1.1')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/audit', { params: { page: 1, limit: 20 } })
  })

  it('shows a system entry without an actor and summarises the change', async () => {
    wrap(<ActivityLogPage />)

    const row = within(await screen.findByTestId('audit-row-log-2'))
    expect(row.getByText('Hệ thống')).toBeInTheDocument()
    expect(row.getByText('phone: 0901 → 0902')).toBeInTheDocument()
  })

  it('renders pagination info after load', async () => {
    wrap(<ActivityLogPage />)
    await waitFor(() => {
      expect(screen.getByText(/bản ghi/i)).toBeInTheDocument()
    })
  })

  it('states the total number of entries', async () => {
    wrap(<ActivityLogPage />)
    await screen.findByTestId('audit-row-log-1')
    expect(screen.getByText(/bản ghi/).closest('p')).toHaveTextContent('Tổng 2 bản ghi')
  })

  it('shows an empty state when there is no entry', async () => {
    api.get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
    wrap(<ActivityLogPage />)
    expect(await screen.findByText('Chưa có nhật ký')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'IP' })).toBeInTheDocument()
  })

  it('sends the search box text as the search query, from page 1', async () => {
    const user = userEvent.setup()
    wrap(<ActivityLogPage />)
    await screen.findByTestId('audit-row-log-1')

    await user.type(screen.getByTestId('audit-search'), 'nguyen')

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/audit', { params: { page: 1, limit: 20, search: 'nguyen' } }),
    )
  })

  it('pages with the page query', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue({ data: { ...mockLogs, total: 45 } })
    wrap(<ActivityLogPage />)
    await screen.findByTestId('audit-row-log-1')

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit', { params: { page: 2, limit: 20 } }))
  })

  it('shows an error state when the log cannot be loaded', async () => {
    api.get.mockRejectedValue({ response: { status: 500, data: { message: 'Internal server error' } } })
    wrap(<ActivityLogPage />)
    expect(await screen.findByText(/Không thể tải nhật ký/)).toBeInTheDocument()
  })

  describe('export (system_admin)', () => {
    async function exportRange(from: string, to: string) {
      wrap(<ActivityLogPage />)
      fireEvent.change(screen.getByTestId('export-from'), { target: { value: from } })
      fireEvent.change(screen.getByTestId('export-to'), { target: { value: to } })
      fireEvent.click(screen.getByTestId('export-audit-btn'))
    }

    it('requests GET /audit/export with from/to as a blob', async () => {
      await exportRange('2026-08-01', '2026-09-14')

      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith('/audit/export', {
          params: { from: '2026-08-01', to: '2026-09-14' },
          responseType: 'blob',
        }),
      )
    })

    it.each([
      ['date_range_exceeds_90_days', 'Khoảng thời gian xuất tối đa là 90 ngày. Vui lòng chọn lại.'],
      ['from_must_be_before_to', 'Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.'],
      ['invalid_date', 'Ngày không hợp lệ. Vui lòng chọn lại.'],
    ])('explains the export error %s', async (code, message) => {
      api.get.mockImplementation((url: string) =>
        url === '/audit/export' ? Promise.reject(blobError(code)) : Promise.resolve({ data: mockLogs }),
      )

      await exportRange('2026-01-01', '2026-09-14')

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    })

    it('asks for a date range before exporting', async () => {
      wrap(<ActivityLogPage />)
      fireEvent.click(screen.getByTestId('export-audit-btn'))

      expect(toast.error).toHaveBeenCalledWith('Vui lòng chọn khoảng thời gian trước khi xuất')
      expect(toast.warning).not.toHaveBeenCalled()
      expect(api.get).not.toHaveBeenCalledWith('/audit/export', expect.anything())
    })

    it('warns that the export holds sensitive data', async () => {
      await exportRange('2026-08-01', '2026-09-14')
      expect(toast.warning).toHaveBeenCalledWith('Nhật ký kiểm toán chứa thông tin nhạy cảm. Chỉ xuất khi có yêu cầu chính thức.')
      await waitFor(() => expect(screen.getByTestId('export-audit-btn')).toHaveTextContent('Xuất nhật ký'))
    })

    it('falls back to a generic text for an export error it does not know', async () => {
      api.get.mockImplementation((url: string) =>
        url === '/audit/export' ? Promise.reject(blobError('something_else')) : Promise.resolve({ data: mockLogs }),
      )

      await exportRange('2026-08-01', '2026-09-14')

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Xuất nhật ký thất bại.'))
    })

    it('is offered to system_admin only (GET /audit/export @Roles)', async () => {
      session.user = { role: 'police_ward', roles: ['police_ward'] }
      wrap(<ActivityLogPage />)
      await screen.findByTestId('audit-row-log-1')
      expect(screen.queryByTestId('export-audit-btn')).not.toBeInTheDocument()
    })

    it('is offered to a user holding system_admin as a secondary role', async () => {
      session.user = { role: 'police_ward', roles: ['police_ward', 'system_admin'] }
      wrap(<ActivityLogPage />)
      expect(screen.getByTestId('export-audit-btn')).toBeInTheDocument()
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationsPage } from './NotificationsPage'

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

// One row of GET /notifications (Web/backend/src/notifications/notifications.controller.ts)
function notification(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    type: 'task_assigned',
    title: `Thông báo ${id}`,
    body: `Nội dung ${id}`,
    entityType: 'task',
    entityId: '3f0c3b8e-8a55-4d7b-9a0e-1d7c2b6f0a11',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...patch,
  }
}

type Params = { page?: number; limit?: number; read?: boolean }

const server = {
  unreadTotal: 1,
  total: 2,
  rows: [] as ReturnType<typeof notification>[],
  failList: false,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const listCalls = () =>
  api.get.mock.calls
    .map(([, config]) => (config as { params: Params }).params)
    .filter((params) => params.limit !== 1)

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.unreadTotal = 1
    server.total = 2
    server.failList = false
    server.rows = [
      notification('n1'),
      notification('n2', { isRead: true, readAt: new Date().toISOString(), body: null }),
    ]
    api.get.mockImplementation((url: string, config: { params: Params }) => {
      if (url !== '/notifications') return Promise.reject(new Error(`unexpected GET ${url}`))
      const { page = 1, limit = 20, read } = config.params
      // Unread counter: read=false&limit=1 — only `total` matters
      if (read === false && limit === 1) {
        return Promise.resolve({ data: { data: [], total: server.unreadTotal, page: 1, limit: 1 } })
      }
      if (server.failList) return Promise.reject({ response: { status: 500, data: { message: 'Internal server error' } } })
      return Promise.resolve({ data: { data: server.rows, total: server.total, page, limit } })
    })
    api.patch.mockResolvedValue({ data: { ok: true } })
    api.post.mockResolvedValue({ data: { updated: 1 } })
    api.delete.mockResolvedValue({ data: { ok: true } })
  })

  it('renders heading', () => {
    wrap(<NotificationsPage />)
    expect(screen.getByRole('heading', { name: /Thông báo/ })).toBeInTheDocument()
  })

  it('renders filter tabs', () => {
    wrap(<NotificationsPage />)
    expect(screen.getByTestId('notif-filter-all')).toBeInTheDocument()
    expect(screen.getByTestId('notif-filter-unread')).toBeInTheDocument()
    expect(screen.getByTestId('notif-filter-read')).toBeInTheDocument()
  })

  it('lists the rows of the paginated { data, total, page, limit } response', async () => {
    wrap(<NotificationsPage />)

    expect(await screen.findByTestId('notification-n1')).toHaveTextContent('Thông báo n1')
    expect(screen.getByTestId('notification-n2')).toHaveTextContent('Thông báo n2')
    expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 20 } })
  })

  it('shows read state from isRead and skips an empty body', async () => {
    wrap(<NotificationsPage />)

    const unread = await screen.findByTestId('notification-n1')
    const read = screen.getByTestId('notification-n2')
    expect(within(unread).getByText('Chưa đọc')).toBeInTheDocument()
    expect(within(unread).getByText('Nội dung n1')).toBeInTheDocument()
    expect(within(read).queryByText('Chưa đọc')).not.toBeInTheDocument()
    expect(read).not.toHaveTextContent('null')
  })

  it('shows the unread total reported by the server, not only the current page', async () => {
    server.unreadTotal = 7
    wrap(<NotificationsPage />)

    await waitFor(() => expect(screen.getByTestId('unread-count')).toHaveTextContent('7'))
    expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 1, read: false } })
  })

  it('asks for unread notifications with read=false', async () => {
    const user = userEvent.setup()
    wrap(<NotificationsPage />)
    await screen.findByTestId('notification-n1')

    await user.click(screen.getByTestId('notif-filter-unread'))

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 20, read: false } }),
    )
  })

  it('asks for read notifications with read=true', async () => {
    const user = userEvent.setup()
    wrap(<NotificationsPage />)
    await screen.findByTestId('notification-n1')

    await user.click(screen.getByTestId('notif-filter-read'))

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 20, read: true } }),
    )
  })

  it('marks an unread notification read with PATCH /notifications/:id/read and refreshes', async () => {
    const user = userEvent.setup()
    wrap(<NotificationsPage />)
    const row = await screen.findByTestId('notification-n1')
    const before = listCalls().length

    await user.click(row)

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/notifications/n1/read'))
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before))
  })

  it('does not mark a notification that is already read', async () => {
    const user = userEvent.setup()
    wrap(<NotificationsPage />)

    await user.click(await screen.findByTestId('notification-n2'))

    expect(api.patch).not.toHaveBeenCalled()
  })

  it('marks everything read with POST /notifications/read-all', async () => {
    const user = userEvent.setup()
    wrap(<NotificationsPage />)

    await user.click(await screen.findByTestId('mark-all-read-btn'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notifications/read-all'))
    expect(api.patch).not.toHaveBeenCalled()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã đánh dấu tất cả là đã đọc'))
  })

  it('hides mark-all-read when nothing is unread', async () => {
    server.unreadTotal = 0
    wrap(<NotificationsPage />)

    await screen.findByTestId('notification-n1')
    expect(screen.queryByTestId('mark-all-read-btn')).not.toBeInTheDocument()
  })

  describe('dismiss (DELETE /notifications/:id)', () => {
    it('removes a notification and refreshes the list and counter', async () => {
      const user = userEvent.setup()
      wrap(<NotificationsPage />)
      await screen.findByTestId('notification-n2')
      const before = listCalls().length

      await user.click(screen.getByRole('button', { name: 'Xóa thông báo "Thông báo n2"' }))

      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/notifications/n2'))
      await waitFor(() => expect(listCalls().length).toBeGreaterThan(before))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã xóa thông báo'))
    })

    it('does not mark an unread notification read on the way', async () => {
      const user = userEvent.setup()
      wrap(<NotificationsPage />)

      await user.click(await screen.findByRole('button', { name: 'Xóa thông báo "Thông báo n1"' }))

      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/notifications/n1'))
      expect(api.patch).not.toHaveBeenCalled()
    })

    it('explains a notification that no longer exists', async () => {
      const user = userEvent.setup()
      api.delete.mockRejectedValueOnce({ response: { status: 404, data: { message: 'notification_not_found' } } })
      wrap(<NotificationsPage />)

      await user.click(await screen.findByRole('button', { name: 'Xóa thông báo "Thông báo n1"' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Thông báo không còn tồn tại'))
    })
  })

  it('pages through the list with page and limit', async () => {
    const user = userEvent.setup()
    server.total = 45
    wrap(<NotificationsPage />)

    expect(await screen.findByText('Trang 1/3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 2, limit: 20 } }),
    )
    expect(await screen.findByText('Trang 2/3')).toBeInTheDocument()
  })

  it('shows an error state with a retry when the list cannot be loaded', async () => {
    const user = userEvent.setup()
    server.failList = true
    wrap(<NotificationsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải thông báo')
    const before = listCalls().length

    server.failList = false
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))

    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before))
    expect(await screen.findByTestId('notification-n1')).toBeInTheDocument()
  })

  it('explains a failed mark-as-read', async () => {
    const user = userEvent.setup()
    api.patch.mockRejectedValueOnce({ response: { status: 404, data: { message: 'notification_not_found' } } })
    wrap(<NotificationsPage />)

    await user.click(await screen.findByTestId('notification-n1'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Thông báo không còn tồn tại'))
  })

  it('shows empty state when no notifications', async () => {
    server.rows = []
    server.total = 0
    server.unreadTotal = 0
    wrap(<NotificationsPage />)
    expect(await screen.findByText('Không có thông báo')).toBeInTheDocument()
  })

  it('says there are no notifications yet, or that everything is read on the unread tab', async () => {
    const user = userEvent.setup()
    server.rows = []
    server.total = 0
    server.unreadTotal = 0
    wrap(<NotificationsPage />)

    expect(await screen.findByText('Chưa có thông báo nào')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Chưa đọc' }))

    expect(await screen.findByText('Bạn đã đọc tất cả thông báo')).toBeInTheDocument()
  })

  it('shows the header texts, the filter tab names and the unread badge label', async () => {
    server.unreadTotal = 3
    wrap(<NotificationsPage />)

    expect(screen.getByText('UBND Phường Phú Định – ANTT')).toBeInTheDocument()
    expect(screen.getByTestId('notif-filter-all')).toHaveTextContent('Tất cả')
    expect(screen.getByTestId('notif-filter-unread')).toHaveTextContent('Chưa đọc')
    expect(screen.getByTestId('notif-filter-read')).toHaveTextContent('Đã đọc')
    await waitFor(() => expect(screen.getByTestId('unread-count')).toHaveAttribute('aria-label', '3 chưa đọc'))
    expect(screen.getByTestId('mark-all-read-btn')).toHaveTextContent('Đánh dấu tất cả đã đọc')
    expect(await screen.findByRole('button', { name: 'Xóa thông báo "Thông báo n1"' })).toHaveAttribute('title', 'Xóa thông báo')
  })

  it('shows how long ago each notification arrived', async () => {
    const now = Date.now()
    const ago = (ms: number) => new Date(now - ms).toISOString()
    const minute = 60_000
    server.rows = [
      notification('t1', { title: 'Mới', createdAt: ago(10_000) }),
      notification('t2', { title: 'Vài phút', createdAt: ago(5 * minute) }),
      notification('t3', { title: 'Vài giờ', createdAt: ago(3 * 60 * minute) }),
      notification('t4', { title: 'Vài ngày', createdAt: ago(2 * 24 * 60 * minute) }),
      notification('t5', { title: 'Cũ', createdAt: new Date(2026, 0, 5, 10, 0).toISOString() }),
      notification('t6', { title: 'Không rõ', createdAt: 'không-phải-ngày' }),
    ]
    server.total = 6
    wrap(<NotificationsPage />)

    expect(await screen.findByTestId('notification-t1')).toHaveTextContent('Vừa xong')
    expect(screen.getByTestId('notification-t2')).toHaveTextContent('5 phút trước')
    expect(screen.getByTestId('notification-t3')).toHaveTextContent('3 giờ trước')
    expect(screen.getByTestId('notification-t4')).toHaveTextContent('2 ngày trước')
    expect(screen.getByTestId('notification-t5')).toHaveTextContent('05/01/2026')
    expect(screen.getByTestId('notification-t6')).toHaveTextContent('không-phải-ngày')
  })

  it('shows the total number of notifications next to the pages', async () => {
    server.total = 45
    wrap(<NotificationsPage />)

    expect(await screen.findByTestId('notifications-total')).toHaveTextContent('Tổng 45 thông báo')
    expect(screen.getByRole('navigation', { name: 'Phân trang thông báo' })).toBeInTheDocument()
  })

  it('explains a failed mark-all-read', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } })
    wrap(<NotificationsPage />)

    await user.click(await screen.findByTestId('mark-all-read-btn'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể cập nhật'))
  })

  it('falls back to a generic text when marking read fails for another reason', async () => {
    const user = userEvent.setup()
    api.patch.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } })
    wrap(<NotificationsPage />)

    await user.click(await screen.findByTestId('notification-n1'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể đánh dấu đã đọc'))
  })

  it('falls back to a generic text when a dismissal fails for another reason', async () => {
    const user = userEvent.setup()
    api.delete.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } })
    wrap(<NotificationsPage />)

    await user.click(await screen.findByRole('button', { name: 'Xóa thông báo "Thông báo n1"' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể xóa thông báo'))
  })
})

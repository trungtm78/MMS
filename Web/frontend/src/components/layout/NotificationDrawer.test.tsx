import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { NotificationDrawer } from './NotificationDrawer'
import { notificationKeys } from '@/api/notifications'

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

type Params = { page?: number; limit?: number; read?: boolean }

const rows = [
  {
    id: 'n1',
    type: 'sos',
    title: 'Báo động SOS',
    body: 'KP1 cần hỗ trợ',
    entityType: 'sos',
    entityId: null,
    isRead: false,
    readAt: null,
    createdAt: '2026-09-14T08:00:00.000Z',
  },
  {
    id: 'n2',
    type: 'task_assigned',
    title: 'Nhiệm vụ mới',
    body: null,
    entityType: 'task',
    entityId: null,
    isRead: true,
    readAt: '2026-09-14T09:00:00.000Z',
    createdAt: '2026-09-14T07:00:00.000Z',
  },
]

function renderDrawer(
  isOpen = true,
  onClose = vi.fn(),
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
) {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <QueryClientProvider client={client}>
        <NotificationDrawer isOpen={isOpen} onClose={onClose} />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return onClose
}

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

describe('NotificationDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url: string, config: { params: Params }) => {
      if (url !== '/notifications') return Promise.reject(new Error(`unexpected GET ${url}`))
      const { page = 1, limit = 20, read } = config.params
      if (read === false && limit === 1) {
        return Promise.resolve({ data: { data: [], total: 5, page: 1, limit: 1 } })
      }
      return Promise.resolve({ data: { data: rows, total: 12, page, limit } })
    })
    api.patch.mockResolvedValue({ data: { ok: true } })
    api.post.mockResolvedValue({ data: { updated: 5 } })
    api.delete.mockResolvedValue({ data: { ok: true } })
  })

  it('renders and fetches nothing while closed', () => {
    renderDrawer(false)
    expect(screen.queryByText('Báo động SOS')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('lists the latest notifications from the paginated response', async () => {
    renderDrawer()

    expect(await screen.findByText('Báo động SOS')).toBeInTheDocument()
    expect(screen.getByText('Nhiệm vụ mới')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, limit: 10 } })
  })

  // The bell polls the unread count; a list cached from an earlier opening must not contradict it
  it('reloads the list and the unread count whenever it opens', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(notificationKeys.list({ page: 1, limit: 10 }), {
      data: [{ ...rows[1], id: 'old', title: 'Thông báo cũ' }],
      total: 1,
      page: 1,
      limit: 10,
    })
    client.setQueryData(notificationKeys.unreadCount, 1)

    renderDrawer(true, vi.fn(), client)

    expect(await screen.findByText('Báo động SOS')).toBeInTheDocument()
    expect(screen.queryByText('Thông báo cũ')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('drawer-unread-count')).toHaveTextContent('5'))
  })

  it('shows the unread total reported by the server', async () => {
    renderDrawer()
    await waitFor(() => expect(screen.getByTestId('drawer-unread-count')).toHaveTextContent('5'))
  })

  it('marks everything read with POST /notifications/read-all (not PATCH)', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: 'Đọc tất cả' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notifications/read-all'))
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('marks an unread notification read with PATCH /notifications/:id/read when it is opened', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: /^Báo động SOS/ }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/notifications/n1/read'))
  })

  it('dismisses a notification with DELETE /notifications/:id', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: 'Xóa thông báo "Nhiệm vụ mới"' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/notifications/n2'))
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('shows an error state when notifications cannot be loaded', async () => {
    api.get.mockRejectedValue({ response: { status: 500, data: { message: 'Internal server error' } } })
    renderDrawer()

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải thông báo')
  })

  it('loads the list again from the retry of the error state', async () => {
    const user = userEvent.setup()
    const listFails = { current: true }
    const answer = api.get.getMockImplementation()!
    api.get.mockImplementation((url: string, config: { params: Params }) => {
      if (listFails.current && config.params.limit === 10) {
        return Promise.reject({ response: { status: 500, data: { message: 'Internal server error' } } })
      }
      return answer(url, config)
    })
    renderDrawer()
    const alert = await screen.findByRole('alert')

    listFails.current = false
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByText('Báo động SOS')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says so when there are no notifications', async () => {
    api.get.mockImplementation((_url: string, config: { params: Params }) =>
      Promise.resolve({ data: { data: [], total: 0, page: 1, limit: config.params.limit } }),
    )
    renderDrawer()

    expect(await screen.findByText('Bạn không có thông báo nào')).toBeInTheDocument()
    expect(screen.queryByTestId('drawer-unread-count')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đọc tất cả' })).not.toBeInTheDocument()
  })

  it('names the drawer, the unread badge and the unread items for screen readers', async () => {
    renderDrawer()

    expect(screen.getByRole('complementary', { name: 'Thông báo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thông báo' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('drawer-unread-count')).toHaveAttribute('aria-label', '5 chưa đọc'))
    const unread = await screen.findByRole('button', { name: /^Báo động SOS/ })
    expect(unread).toHaveTextContent('(chưa đọc)')
    expect(screen.getByRole('button', { name: 'Xóa thông báo "Báo động SOS"' })).toHaveAttribute('title', 'Xóa thông báo')
  })

  it('confirms marking everything read', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: 'Đọc tất cả' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã đánh dấu tất cả đã đọc'))
  })

  it('explains a failed mark-all-read', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } })
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: 'Đọc tất cả' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể cập nhật'))
  })

  it('explains a notification that no longer exists when it is opened', async () => {
    const user = userEvent.setup()
    api.patch.mockRejectedValueOnce({ response: { status: 404, data: { message: 'notification_not_found' } } })
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: /^Báo động SOS/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Thông báo không còn tồn tại'))
  })

  it('falls back to a generic text when marking read fails for another reason', async () => {
    const user = userEvent.setup()
    api.patch.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } })
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: /^Báo động SOS/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể đánh dấu đã đọc'))
  })

  it('falls back to a generic text when a dismissal fails', async () => {
    const user = userEvent.setup()
    api.delete.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Internal server error' } } })
    renderDrawer()

    await user.click(await screen.findByRole('button', { name: 'Xóa thông báo "Nhiệm vụ mới"' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể xóa thông báo'))
  })

  it('opens the notification page and closes', async () => {
    const user = userEvent.setup()
    const onClose = renderDrawer()

    await user.click(screen.getByRole('button', { name: 'Xem tất cả thông báo' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/notifications')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click outside', async () => {
    const user = userEvent.setup()
    const onClose = renderDrawer()

    await user.click(screen.getByTestId('notification-drawer-backdrop'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

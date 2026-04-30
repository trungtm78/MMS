import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationsPage } from './NotificationsPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockNotifs = [
  { id: 'n1', title: 'Nhiệm vụ mới được giao', body: 'Bạn có nhiệm vụ mới', read: false, createdAt: new Date().toISOString() },
  { id: 'n2', title: 'Thông báo hệ thống', body: '', read: true, createdAt: new Date(Date.now() - 3600000).toISOString() },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockNotifs })
    vi.mocked(apiClient.default.patch).mockResolvedValue({ data: {} })
    vi.mocked(apiClient.default.post).mockResolvedValue({ data: {} })
  })

  it('renders heading', () => {
    wrap(<NotificationsPage />)
    expect(screen.getByText('Thông báo')).toBeInTheDocument()
  })

  it('renders filter tabs', () => {
    wrap(<NotificationsPage />)
    expect(screen.getByTestId('notif-filter-all')).toBeInTheDocument()
    expect(screen.getByTestId('notif-filter-unread')).toBeInTheDocument()
    expect(screen.getByTestId('notif-filter-read')).toBeInTheDocument()
  })

  it('shows notifications after load', async () => {
    wrap(<NotificationsPage />)
    await waitFor(() => expect(screen.getByTestId('notification-n1')).toBeInTheDocument())
    expect(screen.getByTestId('notification-n2')).toBeInTheDocument()
  })

  it('shows unread count badge', async () => {
    wrap(<NotificationsPage />)
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
  })

  it('shows mark-all-read button when unread exist', async () => {
    wrap(<NotificationsPage />)
    await waitFor(() => expect(screen.getByTestId('mark-all-read-btn')).toBeInTheDocument())
  })

  it('calls PATCH when clicking unread notification', async () => {
    wrap(<NotificationsPage />)
    await waitFor(() => expect(screen.getByTestId('notification-n1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('notification-n1'))
    await waitFor(() =>
      expect(vi.mocked(apiClient.default.patch)).toHaveBeenCalledWith('/notifications/n1/read'),
    )
  })

  it('shows empty state when no notifications', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: [] })
    wrap(<NotificationsPage />)
    await waitFor(() => expect(screen.getByText('Không có thông báo')).toBeInTheDocument())
  })
})

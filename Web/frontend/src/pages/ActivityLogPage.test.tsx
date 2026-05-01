import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActivityLogPage } from './ActivityLogPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'system_admin' }, isAuthenticated: true }),
}))
vi.mock('@/utils/export-utils', () => ({
  downloadExcelReport: vi.fn(),
}))

const mockLogs = {
  data: [
    {
      id: 'log-1', userId: 'u1', userFullName: 'Nguyễn Văn A',
      action: 'LOGIN', resourceType: 'auth', resourceId: null,
      details: null, ipAddress: '192.168.1.1', createdAt: '2026-04-19T08:00:00Z',
    },
    {
      id: 'log-2', userId: 'u1', userFullName: 'Nguyễn Văn A',
      action: 'CREATE', resourceType: 'task', resourceId: 'task-1',
      details: 'Created task NV-001', ipAddress: '192.168.1.1', createdAt: '2026-04-19T08:05:00Z',
    },
  ],
  total: 2, page: 1, limit: 20,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ActivityLogPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockLogs })
  })

  it('renders heading', () => {
    wrap(<ActivityLogPage />)
    expect(screen.getByTestId('activity-log-page')).toBeInTheDocument()
    expect(screen.getByText('Nhật Ký Hoạt Động')).toBeInTheDocument()
  })

  it('renders log entries after load', async () => {
    wrap(<ActivityLogPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThan(0)
      expect(screen.getAllByText('LOGIN').length).toBeGreaterThan(0)
    })
  })

  it('renders pagination info after load', async () => {
    wrap(<ActivityLogPage />)
    await waitFor(() => {
      expect(screen.getByText(/bản ghi/i)).toBeInTheDocument()
    })
  })
})

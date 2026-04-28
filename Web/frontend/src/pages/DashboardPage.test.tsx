import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from './DashboardPage'
import * as apiClient from '@/api/client'

const mockNavigate = vi.fn()

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'system_admin', fullName: 'Admin' } }) }))
vi.mock('@/contexts/SocketContext', () => ({ useSocket: () => ({ isConnected: true, activeSosAlerts: [{ id: 'sos-1', militiaName: 'Nguyễn Văn A', createdAt: new Date().toISOString(), status: 'active' }] }) }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageMilitia: true, manageAttendance: true } }) }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockStats = { totalMilitia: 120, activeToday: 85, pendingTasks: 12, pendingApprovals: 3, activeSosAlerts: 0 }

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockStats })
    mockNavigate.mockClear()
  })

  it('renders dashboard container', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
  })

  it('shows totalMilitia stat after load', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('120')).toBeInTheDocument())
  })

  it('shows SOS alert section', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getAllByTestId('sos-alert-section').length).toBeGreaterThan(0))
  })

  it('shows pending tasks count', async () => {
    wrap(<DashboardPage />)
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument())
  })

  // Quick actions navigation — FIX A
  describe('quick actions navigation', () => {
    it('clicking "Giao việc mới" navigates to /tasks/new', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Giao việc mới/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/tasks/new')
    })

    it('clicking "Thêm DQTV" navigates to /recruitment', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Thêm DQTV/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/recruitment')
    })

    it('clicking "Tạo báo cáo" navigates to /reports', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Tạo báo cáo/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/reports')
    })

    it('clicking "Xem GPS" navigates to /gps-tracking', async () => {
      wrap(<DashboardPage />)
      await waitFor(() => expect(screen.getByTestId('dashboard-overview')).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /Xem GPS/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/gps-tracking')
    })
  })
})

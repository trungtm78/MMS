import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskListPage } from './TaskListPage'

vi.mock('@/api/tasks', () => ({
  listTasks: vi.fn().mockResolvedValue({
    data: [
      { id: '1', code: 'NV-001', title: 'Tuần tra khu vực', description: null, type: 'tuần_tra', priority: 'high', status: 'pending', deadline: null, createdAt: '2026-01-01', assigneeId: 'u1', assigneeName: 'Nguyen Van A', militiaId: 'm1', militiaCode: 'DQTV001' },
      { id: '2', code: 'NV-002', title: 'Hỗ trợ người dân', description: null, type: 'hỗ_trợ', priority: 'medium', status: 'completed', deadline: null, createdAt: '2026-01-02', assigneeId: 'u2', assigneeName: 'Tran Van B', militiaId: 'm2', militiaCode: 'DQTV002' },
    ],
    total: 2,
    page: 1,
    limit: 20,
  }),
}))

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('TaskListPage', () => {
  it('renders task table with data', async () => {
    renderWithQuery(<TaskListPage />)
    await waitFor(() => screen.getByText('Tuần tra khu vực'))
    expect(screen.getByText('NV-001')).toBeInTheDocument()
  })

  it('renders status tabs', async () => {
    renderWithQuery(<TaskListPage />)
    expect(screen.getByTestId('status-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('tab-all')).toBeInTheDocument()
    expect(screen.getByTestId('tab-pending')).toBeInTheDocument()
    expect(screen.getByTestId('tab-completed')).toBeInTheDocument()
  })

  it('filters by search term', async () => {
    renderWithQuery(<TaskListPage />)
    await waitFor(() => screen.getByTestId('task-table'))
    const searchInput = screen.getByTestId('task-search-input')
    await userEvent.type(searchInput, 'Tuần tra')
    expect(screen.getByText('Tuần tra khu vực')).toBeInTheDocument()
    expect(screen.queryByText('Hỗ trợ người dân')).not.toBeInTheDocument()
  })

  it('pagination prev is disabled on page 1', async () => {
    renderWithQuery(<TaskListPage />)
    await waitFor(() => screen.getByTestId('prev-page'))
    expect(screen.getByTestId('prev-page')).toBeDisabled()
  })
})

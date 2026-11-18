import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskReportPage } from './TaskReportPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
// Charts expose the points they were given, so the labels the page builds can be checked
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-testid="bar-chart" data-points={JSON.stringify(data)}>{children}</div>
  ),
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
}))

/** GET /tasks/report answer (tasks/task-report.ts TaskReport) */
function taskReport(overrides: Record<string, unknown> = {}) {
  return {
    from: '2025-10-01',
    to: '2026-09-14',
    unitCode: null,
    generatedAt: '2026-09-14T03:00:00.000Z',
    totals: { total: 42, pending: 2, assigned: 4, inProgress: 8, completed: 25, cancelled: 3, overdue: 5, completionRate: 64.1 },
    byStatus: [
      { status: 'pending', count: 2 },
      { status: 'assigned', count: 4 },
      { status: 'in_progress', count: 8 },
      { status: 'completed', count: 25 },
      { status: 'cancelled', count: 3 },
      { status: 'overdue', count: 0 },
    ],
    byType: [{ type: 'patrol', count: 15 }, { type: 'guard', count: 9 }, { type: 'drill', count: 1 }],
    byPriority: [{ priority: 'urgent', count: 6 }, { priority: 'medium', count: 21 }],
    byMonth: [{ month: '2026-08', total: 18, completed: 11, overdue: 2 }, { month: '2026-09', total: 7, completed: 3, overdue: 1 }],
    byUnit: [
      { unitCode: 'KP1', unitName: 'Khu phố 1', total: 30, completed: 20, cancelled: 1, overdue: 3, completionRate: 69 },
      { unitCode: null, unitName: null, total: 12, completed: 5, cancelled: 2, overdue: 2, completionRate: 50 },
    ],
    byAssignee: {
      data: [
        { userId: 'user-1', fullName: 'Nguyễn Văn A', militiaCode: 'DQTV-001', unitCode: 'KP1', total: 14, completed: 10, inProgress: 3, cancelled: 0, overdue: 1, completionRate: 71.4 },
        { userId: 'user-2', fullName: 'Trần Thị B', militiaCode: null, unitCode: null, total: 6, completed: 1, inProgress: 2, cancelled: 1, overdue: 0, completionRate: 20 },
      ],
      total: 45,
      page: 1,
      limit: 20,
    },
    ...overrides,
  }
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const region = (name: string) => screen.getByRole('region', { name })
const rowsOf = (table: HTMLElement) =>
  within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))
const headersOf = (table: HTMLElement) => within(table).getAllByRole('columnheader').map((h) => h.textContent)
const chartPoints = (container: HTMLElement) => JSON.parse(within(container).getByTestId('bar-chart').dataset.points ?? 'null')

describe('TaskReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockReset()
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: taskReport() })
  })

  it('renders heading after load', async () => {
    wrap(<TaskReportPage />)
    await waitFor(() => {
      expect(screen.getByText('Báo Cáo Nhiệm Vụ')).toBeInTheDocument()
    })
  })

  it('renders total task count after load', async () => {
    wrap(<TaskReportPage />)
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })

  it('shows error message when API fails', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue(new Error('Network error'))
    wrap(<TaskReportPage />)
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải báo cáo/)).toBeInTheDocument()
    })
  })

  it('shows "Đang tải báo cáo..." until the report arrives', () => {
    vi.mocked(apiClient.default.get).mockImplementation(() => new Promise(() => {}))
    wrap(<TaskReportPage />)
    expect(screen.getByText('Đang tải báo cáo...')).toBeInTheDocument()
  })

  it('says the user may not read the task report on 403', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue({
      response: { status: 403, data: { code: 'E003', message: 'insufficient_role', statusCode: 403 } },
    })
    wrap(<TaskReportPage />)
    expect(await screen.findByText('Bạn không có quyền thực hiện thao tác này')).toBeInTheDocument()
    expect(screen.queryByText(/Không thể tải báo cáo/)).not.toBeInTheDocument()
  })

  // Codes of the date pipes and the range check, read through the error table (errors.tasks.report)
  it.each([
    ['invalid_date', 'Ngày không hợp lệ.'],
    ['invalid_date_range', 'Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.'],
    ['date_range_too_long', 'Khoảng thời gian tối đa là 366 ngày.'],
  ])('explains the backend code %s', async (code, text) => {
    vi.mocked(apiClient.default.get).mockRejectedValue({
      response: { status: 400, data: { code: 'E001', message: code, statusCode: 400 } },
    })
    wrap(<TaskReportPage />)
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByText(/Không thể tải báo cáo/)).not.toBeInTheDocument()
  })

  it('asks for the default period and shows the one the backend used', async () => {
    wrap(<TaskReportPage />)
    expect(await screen.findByText('Từ 01/10/2025 đến 14/09/2026')).toBeInTheDocument()
    expect(apiClient.default.get).toHaveBeenCalledWith('/tasks/report', { params: { page: 1, limit: 20 } })
    expect(screen.getByText('Báo cáo thống kê tình hình thực hiện nhiệm vụ')).toBeInTheDocument()
  })

  it('reads the totals', async () => {
    wrap(<TaskReportPage />)
    await screen.findByText('42')
    expect(screen.getByTestId('task-stat-total')).toHaveTextContent(/^Tổng nhiệm vụ\s*42$/)
    expect(screen.getByTestId('task-stat-completed')).toHaveTextContent(/^Đã hoàn thành\s*25$/)
    expect(screen.getByTestId('task-stat-inProgress')).toHaveTextContent(/^Đang thực hiện\s*8$/)
    expect(screen.getByTestId('task-stat-overdue')).toHaveTextContent(/^Quá hạn\s*5$/)
    expect(screen.getByTestId('task-stat-cancelled')).toHaveTextContent(/^Đã hủy\s*3$/)
    expect(screen.getByTestId('task-stat-completionRate')).toHaveTextContent(/^Tỷ lệ hoàn thành\s*64,1%$/)
  })

  it('breaks the tasks down by status, type, priority and month', async () => {
    wrap(<TaskReportPage />)
    await screen.findByText('42')

    const byStatus = within(region('Theo trạng thái')).getByRole('table')
    expect(headersOf(byStatus)).toEqual(['Trạng thái', 'Số nhiệm vụ'])
    expect(rowsOf(byStatus)).toEqual([
      ['Chờ giao', '2'], ['Đã giao', '4'], ['Đang thực hiện', '8'], ['Hoàn thành', '25'], ['Đã hủy', '3'], ['Quá hạn', '0'],
    ])

    const byType = region('Nhiệm vụ theo loại')
    expect(chartPoints(byType)).toEqual([
      { type: 'Tuần tra', count: 15 }, { type: 'Canh gác', count: 9 }, { type: 'drill', count: 1 },
    ])

    const byPriority = within(region('Theo mức độ ưu tiên')).getByRole('table')
    expect(headersOf(byPriority)).toEqual(['Mức độ ưu tiên', 'Số nhiệm vụ'])
    expect(rowsOf(byPriority)).toEqual([['Khẩn cấp', '6'], ['Trung bình', '21']])

    expect(chartPoints(region('Hoàn thành theo tháng'))).toEqual([
      { month: '08/2026', total: 18, completed: 11, overdue: 2 },
      { month: '09/2026', total: 7, completed: 3, overdue: 1 },
    ])
  })

  it('breaks the tasks down by unit', async () => {
    wrap(<TaskReportPage />)
    await screen.findByText('42')
    const byUnit = within(region('Theo đơn vị')).getByRole('table')
    expect(headersOf(byUnit)).toEqual(['Đơn vị', 'Tổng', 'Hoàn thành', 'Đã hủy', 'Quá hạn', 'Tỷ lệ hoàn thành'])
    expect(rowsOf(byUnit)).toEqual([
      ['Khu phố 1', '30', '20', '1', '3', '69%'],
      ['Chưa xác định đơn vị', '12', '5', '2', '2', '50%'],
    ])
  })

  it('pages through the tasks by assignee', async () => {
    wrap(<TaskReportPage />)
    await screen.findByText('42')
    const byAssignee = region('Theo người thực hiện')
    const table = within(byAssignee).getByRole('table')
    expect(headersOf(table)).toEqual([
      'Người thực hiện', 'Mã DQTV', 'Đơn vị', 'Tổng', 'Hoàn thành', 'Đang thực hiện', 'Đã hủy', 'Quá hạn', 'Tỷ lệ hoàn thành',
    ])
    expect(rowsOf(table)).toEqual([
      ['Nguyễn Văn A', 'DQTV-001', 'KP1', '14', '10', '3', '0', '1', '71,4%'],
      ['Trần Thị B', '—', '—', '6', '1', '2', '1', '0', '20%'],
    ])
    expect(within(byAssignee).getByText('Tổng 45 người thực hiện')).toBeInTheDocument()
    expect(within(byAssignee).getByText('1 / 3')).toBeInTheDocument()
    expect(within(byAssignee).getByRole('button', { name: 'Trang trước' })).toBeDisabled()

    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: taskReport({ byAssignee: { ...taskReport().byAssignee, page: 2 } }),
    })
    fireEvent.click(within(byAssignee).getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(apiClient.default.get).toHaveBeenCalledWith('/tasks/report', { params: { page: 2, limit: 20 } }))
    expect(await within(byAssignee).findByText('2 / 3')).toBeInTheDocument()
    fireEvent.click(within(byAssignee).getByRole('button', { name: 'Trang trước' }))
    await waitFor(() => expect(within(byAssignee).getByText('1 / 3')).toBeInTheDocument())
  })

  it('says a breakdown without rows has no data', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: taskReport({ byType: [], byMonth: [], byUnit: [], byAssignee: { data: [], total: 0, page: 1, limit: 20 } }),
    })
    wrap(<TaskReportPage />)
    await screen.findByText('42')
    expect(within(region('Theo đơn vị')).getByText('Không có dữ liệu')).toBeInTheDocument()
    expect(within(region('Theo người thực hiện')).getByText('Không có dữ liệu')).toBeInTheDocument()
    expect(within(region('Theo người thực hiện')).getByText('1 / 1')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Nhiệm vụ theo loại' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Hoàn thành theo tháng' })).not.toBeInTheDocument()
  })

  it('filters by period and unit, back to the first assignee page', async () => {
    wrap(<TaskReportPage />)
    await screen.findByText('42')
    fireEvent.click(within(region('Theo người thực hiện')).getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(apiClient.default.get).toHaveBeenCalledWith('/tasks/report', { params: { page: 2, limit: 20 } }))

    const unit = screen.getByLabelText('Đơn vị')
    expect(within(unit).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả', 'Khu phố 1', 'Khu phố 2', 'Khu phố 3', 'Khu phố 4', 'Khu phố 5', 'Khu phố 6',
    ])
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-01-01' } })
    await waitFor(() =>
      expect(apiClient.default.get).toHaveBeenCalledWith('/tasks/report', { params: { from: '2026-01-01', page: 1, limit: 20 } }),
    )
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-06-30' } })
    fireEvent.change(unit, { target: { value: 'KP2' } })
    await waitFor(() =>
      expect(apiClient.default.get).toHaveBeenCalledWith('/tasks/report', {
        params: { from: '2026-01-01', to: '2026-06-30', unitCode: 'KP2', page: 1, limit: 20 },
      }),
    )
  })
})

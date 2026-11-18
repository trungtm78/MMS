import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsChiTieuPage } from './SettingsChiTieuPage'

// GET and PUT /settings/kpi-targets are answered here (settings.controller.ts:45-60); useRbac runs for real
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: { id: 'u-admin', role: 'system_admin', roles: ['system_admin'] } as Record<string, unknown> }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: session.user, isAuthenticated: true }) }))

// KpiTargetsView (kpi-targets.service.ts:48-54)
const stored = {
  minAttendanceDays: 20,
  minTasksCompleted: 8,
  maxOverdueTasks: 3,
  minTrainingHours: 60,
  evaluationPeriod: 'quarterly',
  effectiveFrom: '2026-09-01',
  updatedAt: '2026-09-01T03:15:00.000Z',
  updatedBy: { id: 'u-admin', fullName: 'Nguyễn Quản Trị' },
  isDefault: false,
}
// DEFAULT_KPI_TARGETS until a system_admin sets targets
const defaults = {
  minAttendanceDays: 22,
  minTasksCompleted: 10,
  maxOverdueTasks: 2,
  minTrainingHours: 40,
  evaluationPeriod: 'monthly',
  effectiveFrom: null,
  updatedAt: null,
  updatedBy: null,
  isDefault: true,
}

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E001', message, statusCode: status } },
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SettingsChiTieuPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function replaceValue(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = await screen.findByLabelText(label)
  await user.clear(input)
  await user.type(input, value)
}

describe('SettingsChiTieuPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.put.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    session.user = { id: 'u-admin', role: 'system_admin', roles: ['system_admin'] }
    api.get.mockResolvedValue({ data: stored })
    api.put.mockImplementation((_url: string, body: Record<string, unknown>) =>
      Promise.resolve({ data: { ...stored, ...body, effectiveFrom: '2026-09-14', updatedAt: '2026-09-14T02:30:00.000Z' } }),
    )
  })

  it('renders heading after load', async () => {
    renderPage()
    expect(await screen.findByTestId('settings-chitieu-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chỉ Tiêu KPI' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/settings/kpi-targets')
  })

  it('shows the targets in force with the labelled fields and the evaluation period', async () => {
    renderPage()

    expect(await screen.findByLabelText('Số ngày chấm công tối thiểu')).toHaveValue(20)
    expect(screen.getByLabelText('Số nhiệm vụ hoàn thành tối thiểu')).toHaveValue(8)
    expect(screen.getByLabelText('Số nhiệm vụ quá hạn tối đa')).toHaveValue(3)
    expect(screen.getByLabelText('Giờ huấn luyện tối thiểu')).toHaveValue(60)
    const period = screen.getByTestId('evaluation-period-select') as HTMLSelectElement
    expect(period).toHaveAccessibleName('Chu kỳ đánh giá')
    expect(period.value).toBe('quarterly')
    expect([...period.options].map((o) => o.textContent)).toEqual(['Hàng tháng', 'Hàng quý', 'Hàng năm'])
  })

  it('shows since when the version applies and who set it', async () => {
    renderPage()

    expect(await screen.findByText('Áp dụng từ 01/09/2026')).toBeInTheDocument()
    expect(screen.getByText('Cập nhật lúc 10:15 01/09/2026 bởi Nguyễn Quản Trị')).toBeInTheDocument()
  })

  // updatedBy.fullName is null when the account that set the targets has no name (LEFT JOIN users)
  it('shows when the version was set even without the name of who set it', async () => {
    api.get.mockResolvedValue({ data: { ...stored, updatedBy: { id: 'u-gone', fullName: null } } })
    renderPage()

    expect(await screen.findByText('Cập nhật lúc 10:15 01/09/2026')).toBeInTheDocument()
    expect(screen.queryByText(/ bởi /)).not.toBeInTheDocument()
  })

  it('says when the default targets apply', async () => {
    api.get.mockResolvedValue({ data: defaults })
    renderPage()

    expect(await screen.findByText('Đang dùng chỉ tiêu mặc định')).toBeInTheDocument()
    expect(screen.getByLabelText('Số ngày chấm công tối thiểu')).toHaveValue(22)
    expect((screen.getByTestId('evaluation-period-select') as HTMLSelectElement).value).toBe('monthly')
  })

  // KpiTargetsDto accepts exactly the five targets; any other property is a 400
  it('saves exactly the five targets, without the version details', async () => {
    const user = renderPage()

    await replaceValue(user, 'Số nhiệm vụ hoàn thành tối thiểu', '12')
    await user.selectOptions(screen.getByTestId('evaluation-period-select'), 'yearly')
    await user.click(screen.getByRole('button', { name: 'Lưu chỉ tiêu' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][0]).toBe('/settings/kpi-targets')
    expect(api.put.mock.calls[0][1]).toStrictEqual({
      minAttendanceDays: 20,
      minTasksCompleted: 12,
      maxOverdueTasks: 3,
      minTrainingHours: 60,
      evaluationPeriod: 'yearly',
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã lưu chỉ tiêu KPI'))
    expect(await screen.findByText('Áp dụng từ 14/09/2026')).toBeInTheDocument()
  })

  it.each([
    ['Số ngày chấm công tối thiểu', '0', 'Phải từ 1 đến 31 ngày'],
    ['Số nhiệm vụ hoàn thành tối thiểu', '101', 'Phải từ 0 đến 100 nhiệm vụ'],
    ['Số nhiệm vụ quá hạn tối đa', '21', 'Phải từ 0 đến 20 nhiệm vụ'],
    ['Giờ huấn luyện tối thiểu', '501', 'Phải từ 0 đến 500 giờ'],
    ['Giờ huấn luyện tối thiểu', '12.5', 'Phải là số nguyên'],
  ])('refuses %s = %s before sending it', async (label, value, message) => {
    const user = renderPage()

    await replaceValue(user, label, value)
    await user.click(screen.getByRole('button', { name: 'Lưu chỉ tiêu' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    expect(api.put).not.toHaveBeenCalled()
  })

  it('clears a field error once the field is edited', async () => {
    const user = renderPage()

    await replaceValue(user, 'Số ngày chấm công tối thiểu', '0')
    await user.click(screen.getByRole('button', { name: 'Lưu chỉ tiêu' }))
    expect(await screen.findByText('Phải từ 1 đến 31 ngày')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Số ngày chấm công tối thiểu'), '5')

    expect(screen.queryByText('Phải từ 1 đến 31 ngày')).not.toBeInTheDocument()
  })

  it.each([
    // errors.settings.kpiTargets
    ['400 invalid_kpi_targets', httpError(400, 'invalid_kpi_targets'), 'Chỉ tiêu nằm ngoài giới hạn cho phép. Vui lòng kiểm tra lại.'],
    // RolesGuard throws ForbiddenException('insufficient_role')
    ['403 insufficient_role', httpError(403, 'insufficient_role'), 'Chỉ quản trị hệ thống được thay đổi chỉ tiêu.'],
    ['403 without a known code', httpError(403, 'Forbidden resource'), 'Chỉ quản trị viên hệ thống được thay đổi chỉ tiêu KPI.'],
    ['400 without a known code', httpError(400, 'something_new'), 'Lưu thất bại'],
    ['500', httpError(500, 'Internal server error'), 'Lưu thất bại'],
  ])('explains a refused save (%s)', async (_, error, message) => {
    api.put.mockRejectedValueOnce(error)
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Lưu chỉ tiêu' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
  })

  it('shows the pending label while saving', async () => {
    api.put.mockReturnValueOnce(new Promise(() => {}))
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Lưu chỉ tiêu' }))

    expect(await screen.findByRole('button', { name: 'Đang lưu...' })).toBeDisabled()
  })

  // PUT /settings/kpi-targets is @Roles('system_admin'); the readers of GET see the targets only
  it('gives other staff a read-only view', async () => {
    session.user = { id: 'u-ward', role: 'police_ward', roles: ['police_ward'] }
    renderPage()

    expect(await screen.findByLabelText('Số ngày chấm công tối thiểu')).toBeDisabled()
    expect(screen.getByLabelText('Giờ huấn luyện tối thiểu')).toBeDisabled()
    expect(screen.getByTestId('evaluation-period-select')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Lưu chỉ tiêu' })).not.toBeInTheDocument()
    expect(screen.getByText('Chỉ quản trị viên hệ thống được thay đổi chỉ tiêu KPI.')).toBeInTheDocument()
  })

  it('shows a loading state, then explains when the targets cannot be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'Internal server error'))
    renderPage()

    expect(screen.getByText('Đang tải...')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải chỉ tiêu KPI.')
    expect(screen.queryByRole('button', { name: 'Lưu chỉ tiêu' })).not.toBeInTheDocument()
  })
})

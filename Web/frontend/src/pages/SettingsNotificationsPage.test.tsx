import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsNotificationsPage } from './SettingsNotificationsPage'

// GET and PUT /settings/notifications are answered here (settings.controller.ts:63-77)
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

type Preferences = {
  channels: { inApp: boolean; push: boolean; email: boolean }
  categories: {
    taskAssigned: boolean
    taskOverdue: boolean
    attendanceReminder: boolean
    leaveApproval: boolean
    systemAnnouncements: boolean
    sosAlerts: boolean
  }
}

// NotificationPreferencesView (notification-preferences.service.ts:31-36)
function view(overrides: Partial<Preferences & { mandatory: string[]; updatedAt: string | null; isDefault: boolean }> = {}) {
  return {
    channels: { inApp: true, push: true, email: false },
    categories: {
      taskAssigned: true,
      taskOverdue: false,
      attendanceReminder: true,
      leaveApproval: true,
      systemAnnouncements: true,
      sosAlerts: true,
    },
    mandatory: ['channels.inApp'],
    updatedAt: '2026-09-10T02:00:00.000Z',
    isDefault: false,
    ...overrides,
  }
}

// The PUT answer echoes what was stored, with the caller's mandatory list
const echo = (mandatory: string[] = ['channels.inApp']) => (_url: string, body: Preferences) =>
  Promise.resolve({ data: { ...body, mandatory, updatedAt: '2026-09-14T03:00:00.000Z', isDefault: false } })

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E001', message, statusCode: status } },
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SettingsNotificationsPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const lastBody = () => api.put.mock.calls.at(-1)?.[1] as Preferences

describe('SettingsNotificationsPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.put.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    api.get.mockResolvedValue({ data: view() })
    api.put.mockImplementation(echo())
  })

  it('renders the heading and loads the preferences from GET /settings/notifications', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Cài Đặt Thông Báo' })).toBeInTheDocument()
    expect(await screen.findByRole('switch', { name: 'Nhiệm vụ quá hạn' })).toHaveAttribute('aria-checked', 'false')
    expect(api.get).toHaveBeenCalledWith('/settings/notifications')
  })

  it('lists the three channels and the six categories as switches, with no save button', async () => {
    renderPage()

    const channels = await screen.findByRole('group', { name: 'Kênh nhận thông báo' })
    expect(within(channels).getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual([
      'Trong ứng dụng',
      'Thông báo đẩy',
      'Email',
    ])
    const categories = screen.getByRole('group', { name: 'Loại thông báo' })
    expect(within(categories).getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual([
      'Nhiệm vụ mới',
      'Nhiệm vụ quá hạn',
      'Nhắc nhở chấm công',
      'Đơn nghỉ phép',
      'Thông báo hệ thống',
      'Cảnh báo SOS',
    ])
    expect(screen.getByText('Cảnh báo khẩn cấp SOS từ các thành viên')).toBeInTheDocument()
    expect(screen.queryByTestId('save-notifications-btn')).not.toBeInTheDocument()
  })

  // Bug: handleToggle called mutate() with the state from before the click
  it('sends the state after the toggle, not the one before it', async () => {
    const user = renderPage()

    await user.click(await screen.findByTestId('toggle-taskOverdue'))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(lastBody().categories.taskOverdue).toBe(true)
  })

  // NotificationPreferencesDto: nested channels and categories, every key required (a flat body is a 400)
  it('sends exactly the channels and categories the backend validates', async () => {
    const user = renderPage()

    await user.click(await screen.findByRole('switch', { name: 'Email' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/settings/notifications', {
      channels: { inApp: true, push: true, email: true },
      categories: {
        taskAssigned: true,
        taskOverdue: false,
        attendanceReminder: true,
        leaveApproval: true,
        systemAnnouncements: true,
        sosAlerts: true,
      },
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã lưu cài đặt thông báo'))
  })

  it('keeps mandatory preferences on and cannot switch them off', async () => {
    api.get.mockResolvedValue({ data: view({ mandatory: ['channels.inApp', 'categories.sosAlerts'] }) })
    const user = renderPage()

    const inApp = await screen.findByRole('switch', { name: 'Trong ứng dụng' })
    const sos = screen.getByRole('switch', { name: 'Cảnh báo SOS' })
    for (const toggle of [inApp, sos]) {
      expect(toggle).toBeDisabled()
      expect(toggle).toHaveAttribute('aria-checked', 'true')
      await user.click(toggle)
    }
    expect(screen.getAllByText('Bắt buộc')).toHaveLength(2)
    expect(api.put).not.toHaveBeenCalled()
  })

  it('never sends a mandatory preference as off', async () => {
    api.get.mockResolvedValue({
      data: view({
        channels: { inApp: false, push: true, email: false },
        categories: { ...view().categories, sosAlerts: false },
        mandatory: ['channels.inApp', 'categories.sosAlerts'],
      }),
    })
    const user = renderPage()

    await user.click(await screen.findByRole('switch', { name: 'Thông báo đẩy' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(lastBody().channels).toEqual({ inApp: true, push: false, email: false })
    expect(lastBody().categories.sosAlerts).toBe(true)
  })

  it('shows a change at once and puts it back when saving fails', async () => {
    let fail: (reason: unknown) => void = () => undefined
    api.put.mockReturnValueOnce(new Promise((_, reject) => { fail = reject }))
    const user = renderPage()

    const email = await screen.findByRole('switch', { name: 'Email' })
    await user.click(email)
    expect(email).toHaveAttribute('aria-checked', 'true')

    fail(httpError(500, 'Internal server error'))

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Email' })).toHaveAttribute('aria-checked', 'false'))
    expect(toast.error).toHaveBeenCalledWith('Lưu thất bại, vui lòng thử lại')
  })

  it('explains a refused mandatory change', async () => {
    api.put.mockRejectedValueOnce(httpError(400, 'notification_preference_mandatory'))
    const user = renderPage()

    await user.click(await screen.findByRole('switch', { name: 'Nhiệm vụ mới' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Không thể tắt thông báo bắt buộc. Cài đặt đã được khôi phục.'),
    )
    expect(screen.getByRole('switch', { name: 'Nhiệm vụ mới' })).toHaveAttribute('aria-checked', 'true')
  })

  it('explains a refusal without a known code with the general text', async () => {
    api.put.mockRejectedValueOnce(httpError(400, 'something_new'))
    const user = renderPage()

    await user.click(await screen.findByRole('switch', { name: 'Đơn nghỉ phép' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Lưu thất bại, vui lòng thử lại'))
    expect(screen.getByRole('switch', { name: 'Đơn nghỉ phép' })).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps both changes when two switches are toggled quickly', async () => {
    let answerFirst: () => void = () => undefined
    api.put
      .mockImplementationOnce((url: string, body: Preferences) =>
        new Promise((resolve) => { answerFirst = () => resolve(echo()(url, body)) }),
      )
      .mockImplementationOnce(echo())
    const user = renderPage()

    await user.click(await screen.findByRole('switch', { name: 'Thông báo đẩy' }))
    await user.click(screen.getByRole('switch', { name: 'Email' }))
    answerFirst()

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
    expect(lastBody().channels).toEqual({ inApp: true, push: false, email: true })
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('switch', { name: 'Thông báo đẩy' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Email' })).toHaveAttribute('aria-checked', 'true')
  })

  it('says when the defaults apply and when the preferences were last changed', async () => {
    api.get.mockResolvedValueOnce({ data: view({ isDefault: true, updatedAt: null }) })
    renderPage()
    expect(await screen.findByText('Đang dùng cài đặt mặc định')).toBeInTheDocument()
  })

  it('shows when the stored preferences were last changed', async () => {
    renderPage()
    expect(await screen.findByText('Cập nhật lần cuối lúc 09:00 10/09/2026')).toBeInTheDocument()
  })

  it('shows a loading state, then explains when the preferences cannot be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'Internal server error'))
    renderPage()

    expect(screen.getByText('Đang tải...')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải cài đặt thông báo.')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

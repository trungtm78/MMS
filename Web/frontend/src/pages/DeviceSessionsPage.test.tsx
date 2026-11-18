import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeviceSessionsPage } from './DeviceSessionsPage'

// /devices/sessions routes are answered here (device-sessions.controller.ts); useRbac runs for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
const signOutSession = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({
  user: { id: '9b2f6f0e-7d51-4c1a-9a57-1d2f7c3a0b11', role: 'dqtv_member', roles: ['dqtv_member'] } as Record<string, unknown> | null,
}))
vi.mock('@/api/client', () => ({ default: api, signOutSession }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: session.user !== null }),
}))

const USER_ID = '9b2f6f0e-7d51-4c1a-9a57-1d2f7c3a0b11'
const CURRENT_ID = '3f1c2a9e-51b7-4e0c-8d7a-2b6e9f4c1d20'
const PHONE_ID = 'a7d4e8c1-0f3b-4b6a-9e2d-5c8f1a7b3e41'
const TABLET_ID = 'c2e9b5a4-7f1d-4c3e-8a6b-9d0f2e4c6a53'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// DeviceSessionView (device-sessions.service.ts:20-43)
function deviceSession(overrides: Record<string, unknown>) {
  const createdAt = (overrides.createdAt as string | undefined) ?? minutesAgo(3)
  return {
    id: CURRENT_ID,
    userId: USER_ID,
    userName: 'Nguyễn Văn An',
    ip: '10.0.0.5',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    deviceType: 'desktop',
    deviceName: 'Chrome – Windows',
    browser: 'Chrome',
    os: 'Windows',
    amr: ['pwd', 'otp', 'mfa'],
    mfa: true,
    createdAt,
    lastActiveAt: createdAt,
    expiresAt: '2026-09-21T02:00:00.000Z',
    current: false,
    ...overrides,
  }
}

const current = deviceSession({ id: CURRENT_ID, current: true, createdAt: minutesAgo(0) })
const phone = deviceSession({
  id: PHONE_ID,
  ip: '172.16.4.20',
  userAgent: 'Dart/3.5 (dart:io)',
  deviceType: 'mobile',
  deviceName: 'Ứng dụng MMS',
  browser: 'Ứng dụng MMS',
  os: null,
  amr: ['pwd'],
  mfa: false,
  createdAt: minutesAgo(90),
})
const tablet = deviceSession({
  id: TABLET_ID,
  ip: null,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Version/17.5 Safari/605.1.15',
  deviceType: 'tablet',
  deviceName: 'Safari – iPadOS',
  browser: 'Safari',
  os: 'iPadOS',
  createdAt: '2026-09-01T01:00:00.000Z',
})

// DeviceSessionPage (device-sessions.service.ts:45-50)
const pageOf = (data: unknown[], extra: Partial<{ total: number; page: number; limit: number }> = {}) => ({
  data: { data, total: data.length, page: 1, limit: 20, ...extra },
})

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E004', message, statusCode: status } },
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/devices']}>
        <Routes>
          <Route path="/devices" element={<DeviceSessionsPage />} />
          <Route path="/forbidden" element={<p>Trang không có quyền</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const listCalls = () => api.get.mock.calls.filter(([url]) => url === '/devices/sessions').length

describe('DeviceSessionsPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.delete.mockReset()
    signOutSession.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    session.user = { id: USER_ID, role: 'dqtv_member', roles: ['dqtv_member'] }
    api.get.mockResolvedValue(pageOf([current, phone, tablet]))
    api.delete.mockResolvedValue({ status: 204, data: '' })
    api.post.mockResolvedValue({ data: { revoked: 2 } })
  })

  it('does not show the page without a signed-in user', () => {
    session.user = null
    renderPage()

    expect(screen.queryByTestId('device-sessions-page')).not.toBeInTheDocument()
    expect(screen.getByText('Trang không có quyền')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('reads the first page of GET /devices/sessions and lists every live session, the current one first', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Quản lý thiết bị & Phiên đăng nhập' })).toBeInTheDocument()
    const currentRow = await screen.findByTestId(`session-row-${CURRENT_ID}`)
    expect(api.get).toHaveBeenCalledWith('/devices/sessions', { params: { page: 1, limit: 20 } })
    expect(screen.getByText('Tài khoản: Nguyễn Văn An')).toBeInTheDocument()
    const rows = screen.getAllByTestId(/^session-row-/)
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      `session-row-${CURRENT_ID}`,
      `session-row-${PHONE_ID}`,
      `session-row-${TABLET_ID}`,
    ])

    expect(within(currentRow).getByText('Chrome – Windows')).toBeInTheDocument()
    expect(within(currentRow).getByText('Máy tính')).toBeInTheDocument()
    expect(within(currentRow).getByText('10.0.0.5')).toBeInTheDocument()
    expect(within(currentRow).getByTestId(`current-session-badge-${CURRENT_ID}`)).toHaveTextContent('Phiên hiện tại')
    expect(within(currentRow).getByText('Xác thực hai lớp')).toBeInTheDocument()
    expect(within(currentRow).getByText('Vừa xong')).toBeInTheDocument()
    expect(within(currentRow).getByText('09:00 21/09/2026')).toBeInTheDocument()

    const phoneRow = screen.getByTestId(`session-row-${PHONE_ID}`)
    expect(within(phoneRow).getByText('Ứng dụng MMS')).toBeInTheDocument()
    expect(within(phoneRow).getByText('Điện thoại')).toBeInTheDocument()
    expect(within(phoneRow).getByText('Chỉ mật khẩu')).toBeInTheDocument()
    expect(within(phoneRow).getByText('1 giờ trước')).toBeInTheDocument()
    expect(within(phoneRow).queryByText('Phiên hiện tại')).not.toBeInTheDocument()

    const tabletRow = screen.getByTestId(`session-row-${TABLET_ID}`)
    expect(within(tabletRow).getByText('Máy tính bảng')).toBeInTheDocument()
    expect(within(tabletRow).getByText('—')).toBeInTheDocument()
    expect(within(tabletRow).getByText('08:00 01/09/2026')).toBeInTheDocument()
    expect(within(tabletRow).getByText('Đăng nhập lúc 08:00 01/09/2026')).toBeInTheDocument()

    // Every listed session is live: there is no status column any more
    expect(screen.queryByText('Hết hạn')).not.toBeInTheDocument()
  })

  // describeUserAgent answers 'unknown' and "Không xác định" for a client it cannot name
  it('names a device it cannot recognise', async () => {
    api.get.mockResolvedValue(
      pageOf([deviceSession({ id: PHONE_ID, userAgent: null, deviceType: 'unknown', deviceName: 'Không xác định', browser: null, os: null, amr: [], mfa: false })]),
    )
    renderPage()

    const row = await screen.findByTestId(`session-row-${PHONE_ID}`)
    expect(within(row).getByText('Không xác định')).toBeInTheDocument()
    expect(within(row).getByText('Thiết bị khác')).toBeInTheDocument()
    expect(within(row).getByText('Chỉ mật khẩu')).toBeInTheDocument()
  })

  it('says how long ago a device was active in minutes', async () => {
    api.get.mockResolvedValue(pageOf([deviceSession({ id: PHONE_ID, createdAt: minutesAgo(5) })]))
    renderPage()

    expect(await screen.findByText('5 phút trước')).toBeInTheDocument()
    expect(screen.getByText('Đăng xuất các thiết bị khác').closest('button')).toBeEnabled()
  })

  describe('signing one device out', () => {
    it('asks first, then sends DELETE /devices/sessions/:id and reloads the list', async () => {
      const user = renderPage()

      await user.click(await screen.findByTestId(`revoke-btn-${PHONE_ID}`))
      const dialog = screen.getByRole('alertdialog', { name: 'Xác nhận thu hồi?' })
      expect(dialog).toHaveTextContent('Thiết bị Ứng dụng MMS sẽ bị đăng xuất ngay.')
      expect(api.delete).not.toHaveBeenCalled()
      await user.click(within(dialog).getByRole('button', { name: 'Xác nhận thu hồi' }))

      expect(api.delete).toHaveBeenCalledWith(`/devices/sessions/${PHONE_ID}`)
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã thu hồi phiên thiết bị'))
      await waitFor(() => expect(listCalls()).toBe(2))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(signOutSession).not.toHaveBeenCalled()
    })

    it('keeps the list when the user cancels', async () => {
      const user = renderPage()

      await user.click(await screen.findByTestId(`revoke-btn-${TABLET_ID}`))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Hủy' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(api.delete).not.toHaveBeenCalled()
    })

    // 404 session_not_found: already signed out elsewhere, or not a session of this account
    it('explains a session that is gone and reloads the list', async () => {
      api.delete.mockRejectedValueOnce(httpError(404, 'session_not_found'))
      const user = renderPage()

      await user.click(await screen.findByTestId(`revoke-btn-${PHONE_ID}`))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xác nhận thu hồi' }))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Phiên đăng nhập này không còn hoạt động hoặc không thuộc tài khoản của bạn. Danh sách đã được cập nhật.',
        ),
      )
      await waitFor(() => expect(listCalls()).toBe(2))
    })

    it('explains a refusal without a known code with the general text and reloads the list', async () => {
      api.delete.mockRejectedValueOnce(httpError(404, 'Not Found'))
      const user = renderPage()

      await user.click(await screen.findByTestId(`revoke-btn-${PHONE_ID}`))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xác nhận thu hồi' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể thu hồi phiên'))
      await waitFor(() => expect(listCalls()).toBe(2))
    })

    it('explains any other failure', async () => {
      api.delete.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      const user = renderPage()

      await user.click(await screen.findByTestId(`revoke-btn-${PHONE_ID}`))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Xác nhận thu hồi' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể thu hồi phiên'))
    })

    // The access token names its session: revoking it signs this browser out at once
    it('signs this browser out like a refused refresh when the current session is revoked', async () => {
      const user = renderPage()

      await user.click(await screen.findByTestId(`revoke-btn-${CURRENT_ID}`))
      const dialog = screen.getByRole('alertdialog', { name: 'Đăng xuất khỏi trình duyệt này?' })
      expect(dialog).toHaveTextContent('Đây là phiên bạn đang dùng. Sau khi thu hồi, bạn sẽ phải đăng nhập lại.')
      await user.click(within(dialog).getByRole('button', { name: 'Đăng xuất' }))

      expect(api.delete).toHaveBeenCalledWith(`/devices/sessions/${CURRENT_ID}`)
      await waitFor(() => expect(signOutSession).toHaveBeenCalledWith('session_ended'))
      expect(toast.success).not.toHaveBeenCalled()
      expect(listCalls()).toBe(1)
    })
  })

  describe('signing the other devices out', () => {
    it('asks first, then sends POST /devices/sessions/revoke-others and reports the count', async () => {
      const user = renderPage()

      await user.click(await screen.findByRole('button', { name: 'Đăng xuất các thiết bị khác' }))
      const dialog = screen.getByRole('alertdialog', { name: 'Đăng xuất các thiết bị khác?' })
      expect(dialog).toHaveTextContent('Mọi thiết bị khác đang đăng nhập tài khoản này sẽ bị đăng xuất ngay. Thiết bị bạn đang dùng vẫn giữ đăng nhập.')
      expect(api.post).not.toHaveBeenCalled()
      await user.click(within(dialog).getByRole('button', { name: 'Đăng xuất các thiết bị khác' }))

      expect(api.post).toHaveBeenCalledWith('/devices/sessions/revoke-others')
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã đăng xuất 2 thiết bị khác'))
      await waitFor(() => expect(listCalls()).toBe(2))
      expect(signOutSession).not.toHaveBeenCalled()
    })

    it('says so when no other device was signed in', async () => {
      api.post.mockResolvedValueOnce({ data: { revoked: 0 } })
      const user = renderPage()

      await user.click(await screen.findByRole('button', { name: 'Đăng xuất các thiết bị khác' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Đăng xuất các thiết bị khác' }))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Không có thiết bị nào khác đang đăng nhập'))
    })

    it('explains a failure', async () => {
      api.post.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      const user = renderPage()

      await user.click(await screen.findByRole('button', { name: 'Đăng xuất các thiết bị khác' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Đăng xuất các thiết bị khác' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể đăng xuất các thiết bị khác'))
    })

    it('is not offered when this browser is the only signed-in device', async () => {
      api.get.mockResolvedValue(pageOf([current]))
      renderPage()

      await screen.findByTestId(`session-row-${CURRENT_ID}`)
      expect(screen.getByRole('button', { name: 'Đăng xuất các thiết bị khác' })).toBeDisabled()
    })
  })

  it('pages through the sessions', async () => {
    api.get.mockImplementation((_url: string, config: { params: { page: number } }) =>
      Promise.resolve(pageOf(config.params.page === 1 ? [current, phone] : [tablet], { total: 45, page: config.params.page })),
    )
    const user = renderPage()

    expect(await screen.findByText('Trang 1/3 · 45 phiên')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    expect(await screen.findByTestId(`session-row-${TABLET_ID}`)).toBeInTheDocument()
    expect(api.get).toHaveBeenLastCalledWith('/devices/sessions', { params: { page: 2, limit: 20 } })
    expect(screen.getByText('Trang 2/3 · 45 phiên')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(await screen.findByTestId(`session-row-${PHONE_ID}`)).toBeInTheDocument()
  })

  it('says when there is no session', async () => {
    api.get.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Không có phiên nào')).toBeInTheDocument()
  })

  // 403 insufficient_role (errors.devices.sessions): only system_admin may list another user's sessions
  it('explains a refused list with the error table text', async () => {
    api.get.mockRejectedValue(httpError(403, 'insufficient_role'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ quản trị hệ thống được xem phiên đăng nhập của tài khoản khác.')
  })

  it('explains when the sessions cannot be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'Internal server error'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách phiên đăng nhập.')
  })
})

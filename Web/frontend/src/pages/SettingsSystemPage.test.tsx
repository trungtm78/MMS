import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsSystemPage } from './SettingsSystemPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }))

const session = vi.hoisted(() => ({ user: { role: 'system_admin', roles: ['system_admin'] } as Record<string, unknown> }))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user }),
}))

const mockSettings = {
  session_timeout_minutes: '30',
  password_min_length: '8',
  max_login_attempts: '5',
  gps_retention_days: '90',
  min_wage_region_1: '4960000',
  training_daily_allowance_rate: '0.2',
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SettingsSystemPage', () => {
  beforeEach(() => {
    session.user = { role: 'system_admin', roles: ['system_admin'] }
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockSettings })
    vi.mocked(apiClient.default.patch).mockResolvedValue({ data: { updated: 6 } })
  })

  it('renders heading after load', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByTestId('settings-system-page')).toBeInTheDocument()
      expect(screen.getByText('Cài Đặt Hệ Thống')).toBeInTheDocument()
    })
  })

  it('renders editable settings values', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByText('30')).toBeInTheDocument()
    })
  })

  it('shows edit button for system_admin', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByTestId('edit-settings-btn')).toBeInTheDocument()
    })
  })

  // PATCH /admin/system-settings is @Roles('system_admin'); the RolesGuard accepts any held role
  it('shows edit button when system_admin is one of several roles', async () => {
    session.user = { role: 'police_ward', roles: ['police_ward', 'system_admin'] }
    wrap(<SettingsSystemPage />)
    expect(await screen.findByTestId('edit-settings-btn')).toBeInTheDocument()
  })

  it('hides edit button from other roles', async () => {
    session.user = { role: 'police_ward', roles: ['police_ward'] }
    wrap(<SettingsSystemPage />)
    await screen.findByText('30')
    expect(screen.queryByTestId('edit-settings-btn')).not.toBeInTheDocument()
  })

  it('shows edit form inputs when edit button clicked', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => expect(screen.getByTestId('edit-settings-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-settings-btn'))
    expect(screen.getByTestId('setting-input-session_timeout_minutes')).toBeInTheDocument()
    expect(screen.getByTestId('save-settings-btn')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-settings-btn')).toBeInTheDocument()
  })

  it('cancel button closes edit mode', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => expect(screen.getByTestId('edit-settings-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-settings-btn'))
    fireEvent.click(screen.getByTestId('cancel-settings-btn'))
    expect(screen.queryByTestId('setting-input-session_timeout_minutes')).not.toBeInTheDocument()
  })

  it('save button calls PATCH /admin/system-settings', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => expect(screen.getByTestId('edit-settings-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-settings-btn'))
    fireEvent.click(screen.getByTestId('save-settings-btn'))
    await waitFor(() => expect(screen.getByTestId('confirm-save-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('confirm-save-btn'))
    await waitFor(() => {
      expect(vi.mocked(apiClient.default.patch)).toHaveBeenCalledWith(
        '/admin/system-settings',
        expect.objectContaining({ session_timeout_minutes: '30' }),
      )
    })
  })

  it('labels every editable setting and lists the other settings by key', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: { ...mockSettings, min_wage_region_1: undefined, gps_ping_interval: '60' } })
    wrap(<SettingsSystemPage />)

    expect(await screen.findByText('Thông số hệ thống')).toBeInTheDocument()
    for (const label of [
      'Thời gian hết phiên (phút)',
      'Độ dài mật khẩu tối thiểu',
      'Số lần đăng nhập sai tối đa',
      'Lưu giữ GPS (ngày)',
      'Lương tối thiểu vùng I (VNĐ)',
      'Hệ số phụ cấp huấn luyện/ngày',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Lương tối thiểu vùng I (VNĐ)').nextSibling).toHaveTextContent('—')
    expect(screen.getByText('gps_ping_interval').nextSibling).toHaveTextContent('60')
    expect(screen.getByText('Cấu hình chung cho toàn bộ hệ thống MMS')).toBeInTheDocument()
  })

  it('asks for confirmation, then explains when the settings cannot be saved', async () => {
    vi.mocked(apiClient.default.patch).mockRejectedValueOnce({
      isAxiosError: true,
      request: {},
      response: { status: 500, data: { code: 'E005', message: 'Internal server error', statusCode: 500 } },
    })
    wrap(<SettingsSystemPage />)
    fireEvent.click(await screen.findByTestId('edit-settings-btn'))
    expect(screen.getByText('Chỉnh sửa cài đặt hệ thống')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-settings-btn')).toHaveTextContent('Huỷ')
    fireEvent.click(screen.getByTestId('save-settings-btn'))

    expect(screen.getByText('Xác nhận lưu cài đặt')).toBeInTheDocument()
    expect(screen.getByText('Thao tác này sẽ thay đổi cấu hình toàn bộ hệ thống MMS. Bạn chắc chắn muốn tiếp tục?')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-save-btn')).toHaveTextContent('Xác nhận lưu')
    fireEvent.click(screen.getByTestId('confirm-save-btn'))

    expect(await screen.findByTestId('save-error')).toHaveTextContent('Không thể lưu cài đặt. Vui lòng thử lại.')
    expect(screen.queryByTestId('confirm-save-btn')).not.toBeInTheDocument()
  })

  it('closes the confirmation without saving', async () => {
    vi.mocked(apiClient.default.patch).mockClear()
    wrap(<SettingsSystemPage />)
    fireEvent.click(await screen.findByTestId('edit-settings-btn'))
    fireEvent.click(screen.getByTestId('save-settings-btn'))
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))

    expect(screen.queryByTestId('confirm-save-btn')).not.toBeInTheDocument()
    expect(vi.mocked(apiClient.default.patch)).not.toHaveBeenCalled()
  })

  it('shows error when API fails', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue(new Error('fail'))
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải/)).toBeInTheDocument()
    })
  })
})

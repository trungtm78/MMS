import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsProfilePage } from './SettingsProfilePage'
import * as apiClient from '@/api/client'
import { toast } from 'sonner'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ completeSignIn: vi.fn() }) }))

const mockProfile = {
  fullName: 'Nguyễn Văn Test',
  email: 'test@mms.gov.vn',
  phone: '0901234567',
  avatarUrl: null,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SettingsProfilePage', () => {
  beforeEach(() => {
    // GET /auth/mfa/status feeds the security section; every other GET is the profile
    vi.mocked(apiClient.default.get).mockImplementation((url: string) =>
      Promise.resolve({
        data: url === '/auth/mfa/status'
          ? { enabled: true, enrolledAt: '2026-09-01T03:00:00.000Z', required: false, recoveryCodesRemaining: 9 }
          : mockProfile,
      }),
    )
    vi.mocked(apiClient.default.patch).mockResolvedValue({ data: mockProfile })
  })

  it('includes the account security section with the second-factor status', async () => {
    wrap(<SettingsProfilePage />)

    expect(await screen.findByRole('heading', { name: 'Bảo mật tài khoản' })).toBeInTheDocument()
    expect(await screen.findByTestId('mfa-status')).toHaveTextContent('Đang bật')
    expect(vi.mocked(apiClient.default.get)).toHaveBeenCalledWith('/auth/mfa/status')
  })

  it('renders page container', async () => {
    wrap(<SettingsProfilePage />)
    await waitFor(() => expect(screen.getByTestId('settings-profile-page')).toBeInTheDocument())
  })

  it('shows profile data after load', async () => {
    wrap(<SettingsProfilePage />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Test')).toBeInTheDocument())
  })

  it('shows edit button', async () => {
    wrap(<SettingsProfilePage />)
    await waitFor(() => expect(screen.getByTestId('edit-profile-btn')).toBeInTheDocument())
  })

  it('shows form inputs when edit clicked', async () => {
    wrap(<SettingsProfilePage />)
    await waitFor(() => expect(screen.getByTestId('edit-profile-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-profile-btn'))
    expect(screen.getByTestId('fullname-input')).toBeInTheDocument()
    expect(screen.getByTestId('save-profile-btn')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-edit-btn')).toBeInTheDocument()
  })

  it('cancel returns to view mode', async () => {
    wrap(<SettingsProfilePage />)
    await waitFor(() => expect(screen.getByTestId('edit-profile-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-profile-btn'))
    fireEvent.click(screen.getByTestId('cancel-edit-btn'))
    expect(screen.queryByTestId('fullname-input')).not.toBeInTheDocument()
  })

  // GET /users/me returns the primary role and every role (Web/backend/src/users/users.service.ts)
  it('shows every role the user holds with its Vietnamese label', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: { ...mockProfile, username: 'ca.ward', role: 'ca_ward', roles: ['ca_ward', 'dqtv_member'], unitScope: 'KP1', status: 'active' },
    })
    wrap(<SettingsProfilePage />)

    expect(await screen.findByTestId('profile-primary-role')).toHaveTextContent('Công an phường (CA)')
    const roles = screen.getByTestId('profile-roles')
    expect(roles).toHaveTextContent('Công an phường (CA)')
    expect(roles).toHaveTextContent('Thành viên DQTV')
  })

  it('labels the account details and shows a dash for missing values', async () => {
    wrap(<SettingsProfilePage />)

    expect(await screen.findByRole('heading', { name: 'Thông Tin Cá Nhân' })).toBeInTheDocument()
    expect(screen.getByText('Quản lý thông tin tài khoản của bạn')).toBeInTheDocument()
    expect(screen.getByText('Tài khoản').nextSibling).toHaveTextContent('—')
    expect(screen.getByText('Điện thoại').nextSibling).toHaveTextContent('0901234567')
    expect(screen.getByText('Đơn vị').nextSibling).toHaveTextContent('—')
    expect(screen.getByTestId('profile-roles')).toHaveTextContent('—')
    expect(screen.getByText('Trạng thái').nextSibling).toHaveTextContent('Không hoạt động')
  })

  it('labels the edit form and reports a failed update', async () => {
    vi.mocked(apiClient.default.patch).mockRejectedValueOnce({
      isAxiosError: true,
      request: {},
      response: { status: 500, data: { code: 'E005', message: 'Internal server error', statusCode: 500 } },
    })
    wrap(<SettingsProfilePage />)
    fireEvent.click(await screen.findByTestId('edit-profile-btn'))

    for (const label of ['Họ và tên', 'Email', 'Số điện thoại']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByTestId('save-profile-btn')).toHaveTextContent('Lưu thay đổi')
    fireEvent.click(screen.getByTestId('save-profile-btn'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cập nhật thất bại'))
    expect(screen.getByTestId('fullname-input')).toBeInTheDocument()
  })

  it('confirms a successful update and leaves the edit form', async () => {
    wrap(<SettingsProfilePage />)
    fireEvent.click(await screen.findByTestId('edit-profile-btn'))
    fireEvent.click(screen.getByTestId('save-profile-btn'))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cập nhật thông tin thành công'))
    expect(screen.queryByTestId('fullname-input')).not.toBeInTheDocument()
  })

  it('save calls PATCH /users/me/profile', async () => {
    wrap(<SettingsProfilePage />)
    await waitFor(() => expect(screen.getByTestId('edit-profile-btn')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-profile-btn'))
    fireEvent.click(screen.getByTestId('save-profile-btn'))
    await waitFor(() =>
      expect(vi.mocked(apiClient.default.patch)).toHaveBeenCalledWith(
        '/users/me',
        expect.any(Object),
      ),
    )
  })
})

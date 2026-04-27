import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsProfilePage } from './SettingsProfilePage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

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
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockProfile })
    vi.mocked(apiClient.default.patch).mockResolvedValue({ data: mockProfile })
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

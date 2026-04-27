import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsSystemPage } from './SettingsSystemPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'system_admin' } }),
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
    await waitFor(() => {
      expect(vi.mocked(apiClient.default.patch)).toHaveBeenCalledWith(
        '/admin/system-settings',
        expect.objectContaining({ session_timeout_minutes: '30' }),
      )
    })
  })

  it('shows error when API fails', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue(new Error('fail'))
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải/)).toBeInTheDocument()
    })
  })
})

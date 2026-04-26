import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsSystemPage } from './SettingsSystemPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))

const mockSettings = {
  appName: 'MMS', version: '1.0.0', maintenanceMode: false,
  maxLoginAttempts: 5, sessionTimeoutMinutes: 30, passwordMinLength: 8,
  requireTwoFactor: false, allowedFileTypes: ['jpg', 'png', 'pdf'], maxFileSizeMb: 10,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SettingsSystemPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockSettings })
  })

  it('renders heading after load', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByTestId('settings-system-page')).toBeInTheDocument()
      expect(screen.getByText('Cài Đặt Hệ Thống')).toBeInTheDocument()
    })
  })

  it('shows read-only notice', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByText(/Chế độ xem/)).toBeInTheDocument()
    })
  })

  it('renders system settings values', async () => {
    wrap(<SettingsSystemPage />)
    await waitFor(() => {
      expect(screen.getByText('MMS')).toBeInTheDocument()
      expect(screen.getByText('1.0.0')).toBeInTheDocument()
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

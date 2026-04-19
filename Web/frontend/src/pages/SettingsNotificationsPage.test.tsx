import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsNotificationsPage } from './SettingsNotificationsPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => {
  const get  = vi.fn()
  const put  = vi.fn()
  return { default: { get, put } }
})

const mockPrefs = {
  taskAssigned: true, taskOverdue: false, attendanceReminder: true,
  leaveApproval: true, systemAnnouncements: true, sosAlerts: true,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SettingsNotificationsPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockPrefs })
    vi.mocked(apiClient.default.put).mockResolvedValue({ data: mockPrefs })
  })

  it('renders heading', () => {
    wrap(<SettingsNotificationsPage />)
    expect(screen.getByText('Cài Đặt Thông Báo')).toBeInTheDocument()
  })

  it('renders all toggle switches after load', async () => {
    wrap(<SettingsNotificationsPage />)
    await waitFor(() => {
      expect(screen.getAllByRole('switch').length).toBe(6)
    })
  })

  it('has save button', () => {
    wrap(<SettingsNotificationsPage />)
    expect(screen.getByTestId('save-notifications-btn')).toBeInTheDocument()
  })
})

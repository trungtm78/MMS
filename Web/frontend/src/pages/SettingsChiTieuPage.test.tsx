import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsChiTieuPage } from './SettingsChiTieuPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockTargets = {
  minAttendanceDays: 22, minTasksCompleted: 10, maxOverdueTasks: 2,
  minTrainingHours: 40, evaluationPeriod: 'monthly' as const,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SettingsChiTieuPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockTargets })
    vi.mocked(apiClient.default.put).mockResolvedValue({ data: mockTargets })
  })

  it('renders heading after load', async () => {
    wrap(<SettingsChiTieuPage />)
    await waitFor(() => {
      expect(screen.getByTestId('settings-chitieu-page')).toBeInTheDocument()
      expect(screen.getByText('Chỉ Tiêu KPI')).toBeInTheDocument()
    })
  })

  it('renders save button and evaluation period select', async () => {
    wrap(<SettingsChiTieuPage />)
    await waitFor(() => {
      expect(screen.getByTestId('save-chitieu-btn')).toBeInTheDocument()
      expect(screen.getByTestId('evaluation-period-select')).toBeInTheDocument()
    })
  })

  it('evaluation period select has correct default', async () => {
    wrap(<SettingsChiTieuPage />)
    await waitFor(() => {
      const select = screen.getByTestId('evaluation-period-select') as HTMLSelectElement
      expect(select.value).toBe('monthly')
    })
  })
})

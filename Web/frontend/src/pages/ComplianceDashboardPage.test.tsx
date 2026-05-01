import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComplianceDashboardPage } from './ComplianceDashboardPage'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/utils/export-utils', () => ({
  downloadExcelReport: vi.fn(),
  formatVND: vi.fn(),
}))

import * as apiClient from '@/api/client'
import * as exportUtils from '@/utils/export-utils'

const mockData = {
  unitCode: '',
  lastUpdated: '2026-05-01T08:30:00Z',
  stats: {
    activePersonnel: { value: 85, total: 100, criticalThreshold: 80 },
    trainingCompliance: { value: 70, total: 100, criticalThreshold: 75 },
    attendanceThisMonth: { value: 90, total: 100, criticalThreshold: 60 },
    avgKpiScore: { value: 78, total: 100, criticalThreshold: 70 },
    exemptionsExpiringSoon: { value: 5, total: 100, criticalThreshold: 10 },
  },
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ComplianceDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockData })
  })

  it('renders the page container', () => {
    wrap(<ComplianceDashboardPage />)
    expect(screen.getByTestId('compliance-dashboard-page')).toBeInTheDocument()
  })

  it('shows skeleton cards while loading', () => {
    vi.mocked(apiClient.default.get).mockImplementation(() => new Promise(() => {}))
    wrap(<ComplianceDashboardPage />)
    // Skeleton cards have animate-pulse class
    const page = screen.getByTestId('compliance-dashboard-page')
    expect(page.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows stat cards when loaded', async () => {
    wrap(<ComplianceDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Quân số hoạt động')).toBeInTheDocument()
      expect(screen.getByText('Tuân thủ huấn luyện')).toBeInTheDocument()
      expect(screen.getByText('Có mặt tháng này')).toBeInTheDocument()
      expect(screen.getByText('Điểm KPI TB')).toBeInTheDocument()
      expect(screen.getByText('Miễn giảm sắp hết hạn')).toBeInTheDocument()
    })
  })

  it('shows NaN guard — zero total shows dash', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: {
        ...mockData,
        stats: {
          ...mockData.stats,
          activePersonnel: { value: 0, total: 0, criticalThreshold: 80 },
        },
      },
    })
    wrap(<ComplianceDashboardPage />)
    await waitFor(() => {
      // First stat card shows '—' for 0/0
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThan(0)
    })
  })

  it('shows lastUpdated timestamp', async () => {
    wrap(<ComplianceDashboardPage />)
    await waitFor(() => {
      expect(screen.getByText(/Cập nhật lúc:/)).toBeInTheDocument()
    })
  })

  it('export button is present and has correct text', async () => {
    wrap(<ComplianceDashboardPage />)
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).toBeInTheDocument()
      expect(screen.getByTestId('export-btn')).toHaveTextContent('Xuất tổng quan')
    })
  })

  it('export button shows loading state while exporting', async () => {
    // Mock downloadExcelReport to be slow so we can see the loading state
    vi.mocked(exportUtils.downloadExcelReport).mockImplementation(
      (_fetchFn, _filename, onStart) => {
        onStart()
        return new Promise(() => {}) // never resolves
      },
    )
    wrap(<ComplianceDashboardPage />)
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByTestId('export-btn'))
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).toHaveTextContent('Đang xuất...')
    })
  })
})

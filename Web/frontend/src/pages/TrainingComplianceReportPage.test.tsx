import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrainingComplianceReportPage } from './TrainingComplianceReportPage'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import * as apiClient from '@/api/client'

// Shape returned by GET /training/compliance-report (TrainingService.getComplianceReport):
// a plain array; status is ĐẠT at >= 15 days, CẢNH BÁO at >= 10, otherwise KHÔNG ĐẠT.
const mockData = [
  {
    militiaId: '1',
    militiaName: 'Nguyễn Văn A',
    militiaCode: 'DQTV-001',
    unitCode: 'KP1',
    military: 6,
    political: 4,
    fire: 3,
    firstAid: 2,
    other: 1,
    totalDays: 16,
    requiredDays: 15,
    status: 'ĐẠT',
  },
  {
    militiaId: '2',
    militiaName: 'Trần Thị B',
    militiaCode: 'DQTV-002',
    unitCode: 'KP2',
    military: 3,
    political: 2,
    fire: 1,
    firstAid: 1,
    other: 0,
    totalDays: 7,
    requiredDays: 15,
    status: 'KHÔNG ĐẠT',
  },
  {
    militiaId: '3',
    militiaName: 'Lê Văn C',
    militiaCode: 'DQTV-003',
    unitCode: 'KP1',
    military: 5,
    political: 3,
    fire: 2,
    firstAid: 1,
    other: 1,
    totalDays: 12,
    requiredDays: 15,
    status: 'CẢNH BÁO',
  },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('TrainingComplianceReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockData })
  })

  it('renders page container', () => {
    wrap(<TrainingComplianceReportPage />)
    expect(screen.getByTestId('training-compliance-page')).toBeInTheDocument()
  })

  it('renders table with rows', async () => {
    wrap(<TrainingComplianceReportPage />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    })
  })

  it('ĐẠT row has green background', async () => {
    wrap(<TrainingComplianceReportPage />)
    await waitFor(() => {
      // Find the ĐẠT badge
      const badges = screen.getAllByText('ĐẠT')
      expect(badges.length).toBeGreaterThan(0)
      const badge = badges[0]
      expect(badge.className).toContain('bg-green-100')
    })
  })

  it('KHÔNG ĐẠT row has red background', async () => {
    wrap(<TrainingComplianceReportPage />)
    await waitFor(() => {
      const badges = screen.getAllByText('KHÔNG ĐẠT')
      expect(badges.length).toBeGreaterThan(0)
      expect(badges[0].className).toContain('bg-red-100')
    })
  })

  it('CẢNH BÁO row has yellow background', async () => {
    wrap(<TrainingComplianceReportPage />)
    await waitFor(() => {
      const badges = screen.getAllByText('CẢNH BÁO')
      expect(badges.length).toBeGreaterThan(0)
      expect(badges[0].className).toContain('bg-yellow-100')
    })
  })

  it('export button is disabled when no data', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: [] })
    wrap(<TrainingComplianceReportPage />)
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).toBeDisabled()
    })
  })

  it('export button is enabled when data exists', async () => {
    wrap(<TrainingComplianceReportPage />)
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).not.toBeDisabled()
    })
  })

  it('shows summary cards', async () => {
    wrap(<TrainingComplianceReportPage />)
    await waitFor(() => {
      expect(screen.getByText('Tổng DQTV')).toBeInTheDocument()
      expect(screen.getByText('Đạt')).toBeInTheDocument()
      expect(screen.getByText('Cảnh báo')).toBeInTheDocument()
      expect(screen.getByText('Không đạt')).toBeInTheDocument()
    })
  })
})

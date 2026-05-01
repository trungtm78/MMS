import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrainingComplianceReportPage } from './TrainingComplianceReportPage'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import * as apiClient from '@/api/client'

const mockData = {
  data: [
    {
      id: '1',
      fullName: 'Nguyễn Văn A',
      militiaCode: 'DQTV-001',
      unitCode: 'KP1',
      militaryScore: 85,
      politicalScore: 90,
      fireSafetyScore: 80,
      firstAidScore: 75,
      otherScore: null,
      totalScore: 330,
      result: 'ĐẠT',
    },
    {
      id: '2',
      fullName: 'Trần Thị B',
      militiaCode: 'DQTV-002',
      unitCode: 'KP2',
      militaryScore: 50,
      politicalScore: 55,
      fireSafetyScore: 45,
      firstAidScore: 40,
      otherScore: null,
      totalScore: 190,
      result: 'KHÔNG ĐẠT',
    },
    {
      id: '3',
      fullName: 'Lê Văn C',
      militiaCode: 'DQTV-003',
      unitCode: 'KP1',
      militaryScore: 65,
      politicalScore: 70,
      fireSafetyScore: 60,
      firstAidScore: 65,
      otherScore: null,
      totalScore: 260,
      result: 'CẢNH BÁO',
    },
  ],
  summary: { total: 3, passed: 1, warning: 1, failed: 1 },
  byType: { military: 3, political: 3, fireSafety: 3, firstAid: 3, other: 0 },
}

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
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: { data: [], summary: { total: 0, passed: 0, warning: 0, failed: 0 }, byType: { military: 0, political: 0, fireSafety: 0, firstAid: 0, other: 0 } },
    })
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

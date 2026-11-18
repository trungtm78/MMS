import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComplianceDashboardPage } from './ComplianceDashboardPage'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))

import * as apiClient from '@/api/client'

// GET /dashboard/compliance (dashboard.service.ts getComplianceStats): the COUNT figures are parsed
// to integers by the service; attendancePct and avgKpiScore are ROUND over NUMERIC and arrive as
// JSON numbers (src/database/pg-types.ts); trainingCompliancePct is worked out in the service.
const mockStats = {
  totalActive: 1250,
  trainingCompliant: 1000,
  trainingCompliancePct: 80,
  attendancePct: 87.5,
  avgKpiScore: 78.25,
  // The latest KPI period with scores (the current month may still be under evaluation)
  kpiPeriod: { year: 2026, month: 4 },
  expiringExemptions: 3,
  // 15:30 on 1 May in Vietnam
  lastUpdated: '2026-05-01T08:30:00.000Z',
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ComplianceDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockReset()
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockStats })
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

  it('shows the title and subtitle', () => {
    wrap(<ComplianceDashboardPage />)
    expect(screen.getByRole('heading', { name: 'Bảng Tuân Thủ Pháp Định' })).toBeInTheDocument()
    expect(screen.getByText(/^Tổng quan tình trạng tuân thủ toàn đơn vị/)).toBeInTheDocument()
  })

  it('shows each figure of the answer in Vietnamese number format', async () => {
    wrap(<ComplianceDashboardPage />)
    expect(await screen.findByTestId('compliance-stat-activePersonnel')).toHaveTextContent(/^Quân số hoạt động\s*1\.250$/)
    expect(screen.getByTestId('compliance-stat-trainingCompliance')).toHaveTextContent(
      /^Tuân thủ huấn luyện\s*80%\s*1\.000 \/ 1\.250 DQTV đạt tối thiểu 15 ngày huấn luyện$/,
    )
    expect(screen.getByTestId('compliance-stat-attendanceThisMonth')).toHaveTextContent(/^Có mặt tháng này\s*87,5%$/)
    expect(screen.getByTestId('compliance-stat-avgKpiScore')).toHaveTextContent(/^Điểm KPI TB\s*78,25\s*điểm\s*Kỳ tháng 4\/2026$/)
    expect(screen.getByTestId('compliance-stat-exemptionsExpiringSoon')).toHaveTextContent(/^Miễn giảm sắp hết hạn\s*3\s*Trong 30 ngày tới$/)
  })

  it('draws the percentages as progress bars, never past full', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: { ...mockStats, attendancePct: 100.4 } })
    wrap(<ComplianceDashboardPage />)
    expect(await screen.findByTestId('compliance-progress-trainingCompliance')).toHaveStyle({ width: '80%' })
    expect(screen.getByTestId('compliance-progress-attendanceThisMonth')).toHaveStyle({ width: '100%' })
  })

  it('shows zero figures for a scope without members', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: { ...mockStats, totalActive: 0, trainingCompliant: 0, trainingCompliancePct: 0, attendancePct: 0, avgKpiScore: null, kpiPeriod: null, expiringExemptions: 0 },
    })
    wrap(<ComplianceDashboardPage />)
    expect(await screen.findByTestId('compliance-stat-trainingCompliance')).toHaveTextContent(/0%\s*0 \/ 0 DQTV/)
    // No score yet is not a score of zero
    expect(screen.getByTestId('compliance-stat-avgKpiScore')).toHaveTextContent(/^Điểm KPI TB\s*—\s*Chưa có kỳ đánh giá$/)
  })

  it('shows when the figures were worked out, in Vietnam time', async () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      wrap(<ComplianceDashboardPage />)
      expect(await screen.findByText(/Cập nhật lúc: 15:30 01\/05\/2026/)).toBeInTheDocument()
    } finally {
      process.env.TZ = tz
    }
  })

  // GET /dashboard/compliance has no export (dashboard.controller.ts): the page offers none
  it('offers no export of the dashboard', async () => {
    wrap(<ComplianceDashboardPage />)
    await screen.findByTestId('compliance-stat-activePersonnel')
    expect(screen.queryByTestId('export-btn')).not.toBeInTheDocument()
    expect(apiClient.default.get).not.toHaveBeenCalledWith('/dashboard/compliance/export', expect.anything())
  })

  it('reloads the figures for the chosen area unit', async () => {
    wrap(<ComplianceDashboardPage />)
    const unit = screen.getByRole('combobox')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Toàn đơn vị', 'Khu phố 1', 'Khu phố 2', 'Khu phố 3', 'Khu phố 4', 'Khu phố 5', 'Khu phố 6',
    ])
    fireEvent.change(unit, { target: { value: 'KP2' } })
    await waitFor(() =>
      expect(apiClient.default.get).toHaveBeenCalledWith('/dashboard/compliance', { params: { unitCode: 'KP2' } }),
    )
  })

  // Backend codes read through the error table (errors.dashboard.compliance); a 403 without one is a missing permission
  it.each([
    ['a failure', new Error('boom'), 'Không thể tải dữ liệu tuân thủ.'],
    ['no_unit_scope', { response: { status: 403, data: { code: 'E003', message: 'no_unit_scope', statusCode: 403 } } }, 'Tài khoản của bạn chưa được gán đơn vị quản lý.'],
    ['insufficient_role', { response: { status: 403, data: { code: 'E003', message: 'insufficient_role', statusCode: 403 } } }, 'Bạn không có quyền xem bảng tuân thủ pháp định.'],
    ['a 403 without a known code', { response: { status: 403, data: { code: 'E003', message: 'Forbidden resource', statusCode: 403 } } }, 'Bạn không có quyền thực hiện thao tác này'],
  ])('explains %s of the figures', async (_case, error, text) => {
    vi.mocked(apiClient.default.get).mockRejectedValue(error)
    wrap(<ComplianceDashboardPage />)
    expect(await screen.findByText(text)).toBeInTheDocument()
  })
})

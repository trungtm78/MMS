import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RosterReportPage } from './RosterReportPage'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import * as apiClient from '@/api/client'

const mockData = {
  data: [
    {
      id: '1',
      militiaCode: 'DQTV-001',
      fullName: 'Nguyễn Văn A',
      dateOfBirth: '1990-05-15',
      gender: 'Nam',
      phone: '0901234567',
      unitCode: 'KP1',
      rank: 'Binh nhì',
      occupation: 'Công nhân',
      education: 'THPT',
      status: 'active' as const,
    },
    {
      id: '2',
      militiaCode: 'DQTV-002',
      fullName: 'Trần Thị B',
      dateOfBirth: '1995-03-20',
      gender: 'Nữ',
      phone: '0912345678',
      unitCode: 'KP2',
      rank: 'Tiểu đội trưởng',
      occupation: 'Giáo viên',
      education: 'Đại học',
      status: 'reserve' as const,
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('RosterReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockData })
  })

  it('renders page container', () => {
    wrap(<RosterReportPage />)
    expect(screen.getByTestId('roster-report-page')).toBeInTheDocument()
  })

  it('renders table with roster rows', async () => {
    wrap(<RosterReportPage />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
      expect(screen.getByText('DQTV-001')).toBeInTheDocument()
    })
  })

  it('shows all required columns', async () => {
    wrap(<RosterReportPage />)
    await waitFor(() => {
      expect(screen.getByText('STT')).toBeInTheDocument()
      expect(screen.getAllByText('Mã DQTV').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Họ tên').length).toBeGreaterThan(0)
      expect(screen.getByText('Ngày sinh')).toBeInTheDocument()
      expect(screen.getByText('Giới tính')).toBeInTheDocument()
      expect(screen.getByText('Điện thoại')).toBeInTheDocument()
      expect(screen.getAllByText('Đơn vị').length).toBeGreaterThan(0)
      expect(screen.getByText('Cấp bậc')).toBeInTheDocument()
      expect(screen.getByText('Nghề nghiệp')).toBeInTheDocument()
      expect(screen.getByText('Học vấn')).toBeInTheDocument()
      expect(screen.getByText('Trạng thái')).toBeInTheDocument()
    })
  })

  it('export button is present', async () => {
    wrap(<RosterReportPage />)
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).toBeInTheDocument()
    })
  })

  it('export button enabled when data exists', async () => {
    wrap(<RosterReportPage />)
    await waitFor(() => {
      expect(screen.getByTestId('export-btn')).not.toBeDisabled()
    })
  })

  it('shows status badges', async () => {
    wrap(<RosterReportPage />)
    await waitFor(() => {
      // Use getAllByText since "Dự bị" also appears in select options
      expect(screen.getByText('Hoạt động')).toBeInTheDocument()
      expect(screen.getAllByText('Dự bị').length).toBeGreaterThan(0)
    })
  })

  it('shows pagination', async () => {
    wrap(<RosterReportPage />)
    await waitFor(() => {
      expect(screen.getByText(/bản ghi/i)).toBeInTheDocument()
    })
  })
})

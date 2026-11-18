import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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
      gender: 'male',
      phone: '0901234567',
      unitCode: 'KP1',
      rank: 'Binh nhì',
      occupation: 'Công nhân',
      educationLevel: 'THPT',
      status: 'active' as const,
    },
    {
      id: '2',
      militiaCode: 'DQTV-002',
      fullName: 'Trần Thị B',
      dateOfBirth: '1995-03-20',
      gender: 'female',
      phone: '0912345678',
      unitCode: 'KP2',
      rank: 'Tiểu đội trưởng',
      occupation: 'Giáo viên',
      educationLevel: 'Đại học',
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

const listParams = (overrides: Record<string, unknown> = {}) => ({
  params: { page: 1, limit: 20, unitCode: undefined, status: undefined, ...overrides },
})

describe('RosterReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockReset()
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

  it('shows the date of birth as the calendar day it is, in any timezone', async () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      wrap(<RosterReportPage />)
      expect(await screen.findByText('15/05/1990')).toBeInTheDocument()
      expect(screen.getByText('20/03/1995')).toBeInTheDocument()
    } finally {
      process.env.TZ = tz
    }
  })

  // GET /militia (militia.service.ts searchMilitia) answers gender as its code and the
  // education level as educationLevel
  it('fills every roster column from the fields the list answers', async () => {
    wrap(<RosterReportPage />)
    const first = (await screen.findByText('Nguyễn Văn A')).closest('tr') as HTMLElement
    expect(within(first).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '1', 'DQTV-001', 'Nguyễn Văn A', '15/05/1990', 'Nam', '0901234567', 'KP1', 'Binh nhì', 'Công nhân', 'THPT', 'Hoạt động',
    ])
    const second = screen.getByText('Trần Thị B').closest('tr') as HTMLElement
    expect(within(second).getAllByRole('cell')[4]).toHaveTextContent('Nữ')
  })

  it('shows a dash for a field the profile does not have', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: { ...mockData, data: [{ ...mockData.data[0], dateOfBirth: null, gender: null, rank: null, occupation: null, educationLevel: null }] },
    })
    wrap(<RosterReportPage />)
    const row = (await screen.findByText('Nguyễn Văn A')).closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent)
    expect([cells[3], cells[4], cells[7], cells[8], cells[9]]).toEqual(['—', '—', '—', '—', '—'])
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

  it('shows the title, subtitle and filter choices', () => {
    wrap(<RosterReportPage />)
    expect(screen.getByRole('heading', { name: 'Danh Sách Quân Nhân (Mẫu 01-BC)' })).toBeInTheDocument()
    expect(screen.getByText('Danh sách dân quân tự vệ theo đơn vị và trạng thái')).toBeInTheDocument()
    expect(screen.getByTestId('export-btn')).toHaveTextContent('Xuất Excel (Mẫu 01-BC)')
    expect(within(screen.getByLabelText('Đơn vị:')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả', 'Khu phố 1', 'Khu phố 2', 'Khu phố 3', 'Khu phố 4', 'Khu phố 5', 'Khu phố 6',
    ])
    expect(within(screen.getByLabelText('Trạng thái:')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả trạng thái', 'Đang hoạt động', 'Dự bị', 'Ngừng hoạt động',
    ])
  })

  it('shows "Đang tải..." until the roster arrives', () => {
    vi.mocked(apiClient.default.get).mockImplementation(() => new Promise(() => {}))
    wrap(<RosterReportPage />)
    expect(screen.getByText('Đang tải...')).toBeInTheDocument()
  })

  it('says the roster could not be loaded', async () => {
    vi.mocked(apiClient.default.get).mockRejectedValue(new Error('boom'))
    wrap(<RosterReportPage />)
    expect(await screen.findByText('Không thể tải danh sách quân nhân.')).toBeInTheDocument()
  })

  it('shows an empty roster and disables the export', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
    wrap(<RosterReportPage />)
    expect(await screen.findByText('Không có dữ liệu')).toBeInTheDocument()
    expect(screen.getByTestId('export-btn')).toBeDisabled()
  })

  it('labels an inactive member and shows an unknown status as its code', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: {
        ...mockData,
        data: [
          { ...mockData.data[0], status: 'inactive' },
          { ...mockData.data[1], status: 'retired' },
        ],
      },
    })
    wrap(<RosterReportPage />)
    expect(await screen.findByText('Ngừng')).toBeInTheDocument()
    expect(screen.getByText('retired')).toBeInTheDocument()
  })

  it('pages through the roster with the total count', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: { ...mockData, total: 45 } })
    wrap(<RosterReportPage />)
    const summary = (await screen.findByText(/bản ghi/)).closest('p') as HTMLElement
    expect(summary).toHaveTextContent('Tổng 45 bản ghi')
    expect(within(summary).getByText('45')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(apiClient.default.get).toHaveBeenCalledWith('/militia', listParams({ page: 2 })))
    expect(await screen.findByText('2 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
  })

  it('filters by unit and status', async () => {
    wrap(<RosterReportPage />)
    await screen.findByText('Nguyễn Văn A')
    fireEvent.change(screen.getByLabelText('Đơn vị:'), { target: { value: 'KP4' } })
    await waitFor(() => expect(apiClient.default.get).toHaveBeenCalledWith('/militia', listParams({ unitCode: 'KP4' })))
    fireEvent.change(screen.getByLabelText('Trạng thái:'), { target: { value: 'inactive' } })
    await waitFor(() =>
      expect(apiClient.default.get).toHaveBeenCalledWith('/militia', listParams({ unitCode: 'KP4', status: 'inactive' })),
    )
  })

  it('shows "Đang xuất..." while the workbook is exported', async () => {
    vi.mocked(apiClient.default.get).mockImplementation((url: string) =>
      url === '/militia/export' ? new Promise(() => {}) : Promise.resolve({ data: mockData }),
    )
    wrap(<RosterReportPage />)
    await screen.findByText('Nguyễn Văn A')
    fireEvent.click(screen.getByTestId('export-btn'))
    await waitFor(() => expect(screen.getByTestId('export-btn')).toHaveTextContent('Đang xuất...'))
    expect(apiClient.default.get).toHaveBeenCalledWith('/militia/export', {
      params: { format: 'xlsx', unitCode: undefined, status: undefined },
      responseType: 'blob',
    })
  })
})

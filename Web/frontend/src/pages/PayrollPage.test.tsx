import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PayrollPage } from './PayrollPage'
import type { KpiScore, PayrollPeriod } from '@/types'

// Only the HTTP layer is replaced
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

// Shapes of GET /payroll/periods and GET /payroll/kpi (Web/backend/src/payroll/payroll.service.ts)
const mockPeriods: PayrollPeriod[] = [
  { id: 'p1', month: 4, year: 2026, status: 'review', lockedBy: null, lockedAt: null, createdAt: '2026-04-01T00:00:00.000Z' },
]

const kpiRow = (patch: Partial<KpiScore>): KpiScore => ({
  id: 'k1',
  militiaId: 'm1',
  militiaName: 'Nguyễn Văn A',
  periodId: 'p1',
  attendanceDays: 22,
  taskCompleted: 8,
  taskTotal: 10,
  score: 88,
  adjustedScore: null,
  adjustmentNote: null,
  adjustedBy: null,
  ...patch,
})

// GET /payroll/compliance-check rows
interface ComplianceRow {
  militiaId: string
  militiaName: string
  baseSalary: number
  net: number
  minWage: number
  diff: number
  compliant: boolean
}

const server = {
  periods: [] as PayrollPeriod[],
  kpi: [] as KpiScore[],
  compliance: [] as ComplianceRow[],
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

// Files the page hands to the browser: the blobs behind object URLs and the download names
function captureDownloads() {
  const blobs: Blob[] = []
  const names: string[] = []
  Object.assign(URL, {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:download'
    }),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download)
  })
  return { blobs, names }
}

type User = ReturnType<typeof userEvent.setup>

async function openTab(user: User, name: string) {
  await screen.findByText('Nguyễn Văn A')
  await user.click(screen.getByRole('button', { name }))
}

describe('PayrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.periods = mockPeriods
    server.kpi = [kpiRow({})]
    server.compliance = []
    api.get.mockImplementation((url: string) => {
      if (url === '/payroll/periods') return Promise.resolve({ data: server.periods })
      if (url === '/payroll/kpi') {
        return Promise.resolve({ data: { data: server.kpi, total: server.kpi.length, page: 1, limit: 100 } })
      }
      if (url.startsWith('/payroll/compliance-check')) return Promise.resolve({ data: server.compliance })
      if (url.startsWith('/payroll/export')) return Promise.resolve({ data: new Blob(['xlsx']) })
      // Unit and militia lookups of PayrollKpiFilter
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValue({ data: { ...mockPeriods[0], status: 'locked' } })
    api.patch.mockResolvedValue({ data: kpiRow({ adjustedScore: 95 }) })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders heading', () => {
    wrap(<PayrollPage />)
    expect(screen.getAllByText('Bảng Lương & KPI').length).toBeGreaterThanOrEqual(1)
  })

  it('shows militia name after load', async () => {
    wrap(<PayrollPage />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows period label', async () => {
    wrap(<PayrollPage />)
    await waitFor(() => {
      expect(screen.getByText('Tháng 4/2026')).toBeInTheDocument()
    })
  })

  it('does NOT render coming-soon banner', () => {
    wrap(<PayrollPage />)
    expect(screen.queryByTestId('coming-soon-banner')).not.toBeInTheDocument()
  })

  it('shows the status of the selected period', async () => {
    wrap(<PayrollPage />)
    expect(await screen.findByTestId('period-status')).toHaveTextContent('Đang xét duyệt')
  })

  it('says when there is no payroll period', async () => {
    server.periods = []
    wrap(<PayrollPage />)
    expect(await screen.findByText('Không có dữ liệu kỳ lương')).toBeInTheDocument()
  })

  it('says when the period has no KPI rows', async () => {
    server.kpi = []
    wrap(<PayrollPage />)
    // Before a period is selected the table is briefly empty too: wait for the selected period's answer
    await waitFor(() => {
      expect(screen.getByTestId('period-status')).toBeInTheDocument()
      expect(screen.getByText('Không có dữ liệu KPI cho kỳ này')).toBeInTheDocument()
    })
    expect(screen.getByTestId('kpi-average')).toHaveTextContent('—')
  })

  describe('locked period', () => {
    const lockedPeriod: PayrollPeriod = {
      id: 'p1',
      month: 4,
      year: 2026,
      status: 'locked',
      // lockedBy is the locking user's id, lockedAt an ISO timestamp
      lockedBy: '8c1e2f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6',
      lockedAt: '2026-05-02T03:04:00.000Z',
      createdAt: '2026-04-01T00:00:00.000Z',
    }

    it('shows when the period was locked without printing the locking user id', async () => {
      server.periods = [lockedPeriod]
      wrap(<PayrollPage />)

      expect(await screen.findByTestId('period-locked-at')).toHaveTextContent(/Khóa lúc .*02\/05\/2026/)
      expect(screen.getByTestId('period-status')).toHaveTextContent('Đã khóa')
      expect(screen.queryByText(/8c1e2f4a/)).not.toBeInTheDocument()
    })

    it('shows nothing about locking for an open period', async () => {
      wrap(<PayrollPage />)
      await screen.findByText('Nguyễn Văn A')
      expect(screen.queryByTestId('period-locked-at')).not.toBeInTheDocument()
    })
  })

  describe('KPI rows without a score', () => {
    beforeEach(() => {
      server.kpi = [kpiRow({ id: 'k1', score: 80 }), kpiRow({ id: 'k2', militiaId: 'm2', militiaName: 'Trần Văn B', score: null })]
    })

    it('shows a dash instead of an empty score', async () => {
      wrap(<PayrollPage />)
      expect(await screen.findByTestId('kpi-score-k2')).toHaveTextContent('—')
      expect(screen.getByTestId('kpi-score-k1')).toHaveTextContent('80')
    })

    it('averages only the scored rows', async () => {
      wrap(<PayrollPage />)
      // The card renders '—' until the KPI rows arrive
      await waitFor(() => expect(screen.getByTestId('kpi-average')).toHaveTextContent('80.0'))
    })
  })

  describe('locking the period', () => {
    it('locks it with POST /payroll/periods/:id/lock', async () => {
      const user = userEvent.setup()
      wrap(<PayrollPage />)
      await screen.findByText('Nguyễn Văn A')

      await user.click(screen.getByRole('button', { name: 'Khóa kỳ lương' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/payroll/periods/p1/lock'))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã khóa kỳ lương'))
    })

    it('tells when the period could not be locked', async () => {
      api.post.mockRejectedValueOnce(new Error('boom'))
      const user = userEvent.setup()
      wrap(<PayrollPage />)
      await screen.findByText('Nguyễn Văn A')

      await user.click(screen.getByRole('button', { name: 'Khóa kỳ lương' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể khóa kỳ lương'))
    })
  })

  it('exports the KPI table as CSV with translated headers', async () => {
    const downloads = captureDownloads()
    const user = userEvent.setup()
    wrap(<PayrollPage />)
    await screen.findByText('Nguyễn Văn A')

    await user.click(screen.getByRole('button', { name: 'Xuất CSV' }))

    expect(downloads.names).toEqual(['payroll-kpi-p1.csv'])
    const csv = await readBlob(downloads.blobs[0])
    expect(csv).toContain('Họ tên,Ngày công,HT/Tổng NV,Điểm KPI,Điểm hiệu chỉnh,Ghi chú')
    expect(csv).toContain('Nguyễn Văn A,22,8/10,88,,')
  })

  describe('adjusting a KPI score', () => {
    async function openAdjust(user: User) {
      await user.click(await screen.findByTestId('adjust-kpi-btn-k1'))
      return screen.findByTestId('kpi-adjust-modal')
    }

    it('saves the adjusted score and its reason with PATCH /payroll/kpi/:militiaId', async () => {
      const user = userEvent.setup()
      wrap(<PayrollPage />)

      const modal = await openAdjust(user)
      expect(within(modal).getByText('Điều chỉnh KPI')).toBeInTheDocument()
      expect(within(modal).getByTestId('adjust-current-score')).toHaveTextContent('Điểm KPI hiện tại: 88')
      expect(within(modal).getByTestId('save-adjust-btn')).toHaveTextContent('Lưu điều chỉnh')
      expect(within(modal).getByTestId('save-adjust-btn')).toBeDisabled()

      await user.clear(within(modal).getByTestId('adjust-score-input'))
      await user.type(within(modal).getByTestId('adjust-score-input'), '95')
      await user.type(within(modal).getByTestId('adjust-note-input'), 'Hoàn thành nhiệm vụ đột xuất')
      await user.click(within(modal).getByTestId('save-adjust-btn'))

      await waitFor(() =>
        expect(api.patch).toHaveBeenCalledWith('/payroll/kpi/m1', { adjustedScore: 95, adjustmentNote: 'Hoàn thành nhiệm vụ đột xuất' }),
      )
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã lưu điều chỉnh KPI'))
      await waitFor(() => expect(screen.queryByTestId('kpi-adjust-modal')).not.toBeInTheDocument())
    })

    it('keeps the dialog open when the adjustment fails', async () => {
      api.patch.mockRejectedValueOnce(new Error('boom'))
      const user = userEvent.setup()
      wrap(<PayrollPage />)

      const modal = await openAdjust(user)
      await user.type(within(modal).getByTestId('adjust-note-input'), 'Sai sót')
      await user.click(within(modal).getByTestId('save-adjust-btn'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể lưu điều chỉnh'))
      expect(screen.getByTestId('kpi-adjust-modal')).toBeInTheDocument()
    })

    it('shows a dash for a member without a score and closes on Hủy', async () => {
      server.kpi = [kpiRow({ score: null })]
      const user = userEvent.setup()
      wrap(<PayrollPage />)

      const modal = await openAdjust(user)
      expect(within(modal).getByTestId('adjust-current-score')).toHaveTextContent('Điểm KPI hiện tại: —')
      await user.click(within(modal).getByRole('button', { name: 'Hủy' }))

      expect(screen.queryByTestId('kpi-adjust-modal')).not.toBeInTheDocument()
    })
  })

  it('shows allowances and insurance schemes on their tab', async () => {
    const user = userEvent.setup()
    wrap(<PayrollPage />)

    await openTab(user, 'Phụ cấp & Bảo hiểm')

    const tab = within(screen.getByTestId('allowance-tab'))
    expect(tab.getByText('Phụ cấp hàng tháng')).toBeInTheDocument()
    expect(tab.getByText('Phụ cấp chức vụ')).toBeInTheDocument()
    expect(tab.getByText(/561\.600đ/)).toBeInTheDocument()
    expect(tab.getByText('Trợ cấp huấn luyện')).toBeInTheDocument()
    expect(tab.getByText('Bảo hiểm thất nghiệp (BHTN)')).toBeInTheDocument()
    expect(tab.getAllByText('Đang tham gia')).toHaveLength(3)
    expect(tab.getByText('Trạm y tế phường Phú Định')).toBeInTheDocument()
    expect(
      tab.getByText('Thông tin phụ cấp và bảo hiểm mang tính chất tham khảo. Kết nối API đang được triển khai.'),
    ).toBeInTheDocument()
  })

  describe('compliance tab', () => {
    it('lists who is paid at least the minimum wage from GET /payroll/compliance-check', async () => {
      server.compliance = [
        { militiaId: 'm1', militiaName: 'Nguyễn Văn A', baseSalary: 2340000, net: 2500000, minWage: 2340000, diff: 160000, compliant: true },
        { militiaId: 'm2', militiaName: 'Trần Văn B', baseSalary: 2000000, net: 2100000, minWage: 2340000, diff: -240000, compliant: false },
      ]
      const user = userEvent.setup()
      wrap(<PayrollPage />)

      await openTab(user, 'Tuân thủ')

      expect(await screen.findByTestId('compliance-summary')).toHaveTextContent('1/2 trả đúng lương tối thiểu')
      expect(api.get).toHaveBeenCalledWith('/payroll/compliance-check?periodId=p1')
      const compliant = within(screen.getByTestId('compliance-row-m1'))
      expect(compliant.getByText('Đạt')).toBeInTheDocument()
      expect(compliant.getByText(/\+160\.000đ/)).toBeInTheDocument()
      const violation = within(screen.getByTestId('compliance-row-m2'))
      expect(violation.getByText('Vi phạm')).toBeInTheDocument()
      expect(violation.getByText(/-240\.000đ/)).toBeInTheDocument()
    })

    it('says when the period has no compliance rows', async () => {
      const user = userEvent.setup()
      wrap(<PayrollPage />)

      await openTab(user, 'Tuân thủ')

      expect(await screen.findByText('Không có dữ liệu tuân thủ cho kỳ này')).toBeInTheDocument()
    })

    it('downloads the payroll workbook from GET /payroll/export', async () => {
      const downloads = captureDownloads()
      const user = userEvent.setup()
      wrap(<PayrollPage />)

      await openTab(user, 'Tuân thủ')
      await user.click(screen.getByTestId('compliance-export-btn'))

      await waitFor(() => expect(downloads.names).toEqual(['BangLuong_p1.xlsx']))
      expect(screen.getByTestId('compliance-export-btn')).toHaveTextContent('Xuất Excel')
      expect(api.get).toHaveBeenCalledWith('/payroll/export?periodId=p1', { responseType: 'blob' })
    })

    it('tells when the workbook could not be exported', async () => {
      const serve = api.get.getMockImplementation()
      api.get.mockImplementation((url: string) =>
        url.startsWith('/payroll/export') ? Promise.reject(new Error('boom')) : serve?.(url),
      )
      const user = userEvent.setup()
      wrap(<PayrollPage />)

      await openTab(user, 'Tuân thủ')
      await user.click(screen.getByTestId('compliance-export-btn'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể xuất bảng lương'))
    })
  })
})

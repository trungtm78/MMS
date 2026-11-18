import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RewardsDisciplineReportPage, type RewardItem } from './RewardsDisciplineReportPage'

const api = vi.hoisted(() => ({ get: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

// MilitiaService.getRewardsReport rows over REWARD_LEDGER_SQL (Web/backend/src/rewards/reward-ledger.sql.ts):
// description is the form label, content the criteria or violation, status the status of a
// discipline decision (NULL for rewards and for free-form militia_rewards rows)
const rows: RewardItem[] = [
  {
    id: 'r1',
    fullName: 'Nguyễn Văn A',
    militiaCode: 'DQTV001',
    unitName: 'Khu phố 1',
    rewardType: 'reward',
    description: 'Giấy khen',
    content: 'Đạt thành tích xuất sắc',
    issuedBy: 'Chủ tịch UBND cấp xã',
    decisionDate: '2026-03-15',
    status: null,
    createdAt: '2026-03-15T02:00:00.000Z',
  },
  {
    id: 'd1',
    fullName: 'Trần Thị B',
    militiaCode: 'DQTV002',
    unitName: 'Khu phố 2',
    rewardType: 'discipline',
    description: 'Cảnh cáo',
    content: 'Vi phạm quy định',
    issuedBy: null,
    decisionDate: '2026-04-01',
    status: 'overturned',
    createdAt: '2026-04-01T02:00:00.000Z',
  },
  {
    id: 'd2',
    fullName: 'Lê Văn C',
    militiaCode: 'DQTV003',
    unitName: 'Khu phố 2',
    rewardType: 'discipline',
    description: 'Khiển trách',
    content: 'Vắng trực',
    issuedBy: 'Chủ tịch UBND phường',
    decisionDate: '2026-04-10',
    status: 'appealed',
    createdAt: '2026-04-10T02:00:00.000Z',
  },
  {
    id: 'd3',
    fullName: 'Phạm Văn D',
    militiaCode: 'DQTV004',
    unitName: 'Khu phố 3',
    rewardType: 'discipline',
    description: 'Khiển trách',
    content: '',
    issuedBy: null,
    decisionDate: null,
    status: 'active',
    createdAt: '2026-04-12T02:00:00.000Z',
  },
]

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RewardsDisciplineReportPage />
    </QueryClientProvider>,
  )
}

const reportCalls = () => api.get.mock.calls.filter(([url]) => url === '/militia/rewards-report')
const lastReportParams = () => (reportCalls().at(-1)?.[1] as { params: Record<string, unknown> }).params

describe('RewardsDisciplineReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockReset()
    api.get.mockImplementation((url: string) =>
      url === '/militia/rewards-report' ? Promise.resolve({ data: rows }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    )
  })

  it('shows the heading and its legal basis', async () => {
    wrap()
    expect(screen.getByTestId('rewards-discipline-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Khen thưởng & Kỷ luật' })).toBeInTheDocument()
    expect(screen.getByText('Báo cáo theo TT 57/2020/TT-BQP')).toBeInTheDocument()
    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument()
  })

  it('lists the rewards with the form, the content, the signer, the date and a status column', async () => {
    wrap()

    const row = within(await screen.findByTestId('report-row-r1'))
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'STT', 'Họ tên', 'Mã DQTV', 'Đơn vị', 'Hình thức', 'Nội dung', 'Người ký', 'Ngày QĐ', 'Trạng thái',
    ])
    expect(row.getByText('1')).toBeInTheDocument()
    expect(row.getByText('DQTV001')).toBeInTheDocument()
    expect(row.getByText('Khu phố 1')).toBeInTheDocument()
    expect(row.getByText('Giấy khen')).toBeInTheDocument()
    expect(row.getByText('Đạt thành tích xuất sắc')).toBeInTheDocument()
    expect(row.getByText('Chủ tịch UBND cấp xã')).toBeInTheDocument()
    expect(row.getByText('15/03/2026')).toBeInTheDocument()
    // The ledger kind is not a form
    expect(row.queryByText('reward')).not.toBeInTheDocument()
    // A reward has no status
    expect(row.getByTestId('report-status-r1')).toHaveTextContent('—')
    expect(screen.queryByTestId('report-row-d1')).not.toBeInTheDocument()
  })

  it('counts each ledger in its tab and shows the status of discipline decisions', async () => {
    wrap()
    await screen.findByTestId('report-row-r1')
    expect(screen.getByRole('button', { name: 'Khen thưởng (1)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kỷ luật (3)' }))

    expect(within(screen.getByTestId('report-row-d1')).getByTestId('report-status-d1')).toHaveTextContent('Đã hủy')
    expect(within(screen.getByTestId('report-row-d2')).getByTestId('report-status-d2')).toHaveTextContent('Đang kháng cáo')
    const missing = within(screen.getByTestId('report-row-d3'))
    expect(missing.getByTestId('report-status-d3')).toHaveTextContent('Hiệu lực')
    // No content, signer or date: dashes
    expect(missing.getAllByText('—')).toHaveLength(3)
    expect(screen.queryByTestId('report-row-r1')).not.toBeInTheDocument()
  })

  it('shows an unknown status code as it is', async () => {
    api.get.mockResolvedValue({ data: [{ ...rows[1], status: 'archived' }] })
    wrap()
    fireEvent.click(await screen.findByRole('button', { name: 'Kỷ luật (1)' }))
    expect(screen.getByTestId('report-status-d1')).toHaveTextContent('archived')
  })

  it('summarises decisions per month, skipping undated rows', async () => {
    wrap()
    const march = within(await screen.findByTestId('month-2026-03'))
    expect(screen.getByText('Thống kê theo tháng')).toBeInTheDocument()
    expect(march.getByText('03/2026')).toBeInTheDocument()
    expect(march.getByText('KT: 1')).toBeInTheDocument()
    expect(march.getByText('KL: 0')).toBeInTheDocument()
    const april = within(screen.getByTestId('month-2026-04'))
    expect(april.getByText('KT: 0')).toBeInTheDocument()
    expect(april.getByText('KL: 2')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^month-/)).toHaveLength(2)
  })

  it('filters by kind and unit code', async () => {
    const user = userEvent.setup()
    wrap()
    await screen.findByTestId('report-row-r1')

    expect(screen.getByText('Bộ lọc')).toBeInTheDocument()
    const kind = screen.getByLabelText('Loại')
    expect(within(kind).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tất cả', 'Khen thưởng', 'Kỷ luật'])
    await user.selectOptions(kind, 'discipline')
    await waitFor(() => expect(lastReportParams()).toMatchObject({ type: 'discipline' }))

    const unit = screen.getByLabelText('Mã đơn vị')
    expect(unit).toHaveAttribute('placeholder', 'VD: DV01')
    await user.type(unit, 'KP1')
    await waitFor(() => expect(lastReportParams()).toMatchObject({ type: 'discipline', unitCode: 'KP1' }))

    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '' } })
    await waitFor(() => expect(lastReportParams()).toEqual({ from: undefined, to: undefined, type: 'discipline', unitCode: 'KP1' }))
  })

  it('explains a report that cannot be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'Internal server error'))
    wrap()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu.')
  })

  it('shows an empty report and offers no export', async () => {
    api.get.mockResolvedValue({ data: [] })
    wrap()
    expect(await screen.findByText('Không có dữ liệu')).toBeInTheDocument()
    expect(screen.getByTestId('rewards-export-btn')).toBeDisabled()
  })

  describe('export', () => {
    const createObjectURL = vi.fn(() => 'blob:report')
    const revokeObjectURL = vi.fn()

    beforeEach(() => {
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
      createObjectURL.mockClear()
      revokeObjectURL.mockClear()
    })

    it('downloads the workbook for the current filters', async () => {
      const blob = new Blob(['xlsx'])
      let finish: (value: { data: Blob }) => void = () => {}
      api.get.mockImplementation((url: string) =>
        url === '/militia/rewards-export'
          ? new Promise((resolve) => { finish = resolve })
          : Promise.resolve({ data: rows }),
      )
      const downloads: string[] = []
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download)
      })
      wrap()
      await screen.findByTestId('report-row-r1')
      const params = lastReportParams()

      const button = screen.getByTestId('rewards-export-btn')
      expect(button).toHaveTextContent('Xuất Excel')
      fireEvent.click(button)
      await waitFor(() => expect(button).toHaveTextContent('Đang xuất...'))
      finish({ data: blob })

      await waitFor(() => expect(button).toHaveTextContent('Xuất Excel'))
      expect(api.get).toHaveBeenCalledWith('/militia/rewards-export', { params, responseType: 'blob' })
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(downloads).toEqual([`KhenThuong_KyLuat_${params.from as string}_${params.to as string}.xlsx`])
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:report')
      click.mockRestore()
    })

    it('names an open-ended export "all"', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      api.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/militia/rewards-export' ? new Blob(['x']) : rows }))
      const anchors: string[] = []
      click.mockImplementation(function (this: HTMLAnchorElement) {
        anchors.push(this.download)
      })
      wrap()
      await screen.findByTestId('report-row-r1')
      fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '' } })
      fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '' } })
      await waitFor(() => expect(lastReportParams()).toMatchObject({ from: undefined, to: undefined }))
      await screen.findByTestId('report-row-r1')

      fireEvent.click(screen.getByTestId('rewards-export-btn'))
      await waitFor(() => expect(anchors).toEqual(['KhenThuong_KyLuat_all_all.xlsx']))
      click.mockRestore()
    })

    it('explains an export that failed', async () => {
      api.get.mockImplementation((url: string) =>
        url === '/militia/rewards-export'
          ? Promise.reject({ response: { status: 500, data: new Blob([JSON.stringify({ message: 'internal_error' })]) } })
          : Promise.resolve({ data: rows }),
      )
      wrap()
      await screen.findByTestId('report-row-r1')
      fireEvent.click(screen.getByTestId('rewards-export-btn'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể xuất báo cáo'))
      expect(createObjectURL).not.toHaveBeenCalled()
      expect(screen.getByTestId('rewards-export-btn')).toHaveTextContent('Xuất Excel')
    })
  })

  describe('calendar dates', () => {
    const tz = process.env.TZ
    afterEach(() => {
      vi.useRealTimers()
      process.env.TZ = tz
    })

    it('shows the decision date as the day it is, in any timezone', async () => {
      process.env.TZ = 'America/Los_Angeles'
      wrap()
      expect(await screen.findByText('15/03/2026')).toBeInTheDocument()
    })

    // A browser in Vietnam at 00:30 on 1 January 2026 (17:30 UTC on 31 December 2025)
    it('defaults to the Vietnamese year so far', async () => {
      process.env.TZ = 'Asia/Ho_Chi_Minh'
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2025-12-31T17:30:00.000Z'))
      wrap()

      expect(screen.getAllByDisplayValue('2026-01-01')).toHaveLength(2)
      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith('/militia/rewards-report', {
          params: { from: '2026-01-01', to: '2026-01-01', type: undefined, unitCode: undefined },
        }),
      )
    })
  })
})

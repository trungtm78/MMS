import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TrainingComplianceReportPage } from './TrainingComplianceReportPage'
import { todayInVietnam } from '@/lib/dates'
import { t } from '@/test/i18n'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))

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
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <Toaster theme="light" />
    </QueryClientProvider>,
  )
}

/** Answers GET by URL; the report answers mockData unless listed */
function answer(byUrl: Record<string, () => Promise<unknown>>) {
  vi.mocked(apiClient.default.get).mockImplementation((url: string) =>
    (byUrl[url] ?? (() => Promise.resolve({ data: mockData })))() as never,
  )
}

const vietnamYear = () => Number(todayInVietnam().slice(0, 4))
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)

describe('TrainingComplianceReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockReset()
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockData })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  describe('request', () => {
    const tz = process.env.TZ
    afterEach(() => {
      vi.useRealTimers()
      process.env.TZ = tz
    })

    // 18:30 UTC on 31 December 2026 is already 1 January 2027 in Vietnam (still 2026 in Los Angeles)
    it('asks for the Vietnamese year by default and offers two years either side', async () => {
      process.env.TZ = 'America/Los_Angeles'
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-12-31T18:30:00.000Z'))
      wrap(<TrainingComplianceReportPage />)

      const year = screen.getByLabelText('Năm:')
      expect(year).toHaveValue('2027')
      expect(within(year).getAllByRole('option').map((o) => o.textContent)).toEqual(['2025', '2026', '2027', '2028', '2029'])
      await waitFor(() =>
        expect(apiClient.default.get).toHaveBeenCalledWith('/training/compliance-report', { params: { year: 2027 } }),
      )
    })

    it('asks again for the chosen year and unit', async () => {
      wrap(<TrainingComplianceReportPage />)
      const unit = screen.getByLabelText('Đơn vị:')
      expect(within(unit).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Tất cả', 'Khu phố 1', 'Khu phố 2', 'Khu phố 3', 'Khu phố 4', 'Khu phố 5', 'Khu phố 6',
      ])
      fireEvent.change(unit, { target: { value: 'KP2' } })
      fireEvent.change(screen.getByLabelText('Năm:'), { target: { value: String(vietnamYear() - 1) } })
      await waitFor(() =>
        expect(apiClient.default.get).toHaveBeenCalledWith('/training/compliance-report', {
          params: { year: vietnamYear() - 1, unitCode: 'KP2' },
        }),
      )
    })
  })

  it('shows the title, subtitle and the export action', () => {
    wrap(<TrainingComplianceReportPage />)
    expect(screen.getByRole('heading', { name: 'Báo Cáo Tuân Thủ Huấn Luyện' })).toBeInTheDocument()
    expect(screen.getByText('Kết quả huấn luyện và tuân thủ theo từng DQTV')).toBeInTheDocument()
    expect(screen.getByTestId('export-btn')).toHaveTextContent('Xuất báo cáo')
  })

  it('lists each member with the days per training type, the total and the result', async () => {
    wrap(<TrainingComplianceReportPage />)
    const table = await screen.findByRole('table')
    await within(table).findByText('Nguyễn Văn A')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'STT', 'Họ tên', 'Mã DQTV', 'Đơn vị', 'Quân sự', 'Chính trị', 'PCCC', 'Sơ cứu', 'Khác', 'Tổng', 'Kết quả',
    ])
    const [, first, second, third] = within(table).getAllByRole('row')
    expect(cells(first)).toEqual(['1', 'Nguyễn Văn A', 'DQTV-001', 'KP1', '6', '4', '3', '2', '1', '16', 'ĐẠT'])
    expect(cells(second)).toEqual(['2', 'Trần Thị B', 'DQTV-002', 'KP2', '3', '2', '1', '1', '0', '7', 'KHÔNG ĐẠT'])
    expect(cells(third)).toEqual(['3', 'Lê Văn C', 'DQTV-003', 'KP1', '5', '3', '2', '1', '1', '12', 'CẢNH BÁO'])
    expect(first).toHaveClass('bg-green-50')
    expect(second).toHaveClass('bg-red-50')
    expect(third).toHaveClass('bg-yellow-50')
  })

  // training_records.total_days is NUMERIC(5,1): the sums per type arrive as JSON numbers and keep half days
  it('shows half training days in Vietnamese number format, in the rows and the totals by type', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({
      data: [
        { ...mockData[0], military: 5.5, political: 4, fire: 3, firstAid: 2.5, other: 0.5, totalDays: 15.5 },
        { ...mockData[2], military: 5, political: 3, fire: 2, firstAid: 1, other: 1.5, totalDays: 12.5 },
      ],
    })
    wrap(<TrainingComplianceReportPage />)
    const table = await screen.findByRole('table')
    await within(table).findByText('Nguyễn Văn A')
    const [, first, second] = within(table).getAllByRole('row')
    expect(cells(first)).toEqual(['1', 'Nguyễn Văn A', 'DQTV-001', 'KP1', '5,5', '4', '3', '2,5', '0,5', '15,5', 'ĐẠT'])
    expect(cells(second)).toEqual(['2', 'Lê Văn C', 'DQTV-003', 'KP1', '5', '3', '2', '1', '1,5', '12,5', 'CẢNH BÁO'])
    const byType = screen.getByRole('region', { name: 'Thống kê theo loại huấn luyện (tổng ngày)' })
    expect(within(byType).getAllByTestId(/^compliance-by-type-/).map((item) => item.textContent)).toEqual([
      '10,5Quân sự', '7Chính trị', '5PCCC', '3,5Sơ cứu', '2Khác',
    ])
  })

  it('shows a status it does not know as the backend sent it, on a neutral badge', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: [{ ...mockData[0], status: 'N/A' }] })
    wrap(<TrainingComplianceReportPage />)
    const badge = await screen.findByText('N/A')
    expect(badge).toHaveClass('bg-gray-100')
  })

  it('sums up the members by result and the days by training type', async () => {
    wrap(<TrainingComplianceReportPage />)
    await screen.findByText('Nguyễn Văn A')
    expect(screen.getByTestId('compliance-summary-total')).toHaveTextContent(/^Tổng DQTV\s*3$/)
    expect(screen.getByTestId('compliance-summary-passed')).toHaveTextContent(/^Đạt\s*33%\s*1 người$/)
    expect(screen.getByTestId('compliance-summary-warning')).toHaveTextContent(/^Cảnh báo\s*1$/)
    expect(screen.getByTestId('compliance-summary-failed')).toHaveTextContent(/^Không đạt\s*1$/)

    const byType = screen.getByRole('region', { name: 'Thống kê theo loại huấn luyện (tổng ngày)' })
    expect(within(byType).getAllByTestId(/^compliance-by-type-/).map((item) => item.textContent)).toEqual([
      '14Quân sự', '9Chính trị', '6PCCC', '4Sơ cứu', '2Khác',
    ])
  })

  it('shows "Đang tải..." while the report loads', () => {
    vi.mocked(apiClient.default.get).mockImplementation(() => new Promise(() => {}))
    wrap(<TrainingComplianceReportPage />)
    expect(screen.getByText('Đang tải...')).toBeInTheDocument()
  })

  it('says there is no data and leaves out the summaries for an empty report', async () => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: [] })
    wrap(<TrainingComplianceReportPage />)
    expect(await screen.findByText('Không có dữ liệu')).toBeInTheDocument()
    expect(screen.queryByTestId('compliance-summary-total')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Thống kê theo loại huấn luyện (tổng ngày)' })).not.toBeInTheDocument()
  })

  // Backend codes read through the error table (errors.training.compliance); a 403 without one is a missing permission
  it.each([
    ['a failure', new Error('boom'), 'Không thể tải báo cáo huấn luyện.'],
    ['no_unit_scope', { response: { status: 403, data: { code: 'E003', message: 'no_unit_scope', statusCode: 403 } } }, 'Tài khoản của bạn chưa được gán đơn vị quản lý.'],
    ['insufficient_role', { response: { status: 403, data: { code: 'E003', message: 'insufficient_role', statusCode: 403 } } }, 'Bạn không có quyền xem báo cáo tuân thủ huấn luyện.'],
    ['a 403 without a known code', { response: { status: 403, data: { code: 'E003', message: 'Forbidden resource', statusCode: 403 } } }, 'Bạn không có quyền thực hiện thao tác này'],
  ])('explains %s of the report', async (_case, error, text) => {
    vi.mocked(apiClient.default.get).mockRejectedValue(error)
    wrap(<TrainingComplianceReportPage />)
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  describe('export', () => {
    function captureDownloads() {
      const names: string[] = []
      URL.createObjectURL = vi.fn(() => 'blob:download')
      URL.revokeObjectURL = vi.fn()
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download)
      })
      return names
    }

    it('tells the user it is preparing the file, downloads it, then reminds them to sign it', async () => {
      const names = captureDownloads()
      let finish: (value: unknown) => void = () => undefined
      answer({ '/training/export': () => new Promise((resolve) => { finish = resolve }) })
      wrap(<TrainingComplianceReportPage />)
      const exportButton = screen.getByTestId('export-btn')
      await waitFor(() => expect(exportButton).not.toBeDisabled())

      fireEvent.click(exportButton)
      expect(await screen.findByText('Đang tạo báo cáo...')).toBeInTheDocument()
      await waitFor(() => expect(exportButton).toHaveTextContent('Đang xuất...'))
      expect(apiClient.default.get).toHaveBeenCalledWith('/training/export', { params: { year: vietnamYear() }, responseType: 'blob' })
      expect(screen.queryByText('File đã tải xuống. In và ký tay trước khi nộp.')).not.toBeInTheDocument()

      finish({ data: new Blob(['xlsx']) })
      expect(await screen.findByText('File đã tải xuống. In và ký tay trước khi nộp.')).toBeInTheDocument()
      expect(exportButton).toHaveTextContent('Xuất báo cáo')
      expect(names).toEqual([`tuan-thu-huan-luyen-${vietnamYear()}.xlsx`])
    })

    // The JSON error inside a blob answer, read through the error table (errors.training.compliance)
    const blobError = (status: number, body: Record<string, unknown>) => ({
      response: { status, data: new Blob([JSON.stringify(body)], { type: 'application/json' }) },
    })

    it.each([
      ['a failure', blobError(500, { message: 'Internal server error' }), 'Không thể xuất báo cáo huấn luyện.'],
      ['insufficient_role', blobError(403, { code: 'E003', message: 'insufficient_role', statusCode: 403 }), 'Bạn không có quyền xem báo cáo tuân thủ huấn luyện.'],
      ['no_unit_scope', blobError(403, { code: 'E003', message: 'no_unit_scope', statusCode: 403 }), 'Tài khoản của bạn chưa được gán đơn vị quản lý.'],
      ['a 403 without a known code', blobError(403, { code: 'E003', message: 'Forbidden resource', statusCode: 403 }), 'Bạn không có quyền thực hiện thao tác này'],
    ])('explains %s of the export and does not claim a download', async (_case, error, text) => {
      const names = captureDownloads()
      answer({ '/training/export': () => Promise.reject(error) })
      wrap(<TrainingComplianceReportPage />)
      const exportButton = screen.getByTestId('export-btn')
      await waitFor(() => expect(exportButton).not.toBeDisabled())

      fireEvent.click(exportButton)
      expect(await screen.findByText(text)).toBeInTheDocument()
      expect(screen.queryByText('File đã tải xuống. In và ký tay trước khi nộp.')).not.toBeInTheDocument()
      expect(exportButton).toHaveTextContent('Xuất báo cáo')
      expect(names).toEqual([])
    })
  })

  // Every text comes from reports.json (reports.trainingCompliance)
  describe('texts from reports.trainingCompliance', () => {
    it('reads the header, filters, columns, results and summaries by key', async () => {
      wrap(<TrainingComplianceReportPage />)
      expect(screen.getByRole('heading', { name: t('reports.trainingCompliance.header.title') })).toBeInTheDocument()
      expect(screen.getByText(t('reports.trainingCompliance.header.subtitle'))).toBeInTheDocument()
      expect(screen.getByTestId('export-btn')).toHaveTextContent(t('reports.trainingCompliance.export.idle'))
      expect(within(screen.getByLabelText(t('reports.trainingCompliance.filters.unit'))).getByRole('option', {
        name: t('reports.trainingCompliance.filters.area', { number: 3 }),
      })).toHaveValue('KP3')
      expect(screen.getByLabelText(t('reports.trainingCompliance.filters.year'))).toBeInTheDocument()

      const table = await screen.findByRole('table')
      await within(table).findByText('Nguyễn Văn A')
      const columns = ['index', 'fullName', 'militiaCode', 'unit', 'military', 'political', 'fire', 'firstAid', 'other', 'total', 'result'] as const
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
        columns.map((column) => t(`reports.trainingCompliance.columns.${column}`)),
      )
      expect(within(table).getByText(t('reports.trainingCompliance.status.pass'))).toHaveClass('bg-green-100')
      expect(within(table).getByText(t('reports.trainingCompliance.status.warning'))).toHaveClass('bg-yellow-100')
      expect(within(table).getByText(t('reports.trainingCompliance.status.fail'))).toHaveClass('bg-red-100')

      expect(screen.getByTestId('compliance-summary-total')).toHaveTextContent(t('reports.trainingCompliance.summary.total'))
      expect(screen.getByTestId('compliance-summary-passed')).toHaveTextContent(
        `${t('reports.trainingCompliance.summary.passed')}${t('reports.trainingCompliance.summary.percent', { value: 33 })}${t('reports.trainingCompliance.summary.passedCount', { count: 1 })}`,
      )
      expect(screen.getByTestId('compliance-summary-warning')).toHaveTextContent(t('reports.trainingCompliance.summary.warning'))
      expect(screen.getByTestId('compliance-summary-failed')).toHaveTextContent(t('reports.trainingCompliance.summary.failed'))
      expect(screen.getByRole('region', { name: t('reports.trainingCompliance.byType.title') })).toBeInTheDocument()
    })

    it('reads the load error and the export notices by key', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:download')
      URL.revokeObjectURL = vi.fn()
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      answer({
        '/training/export': () => Promise.resolve({ data: new Blob(['xlsx']) }),
      })
      wrap(<TrainingComplianceReportPage />)
      const exportButton = screen.getByTestId('export-btn')
      await waitFor(() => expect(exportButton).not.toBeDisabled())
      fireEvent.click(exportButton)
      expect(await screen.findByText(t('reports.trainingCompliance.export.pending'))).toBeInTheDocument()
      expect(await screen.findByText(t('reports.trainingCompliance.export.success'))).toBeInTheDocument()

      vi.mocked(apiClient.default.get).mockRejectedValue(new Error('boom'))
      fireEvent.change(screen.getByLabelText(t('reports.trainingCompliance.filters.unit')), { target: { value: 'KP6' } })
      expect(await screen.findByText(t('reports.trainingCompliance.load.error'))).toBeInTheDocument()
    })

    it('reads the export failure by key', async () => {
      answer({ '/training/export': () => Promise.reject(new Error('boom')) })
      wrap(<TrainingComplianceReportPage />)
      const exportButton = screen.getByTestId('export-btn')
      await waitFor(() => expect(exportButton).not.toBeDisabled())
      fireEvent.click(exportButton)
      expect(await screen.findByText(t('reports.trainingCompliance.export.error'))).toBeInTheDocument()
    })
  })
})

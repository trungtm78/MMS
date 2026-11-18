import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomReportPage } from './CustomReportPage'
import * as apiClient from '@/api/client'
import { firstDayOfMonthInVietnam, todayInVietnam } from '@/lib/dates'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('sonner', () => ({ toast }))

// custom-report.definitions.ts ReportColumn
interface Column { key: string; label: string; type: 'text' | 'number' | 'percent' | 'currency' | 'date' }

const ATTENDANCE_MEASURES: Column[] = [
  { key: 'records', label: 'Số lượt chấm công', type: 'number' },
  { key: 'workHours', label: 'Tổng giờ công', type: 'number' },
  { key: 'attendanceRate', label: 'Tỷ lệ có mặt (%)', type: 'percent' },
]

/** GET /reports/custom answer (custom-reports.service.ts CustomReportResult), the summary of attendance by default */
function report(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'attendance',
    title: 'Báo cáo chấm công',
    from: '2026-09-01',
    to: '2026-09-14',
    unitCode: null,
    groupBy: 'none',
    status: null,
    generatedAt: '2026-09-14T03:05:00.000Z',
    columns: ATTENDANCE_MEASURES,
    rows: [{ records: 1250, workHours: 9876.5, attendanceRate: 87.5 }],
    rowCount: 1,
    rowLimit: 500,
    truncated: false,
    summary: [
      { key: 'records', label: 'Số lượt chấm công', value: 1250 },
      { key: 'workHours', label: 'Tổng giờ công', value: 9876.5 },
      { key: 'attendanceRate', label: 'Tỷ lệ có mặt (%)', value: 87.5 },
    ],
    ...overrides,
  }
}

const mau03Bc = {
  year: 2026,
  unitCode: null,
  militia: { totalActive: 41, totalInactive: 7, totalFemale: 5 },
  training: { trainedCount: 33, totalTrainingDays: 12 },
  discipline: { rewardCount: 4, disciplineCount: 1 },
  budget: { totalSalary: 1500000 },
  generatedAt: '2026-04-20T08:00:00Z',
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

/** Answers GET by URL; any URL not listed resolves with the default report */
function answer(byUrl: Record<string, () => Promise<unknown>>) {
  vi.mocked(apiClient.default.get).mockImplementation((url: string) =>
    (byUrl[url] ?? (() => Promise.resolve({ data: report() })))() as never,
  )
}

/** Captures browser downloads: the anchor file names */
function captureDownloads() {
  const names: string[] = []
  URL.createObjectURL = vi.fn(() => 'blob:download')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download)
  })
  return { names }
}

const options = (select: HTMLElement) =>
  within(select).getAllByRole('option').map((o) => [(o as HTMLOptionElement).value, o.textContent])

const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent)

async function generate() {
  fireEvent.click(screen.getByTestId('generate-btn'))
  return screen.findByTestId('custom-report-result')
}

describe('CustomReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockReset()
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: report() })
    toast.error.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders heading', () => {
    wrap(<CustomReportPage />)
    expect(screen.getByTestId('custom-report-page')).toBeInTheDocument()
    expect(screen.getByText('Báo Cáo Tùy Chỉnh')).toBeInTheDocument()
  })

  it('renders report type selector and generate button', () => {
    wrap(<CustomReportPage />)
    expect(screen.getByTestId('report-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('generate-btn')).toBeInTheDocument()
  })

  it('labels the report parameters', () => {
    wrap(<CustomReportPage />)
    expect(screen.getByText('Tạo báo cáo theo khoảng thời gian và loại dữ liệu')).toBeInTheDocument()
    expect(screen.getByText('Tham số báo cáo')).toBeInTheDocument()
    expect(options(screen.getByLabelText('Loại báo cáo'))).toEqual([
      ['attendance', 'Chấm công'], ['tasks', 'Nhiệm vụ'], ['kpi', 'KPI & Hiệu suất'], ['payroll', 'Lương & Phụ cấp'],
    ])
    expect(screen.getByLabelText('Từ ngày')).toHaveValue(firstDayOfMonthInVietnam())
    expect(screen.getByLabelText('Đến ngày')).toHaveValue(todayInVietnam())
    expect(screen.getByLabelText('Mã đơn vị')).toHaveAttribute('placeholder', 'VD: KP1')
    expect(screen.getByTestId('generate-btn')).toHaveTextContent('Tạo báo cáo')
  })

  describe('group-by and status choices', () => {
    it.each([
      ['attendance',
        [['none', 'Không nhóm'], ['unit', 'Đơn vị'], ['member', 'DQTV'], ['day', 'Ngày'], ['month', 'Tháng'], ['status', 'Trạng thái']],
        [['', 'Tất cả'], ['present', 'Có mặt'], ['late', 'Đi muộn'], ['early_leave', 'Về sớm'], ['absent', 'Vắng']]],
      ['tasks',
        [['none', 'Không nhóm'], ['unit', 'Đơn vị'], ['day', 'Ngày'], ['month', 'Tháng'], ['status', 'Trạng thái'], ['type', 'Loại nhiệm vụ'], ['priority', 'Mức độ ưu tiên'], ['assignee', 'Người thực hiện']],
        [['', 'Tất cả'], ['pending', 'Chờ giao'], ['assigned', 'Đã giao'], ['in_progress', 'Đang thực hiện'], ['completed', 'Hoàn thành'], ['cancelled', 'Đã hủy'], ['overdue', 'Quá hạn']]],
      ['kpi',
        [['none', 'Không nhóm'], ['unit', 'Đơn vị'], ['member', 'DQTV'], ['month', 'Tháng'], ['status', 'Trạng thái']],
        [['', 'Tất cả'], ['reward', 'Khen thưởng'], ['maintain', 'Duy trì'], ['training', 'Bồi dưỡng thêm'], ['warning', 'Nhắc nhở'], ['discipline', 'Xem xét kỷ luật']]],
      ['payroll',
        [['none', 'Không nhóm'], ['unit', 'Đơn vị'], ['member', 'DQTV'], ['month', 'Tháng'], ['status', 'Trạng thái']],
        [['', 'Tất cả'], ['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối']]],
    ])('offers exactly the values of %s', (dataset, groupings, statuses) => {
      wrap(<CustomReportPage />)
      fireEvent.change(screen.getByLabelText('Loại báo cáo'), { target: { value: dataset } })
      expect(options(screen.getByLabelText('Nhóm theo'))).toEqual(groupings)
      expect(options(screen.getByLabelText('Trạng thái'))).toEqual(statuses)
    })

    it('resets the choices the new dataset does not accept and keeps the others', () => {
      wrap(<CustomReportPage />)
      const dataset = screen.getByLabelText('Loại báo cáo')
      const groupBy = screen.getByLabelText('Nhóm theo')
      const status = screen.getByLabelText('Trạng thái')

      fireEvent.change(dataset, { target: { value: 'tasks' } })
      fireEvent.change(groupBy, { target: { value: 'assignee' } })
      fireEvent.change(status, { target: { value: 'pending' } })
      fireEvent.change(dataset, { target: { value: 'payroll' } })
      expect(groupBy).toHaveValue('none')
      expect(status).toHaveValue('pending')

      fireEvent.change(groupBy, { target: { value: 'month' } })
      fireEvent.change(status, { target: { value: 'approved' } })
      fireEvent.change(dataset, { target: { value: 'attendance' } })
      expect(groupBy).toHaveValue('month')
      expect(status).toHaveValue('')
    })
  })

  it('asks for the chosen dataset, breakdown, status and unit', async () => {
    wrap(<CustomReportPage />)
    fireEvent.change(screen.getByLabelText('Loại báo cáo'), { target: { value: 'payroll' } })
    fireEvent.change(screen.getByLabelText('Nhóm theo'), { target: { value: 'month' } })
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'approved' } })
    fireEvent.change(screen.getByLabelText('Mã đơn vị'), { target: { value: 'KP1' } })
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-08-31' } })
    fireEvent.click(screen.getByTestId('generate-btn'))
    await waitFor(() =>
      expect(apiClient.default.get).toHaveBeenCalledWith('/reports/custom', {
        params: { dataset: 'payroll', from: '2026-07-01', to: '2026-08-31', groupBy: 'month', status: 'approved', unitCode: 'KP1' },
      }),
    )
  })

  it('shows the report heading, period and the summary with its own labels by key', async () => {
    answer({
      '/reports/custom': () => Promise.resolve({
        data: report({
          summary: [
            { key: 'records', label: 'records (server label)', value: 1250 },
            { key: 'workHours', label: 'Tổng giờ công', value: 9876.5 },
            { key: 'attendanceRate', label: 'Tỷ lệ có mặt (%)', value: 87.5 },
            { key: 'overtimeHours', label: 'Giờ làm thêm', value: null },
          ],
        }),
      }),
    })
    wrap(<CustomReportPage />)
    const result = await generate()

    expect(within(result).getByRole('heading', { name: 'Báo cáo chấm công' })).toBeInTheDocument()
    expect(within(result).getByText('Từ 01/09/2026 đến 14/09/2026 · Toàn phường')).toBeInTheDocument()
    expect(within(result).getByText('Tạo lúc 10:05 ngày 14/09/2026')).toBeInTheDocument()
    const summary = within(result).getByRole('region', { name: 'Tổng hợp' })
    expect(within(summary).getByTestId('summary-records')).toHaveTextContent(/^Số lượt chấm công\s*1\.250$/)
    expect(within(summary).getByTestId('summary-workHours')).toHaveTextContent(/^Tổng giờ công\s*9\.876,5$/)
    expect(within(summary).getByTestId('summary-attendanceRate')).toHaveTextContent(/^Tỷ lệ có mặt \(%\)\s*87,5%$/)
    // A measure the page does not know keeps the backend label
    expect(within(summary).getByTestId('summary-overtimeHours')).toHaveTextContent(/^Giờ làm thêm\s*—$/)
    // No breakdown was asked for
    expect(within(result).queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders the breakdown formatted by column type and warns when it was cut', async () => {
    answer({
      '/reports/custom': () => Promise.resolve({
        data: report({
          dataset: 'payroll',
          title: 'Báo cáo lương & phụ cấp',
          unitCode: 'KP1',
          groupBy: 'month',
          status: 'approved',
          columns: [
            { key: 'month', label: 'Tháng', type: 'text' },
            { key: 'members', label: 'Số DQTV', type: 'number' },
            { key: 'netSalary', label: 'net (server label)', type: 'currency' },
            { key: 'bonusNote', label: 'Ghi chú thưởng', type: 'text' },
          ],
          rows: [
            { month: '2026-08', members: 1200, netSalary: 18500000, bonusNote: 'Đợt 1' },
            { month: '2026-09', members: 11, netSalary: null, bonusNote: null },
          ],
          rowCount: 2,
          rowLimit: 2,
          truncated: true,
          summary: [{ key: 'netSalary', label: 'Thực lĩnh', value: 18500000 }],
        }),
      }),
    })
    wrap(<CustomReportPage />)
    const result = await generate()

    expect(within(result).getByRole('heading', { name: 'Báo cáo lương & phụ cấp' })).toBeInTheDocument()
    expect(within(result).getByText('Từ 01/09/2026 đến 14/09/2026 · Đơn vị KP1')).toBeInTheDocument()
    expect(within(result).getByTestId('summary-netSalary')).toHaveTextContent(/^Thực lĩnh\s*18\.500\.000 đ$/)
    const table = within(result).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Tháng', 'Số DQTV', 'Thực lĩnh', 'Ghi chú thưởng'])
    const [, first, second] = within(table).getAllByRole('row')
    expect(cells(first)).toEqual(['2026-08', '1.200', '18.500.000 đ', 'Đợt 1'])
    expect(cells(second)).toEqual(['2026-09', '11', '—', '—'])
    expect(within(result).getByRole('status')).toHaveTextContent('Chỉ hiển thị 2 dòng đầu (giới hạn 2 dòng). Hãy thu hẹp bộ lọc để xem đầy đủ.')
  })

  it('formats date and percent columns and shows no cut notice for a full breakdown', async () => {
    answer({
      '/reports/custom': () => Promise.resolve({
        data: report({
          dataset: 'tasks',
          title: 'Báo cáo nhiệm vụ',
          groupBy: 'day',
          columns: [
            { key: 'date', label: 'Ngày', type: 'date' },
            { key: 'completionRate', label: 'Tỷ lệ hoàn thành (%)', type: 'percent' },
          ],
          rows: [{ date: '2026-09-02', completionRate: 66.7 }],
          summary: [],
        }),
      }),
    })
    wrap(<CustomReportPage />)
    const result = await generate()
    const [, row] = within(result).getAllByRole('row')
    expect(cells(row)).toEqual(['02/09/2026', '66,7%'])
    expect(within(result).queryByRole('status')).not.toBeInTheDocument()
  })

  it('says a breakdown without rows has no data', async () => {
    answer({ '/reports/custom': () => Promise.resolve({ data: report({ groupBy: 'unit', rows: [], rowCount: 0 }) }) })
    wrap(<CustomReportPage />)
    const result = await generate()
    expect(within(result).getByText('Không có dữ liệu')).toBeInTheDocument()
  })

  it('shows "Đang tạo..." while the report is generated', async () => {
    answer({ '/reports/custom': () => new Promise(() => {}) })
    wrap(<CustomReportPage />)
    fireEvent.click(screen.getByTestId('generate-btn'))
    await waitFor(() => expect(screen.getByTestId('generate-btn')).toHaveTextContent('Đang tạo...'))
  })

  it('says the report could not be generated', async () => {
    answer({ '/reports/custom': () => Promise.reject(new Error('boom')) })
    wrap(<CustomReportPage />)
    fireEvent.click(screen.getByTestId('generate-btn'))
    expect(await screen.findByText('Không thể tạo báo cáo. Vui lòng thử lại.')).toBeInTheDocument()
  })

  it('says the user may not read the report on 403', async () => {
    answer({
      '/reports/custom': () => Promise.reject({ response: { status: 403, data: { code: 'E003', message: 'insufficient_role', statusCode: 403 } } }),
    })
    wrap(<CustomReportPage />)
    fireEvent.click(screen.getByTestId('generate-btn'))
    expect(await screen.findByText('Bạn không có quyền thực hiện thao tác này')).toBeInTheDocument()
  })

  // Backend codes read through the error table (errors.reports.custom): definition and range codes
  // answer as the message, the query's own codes as the messages of a validation_failed answer
  describe('backend codes when generating', () => {
    const rejectWith = (data: Record<string, unknown>) => () =>
      Promise.reject({ response: { status: 400, data: { code: 'E001', statusCode: 400, ...data } } })

    it.each([
      ['a definition code', { message: 'group_by_not_supported' }, 'Loại báo cáo này không hỗ trợ cách nhóm đã chọn.'],
      ['a range code', { message: 'date_range_too_long' }, 'Khoảng thời gian tối đa là 366 ngày.'],
      ['a query code in validation_failed', { message: 'validation_failed', errors: ['invalid_unit_code'] }, 'Mã đơn vị không hợp lệ.'],
      ['several query codes, each once', { message: 'validation_failed', errors: ['invalid_date', 'invalid_date', 'invalid_limit'] }, 'Ngày không hợp lệ. Số dòng tối đa phải từ 1 đến 5000.'],
      ['a validation message outside the table', { message: 'validation_failed', errors: ['property type should not exist'] }, 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (property type should not exist)'],
    ])('explains %s', async (_family, data, text) => {
      answer({ '/reports/custom': rejectWith(data) })
      wrap(<CustomReportPage />)
      fireEvent.click(screen.getByTestId('generate-btn'))
      expect(await screen.findByText(text)).toBeInTheDocument()
    })
  })

  describe('Excel export', () => {
    it('downloads the backend workbook for the same parameters', async () => {
      const downloads = captureDownloads()
      let finishExport: (value: unknown) => void = () => undefined
      answer({ '/reports/custom/export': () => new Promise((resolve) => { finishExport = resolve }) })
      wrap(<CustomReportPage />)
      fireEvent.change(screen.getByLabelText('Nhóm theo'), { target: { value: 'unit' } })
      fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'late' } })
      await generate()

      const exportButton = screen.getByTestId('export-btn')
      expect(exportButton).toHaveTextContent('Xuất Excel')
      fireEvent.click(exportButton)
      await waitFor(() => expect(exportButton).toHaveTextContent('Đang xuất...'))
      expect(exportButton).toBeDisabled()
      expect(apiClient.default.get).toHaveBeenCalledWith('/reports/custom/export', {
        params: { dataset: 'attendance', from: firstDayOfMonthInVietnam(), to: todayInVietnam(), groupBy: 'unit', status: 'late' },
        responseType: 'blob',
      })

      finishExport({ data: new Blob(['xlsx']) })
      await waitFor(() => expect(exportButton).toHaveTextContent('Xuất Excel'))
      expect(downloads.names).toEqual(['BaoCao_attendance_2026-09-01_2026-09-14.xlsx'])
      expect(toast.error).not.toHaveBeenCalled()
    })

    // The JSON error inside a blob answer, read through the error table (errors.reports.custom)
    it.each([
      ['a query code in validation_failed', 400, { message: 'validation_failed', errors: ['invalid_limit'] }, 'Số dòng tối đa phải từ 1 đến 5000.'],
      ['a definition code', 400, { message: 'status_not_supported' }, 'Loại báo cáo này không hỗ trợ trạng thái đã chọn.'],
      ['a 403 answer', 403, { message: 'insufficient_role' }, 'Bạn không có quyền thực hiện thao tác này'],
    ])('explains %s of the export', async (_family, status, data, text) => {
      captureDownloads()
      const body = JSON.stringify({ code: 'E001', statusCode: status, ...data })
      answer({
        '/reports/custom/export': () => Promise.reject({ response: { status, data: new Blob([body], { type: 'application/json' }) } }),
      })
      wrap(<CustomReportPage />)
      await generate()
      fireEvent.click(screen.getByTestId('export-btn'))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(text))
      expect(screen.getByTestId('export-btn')).toHaveTextContent('Xuất Excel')
    })

    it('tells the user when the export fails', async () => {
      captureDownloads()
      answer({ '/reports/custom/export': () => Promise.reject(new Error('boom')) })
      wrap(<CustomReportPage />)
      await generate()
      fireEvent.click(screen.getByTestId('export-btn'))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể xuất báo cáo.'))
    })
  })

  describe('statutory reports', () => {
    it('lists the statutory report forms', () => {
      wrap(<CustomReportPage />)
      expect(screen.getByText('Báo cáo pháp định')).toBeInTheDocument()
      expect(screen.getByText('Theo TT 144/2014/TT-BQP')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Mẫu 03-BC\s*Báo cáo tháng dân quân tự vệ/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Mẫu huấn luyện\s*Kết quả huấn luyện định kỳ/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Mẫu khen thưởng-kỷ luật\s*Đề nghị khen thưởng \/ kỷ luật/ })).toBeInTheDocument()
    })

    it('opens the Mẫu 03-BC figures for the chosen year and unit', async () => {
      answer({ '/reports/mau-03-bc': () => Promise.resolve({ data: mau03Bc }) })
      wrap(<CustomReportPage />)
      fireEvent.click(screen.getByRole('button', { name: /Mẫu 03-BC/ }))

      expect(await screen.findByText('I. Quân số')).toBeInTheDocument()
      const figure = (value: string) => screen.getByText(value).closest('p')
      expect(figure('41')).toHaveTextContent('Hiện dịch: 41')
      expect(figure('7')).toHaveTextContent('Dự bị: 7')
      expect(figure('5')).toHaveTextContent('Nữ: 5')
      expect(screen.getByText('II. Huấn luyện')).toBeInTheDocument()
      expect(figure('33')).toHaveTextContent('Lượt: 33')
      expect(figure('12')).toHaveTextContent('Ngày: 12')
      expect(screen.getByText('III. Kỷ luật')).toBeInTheDocument()
      expect(figure('4')).toHaveTextContent('Khen thưởng: 4')
      expect(figure('1')).toHaveTextContent('Kỷ luật: 1')
      expect(screen.getByText('IV. Kinh phí')).toBeInTheDocument()
      expect(figure('1.500.000 đ')).toHaveTextContent('Lương: 1.500.000 đ')

      fireEvent.change(screen.getByLabelText('Năm'), { target: { value: '2025' } })
      const unit = screen.getByLabelText('Mã đơn vị (tuỳ chọn)')
      expect(unit).toHaveAttribute('placeholder', 'VD: DV01')
      fireEvent.change(unit, { target: { value: 'DV01' } })
      await waitFor(() =>
        expect(apiClient.default.get).toHaveBeenCalledWith('/reports/mau-03-bc', { params: { year: '2025', unitCode: 'DV01' } }),
      )
    })

    // COUNT figures are integers; SUM over training_records.total_days (NUMERIC(5,1)) and over
    // payroll net salaries arrive as JSON numbers and keep their decimals (pg-types.ts)
    it('shows half training days, counts and the salary in Vietnamese number format', async () => {
      answer({
        '/reports/mau-03-bc': () => Promise.resolve({
          data: {
            ...mau03Bc,
            militia: { totalActive: 1250, totalInactive: 7, totalFemale: 5 },
            training: { trainedCount: 1200, totalTrainingDays: 12.5 },
            budget: { totalSalary: 1500000.5 },
          },
        }),
      })
      wrap(<CustomReportPage />)
      fireEvent.click(screen.getByRole('button', { name: /Mẫu 03-BC/ }))

      const figure = async (value: string) => (await screen.findByText(value)).closest('p')
      expect(await figure('12,5')).toHaveTextContent('Ngày: 12,5')
      expect(await figure('1.200')).toHaveTextContent('Lượt: 1.200')
      expect(await figure('1.250')).toHaveTextContent('Hiện dịch: 1.250')
      expect(await figure('1.500.000,5 đ')).toHaveTextContent('Lương: 1.500.000,5 đ')
    })

    it('downloads the Mẫu 03-BC workbook', async () => {
      const downloads = captureDownloads()
      let finishExport: (value: unknown) => void = () => undefined
      answer({
        '/reports/mau-03-bc': () => Promise.resolve({ data: mau03Bc }),
        '/reports/mau-03-bc/export': () => new Promise((resolve) => { finishExport = resolve }),
      })
      wrap(<CustomReportPage />)
      fireEvent.click(screen.getByRole('button', { name: /Mẫu 03-BC/ }))
      await screen.findByText('I. Quân số')
      fireEvent.change(screen.getByLabelText('Năm'), { target: { value: '2025' } })
      const exportButton = screen.getByTestId('mau03bc-export-btn')
      await waitFor(() => expect(exportButton).not.toBeDisabled())
      expect(exportButton).toHaveTextContent('Xuất Excel')

      fireEvent.click(exportButton)
      await waitFor(() => expect(exportButton).toHaveTextContent('Đang xuất...'))
      finishExport({ data: new Blob(['xlsx']) })
      await waitFor(() => expect(exportButton).toHaveTextContent('Xuất Excel'))
      expect(downloads.names).toEqual(['Mau03BC_2025.xlsx'])
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('tells the user when the Mẫu 03-BC export fails', async () => {
      answer({
        '/reports/mau-03-bc': () => Promise.resolve({ data: mau03Bc }),
        '/reports/mau-03-bc/export': () => Promise.reject(new Error('boom')),
      })
      wrap(<CustomReportPage />)
      fireEvent.click(screen.getByRole('button', { name: /Mẫu 03-BC/ }))
      await screen.findByText('I. Quân số')
      fireEvent.click(screen.getByTestId('mau03bc-export-btn'))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể xuất Mẫu 03-BC'))
      expect(screen.getByTestId('mau03bc-export-btn')).toHaveTextContent('Xuất Excel')
    })
  })

  describe('default period', () => {
    const tz = process.env.TZ
    afterEach(() => {
      vi.useRealTimers()
      process.env.TZ = tz
    })

    // A browser in Vietnam at 01:30 on 1 September (18:30 UTC on 31 August)
    it('runs from the first of the Vietnamese month to today in Vietnam', async () => {
      process.env.TZ = 'Asia/Ho_Chi_Minh'
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-31T18:30:00.000Z'))
      wrap(<CustomReportPage />)

      expect(screen.getAllByDisplayValue('2026-09-01')).toHaveLength(2)
      fireEvent.click(screen.getByTestId('generate-btn'))
      await waitFor(() =>
        expect(apiClient.default.get).toHaveBeenCalledWith('/reports/custom', {
          params: { dataset: 'attendance', from: '2026-09-01', to: '2026-09-01', groupBy: 'none' },
        }),
      )
    })
  })
})

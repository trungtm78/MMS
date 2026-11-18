import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AttendanceReportPage } from './AttendanceReportPage'

// Only the HTTP layer is replaced
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

// GET /attendance rows
interface AttendanceRow {
  id: string
  militiaId: string
  militiaName: string
  militiaCode: string
  workDate: string
  status: string
  checkinAt: string | null
  checkoutAt: string | null
  workHours: number | null
  source: string
}

const records: AttendanceRow[] = [
  { id: 'a1', militiaId: 'm1', militiaName: 'Nguyễn Văn A', militiaCode: 'DQTV001', workDate: '2026-04-18', status: 'checked_in', checkinAt: '2026-04-18T07:00:00Z', checkoutAt: null, workHours: null, source: 'manual' },
  { id: 'a2', militiaId: 'm2', militiaName: 'Trần Thị B', militiaCode: 'DQTV002', workDate: '2026-04-18', status: 'absent', checkinAt: null, checkoutAt: null, workHours: null, source: 'manual' },
]

const listResponse = (data: AttendanceRow[], total = data.length) => ({ data: { data, total, page: 1, limit: 20 } })

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

describe('AttendanceReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(listResponse(records))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders page with date filter', () => {
    renderWithQuery(<AttendanceReportPage />)
    expect(screen.getByTestId('date-filter')).toBeInTheDocument()
    expect(screen.getByText('Báo Cáo Điểm Danh')).toBeInTheDocument()
  })

  it('renders attendance table with data', async () => {
    renderWithQuery(<AttendanceReportPage />)
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getByText('DQTV001')).toBeInTheDocument()
  })

  it('shows stats for present and absent counts', async () => {
    renderWithQuery(<AttendanceReportPage />)
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getAllByText('Có mặt').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vắng mặt').length).toBeGreaterThan(0)
  })

  it('renders export button', () => {
    renderWithQuery(<AttendanceReportPage />)
    expect(screen.getByTestId('export-btn')).toBeInTheDocument()
    expect(screen.getByText('Xuất Excel')).toBeInTheDocument()
  })

  it('export button is not disabled on initial render', () => {
    renderWithQuery(<AttendanceReportPage />)
    expect(screen.getByTestId('export-btn')).not.toBeDisabled()
  })

  it('names the statuses, the columns and the record count', async () => {
    api.get.mockResolvedValue(
      listResponse([...records, { ...records[0], id: 'a3', militiaCode: 'DQTV003', status: 'on_duty', workHours: 8 }]),
    )
    renderWithQuery(<AttendanceReportPage />)

    expect(await screen.findByText('Đã điểm danh')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Họ và tên' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Số giờ' })).toBeInTheDocument()
    // A status the page does not know is shown as it is
    expect(screen.getByText('on_duty')).toBeInTheDocument()
    expect(screen.getByText('8h')).toBeInTheDocument()
    expect(screen.getByTestId('attendance-total')).toHaveTextContent('Tổng 3 bản ghi')
  })

  it('says when nobody has attendance on the day', async () => {
    api.get.mockResolvedValue(listResponse([]))
    renderWithQuery(<AttendanceReportPage />)
    expect(await screen.findByText('Không có dữ liệu điểm danh cho ngày này')).toBeInTheDocument()
  })

  it('pages through the records', async () => {
    api.get.mockResolvedValue(listResponse(records, 25))
    const user = userEvent.setup()
    renderWithQuery(<AttendanceReportPage />)
    await screen.findByText('Nguyễn Văn A')

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/attendance', { params: expect.objectContaining({ page: 2, limit: 20 }) }),
    )
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
  })

  it('exports the day as CSV with translated headers and statuses', async () => {
    const blobs: Blob[] = []
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob)
        return 'blob:download'
      }),
      revokeObjectURL: vi.fn(),
    })
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    const user = userEvent.setup()
    renderWithQuery(<AttendanceReportPage />)
    await screen.findByText('Nguyễn Văn A')

    await user.click(screen.getByTestId('export-btn'))

    await waitFor(() => expect(blobs).toHaveLength(1))
    expect(api.get).toHaveBeenCalledWith('/attendance', { params: expect.objectContaining({ page: 1, limit: 1000 }) })
    expect(names[0]).toMatch(/^diem-danh-\d{4}-\d{2}-\d{2}\.csv$/)
    const csv = await readBlob(blobs[0])
    expect(csv).toContain('"Mã DQTV","Họ và tên","Trạng thái","Giờ vào","Giờ ra","Số giờ"')
    expect(csv).toContain('"DQTV002","Trần Thị B","Vắng mặt","—","—","—"')
  })

  describe('default day', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    // 18:30 UTC on 31 August is already 01:30 on 1 September in Vietnam
    it('starts on today in Vietnam, not the UTC day', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-31T18:30:00.000Z'))
      renderWithQuery(<AttendanceReportPage />)
      expect(screen.getByTestId('date-filter')).toHaveValue('2026-09-01')
    })
  })
})

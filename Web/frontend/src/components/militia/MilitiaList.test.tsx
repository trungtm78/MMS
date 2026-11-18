import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MilitiaList } from './MilitiaList'
import * as militiaApi from '@/api/militia'
import { exportCsv } from '@/utils/csv-export'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/api/militia', () => ({
  searchMilitia: vi.fn(),
}))

vi.mock('@/utils/csv-export', () => ({
  exportCsv: vi.fn(),
}))

const mockData = {
  data: [
    {
      id: 'uuid-1',
      militiaCode: 'DQTV001',
      fullName: 'Nguyễn Văn Minh',
      unitCode: 'KP1',
      unitName: 'Khu phố 1',
      status: 'active',
      phone: '0901234567',
      email: 'minh@test.com',
      rank: 'Chiến sĩ',
      avatarUrl: null,
    },
    {
      id: 'uuid-2',
      militiaCode: 'DQTV002',
      fullName: 'Trần Thanh Tùng',
      unitCode: 'KP2',
      unitName: 'Khu phố 2',
      status: 'reserve',
      phone: null,
      email: null,
      rank: null,
      avatarUrl: null,
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
}

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('MilitiaList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(militiaApi.searchMilitia).mockResolvedValue(mockData)
  })

  it('renders heading', async () => {
    renderWithProviders(<MilitiaList />)
    expect(screen.getByText('Danh sách Dân Quân Tự Vệ')).toBeInTheDocument()
    expect(screen.getByText('Quản lý thông tin toàn bộ dân quân tự vệ')).toBeInTheDocument()
  })

  it('renders militia rows after load', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument()
      expect(screen.getByText('Trần Thanh Tùng')).toBeInTheDocument()
    })
  })

  it('shows status badges', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => {
      expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
      expect(screen.getByText('Dự bị')).toBeInTheDocument()
    })
  })

  it('shows a status it does not know as it is', async () => {
    vi.mocked(militiaApi.searchMilitia).mockResolvedValue({
      ...mockData,
      data: [{ ...mockData.data[0], status: 'suspended' }],
      total: 1,
    })
    renderWithProviders(<MilitiaList />)
    expect(await screen.findByText('suspended')).toBeInTheDocument()
  })

  it('names the filters, the columns and the filter options', async () => {
    renderWithProviders(<MilitiaList />)
    await screen.findByText('Nguyễn Văn Minh')

    expect(screen.getByText('Bộ lọc tìm kiếm')).toBeInTheDocument()
    expect(screen.getByLabelText('Tìm kiếm')).toHaveAttribute('placeholder', 'Tên hoặc mã DQTV...')
    expect(within(screen.getByLabelText('Đơn vị')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả đơn vị', 'Khu phố 1', 'Khu phố 2', 'Khu phố 3', 'Khu phố 4', 'Khu phố 5', 'Khu phố 6',
    ])
    expect(within(screen.getByLabelText('Trạng thái')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả trạng thái', 'Đang hoạt động', 'Dự bị', 'Đã xuất ngũ', 'Nghỉ phép',
    ])
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'STT', 'Mã DQTV', 'Họ và tên', 'Đơn vị', 'Điện thoại', 'Email', 'Trạng thái', 'Thao tác',
    ])
  })

  it("shows each member's phone and email in their own columns", async () => {
    renderWithProviders(<MilitiaList />)
    const row = (await screen.findByText('Nguyễn Văn Minh')).closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells[4]).toBe('0901234567')
    expect(cells[5]).toBe('minh@test.com')
    const empty = (screen.getByText('Trần Thanh Tùng')).closest('tr') as HTMLElement
    expect(within(empty).getAllByRole('cell').map((cell) => cell.textContent).slice(4, 6)).toEqual(['—', '—'])
  })

  it('calls searchMilitia with status filter when changed', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())

    const selects = screen.getAllByRole('combobox')
    // Second select is status filter
    fireEvent.change(selects[1], { target: { value: 'active' } })

    await waitFor(() => {
      expect(vi.mocked(militiaApi.searchMilitia)).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      )
    })
  })

  it('calls searchMilitia with unit filter when changed', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'KP1' } })

    await waitFor(() => {
      expect(vi.mocked(militiaApi.searchMilitia)).toHaveBeenCalledWith(
        expect.objectContaining({ unitCode: 'KP1' }),
      )
    })
  })

  it('calls onViewProfile callback when eye button clicked', async () => {
    const onViewProfile = vi.fn()
    renderWithProviders(<MilitiaList onViewProfile={onViewProfile} />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())

    const eyeButtons = screen.getAllByTitle('Xem chi tiết')
    fireEvent.click(eyeButtons[0])
    expect(onViewProfile).toHaveBeenCalledWith('uuid-1')
    expect(screen.getAllByTitle('Chỉnh sửa')).toHaveLength(2)
  })

  it('opens the profile page when no callback is given', async () => {
    renderWithProviders(<MilitiaList />)
    await screen.findByText('Nguyễn Văn Minh')

    fireEvent.click(screen.getAllByTitle('Xem chi tiết')[1])

    expect(mockNavigate).toHaveBeenCalledWith('/militia/uuid-2')
  })

  it('shows empty state when no results', async () => {
    vi.mocked(militiaApi.searchMilitia).mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 })
    renderWithProviders(<MilitiaList />)
    await waitFor(() => {
      expect(screen.getByText('Chưa có dữ liệu dân quân')).toBeInTheDocument()
    })
    expect(screen.getByText('Nhấn "Thêm DQTV" để bắt đầu')).toBeInTheDocument()
    expect(screen.getByTestId('militia-page-summary')).toHaveTextContent('Không có bản ghi')
  })

  it('suggests changing the filters when a search finds nothing', async () => {
    vi.mocked(militiaApi.searchMilitia).mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 })
    renderWithProviders(<MilitiaList />)
    await screen.findByText('Chưa có dữ liệu dân quân')

    fireEvent.change(screen.getByTestId('militia-search-input'), { target: { value: 'Không ai' } })

    expect(await screen.findByText('Không tìm thấy kết quả phù hợp')).toBeInTheDocument()
    expect(screen.getByText('Thử thay đổi bộ lọc tìm kiếm')).toBeInTheDocument()
    expect(militiaApi.searchMilitia).toHaveBeenCalledWith(expect.objectContaining({ q: 'Không ai', page: 1 }))
  })

  it('tells which rows of how many are shown', async () => {
    renderWithProviders(<MilitiaList />)
    await screen.findByText('Nguyễn Văn Minh')

    expect(screen.getByTestId('militia-page-summary')).toHaveTextContent('Hiển thị 1 đến 2 trong tổng số 2 bản ghi')
    expect(screen.getByTestId('prev-page')).toHaveTextContent('Trước')
    expect(screen.getByTestId('next-page')).toHaveTextContent('Sau')
  })

  it('explains a list that could not be loaded', async () => {
    vi.mocked(militiaApi.searchMilitia).mockRejectedValue(new Error('Request failed with status code 500'))
    renderWithProviders(<MilitiaList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách. Vui lòng thử lại.')
  })

  it('shows Xuất Excel button', () => {
    renderWithProviders(<MilitiaList />)
    expect(screen.getByText('Xuất Excel')).toBeInTheDocument()
  })

  it('exports every matching row with Vietnamese headers and status labels', async () => {
    renderWithProviders(<MilitiaList />)
    await screen.findByText('Nguyễn Văn Minh')
    vi.mocked(militiaApi.searchMilitia).mockResolvedValue({
      ...mockData,
      data: [...mockData.data, { ...mockData.data[1], id: 'uuid-3', militiaCode: 'DQTV003', status: 'suspended' }],
      total: 3,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }))

    await waitFor(() => expect(exportCsv).toHaveBeenCalledTimes(1))
    expect(militiaApi.searchMilitia).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 1000 }))
    const [headers, rows, fileName] = vi.mocked(exportCsv).mock.calls[0]
    expect(headers).toEqual(['Mã DQTV', 'Họ và tên', 'Đơn vị', 'Cấp bậc', 'Điện thoại', 'Trạng thái'])
    expect(rows).toEqual([
      ['DQTV001', 'Nguyễn Văn Minh', 'KP1', 'Chiến sĩ', '0901234567', 'Đang hoạt động'],
      ['DQTV002', 'Trần Thanh Tùng', 'KP2', '', '', 'Dự bị'],
      ['DQTV003', 'Trần Thanh Tùng', 'KP2', '', '', 'suspended'],
    ])
    expect(fileName).toMatch(/^danh-sach-dqtv-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('navigates to /militia/new when Thêm DQTV is clicked', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
    expect(screen.getByTestId('add-militia-btn')).toHaveTextContent('Thêm DQTV')
    fireEvent.click(screen.getByTestId('add-militia-btn'))
    expect(mockNavigate).toHaveBeenCalledWith('/militia/new')
  })
})

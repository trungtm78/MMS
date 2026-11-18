import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MilitiaSearchPage } from './MilitiaSearchPage'

// Only the HTTP layer is replaced
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

// GET /militia (militia.service.ts searchMilitia): active members only, as MilitiaSearchItem rows
const rows = [
  {
    id: 'm1',
    userId: null,
    militiaCode: 'DQTV001',
    fullName: 'Nguyễn Văn A',
    phone: '0901000001',
    rank: 'Tiểu đội trưởng',
    status: 'active',
    unitCode: 'P01',
    unitName: 'Phường 1',
  },
  {
    id: 'm2',
    userId: '7c1b2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
    militiaCode: 'DQTV002',
    fullName: 'Trần Thị B',
    phone: null,
    rank: null,
    status: 'active',
    unitCode: 'P01',
    unitName: 'Phường 1',
  },
]

const pageOf = (data: typeof rows) => ({ data: { data, total: data.length, page: 1, limit: 50 } })

// Body produced by the backend HttpExceptionFilter
const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  response: {
    status,
    data: { code: 'E00x', message, statusCode: status, timestamp: '2026-09-14T03:00:00.000Z', path: '/api/v1/mms_core/militia' },
  },
})

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('MilitiaSearchPage', () => {
  beforeEach(() => {
    // mockReset also drops answers queued with mock*Once by an earlier test
    api.get.mockReset()
    api.get.mockResolvedValue(pageOf(rows))
  })

  it('renders search form', () => {
    renderWithQuery(<MilitiaSearchPage />)
    expect(screen.getByTestId('militia-search-input')).toBeInTheDocument()
    expect(screen.getByTestId('search-btn')).toBeInTheDocument()
    expect(screen.getByTestId('reset-search-btn')).toBeInTheDocument()
  })

  it('does not show results before search', () => {
    renderWithQuery(<MilitiaSearchPage />)
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('names the page, the fields and the buttons', () => {
    renderWithQuery(<MilitiaSearchPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Tìm kiếm Dân Quân Tự Vệ' })).toBeInTheDocument()
    expect(screen.getByText('Tra cứu thông tin dân quân theo nhiều tiêu chí')).toBeInTheDocument()
    expect(screen.getByLabelText('Tìm kiếm nhanh')).toHaveAttribute('placeholder', 'Nhập họ tên, mã DQTV...')
    expect(screen.getByLabelText('Đơn vị')).toHaveAttribute('placeholder', 'Mã đơn vị...')
    expect(screen.getByTestId('reset-search-btn')).toHaveTextContent('Đặt lại')
    expect(screen.getByTestId('search-btn')).toHaveTextContent('Tìm kiếm')
  })

  it('shows results after clicking search', async () => {
    renderWithQuery(<MilitiaSearchPage />)
    await userEvent.click(screen.getByTestId('search-btn'))
    await waitFor(() => screen.getByTestId('search-results'))
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getByText('DQTV001')).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith('/militia', { params: { limit: 50, page: 1, q: '', unitCode: undefined } })
    const results = within(screen.getByTestId('search-results'))
    expect(results.getByRole('heading', { name: 'Kết quả tìm kiếm' })).toBeInTheDocument()
    expect(results.getByText('2 bản ghi')).toBeInTheDocument()
    const first = within(screen.getByTestId('search-result-m1'))
    expect(first.getByText('DQTV001').parentElement).toHaveTextContent('Mã: DQTV001')
    expect(first.getByText('Đang hoạt động')).toBeInTheDocument()
    expect(first.getByText('Phường 1')).toBeInTheDocument()
    expect(first.getByText('Tiểu đội trưởng')).toBeInTheDocument()
    expect(first.getByText('0901000001')).toBeInTheDocument()
    expect(within(screen.getByTestId('search-result-m2')).getAllByText('—')).toHaveLength(2)
  })

  it('searches with Enter within the chosen unit', async () => {
    const user = userEvent.setup()
    renderWithQuery(<MilitiaSearchPage />)

    await user.type(screen.getByTestId('unit-filter-input'), 'KP1')
    await user.type(screen.getByTestId('militia-search-input'), 'Minh{Enter}')

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/militia', { params: { limit: 50, page: 1, q: 'Minh', unitCode: 'KP1' } }),
    )
  })

  it('shows the count as pending while the search runs', async () => {
    api.get.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderWithQuery(<MilitiaSearchPage />)

    await user.click(screen.getByTestId('search-btn'))

    expect(await within(await screen.findByTestId('search-results')).findByText('...')).toBeInTheDocument()
  })

  it('shows empty state when no results', async () => {
    api.get.mockResolvedValue(pageOf([]))
    renderWithQuery(<MilitiaSearchPage />)
    await userEvent.click(screen.getByTestId('search-btn'))
    await waitFor(() => screen.getByTestId('empty-state'))

    expect(screen.getByText('Không tìm thấy kết quả')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng thử lại với từ khóa khác')).toBeInTheDocument()
    expect(screen.getByText('0 bản ghi')).toBeInTheDocument()
  })

  // effectiveUnit() refuses a unit outside the caller's scope and area roles without one
  it.each([
    { status: 403, code: 'unit_scope_violation', message: 'Đơn vị này nằm ngoài phạm vi quản lý của bạn.' },
    { status: 403, code: 'no_unit_scope', message: 'Tài khoản của bạn chưa được gán đơn vị quản lý.' },
    // RolesGuard answers without a code of the table
    { status: 403, code: 'Forbidden resource', message: 'Bạn không có quyền tra cứu DQTV của đơn vị này.' },
    { status: 500, code: 'internal_error', message: 'Không thể tìm kiếm DQTV. Vui lòng thử lại.' },
  ])('explains a failed search ($status $code) instead of showing no results', async ({ status, code, message }) => {
    api.get.mockRejectedValue(httpError(status, code))
    const user = userEvent.setup()
    renderWithQuery(<MilitiaSearchPage />)

    await user.click(screen.getByTestId('search-btn'))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
    expect(screen.queryByText('0 bản ghi')).not.toBeInTheDocument()
  })

  it('resets form on reset button click', async () => {
    renderWithQuery(<MilitiaSearchPage />)
    await userEvent.type(screen.getByTestId('militia-search-input'), 'test')
    await userEvent.click(screen.getByTestId('search-btn'))
    await waitFor(() => screen.getByTestId('search-results'))
    await userEvent.click(screen.getByTestId('reset-search-btn'))
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()
    expect(screen.getByTestId('militia-search-input')).toHaveValue('')
  })
})

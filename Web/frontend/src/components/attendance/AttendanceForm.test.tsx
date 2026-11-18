import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AttendanceForm } from './AttendanceForm'

// Only the HTTP layer is replaced
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

const MILITIA_ID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b'

// GET /militia/search rows
const militia = [
  {
    id: MILITIA_ID,
    userId: null,
    militiaCode: 'DQTV001',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    rank: null,
    status: 'active',
    unitCode: 'KP1',
    unitName: 'Khu phố 1',
  },
]

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

function renderForm(onSuccess?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AttendanceForm onSuccess={onSuccess} />
    </QueryClientProvider>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function chooseMilitia(user: User) {
  const input = screen.getByTestId('smart-select-militia-input')
  await user.click(input)
  await user.type(input, 'Nguyễn')
  await user.click(await screen.findByRole('option', { name: /DQTV001 — Nguyễn Văn A/ }))
}

describe('AttendanceForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: militia })
    api.post.mockResolvedValue({ data: { id: 'att-1' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // work_date is a DATE column: the default is today's day in Vietnam, where the ward operates.
  // 18:30 UTC on 31 August is already 01:30 on 1 September in Vietnam.
  it('defaults the work date to today in Vietnam, not the UTC day', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-31T18:30:00.000Z'))
    renderForm()

    expect(screen.getByTestId('attendance-date-input')).toHaveValue('2026-09-01')
  })

  it('labels the fields and the attendance statuses', () => {
    renderForm()

    expect(screen.getByRole('heading', { name: 'Ghi nhận chấm công' })).toBeInTheDocument()
    expect(screen.getByLabelText('Ngày chấm công *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Tìm theo tên, mã hoặc SĐT...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ghi chú thêm...')).toBeInTheDocument()
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Có mặt', 'Vắng mặt', 'Đi trễ', 'Nửa ngày'])
  })

  it('requires a militia member and a work date', async () => {
    const user = userEvent.setup()
    renderForm()

    fireEvent.change(screen.getByTestId('attendance-date-input'), { target: { value: '' } })
    await user.click(screen.getByTestId('attendance-submit-btn'))

    expect(await screen.findByTestId('smart-select-militia-error')).toHaveTextContent('Vui lòng chọn cán bộ dân quân')
    expect(screen.getByText('Ngày chấm công là bắt buộc')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('records the attendance with POST /attendance', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    renderForm(onSuccess)

    await chooseMilitia(user)
    await user.selectOptions(screen.getByTestId('attendance-status-select'), 'late')
    await user.click(screen.getByTestId('attendance-submit-btn'))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/attendance', expect.objectContaining({ militiaId: MILITIA_ID, status: 'late' })),
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Ghi nhận chấm công thành công'))
    expect(await screen.findByTestId('attendance-create-success')).toHaveTextContent('Ghi nhận chấm công thành công!')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it.each([
    [409, 'attendance_already_recorded', 'Dân quân này đã được chấm công cho ngày đã chọn.'],
    [500, 'internal_error', 'Có lỗi xảy ra. Vui lòng thử lại.'],
  ])('explains HTTP %i %s', async (status, code, message) => {
    api.post.mockRejectedValueOnce(httpError(status, code))
    const user = userEvent.setup()
    renderForm()

    await chooseMilitia(user)
    await user.click(screen.getByTestId('attendance-submit-btn'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
    expect(screen.queryByTestId('attendance-create-success')).not.toBeInTheDocument()
  })

  it('clears the form with Đặt lại', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByPlaceholderText('Ghi chú thêm...'), 'Trực đêm')
    await user.click(screen.getByRole('button', { name: 'Đặt lại' }))

    expect(screen.getByPlaceholderText('Ghi chú thêm...')).toHaveValue('')
  })
})

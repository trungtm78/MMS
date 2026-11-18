import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { MilitiaCreateForm } from './MilitiaCreateForm'

// Only the HTTP layer is replaced: routing, validation and the toasts run for real
const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

// militia.service.ts quickCreate() reads the new row back as a MilitiaSearchItem
const created = {
  id: '5d0c7a8e-3b2f-4c1d-9e8f-7a6b5c4d3e21',
  userId: null,
  militiaCode: 'KP1-001',
  fullName: 'Nguyễn Văn An',
  phone: null,
  rank: null,
  status: 'active',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
}

// Body produced by the backend HttpExceptionFilter
const httpError = (status: number, message: string, errors?: string[]) => ({
  isAxiosError: true,
  response: {
    status,
    data: {
      code: 'E00x',
      message,
      statusCode: status,
      timestamp: '2026-09-14T03:00:00.000Z',
      path: '/api/v1/mms_core/militia/quick-create',
      ...(errors ? { errors } : {}),
    },
  },
})

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/militia/new']}>
        <Routes>
          <Route path="/militia/new" element={<MilitiaCreateForm />} />
          <Route path="/militia" element={<p>Trang danh sách DQTV</p>} />
        </Routes>
        <Toaster theme="light" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, code = 'KP1-001') {
  await user.type(screen.getByTestId('fullName-input'), 'Nguyễn Văn An')
  await user.type(screen.getByTestId('militiaCode-input'), code)
  await user.type(screen.getByTestId('unitCode-input'), 'KP1')
}

async function paste(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) {
  await user.click(input)
  await user.paste(value)
}

describe('MilitiaCreateForm', () => {
  beforeEach(() => {
    // mockReset also drops answers queued with mock*Once by an earlier test
    api.post.mockReset()
    api.post.mockResolvedValue({ data: created })
  })

  describe('rendering', () => {
    it('renders all required fields', () => {
      renderForm()
      expect(screen.getByTestId('fullName-input')).toBeInTheDocument()
      expect(screen.getByTestId('militiaCode-input')).toBeInTheDocument()
      expect(screen.getByTestId('unitCode-input')).toBeInTheDocument()
      expect(screen.getByTestId('submit-btn')).toBeInTheDocument()
    })

    it('renders back button that navigates to /militia', async () => {
      renderForm()
      await userEvent.click(screen.getByTestId('back-btn'))
      expect(await screen.findByText('Trang danh sách DQTV')).toBeInTheDocument()
    })

    it('names the page, the fields and the gender options', () => {
      renderForm()

      expect(screen.getByRole('heading', { level: 1, name: 'Thêm Dân Quân Tự Vệ' })).toBeInTheDocument()
      expect(screen.getByText('Nhập thông tin cơ bản cho thành viên mới')).toBeInTheDocument()
      expect(screen.getByTestId('back-btn')).toHaveAccessibleName('Quay lại danh sách')
      expect(screen.getByLabelText('Họ và tên *')).toHaveAttribute('placeholder', 'Nhập họ tên đầy đủ...')
      expect(screen.getByLabelText('Mã DQTV *')).toHaveAttribute('placeholder', 'VD: HCM-PHD-T12-0001')
      expect(screen.getByLabelText('Đơn vị *')).toHaveAttribute('placeholder', 'VD: KP1')
      expect(screen.getByLabelText('Số điện thoại')).toHaveAttribute('placeholder', '0909xxxxxx')
      expect(screen.getByLabelText('Ngày sinh')).toHaveAttribute('type', 'date')
      expect(within(screen.getByLabelText('Giới tính')).getAllByRole('option').map((o) => o.textContent)).toEqual([
        '-- Chọn giới tính --', 'Nam', 'Nữ',
      ])
      expect(screen.getByTestId('reset-btn')).toHaveTextContent('Đặt lại')
      expect(screen.getByTestId('submit-btn')).toHaveTextContent('Thêm DQTV')
    })
  })

  describe('validation', () => {
    it('shows required errors when submitting empty form', async () => {
      renderForm()
      await userEvent.click(screen.getByTestId('submit-btn'))
      await waitFor(() => {
        expect(screen.getByText(/Họ tên tối thiểu 2 ký tự/i)).toBeInTheDocument()
      })
      expect(screen.getByText('Mã DQTV tối thiểu 3 ký tự')).toBeInTheDocument()
      expect(screen.getByText('Đơn vị là bắt buộc')).toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it('validates militiaCode allows only uppercase letters, digits, hyphens', async () => {
      renderForm()
      await userEvent.type(screen.getByTestId('militiaCode-input'), 'invalid code!')
      await userEvent.click(screen.getByTestId('submit-btn'))
      await waitFor(() => {
        expect(screen.getByText(/chỉ gồm chữ hoa, số và dấu gạch ngang/i)).toBeInTheDocument()
      })
    })

    it('validates phone number format', async () => {
      renderForm()
      await userEvent.type(screen.getByTestId('phone-input'), '12345')
      await userEvent.click(screen.getByTestId('submit-btn'))
      await waitFor(() => {
        expect(screen.getByText(/Số điện thoại không hợp lệ/i)).toBeInTheDocument()
      })
    })

    it.each([
      { testId: 'fullName-input', value: 'A'.repeat(101), message: 'Họ tên tối đa 100 ký tự' },
      { testId: 'militiaCode-input', value: 'A'.repeat(31), message: 'Mã DQTV tối đa 30 ký tự' },
    ])('explains a value longer than the backend allows ($message)', async ({ testId, value, message }) => {
      const user = userEvent.setup()
      renderForm()

      await paste(user, screen.getByTestId(testId), value)
      await user.click(screen.getByTestId('submit-btn'))

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    // QuickCreateMilitiaDto: militiaCode @Length(3, 30)
    it('accepts a 30-character code, the longest the backend takes', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByTestId('fullName-input'), 'Nguyễn Văn An')
      await paste(user, screen.getByTestId('militiaCode-input'), 'A'.repeat(30))
      await user.type(screen.getByTestId('unitCode-input'), 'KP1')
      await user.click(screen.getByTestId('submit-btn'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][1]).toEqual(expect.objectContaining({ militiaCode: 'A'.repeat(30) }))
    })
  })

  describe('submission', () => {
    it('calls quickCreate and navigates to /militia on success', async () => {
      renderForm()
      await userEvent.type(screen.getByTestId('fullName-input'), 'Nguyen Van A')
      await userEvent.type(screen.getByTestId('militiaCode-input'), 'KP1-001')
      await userEvent.type(screen.getByTestId('unitCode-input'), 'KP1')
      await userEvent.click(screen.getByTestId('submit-btn'))

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/militia/quick-create',
          expect.objectContaining({ fullName: 'Nguyen Van A', militiaCode: 'KP1-001', unitCode: 'KP1' }),
        ),
      )
      expect(await screen.findByText('Thêm dân quân tự vệ thành công')).toBeInTheDocument()
      expect(await screen.findByText('Trang danh sách DQTV')).toBeInTheDocument()
    })

    it('sends the optional fields that were filled in', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.type(screen.getByLabelText('Số điện thoại'), '0909123456')
      fireEvent.change(screen.getByLabelText('Ngày sinh'), { target: { value: '1995-05-20' } })
      await user.selectOptions(screen.getByLabelText('Giới tính'), 'female')
      await user.click(screen.getByTestId('submit-btn'))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post).toHaveBeenCalledWith('/militia/quick-create', {
        fullName: 'Nguyễn Văn An',
        militiaCode: 'KP1-001',
        unitCode: 'KP1',
        phone: '0909123456',
        dob: '1995-05-20',
        gender: 'female',
      })
    })

    // militia.service.ts quickCreate(): a taken code is 400 militia_code_duplicate, an unknown unit
    // 400 unit_not_found:<code>, a unit outside the caller's scope 403 unit_scope_violation
    it.each([
      { status: 400, code: 'militia_code_duplicate', errors: undefined, message: 'Mã dân quân đã tồn tại. Vui lòng dùng mã khác.' },
      {
        status: 400,
        code: 'validation_failed',
        errors: ['militiaCode must be longer than or equal to 3 characters'],
        message: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (militiaCode must be longer than or equal to 3 characters)',
      },
      { status: 400, code: 'militia_cccd_duplicate', errors: undefined, message: 'Số CCCD đã được sử dụng cho DQTV khác.' },
      { status: 400, code: 'unit_not_found', errors: undefined, message: 'Mã đơn vị không tồn tại.' },
      // The backend sends `unit_not_found:${unitCode}` today: not a machine code, so the 400 text answers
      { status: 400, code: 'unit_not_found:KP9', errors: undefined, message: 'Không thể thêm DQTV: mã đơn vị không tồn tại hoặc dữ liệu bị trùng. Vui lòng kiểm tra lại.' },
      { status: 403, code: 'unit_scope_violation', errors: undefined, message: 'Bạn chỉ được thêm DQTV vào đơn vị mình quản lý.' },
      { status: 403, code: 'no_unit_scope', errors: undefined, message: 'Tài khoản của bạn chưa được gán đơn vị quản lý.' },
      // RolesGuard answers without a code of the table
      { status: 403, code: 'Forbidden resource', errors: undefined, message: 'Bạn không có quyền thêm DQTV vào đơn vị này.' },
      { status: 500, code: 'internal_error', errors: undefined, message: 'Có lỗi xảy ra. Vui lòng thử lại.' },
    ])('explains a refused member ($status $code) and stays on the form', async ({ status, code, errors, message }) => {
      api.post.mockRejectedValue(httpError(status, code, errors))
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByTestId('submit-btn'))

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByTestId('militia-create-form')).toBeInTheDocument()
      expect(screen.queryByText('Trang danh sách DQTV')).not.toBeInTheDocument()
    })

    it('clears the form with "Đặt lại"', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByTestId('reset-btn'))

      expect(screen.getByTestId('fullName-input')).toHaveValue('')
      expect(screen.getByTestId('militiaCode-input')).toHaveValue('')
      expect(screen.getByTestId('unitCode-input')).toHaveValue('')
    })
  })
})

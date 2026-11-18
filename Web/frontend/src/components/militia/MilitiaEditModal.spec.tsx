import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { MilitiaEditModal } from './MilitiaEditModal'
import type { MilitiaListItem } from '@/api/militia'

// Only the HTTP layer is replaced: validation and the toasts run for real
const api = vi.hoisted(() => ({ patch: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

// GET /militia/:id (militia.service.ts getMilitiaById)
const mockProfile: MilitiaListItem = {
  id: 'uuid-1',
  userId: null,
  militiaCode: 'DQTV001',
  fullName: 'Nguyễn Văn Minh',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
  status: 'active',
  phone: '0901234567',
  email: null,
  rank: 'Chiến sĩ',
  avatarUrl: null,
  occupation: null,
  educationLevel: null,
  healthStatus: null,
  bloodType: null,
  permanentAddress: '123 Đường ABC',
  judicialClearanceStatus: null,
}

const otherProfile: MilitiaListItem = {
  ...mockProfile,
  id: 'uuid-2',
  militiaCode: 'DQTV002',
  fullName: 'Trần Thanh Tùng',
  phone: '0912000222',
  rank: null,
  permanentAddress: 'Số 5 Lê Lợi',
}

// PATCH /militia/:id — UPDATE … RETURNING id, fullName, phone, status, updatedAt
const updated = {
  id: 'uuid-1',
  fullName: 'Nguyễn Văn Minh',
  phone: '0901234567',
  status: 'active',
  updatedAt: '2026-09-14T03:00:00.000Z',
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
      path: '/api/v1/mms_core/militia/uuid-1',
      ...(errors ? { errors } : {}),
    },
  },
})

const onClose = vi.fn()

interface ModalProps {
  open?: boolean
  id?: string
  profile?: MilitiaListItem
}

function renderModal(props: ModalProps = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = (p: ModalProps) => (
    <QueryClientProvider client={qc}>
      <MilitiaEditModal open={p.open ?? true} onClose={onClose} id={p.id ?? 'uuid-1'} profile={p.profile ?? mockProfile} />
      <Toaster theme="light" />
    </QueryClientProvider>
  )
  const result = render(view(props))
  return { ...result, rerenderWith: (next: ModalProps) => result.rerender(view(next)) }
}

async function replaceValue(user: ReturnType<typeof userEvent.setup>, testId: string, value: string) {
  const input = screen.getByTestId(testId)
  await user.clear(input)
  await user.click(input)
  await user.paste(value)
}

describe('MilitiaEditModal', () => {
  beforeEach(() => {
    // mockReset also drops answers queued with mock*Once by an earlier test
    api.patch.mockReset()
    api.patch.mockResolvedValue({ data: updated })
    onClose.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('rendering', () => {
    it('renders nothing when open=false', () => {
      renderModal({ open: false })
      expect(screen.queryByTestId('militia-edit-modal')).not.toBeInTheDocument()
    })

    it('pre-populates phone and address from profile', () => {
      renderModal()
      expect(screen.getByTestId('edit-phone-input')).toHaveValue('0901234567')
      expect(screen.getByTestId('edit-address-input')).toHaveValue('123 Đường ABC')
    })

    it('shows Hủy and Lưu thay đổi buttons', () => {
      renderModal()
      expect(screen.getByTestId('cancel-btn')).toHaveTextContent('Hủy')
      expect(screen.getByTestId('save-btn')).toHaveTextContent('Lưu thay đổi')
    })

    it('names the dialog and its fields', () => {
      renderModal()

      expect(screen.getByRole('heading', { name: 'Chỉnh sửa thông tin' })).toBeInTheDocument()
      expect(screen.getByTestId('close-modal-btn')).toHaveAccessibleName('Đóng')
      expect(screen.getByLabelText('Số điện thoại')).toHaveAttribute('placeholder', '0909xxxxxx')
      expect(screen.getByLabelText('Địa chỉ thường trú')).toHaveAttribute('placeholder', 'Nhập địa chỉ...')
      expect(screen.getByLabelText('Cấp bậc')).toHaveAttribute('placeholder', 'VD: Tiểu đội trưởng')
    })

    // militia.controller.ts UpdateMilitiaDto has no status or avatarUrl, and the global
    // ValidationPipe (forbidNonWhitelisted) refuses a body that carries them
    it('offers only fields PATCH /militia/:id accepts', () => {
      renderModal()
      expect(screen.queryByLabelText('Trạng thái')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('URL ảnh đại diện')).not.toBeInTheDocument()
    })
  })

  describe('dismiss behavior', () => {
    it('closes when Hủy is clicked and form is clean', async () => {
      renderModal()
      await userEvent.click(screen.getByTestId('cancel-btn'))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes when X button is clicked and form is clean', async () => {
      renderModal()
      await userEvent.click(screen.getByTestId('close-modal-btn'))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('prompts confirmation when form is dirty and user cancels', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderModal()
      await userEvent.clear(screen.getByTestId('edit-phone-input'))
      await userEvent.type(screen.getByTestId('edit-phone-input'), '0909999999')
      await userEvent.click(screen.getByTestId('cancel-btn'))
      expect(confirmSpy).toHaveBeenCalledWith('Bạn có thay đổi chưa lưu. Thoát không?')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('closes via backdrop click when form is clean', async () => {
      renderModal()
      fireEvent.click(screen.getByTestId('militia-edit-modal'))
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes with Escape when the form is clean', async () => {
      const user = userEvent.setup()
      renderModal()

      await user.keyboard('{Escape}')

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('asks before Escape discards unsaved changes, and closes once confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
      const user = userEvent.setup()
      renderModal()
      await replaceValue(user, 'edit-rank-input', 'Tiểu đội trưởng')

      await user.keyboard('{Escape}')
      expect(confirmSpy).toHaveBeenCalledWith('Bạn có thay đổi chưa lưu. Thoát không?')
      expect(onClose).not.toHaveBeenCalled()

      await user.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  describe('form values', () => {
    it('loads the values of a newly chosen militia', async () => {
      const user = userEvent.setup()
      const { rerenderWith } = renderModal()
      await replaceValue(user, 'edit-phone-input', '0909999999')

      rerenderWith({ id: 'uuid-2', profile: otherProfile })

      expect(screen.getByTestId('edit-phone-input')).toHaveValue('0912000222')
      expect(screen.getByTestId('edit-address-input')).toHaveValue('Số 5 Lê Lợi')
      expect(screen.getByTestId('edit-rank-input')).toHaveValue('')
    })

    it('keeps unsaved edits when the same militia is read again', async () => {
      const user = userEvent.setup()
      const { rerenderWith } = renderModal()
      await replaceValue(user, 'edit-phone-input', '0909999999')

      // A refetch of the profile hands over a new object for the same member
      rerenderWith({ profile: { ...mockProfile } })

      expect(screen.getByTestId('edit-phone-input')).toHaveValue('0909999999')
    })

    it('starts from the saved values each time it is opened', async () => {
      const user = userEvent.setup()
      const { rerenderWith } = renderModal()
      await replaceValue(user, 'edit-phone-input', '0909999999')

      rerenderWith({ open: false })
      rerenderWith({ open: true })

      expect(screen.getByTestId('edit-phone-input')).toHaveValue('0901234567')
    })
  })

  describe('validation', () => {
    it.each([
      { testId: 'edit-phone-input', value: '12345', message: 'Số điện thoại không hợp lệ' },
      { testId: 'edit-address-input', value: 'A'.repeat(256), message: 'Địa chỉ tối đa 255 ký tự' },
      { testId: 'edit-rank-input', value: 'A'.repeat(51), message: 'Cấp bậc tối đa 50 ký tự' },
    ])('explains an invalid value ($message)', async ({ testId, value, message }) => {
      const user = userEvent.setup()
      renderModal()

      await replaceValue(user, testId, value)
      await user.click(screen.getByTestId('save-btn'))

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(api.patch).not.toHaveBeenCalled()
    })
  })

  describe('submission', () => {
    it('calls update and closes modal on success', async () => {
      renderModal()
      await userEvent.click(screen.getByTestId('save-btn'))

      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(api.patch).toHaveBeenCalledWith('/militia/uuid-1', expect.objectContaining({ phone: '0901234567' }))
      expect(await screen.findByText('Cập nhật thành công')).toBeInTheDocument()
    })

    it('sends only the fields UpdateMilitiaDto accepts', async () => {
      const user = userEvent.setup()
      renderModal()
      await replaceValue(user, 'edit-rank-input', 'Tiểu đội trưởng')

      await user.click(screen.getByTestId('save-btn'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
      expect(api.patch.mock.calls[0][0]).toBe('/militia/uuid-1')
      expect(api.patch.mock.calls[0][1]).toStrictEqual({
        phone: '0901234567',
        address: '123 Đường ABC',
        rank: 'Tiểu đội trưởng',
      })
    })

    it('shows the saving state while the request runs', async () => {
      api.patch.mockReturnValue(new Promise(() => {}))
      const user = userEvent.setup()
      renderModal()

      await user.click(screen.getByTestId('save-btn'))

      await waitFor(() => expect(screen.getByTestId('save-btn')).toBeDisabled())
    })

    // militia.service.ts updateMilitia(): a body without any field is refused with 400 no_fields_to_update
    it('explains that there is nothing to save when every field was emptied', async () => {
      api.patch.mockRejectedValue(httpError(400, 'no_fields_to_update'))
      const user = userEvent.setup()
      renderModal()
      await user.clear(screen.getByTestId('edit-phone-input'))
      await user.clear(screen.getByTestId('edit-address-input'))
      await user.clear(screen.getByTestId('edit-rank-input'))

      await user.click(screen.getByTestId('save-btn'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/militia/uuid-1', {}))
      expect(await screen.findByText('Chưa có thay đổi nào để lưu.')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })

    it.each([
      {
        status: 400,
        code: 'validation_failed',
        errors: ['phone must be a string'],
        message: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (phone must be a string)',
      },
      { status: 403, code: 'Forbidden resource', errors: undefined, message: 'Bạn không có quyền thực hiện thao tác này' },
      { status: 403, code: 'unit_scope_violation', errors: undefined, message: 'Hồ sơ này thuộc đơn vị nằm ngoài phạm vi quản lý của bạn.' },
      { status: 403, code: 'no_unit_scope', errors: undefined, message: 'Tài khoản của bạn chưa được gán đơn vị quản lý. Vui lòng liên hệ quản trị viên.' },
      { status: 404, code: 'militia_not_found', errors: undefined, message: 'Không tìm thấy hồ sơ DQTV này, hoặc bạn không có quyền sửa hồ sơ.' },
      { status: 500, code: 'internal_error', errors: undefined, message: 'Có lỗi xảy ra. Vui lòng thử lại.' },
    ])('explains a refused update ($status $code) and keeps the dialog open', async ({ status, code, errors, message }) => {
      api.patch.mockRejectedValue(httpError(status, code, errors))
      const user = userEvent.setup()
      renderModal()

      await user.click(screen.getByTestId('save-btn'))

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(within(screen.getByTestId('militia-edit-modal')).getByTestId('save-btn')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})

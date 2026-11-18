import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { t } from '@/test/i18n'
import type { TranslationKey } from '@/i18n/types'
import { UserForm } from './UserForm'

// Only the HTTP layer and the signed-in user are replaced: api/admin.ts, api/users.ts,
// useRbac, react-hook-form, zod and SmartSelect run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({
  user: { id: 'me', role: 'system_admin', roles: ['system_admin'], unitScope: null as string | null },
}))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// GET /units/search rows (users.service.ts searchUnits)
const units = [
  { id: 'unit-1', code: 'KP1', name: 'Khu phố 1', type: 'area', parentCode: 'PD' },
  { id: 'unit-2', code: 'KP2', name: 'Khu phố 2', type: 'area', parentCode: 'PD' },
]

// POST /admin/users answer (admin.service.ts createUser): the new row plus the one-time password
const created = {
  id: 'u-new',
  username: 'new.user',
  fullName: 'Nguyễn Văn Mới',
  email: null,
  phone: null,
  status: 'active',
  role: 'ca_officer',
  roles: ['ca_officer'],
  unitScope: 'KP1',
  createdAt: '2026-09-14T00:00:00.000Z',
  temporaryPassword: 'NewPass456',
}

const httpError = (status: number, message: string, errors?: string[]) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status, ...(errors ? { errors } : {}) } },
})

type User = ReturnType<typeof userEvent.setup>

function renderForm(onSuccess = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/users/new']}>
        <UserForm onSuccess={onSuccess} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onSuccess
}

function expectTexts(texts: ReadonlyArray<readonly [TranslationKey, string]>) {
  for (const [key, text] of texts) expect(t(key)).toBe(text)
}

async function fillRequired(user: User, username = 'new.user') {
  await user.type(screen.getByLabelText('Tên đăng nhập *'), username)
  await user.type(screen.getByLabelText('Họ và tên *'), 'Nguyễn Văn Mới')
  await user.selectOptions(screen.getByLabelText('Vai trò *'), 'ca_officer')
}

async function chooseUnit(user: User) {
  const unitInput = screen.getByTestId('smart-select-unit-input')
  await user.click(unitInput)
  await user.type(unitInput, 'Khu')
  await user.click(await screen.findByRole('option', { name: /Khu phố 1/ }))
}

const roleOptions = () =>
  Array.from((screen.getByLabelText('Vai trò *') as HTMLSelectElement).options).map((o) => [o.value, o.text])

describe('UserForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued mock*Once answers; an unused one must not leak into the next test
    api.get.mockReset()
    api.post.mockReset()
    session.user = { id: 'me', role: 'system_admin', roles: ['system_admin'], unitScope: null }
    api.get.mockResolvedValue({ data: units })
    api.post.mockResolvedValue({ data: created })
  })

  it('shows the heading, the CreateUserBodyDto fields with their placeholders and the actions — no password', async () => {
    expectTexts([
      ['users.form.page.title', 'Tạo tài khoản mới'],
      ['users.form.page.description', 'Mật khẩu tạm thời do hệ thống tạo và chỉ hiển thị một lần sau khi tạo.'],
      ['users.form.fields.username', 'Tên đăng nhập *'],
      ['users.form.fields.usernamePlaceholder', 'Nhập tên đăng nhập...'],
      ['users.form.fields.fullName', 'Họ và tên *'],
      ['users.form.fields.fullNamePlaceholder', 'Nhập họ tên đầy đủ...'],
      ['users.form.fields.role', 'Vai trò *'],
      ['users.form.fields.unit', 'Đơn vị / Khu phố'],
      ['users.form.fields.unitPlaceholder', 'Tìm đơn vị theo tên hoặc mã...'],
      ['users.form.fields.email', 'Email'],
      ['users.form.fields.emailPlaceholder', 'email@example.com'],
      ['users.form.fields.phone', 'Số điện thoại'],
      ['users.form.fields.phonePlaceholder', '0909xxxxxx'],
      ['users.form.actions.reset', 'Đặt lại'],
      ['users.form.actions.submit', 'Tạo tài khoản'],
      ['users.form.actions.backToList', 'Quay lại danh sách người dùng'],
    ])
    renderForm()

    expect(screen.getByRole('heading', { name: 'Tạo tài khoản mới' })).toBeInTheDocument()
    expect(screen.getByText('Mật khẩu tạm thời do hệ thống tạo và chỉ hiển thị một lần sau khi tạo.')).toBeInTheDocument()
    for (const [label, placeholder] of [
      ['Tên đăng nhập *', 'Nhập tên đăng nhập...'],
      ['Họ và tên *', 'Nhập họ tên đầy đủ...'],
      ['Email', 'email@example.com'],
      ['Số điện thoại', '0909xxxxxx'],
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('placeholder', placeholder)
    }
    expect(screen.queryByLabelText(/Mật khẩu/)).not.toBeInTheDocument()
    expect(screen.getByText('Đơn vị / Khu phố')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Tìm đơn vị theo tên hoặc mã...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đặt lại' })).toBeInTheDocument()
    expect(screen.getByTestId('user-submit-btn')).toHaveTextContent('Tạo tài khoản')
    expect(screen.getByRole('link', { name: 'Quay lại danh sách người dùng' })).toHaveAttribute('href', '/users')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/units/search', { params: { q: '', limit: 20 } }))
  })

  // AdminService.assertAssignableRole: system_admin assigns any role
  it('offers a system admin every role, named as in the role catalogue', () => {
    expectTexts([['users.form.fields.rolePlaceholder', '-- Chọn vai trò --']])
    renderForm()

    expect(roleOptions()).toEqual([
      ['', '-- Chọn vai trò --'],
      ['system_admin', 'Quản trị hệ thống'],
      ['police_ward', 'Công an phường'],
      ['ca_ward', 'Công an phường (CA)'],
      ['ubnd_leader', 'Lãnh đạo UBND'],
      ['police_area', 'Công an khu vực'],
      ['ca_area', 'Công an khu vực (CA)'],
      ['ca_officer', 'Cán bộ công an'],
      ['office_staff', 'Nhân viên văn phòng'],
      ['dqtv', 'Dân quân tự vệ'],
      ['dqtv_member', 'Thành viên DQTV'],
    ])
  })

  // AdminService.OFFICE_STAFF_ASSIGNABLE_ROLES
  it('offers office staff only the roles they may assign', () => {
    session.user = { id: 'me', role: 'office_staff', roles: ['office_staff'], unitScope: 'KP1' }
    renderForm()

    expect(roleOptions()).toEqual([
      ['', '-- Chọn vai trò --'],
      ['ca_officer', 'Cán bộ công an'],
      ['office_staff', 'Nhân viên văn phòng'],
      ['dqtv_member', 'Thành viên DQTV'],
      ['dqtv', 'Dân quân tự vệ'],
    ])
  })

  it('checks every field against CreateUserBodyDto before sending', async () => {
    expectTexts([
      ['users.create.validation.username', 'Tên đăng nhập gồm 3–50 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang'],
      ['users.create.validation.fullNameRequired', 'Vui lòng nhập họ và tên'],
      ['users.form.validation.roleRequired', 'Vai trò là bắt buộc'],
      ['users.create.validation.emailInvalid', 'Email không hợp lệ'],
      ['users.create.validation.phoneInvalid', 'Số điện thoại không hợp lệ'],
    ])
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Tên đăng nhập *'), 'có dấu')
    await user.type(screen.getByLabelText('Họ và tên *'), '   ')
    await user.type(screen.getByLabelText('Email'), 'không-phải-email')
    await user.type(screen.getByLabelText('Số điện thoại'), 'abc')
    await user.click(screen.getByTestId('user-submit-btn'))

    expect(
      await screen.findByText('Tên đăng nhập gồm 3–50 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang'),
    ).toBeInTheDocument()
    expect(screen.getByText('Vui lòng nhập họ và tên')).toBeInTheDocument()
    expect(screen.getByTestId('user-role-error')).toHaveTextContent('Vai trò là bắt buộc')
    expect(screen.getByText('Email không hợp lệ')).toBeInTheDocument()
    expect(screen.getByText('Số điện thoại không hợp lệ')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('posts exactly CreateUserBodyDto to POST /admin/users, trimmed and without blank optional fields', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user, '  new.user  ')
    await chooseUnit(user)
    await user.click(screen.getByTestId('user-submit-btn'))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/admin/users')
    expect(body).toStrictEqual({ username: 'new.user', fullName: 'Nguyễn Văn Mới', role: 'ca_officer', unitCode: 'KP1' })
  })

  it('sends email and phone when they are filled in', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.type(screen.getByLabelText('Email'), 'moi@phudinh.gov.vn')
    await user.type(screen.getByLabelText('Số điện thoại'), '0901234567')
    await user.click(screen.getByTestId('user-submit-btn'))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).toStrictEqual({
      username: 'new.user',
      fullName: 'Nguyễn Văn Mới',
      email: 'moi@phudinh.gov.vn',
      phone: '0901234567',
      role: 'ca_officer',
    })
  })

  it('shows the temporary password once, lets it be copied and links back to the list', async () => {
    expectTexts([
      ['users.form.submit.success', 'Tạo tài khoản thành công'],
      ['users.temporaryPassword.title', 'Mật khẩu tạm thời'],
      ['users.temporaryPassword.description', 'Hãy thông báo mật khẩu này cho người dùng và yêu cầu đổi ngay sau khi đăng nhập.'],
      ['users.temporaryPassword.copy', 'Sao chép mật khẩu'],
      ['users.temporaryPassword.copied', 'Đã sao chép mật khẩu'],
      ['users.temporaryPassword.acknowledge', 'Đã ghi nhận'],
    ])
    expect(t('users.form.created.title', { username: 'new.user' })).toBe('Đã tạo tài khoản new.user')
    const user = userEvent.setup()
    const onSuccess = renderForm()

    await fillRequired(user)
    await user.click(screen.getByTestId('user-submit-btn'))

    const panel = within(await screen.findByTestId('user-create-success'))
    expect(panel.getByText('Đã tạo tài khoản new.user')).toBeInTheDocument()
    expect(panel.getByText('Mật khẩu tạm thời')).toBeInTheDocument()
    expect(panel.getByText('Hãy thông báo mật khẩu này cho người dùng và yêu cầu đổi ngay sau khi đăng nhập.')).toBeInTheDocument()
    expect(panel.getByTestId('temp-password')).toHaveTextContent('NewPass456')
    expect(panel.getByRole('link', { name: 'Quay lại danh sách người dùng' })).toHaveAttribute('href', '/users')
    expect(toast.success).toHaveBeenCalledWith('Tạo tài khoản thành công')
    expect(onSuccess).toHaveBeenCalled()
    // The form is emptied for the next account
    expect(screen.getByLabelText('Tên đăng nhập *')).toHaveValue('')

    await user.click(panel.getByRole('button', { name: 'Sao chép mật khẩu' }))
    expect(await panel.findByRole('status')).toHaveTextContent('Đã sao chép mật khẩu')
    await expect(navigator.clipboard.readText()).resolves.toBe('NewPass456')

    await user.click(panel.getByRole('button', { name: 'Đã ghi nhận' }))
    expect(screen.queryByTestId('user-create-success')).not.toBeInTheDocument()
    expect(screen.queryByText('NewPass456')).not.toBeInTheDocument()
  })

  it('asks to note the password by hand when it cannot be copied', async () => {
    expectTexts([['users.temporaryPassword.copyFailed', 'Không thể sao chép. Hãy ghi lại mật khẩu thủ công.']])
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByTestId('user-submit-btn'))
    const panel = within(await screen.findByTestId('user-create-success'))
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))

    await user.click(panel.getByRole('button', { name: 'Sao chép mật khẩu' }))

    expect(await panel.findByRole('status')).toHaveTextContent('Không thể sao chép. Hãy ghi lại mật khẩu thủ công.')
  })

  it('clears the form on reset', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Tên đăng nhập *'), 'new.user')
    await user.click(screen.getByRole('button', { name: 'Đặt lại' }))

    expect(screen.getByLabelText('Tên đăng nhập *')).toHaveValue('')
  })

  // admin.service.ts createUser / assertAssignableRole / resolveUnit
  it.each([
    [409, 'username_taken', 'Tên đăng nhập đã được sử dụng', 'user-username-input'],
    [409, 'email_taken', 'Email đã được sử dụng', 'user-email-input'],
    [400, 'unknown_unit', 'Mã đơn vị không tồn tại', 'smart-select-unit-error'],
    [403, 'role_not_assignable', 'Bạn không được phép cấp hoặc quản lý vai trò này', 'user-role-error'],
    [400, 'unknown_role', 'Vai trò không tồn tại trong hệ thống', 'user-role-error'],
  ])('shows HTTP %i %s next to its field', async (status, code, text, testId) => {
    api.post.mockRejectedValueOnce(httpError(status, code))
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByTestId('user-submit-btn'))

    expect(await screen.findByText(text)).toBeInTheDocument()
    const target = screen.getByTestId(testId)
    if (target.tagName === 'INPUT') expect(target).toHaveAttribute('aria-invalid', 'true')
    else expect(target).toHaveTextContent(text)
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.queryByTestId('user-create-success')).not.toBeInTheDocument()
  })

  it('puts validation messages next to their fields and the rest in a notice', async () => {
    api.post.mockRejectedValueOnce(
      httpError(400, 'validation_failed', [
        'username must be 3-50 letters, digits, dots, underscores or hyphens',
        'property password should not exist',
      ]),
    )
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByTestId('user-submit-btn'))

    expect(await screen.findByText('username must be 3-50 letters, digits, dots, underscores or hyphens')).toBeInTheDocument()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (property password should not exist)'),
    )
  })

  it.each([
    // RolesGuard: ForbiddenException('insufficient_role') → errors.admin.insufficient_role
    ['a refusal', httpError(403, 'insufficient_role'), 'Bạn không có quyền thực hiện thao tác này'],
    ['no answer from the server', { isAxiosError: true, request: {} }, 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'],
    ['any other failure', httpError(500, 'Internal server error'), 'Có lỗi xảy ra. Vui lòng thử lại.'],
  ])('explains %s', async (_case, error, text) => {
    expectTexts([['users.form.submit.error', 'Có lỗi xảy ra. Vui lòng thử lại.']])
    api.post.mockRejectedValueOnce(error)
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByTestId('user-submit-btn'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(text))
    expect(toast.success).not.toHaveBeenCalled()
  })
})

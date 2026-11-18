import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UPLOAD_ACCEPT } from '@/api/files'
import { TaskCreateForm } from './TaskCreateForm'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

// Typing through the form is slow when the machine is busy (coverage, parallel runs)
configure({ asyncUtilTimeout: 5_000 })

const MILITIA_ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01'

// GET /militia/search row
const militia = [
  {
    id: MILITIA_ID,
    userId: 'u-1',
    militiaCode: 'DQ-001',
    fullName: 'Trần Văn Bình',
    phone: null,
    rank: null,
    status: 'active',
    unitCode: 'KP1',
    unitName: 'Khu phố 1',
  },
]

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TaskCreateForm />
    </QueryClientProvider>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function fillRequired(user: User) {
  await user.type(screen.getByTestId('task-title-input'), 'Tuần tra KP1')
  const input = screen.getByTestId('smart-select-assignee-input')
  await user.click(input)
  await user.type(input, 'DQ')
  await user.click(await screen.findByRole('option', { name: /DQ-001/ }))
}

// Search for someone and open the "Thêm dân quân mới" dialog from the dropdown; the searched
// name reaches the dialog once the debounced search has run
async function openQuickCreate(user: User, query = 'Nguyen Van Moi') {
  const input = screen.getByTestId('smart-select-assignee-input')
  await user.click(input)
  await user.type(input, query)
  await user.click(await screen.findByTestId('smart-select-assignee-create-btn'))
  const dialog = await screen.findByTestId('smart-select-assignee-modal')
  await waitFor(() => expect(within(dialog).getByTestId('quick-create-militia-name')).toHaveValue(query))
  return dialog
}

const postedBody = () => api.post.mock.calls.find(([url]) => url === '/tasks')?.[1] as Record<string, unknown>
const postsTo = (url: string) => api.post.mock.calls.filter(([u]) => u === url)

// The backend answers errors as { code, message: <machine code>, statusCode }
const apiError = (status: number, message?: string) => ({ response: { status, data: message ? { message } : {} } })

// POST /files/upload answers (files.service.ts FileView), kept so POST /tasks can list them
const fileId = (n: number) => `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const uploads = { count: 0, stored: new Map<string, Record<string, unknown>>() }

function uploadAnswer(form: FormData): Promise<unknown> {
  uploads.count += 1
  const file = form.get('file') as File
  const id = fileId(uploads.count)
  const stored = { id, url: `/api/v1/mms_core/files/${id}`, name: file.name, mimeType: file.type, size: file.size }
  uploads.stored.set(id, stored)
  return Promise.resolve({ data: stored })
}

// POST /tasks answer (tasks.service.ts createTask); the server gives the code TASK-YYYYMMDD-XXXXXX
const createdTask = (body: { attachmentIds?: string[] }) => ({
  id: 'a1000000-0000-4000-8000-000000000001',
  code: 'TASK-20260914-A1B2C3',
  title: 'Tuần tra KP1',
  description: null,
  type: 'other',
  priority: 'medium',
  status: 'pending',
  deadline: null,
  createdAt: '2026-09-14T08:00:00.000Z',
  assigneeId: 'u-1',
  assigneeName: 'Trần Văn Bình',
  militiaId: MILITIA_ID,
  militiaCode: 'DQ-001',
  locationName: null,
  locationLat: null,
  locationLng: null,
  attachments: (body.attachmentIds ?? []).map((id) => uploads.stored.get(id)),
})

const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' })
const uploadCalls = () => postsTo('/files/upload')
const uploadedNames = () => uploadCalls().map(([, form]) => ((form as FormData).get('file') as File).name)

describe('TaskCreateForm', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockReset()
    api.post.mockReset()
    api.get.mockImplementation((url: string) =>
      url === '/militia/search' ? Promise.resolve({ data: militia }) : Promise.reject(new Error(`unexpected GET ${url}`)),
    )
    uploads.count = 0
    uploads.stored.clear()
    api.post.mockImplementation((url: string, body: unknown) => {
      if (url === '/files/upload') return uploadAnswer(body as FormData)
      if (url === '/tasks') return Promise.resolve({ data: createdTask(body as { attachmentIds?: string[] }) })
      return Promise.reject(new Error(`unexpected POST ${url}`))
    })
  })

  // CreateTaskDto (Web/backend/src/tasks/tasks.controller.ts): locationName, locationLat, locationLng
  it('sends locationName, locationLat and locationLng with the task', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.type(screen.getByTestId('task-location-input'), '  Chợ Phú Định  ')
    await user.type(screen.getByTestId('task-location-lat-input'), '10.7512')
    await user.type(screen.getByTestId('task-location-lng-input'), '106.6283')
    await user.click(screen.getByTestId('task-submit-btn'))

    await waitFor(() => expect(postedBody()).toBeDefined())
    expect(postedBody()).toStrictEqual({
      title: 'Tuần tra KP1',
      type: 'other',
      priority: 'medium',
      assigneeMilitiaId: MILITIA_ID,
      locationName: 'Chợ Phú Định',
      locationLat: 10.7512,
      locationLng: 106.6283,
    })
  })

  it('leaves out every empty optional field, so an empty deadline is not sent', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.click(screen.getByTestId('task-submit-btn'))

    await waitFor(() => expect(postedBody()).toBeDefined())
    expect(postedBody()).toStrictEqual({
      title: 'Tuần tra KP1',
      type: 'other',
      priority: 'medium',
      assigneeMilitiaId: MILITIA_ID,
    })
  })

  it('requires latitude and longitude together', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.type(screen.getByTestId('task-location-lat-input'), '10.75')
    await user.click(screen.getByTestId('task-submit-btn'))

    expect(await screen.findByTestId('task-location-coords-error')).toHaveTextContent('Nhập cả vĩ độ và kinh độ')
    expect(postedBody()).toBeUndefined()
  })

  it.each([
    ['task-location-lat-input', '95', '106.6', 'Vĩ độ phải từ -90 đến 90'],
    ['task-location-lng-input', '10.7', '190', 'Kinh độ phải từ -180 đến 180'],
  ])('rejects coordinates out of range (%s)', async (_field, lat, lng, message) => {
    const user = userEvent.setup()
    renderForm()

    await fillRequired(user)
    await user.type(screen.getByTestId('task-location-lat-input'), lat)
    await user.type(screen.getByTestId('task-location-lng-input'), lng)
    await user.click(screen.getByTestId('task-submit-btn'))

    expect(await screen.findByTestId('task-location-coords-error')).toHaveTextContent(message)
    expect(postedBody()).toBeUndefined()
  })

  describe('form texts', () => {
    it('labels the fields and lists the priorities and task types', () => {
      renderForm()

      expect(screen.getByRole('heading', { name: 'Tạo nhiệm vụ mới' })).toBeInTheDocument()
      expect(screen.getByTestId('task-title-input')).toHaveAttribute('placeholder', 'Nhập tiêu đề nhiệm vụ...')
      expect(screen.getByLabelText('Mô tả')).toHaveAttribute('placeholder', 'Mô tả chi tiết nhiệm vụ...')
      expect(within(screen.getByLabelText('Độ ưu tiên')).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Thấp',
        'Trung bình',
        'Cao',
        'Khẩn cấp',
      ])
      expect(within(screen.getByLabelText('Loại nhiệm vụ')).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Tuần tra',
        'Bảo vệ',
        'Kiểm tra',
        'Hỗ trợ',
        'Tập huấn',
        'Hành chính',
        'Khác',
      ])
      expect(screen.getByLabelText('Loại nhiệm vụ')).toHaveValue('other')
      expect(screen.getByLabelText('Vĩ độ')).toHaveAttribute('placeholder', 'VD: 10.7512')
      expect(screen.getByLabelText('Kinh độ')).toHaveAttribute('placeholder', 'VD: 106.6283')
      expect(screen.getByTestId('smart-select-assignee-input')).toHaveAttribute('placeholder', 'Tìm dân quân theo tên, mã hoặc SĐT...')
      expect(screen.getByTestId('task-submit-btn')).toHaveTextContent('Tạo nhiệm vụ')
    })

    it('requires a title', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByTestId('task-submit-btn'))

      expect(await screen.findByTestId('task-title-error')).toHaveTextContent('Tiêu đề là bắt buộc')
      expect(postedBody()).toBeUndefined()
    })

    it('asks for an assignee again after the chosen one is cleared', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByTestId('smart-select-assignee-clear'))

      expect(await screen.findByTestId('smart-select-assignee-error')).toHaveTextContent('Vui lòng chọn người thực hiện')
    })
  })

  describe('submitting', () => {
    it('confirms a created task', async () => {
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByTestId('task-submit-btn'))

      expect(await screen.findByTestId('task-create-success')).toHaveTextContent('Nhiệm vụ TASK-20260914-A1B2C3 đã được tạo thành công!')
      expect(toast.success).toHaveBeenCalledWith('Tạo nhiệm vụ thành công')
    })

    // POST /tasks (tasks.service.ts createTask): an assignee outside the creator's scope answers
    // 404 militia_not_found, a member without an account 400 militia_no_user_account
    it.each([
      [
        'outside the creator’s scope',
        apiError(404, 'militia_not_found'),
        'Không tìm thấy dân quân đã chọn, hoặc dân quân nằm ngoài phạm vi giao việc của bạn.',
      ],
      [
        'without a user account',
        apiError(400, 'militia_no_user_account'),
        'Dân quân này chưa có tài khoản hệ thống. Vui lòng liên kết tài khoản trước khi giao việc.',
      ],
    ])('shows an assignee %s next to the assignee field', async (_case, error, message) => {
      api.post.mockRejectedValue(error)
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByTestId('task-submit-btn'))

      expect(await screen.findByTestId('smart-select-assignee-error')).toHaveTextContent(message)
      expect(toast.error).not.toHaveBeenCalled()
      expect(screen.queryByTestId('task-create-success')).not.toBeInTheDocument()
    })

    it('explains any other failure', async () => {
      api.post.mockRejectedValue(apiError(500, 'internal_error'))
      const user = userEvent.setup()
      renderForm()

      await fillRequired(user)
      await user.click(screen.getByTestId('task-submit-btn'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Có lỗi xảy ra. Vui lòng thử lại.'))
      expect(screen.queryByTestId('smart-select-assignee-error')).not.toBeInTheDocument()
      expect(screen.queryByTestId('task-create-success')).not.toBeInTheDocument()
    })
  })

  // POST /files/upload with purpose task, then POST /tasks attachmentIds: at most 10 uploads of the
  // creator (tasks.controller.ts TASK_ATTACHMENTS_PER_REQUEST); a refused file creates no task
  describe('attachments', () => {
    const fileInput = () => screen.getByLabelText('Chọn tệp đính kèm')
    const uploadedList = () => screen.getByRole('list', { name: 'Tệp đã tải lên' })

    it('uploads each chosen file for the task and sends the ids of the files kept', async () => {
      const user = userEvent.setup()
      renderForm()
      expect(screen.getByRole('heading', { name: 'Tệp đính kèm' })).toBeInTheDocument()
      expect(fileInput()).toHaveAttribute('accept', UPLOAD_ACCEPT)
      expect(fileInput()).toHaveAttribute('multiple')

      await user.upload(fileInput(), [pdf('ke-hoach.pdf'), new File(['png'], 'so-do.png', { type: 'image/png' })])

      await waitFor(() => expect(within(uploadedList()).getAllByRole('listitem')).toHaveLength(2))
      const [url, form, config] = uploadCalls()[0]
      expect(url).toBe('/files/upload')
      expect((form as FormData).get('purpose')).toBe('task')
      expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
      expect(uploadedNames()).toEqual(['ke-hoach.pdf', 'so-do.png'])

      await user.click(within(uploadedList()).getByRole('button', { name: 'Bỏ tệp ke-hoach.pdf' }))
      await fillRequired(user)
      await user.click(screen.getByTestId('task-submit-btn'))

      await waitFor(() => expect(postedBody()).toBeDefined())
      expect(postedBody()).toStrictEqual({
        title: 'Tuần tra KP1',
        type: 'other',
        priority: 'medium',
        assigneeMilitiaId: MILITIA_ID,
        attachmentIds: [fileId(2)],
      })
      expect(await screen.findByTestId('task-create-success')).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Tệp đã tải lên' })).not.toBeInTheDocument()
    })

    it('checks each file before sending it and names the ones refused', async () => {
      const user = userEvent.setup({ applyAccept: false })
      renderForm()
      const tooLarge = pdf('lon.pdf')
      Object.defineProperty(tooLarge, 'size', { value: 10 * 1024 * 1024 + 1 })

      await user.upload(fileInput(), [
        new File([], 'rong.pdf', { type: 'application/pdf' }),
        tooLarge,
        new File(['heic'], 'anh.heic', { type: 'image/heic' }),
        pdf('dung.pdf'),
      ])

      await waitFor(() => expect(within(uploadedList()).getByText('dung.pdf')).toBeInTheDocument())
      const problems = screen.getByTestId('task-attachment-errors')
      expect(problems).toHaveTextContent('rong.pdf: Tệp không có nội dung. Vui lòng chọn tệp khác.')
      expect(problems).toHaveTextContent('lon.pdf: Tệp vượt quá dung lượng cho phép (tối đa 10 MB).')
      expect(problems).toHaveTextContent(
        'anh.heic: Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF, tệp PDF, Word (.docx) hoặc Excel (.xlsx).',
      )
      expect(uploadedNames()).toEqual(['dung.pdf'])
    })

    it.each([
      [413, 'file_too_large', 'bien-ban.pdf: Tệp vượt quá dung lượng cho phép (tối đa 10 MB).'],
      [415, 'file_type_not_allowed', 'bien-ban.pdf: Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF, tệp PDF, Word (.docx) hoặc Excel (.xlsx).'],
      [500, 'internal_error', 'bien-ban.pdf: Không thể tải lên tệp. Vui lòng thử lại.'],
    ])('names a file the server refused with %i %s', async (status, errorCode, message) => {
      api.post.mockImplementation((url: string) =>
        url === '/files/upload' ? Promise.reject(apiError(status, errorCode)) : Promise.reject(new Error(`unexpected POST ${url}`)),
      )
      const user = userEvent.setup()
      renderForm()

      await user.upload(fileInput(), pdf('bien-ban.pdf'))

      expect(await screen.findByTestId('task-attachment-errors')).toHaveTextContent(message)
      expect(screen.queryByRole('list', { name: 'Tệp đã tải lên' })).not.toBeInTheDocument()
    })

    it('attaches at most 10 files and names the ones left out', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.upload(
        fileInput(),
        Array.from({ length: 11 }, (_, i) => pdf(`tep-${i + 1}.pdf`)),
      )

      await waitFor(() => expect(within(uploadedList()).getAllByRole('listitem')).toHaveLength(10))
      expect(uploadCalls()).toHaveLength(10)
      expect(screen.getByTestId('task-attachment-errors')).toHaveTextContent('Chỉ đính kèm được tối đa 10 tệp. Đã bỏ qua: tep-11.pdf')
      expect(fileInput()).toBeDisabled()
    })

    it.each([
      [409, 'file_already_attached', 'Tệp này đã được đính kèm vào hồ sơ khác. Vui lòng tải lại tệp.'],
      [400, 'file_purpose_mismatch', 'Tệp này được tải lên cho mục đích khác. Vui lòng tải lại tệp.'],
      [400, 'file_not_found', 'Tệp đính kèm không tồn tại hoặc không do bạn tải lên. Vui lòng tải lại tệp.'],
    ])('keeps the form filled and asks to upload again when POST /tasks answers %i %s', async (status, errorCode, message) => {
      api.post.mockImplementation((url: string, body: unknown) =>
        url === '/tasks' ? Promise.reject(apiError(status, errorCode)) : uploadAnswer(body as FormData),
      )
      const user = userEvent.setup()
      renderForm()
      await user.upload(fileInput(), pdf('ke-hoach.pdf'))
      await waitFor(() => expect(within(uploadedList()).getByText('ke-hoach.pdf')).toBeInTheDocument())
      await fillRequired(user)

      await user.click(screen.getByTestId('task-submit-btn'))

      expect(await screen.findByTestId('task-attachment-submit-error')).toHaveTextContent(message)
      expect(screen.getByTestId('task-title-input')).toHaveValue('Tuần tra KP1')
      expect(within(uploadedList()).getByText('ke-hoach.pdf')).toBeInTheDocument()
      expect(toast.error).not.toHaveBeenCalled()
      expect(screen.queryByTestId('task-create-success')).not.toBeInTheDocument()

      // Removing or uploading a file answers the request to upload again
      await user.click(within(uploadedList()).getByRole('button', { name: 'Bỏ tệp ke-hoach.pdf' }))
      expect(screen.queryByTestId('task-attachment-submit-error')).not.toBeInTheDocument()
    })
  })

  // POST /militia/quick-create from the assignee picker (US-SS-03, US-SS-05)
  describe('quick-create militia', () => {
    it('creates the militia with the searched name and selects it', async () => {
      api.post.mockResolvedValue({
        data: { id: 'b7a1c7de-0000-4000-8000-000000000001', militiaCode: 'QS-9', fullName: 'Nguyen Van Moi', phone: null, unitName: 'Phú Định' },
      })
      const user = userEvent.setup()
      renderForm()

      const dialog = await openQuickCreate(user)
      expect(within(dialog).getByText('Thêm dân quân mới')).toBeInTheDocument()
      expect(within(dialog).getByTestId('quick-create-militia-name')).toHaveAttribute('placeholder', 'Nhập họ và tên')
      expect(within(dialog).getByTestId('quick-create-militia-unit')).toHaveAttribute('placeholder', 'Mã đơn vị (VD: PHU_DINH)')
      await user.clear(within(dialog).getByTestId('quick-create-militia-code'))
      await user.type(within(dialog).getByTestId('quick-create-militia-code'), 'QS-9')
      await user.click(within(dialog).getByTestId('smart-select-assignee-modal-submit'))

      expect(await screen.findByTestId('smart-select-assignee-selected')).toHaveTextContent('QS-9 — Nguyen Van Moi')
      expect(postsTo('/militia/quick-create')[0]?.[1]).toStrictEqual({
        militiaCode: 'QS-9',
        fullName: 'Nguyen Van Moi',
        unitCode: 'PHU_DINH',
      })
    })

    it('names each missing field and sends nothing', async () => {
      const user = userEvent.setup()
      renderForm()

      const dialog = await openQuickCreate(user)
      await user.clear(within(dialog).getByTestId('quick-create-militia-code'))
      await user.clear(within(dialog).getByTestId('quick-create-militia-name'))
      await user.clear(within(dialog).getByTestId('quick-create-militia-unit'))
      await user.click(within(dialog).getByTestId('smart-select-assignee-modal-submit'))

      expect(await within(dialog).findByTestId('quick-create-code-error')).toHaveTextContent('Mã dân quân là bắt buộc')
      expect(within(dialog).getByTestId('quick-create-name-error')).toHaveTextContent('Họ và tên là bắt buộc')
      expect(within(dialog).getByTestId('quick-create-unit-error')).toHaveTextContent('Đơn vị là bắt buộc')
      expect(postsTo('/militia/quick-create')).toHaveLength(0)
    })

    it('shows a duplicate militia code under the code field', async () => {
      api.post.mockRejectedValue(apiError(409, 'militia_code_duplicate'))
      const user = userEvent.setup()
      renderForm()

      const dialog = await openQuickCreate(user)
      await user.click(within(dialog).getByTestId('smart-select-assignee-modal-submit'))

      expect(await within(dialog).findByTestId('quick-create-code-error')).toHaveTextContent(
        'Mã dân quân đã tồn tại. Vui lòng dùng mã khác.',
      )
      expect(within(dialog).queryByTestId('quick-create-server-error')).not.toBeInTheDocument()
    })

    it('shows any other failure above the form', async () => {
      api.post.mockRejectedValue(apiError(500, 'internal_error'))
      const user = userEvent.setup()
      renderForm()

      const dialog = await openQuickCreate(user)
      await user.click(within(dialog).getByTestId('smart-select-assignee-modal-submit'))

      expect(await within(dialog).findByTestId('quick-create-server-error')).toHaveTextContent(
        'Không thể tạo dân quân. Vui lòng kiểm tra lại thông tin.',
      )
      expect(within(dialog).queryByTestId('quick-create-code-error')).not.toBeInTheDocument()
    })
  })
})

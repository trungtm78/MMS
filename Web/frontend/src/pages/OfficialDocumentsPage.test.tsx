import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { OfficialDocumentsPage } from './OfficialDocumentsPage'

// Only the HTTP layer is replaced: the dialogs, the downloads and the toasts run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

const FILE_ID = '3f0b6a52-8c1e-4d7a-9b2f-5e6d7c8b9a01'
const CREATOR_ID = '9b7e4c1d-2a3f-4b5c-8d6e-7f8091a2b3c4'

type Doc = Record<string, unknown> & { id: string }

// official-documents.service.ts list(): DATE columns arrive as YYYY-MM-DD (database/pg-types.ts)
const mockDocs: Doc[] = [
  {
    id: 'doc-1',
    docNumber: '123/CV-BCA',
    docType: 'cong_van',
    title: 'Công văn về huấn luyện DQTV',
    issuedBy: 'BCA',
    issuedDate: '2024-01-15',
    effectiveDate: '2024-02-01',
    expiryDate: null,
    status: 'active',
    subject: 'Hướng dẫn thực hiện huấn luyện',
    createdAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 'doc-2',
    docNumber: null,
    docType: 'quyet_dinh',
    title: 'Quyết định thành lập ban chỉ huy',
    issuedBy: 'UBND',
    issuedDate: '2024-03-01',
    effectiveDate: null,
    expiryDate: null,
    status: 'draft',
    subject: null,
    createdAt: '2024-03-01T09:00:00.000Z',
  },
]

// files.service.ts FileView, as POST /files/upload and the documents answer it
const storedFile = {
  id: FILE_ID,
  url: `/api/v1/mms_core/files/${FILE_ID}`,
  name: 'cong-van-123.pdf',
  mimeType: 'application/pdf',
  size: 20480,
}

// Body produced by the backend HttpExceptionFilter
const httpError = (status: number, message: string, errors?: string[]) => ({
  isAxiosError: true,
  response: {
    status,
    data: { code: 'E00x', message, statusCode: status, timestamp: '2026-09-14T03:00:00.000Z', path: '/api/v1/mms_core', ...(errors ? { errors } : {}) },
  },
})

// GET /files/:id is read as a blob, so its JSON error body arrives as a Blob too
const blobError = (status: number, message: string) => ({
  isAxiosError: true,
  response: {
    status,
    data: new Blob([JSON.stringify({ code: 'E00x', message, statusCode: status })], { type: 'application/json' }),
  },
})

const server = {
  docs: mockDocs,
  total: 2,
  // getById() adds the attached file and the related records to the list fields
  detailExtra: {} as Record<string, unknown>,
}

function answerGet(url: string) {
  if (url === '/official-documents') {
    return Promise.resolve({ data: { data: server.docs, total: server.total, page: 1, limit: 20 } })
  }
  if (url.startsWith('/official-documents/')) {
    const doc = server.docs.find((d) => url === `/official-documents/${d.id}`)
    if (!doc) return Promise.reject(httpError(404, 'document_not_found'))
    return Promise.resolve({
      data: {
        ...doc,
        fileId: null,
        relatedMilitiaId: null,
        relatedUnitId: null,
        createdBy: CREATOR_ID,
        file: null,
        ...server.detailExtra,
      },
    })
  }
  if (url === `/files/${FILE_ID}`) return Promise.resolve({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })
  return Promise.reject(new Error(`unexpected GET ${url}`))
}

function answerPost(url: string, body: unknown) {
  if (url === '/files/upload') return Promise.resolve({ data: storedFile })
  if (url === '/official-documents') {
    const dto = body as Record<string, string | undefined>
    // create() RETURNING … plus the attached file
    return Promise.resolve({
      data: {
        id: 'doc-3',
        docNumber: dto.docNumber ?? null,
        docType: dto.docType,
        title: dto.title,
        issuedDate: dto.issuedDate ?? null,
        status: 'active',
        createdAt: '2026-09-14T03:00:00.000Z',
        fileId: dto.fileId ?? null,
        file: dto.fileId ? storedFile : null,
      },
    })
  }
  return Promise.reject(new Error(`unexpected POST ${url}`))
}

const createPosts = () => api.post.mock.calls.filter(([url]) => url === '/official-documents')
const uploadPosts = () => api.post.mock.calls.filter(([url]) => url === '/files/upload')
const listGets = () => api.get.mock.calls.filter(([url]) => url === '/official-documents')

const pdf = (name = 'cong-van-123.pdf') => new File(['%PDF-1.4 noi dung'], name, { type: 'application/pdf' })

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <OfficialDocumentsPage />
      </BrowserRouter>
      <Toaster theme="light" />
    </QueryClientProvider>,
  )
}

async function openCreate() {
  const user = userEvent.setup()
  renderPage()
  await user.click(await screen.findByTestId('create-doc-btn'))
  return user
}

describe('OfficialDocumentsPage', () => {
  beforeEach(() => {
    // mockReset also drops answers queued with mock*Once by an earlier test
    api.get.mockReset()
    api.post.mockReset()
    api.delete.mockReset()
    server.docs = mockDocs
    server.total = 2
    server.detailExtra = {}
    api.get.mockImplementation(answerGet)
    api.post.mockImplementation(answerPost)
    api.delete.mockResolvedValue({ data: '' })
  })

  it('renders page heading', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('official-documents-page')).toBeInTheDocument())
    expect(screen.getByText('Văn bản pháp lý')).toBeInTheDocument()
  })

  it('renders document rows', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('doc-row-doc-1')).toBeInTheDocument())
    expect(screen.getByText('Công văn về huấn luyện DQTV')).toBeInTheDocument()
    expect(screen.getByTestId('doc-row-doc-2')).toBeInTheDocument()
  })

  it('shows status badge', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Hiệu lực')).toBeInTheDocument())
    expect(screen.getByText('Nháp')).toBeInTheDocument()
  })

  it('names the page, the filters and the columns', async () => {
    renderPage()
    const row = within(await screen.findByTestId('doc-row-doc-1'))

    expect(screen.getByText('Trang chủ › Văn bản pháp lý')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Văn bản pháp lý' })).toBeInTheDocument()
    expect(screen.getByText('Quản lý văn bản hành chính — NĐ 30/2020')).toBeInTheDocument()
    expect(screen.getByTestId('create-doc-btn')).toHaveTextContent('Tạo văn bản')
    expect(screen.getByPlaceholderText('Tìm theo tiêu đề, số hiệu...')).toBeInTheDocument()
    expect(within(screen.getByTestId('status-filter')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả trạng thái', 'Nháp', 'Hiệu lực', 'Hết hạn', 'Thu hồi',
    ])
    expect(within(screen.getByTestId('type-filter')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả loại', 'Công văn', 'Quyết định', 'Thông báo', 'Báo cáo', 'Biên bản', 'Khác',
    ])
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Số hiệu', 'Tiêu đề', 'Loại', 'Ban hành', 'Hiệu lực', 'Trạng thái', 'Thao tác',
    ])
    expect(row.getByText('Công văn')).toBeInTheDocument()
    expect(row.getByText('Hướng dẫn thực hiện huấn luyện')).toBeInTheDocument()
    expect(row.getByRole('button', { name: 'Thu hồi văn bản' })).toBeInTheDocument()
    expect(within(screen.getByTestId('doc-row-doc-2')).getByText('Quyết định')).toBeInTheDocument()
  })

  it('shows a type or status this screen does not know as it is', async () => {
    server.docs = [{ ...mockDocs[0], docType: 'chi_thi', status: 'archived' }]
    renderPage()
    const row = within(await screen.findByTestId('doc-row-doc-1'))
    expect(row.getByText('chi_thi')).toBeInTheDocument()
    expect(row.getByText('archived')).toBeInTheDocument()
  })

  it('explains a list that could not be loaded', async () => {
    api.get.mockRejectedValue(httpError(500, 'internal_error'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách văn bản.')
  })

  it('searches the rows by title and by number', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('doc-row-doc-1')

    await user.type(screen.getByPlaceholderText('Tìm theo tiêu đề, số hiệu...'), 'thành lập')
    expect(screen.queryByTestId('doc-row-doc-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('doc-row-doc-2')).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText('Tìm theo tiêu đề, số hiệu...'))
    await user.type(screen.getByPlaceholderText('Tìm theo tiêu đề, số hiệu...'), '123/cv')
    expect(screen.getByTestId('doc-row-doc-1')).toBeInTheDocument()
    expect(screen.queryByTestId('doc-row-doc-2')).not.toBeInTheDocument()
  })

  it('pages through the documents', async () => {
    server.total = 45
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('doc-row-doc-1')

    expect(screen.getByText('45 văn bản · Trang 1/3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Trang sau' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/official-documents', { params: { page: 2, limit: 20 } }))
    expect(await screen.findByText('45 văn bản · Trang 2/3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(await screen.findByText('45 văn bản · Trang 1/3')).toBeInTheDocument()
  })

  it('filters by type using select', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('type-filter'))
    fireEvent.change(screen.getByTestId('type-filter'), { target: { value: 'cong_van' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/official-documents',
      expect.objectContaining({ params: expect.objectContaining({ type: 'cong_van' }) }),
    ))
  })

  it('filters by type with the pills and by status', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('doc-row-doc-1')

    await user.click(screen.getByRole('button', { name: 'Quyết định' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/official-documents', { params: { page: 1, limit: 20, type: 'quyet_dinh' } }))
    await user.selectOptions(screen.getByTestId('status-filter'), 'draft')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/official-documents', { params: { page: 1, limit: 20, type: 'quyet_dinh', status: 'draft' } }))
    await user.click(screen.getByRole('button', { name: 'Tất cả loại' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/official-documents', { params: { page: 1, limit: 20, status: 'draft' } }))
  })

  it('shows empty state when no documents', async () => {
    server.docs = []
    server.total = 0
    renderPage()
    await waitFor(() => expect(screen.getByText('Chưa có văn bản nào')).toBeInTheDocument())
  })

  it('offers to create the first document', async () => {
    server.docs = []
    server.total = 0
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Tạo văn bản đầu tiên' }))

    expect(screen.getByRole('dialog', { name: 'Tạo văn bản mới' })).toBeInTheDocument()
  })

  // DATE columns arrive as YYYY-MM-DD and must not move a day in timezones behind UTC
  describe('calendar dates', () => {
    const tz = process.env.TZ
    beforeEach(() => {
      process.env.TZ = 'America/Los_Angeles'
    })
    afterEach(() => {
      process.env.TZ = tz
    })

    it('shows the issue and effective dates as the days they are', async () => {
      renderPage()
      const row = within(await screen.findByTestId('doc-row-doc-1'))
      expect(row.getByText('15/01/2024')).toBeInTheDocument()
      expect(row.getByText('01/02/2024')).toBeInTheDocument()
    })
  })

  describe('creating a document', () => {
    it('shows create modal on button click', async () => {
      renderPage()
      await waitFor(() => screen.getByTestId('create-doc-btn'))
      fireEvent.click(screen.getByTestId('create-doc-btn'))
      expect(screen.getByTestId('doc-title-input')).toBeInTheDocument()
      expect(screen.getByTestId('doc-type-select')).toBeInTheDocument()
    })

    it('submits create form and closes modal', async () => {
      renderPage()
      await waitFor(() => screen.getByTestId('create-doc-btn'))
      fireEvent.click(screen.getByTestId('create-doc-btn'))

      fireEvent.change(screen.getByTestId('doc-title-input'), { target: { value: 'Công văn mới' } })
      fireEvent.click(screen.getByTestId('create-doc-submit'))

      await waitFor(() => expect(api.post).toHaveBeenCalledWith(
        '/official-documents',
        expect.objectContaining({ title: 'Công văn mới', docType: 'cong_van' }),
      ))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('names the fields and their examples', async () => {
      await openCreate()

      const dialog = within(screen.getByRole('dialog', { name: 'Tạo văn bản mới' }))
      expect(dialog.getByRole('heading', { name: 'Tạo văn bản mới' })).toBeInTheDocument()
      expect(dialog.getByLabelText(/Tiêu đề/)).toHaveAttribute('placeholder', 'Nhập tiêu đề văn bản...')
      expect(within(dialog.getByLabelText('Loại văn bản')).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Công văn', 'Quyết định', 'Thông báo', 'Báo cáo', 'Biên bản', 'Khác',
      ])
      expect(dialog.getByLabelText('Số hiệu')).toHaveAttribute('placeholder', 'VD: 123/CV-BCA')
      expect(dialog.getByLabelText('Cơ quan ban hành')).toHaveAttribute('placeholder', 'BCA, UBND...')
      expect(dialog.getByLabelText('Ngày ban hành')).toBeInTheDocument()
      expect(dialog.getByLabelText('Ngày hiệu lực')).toBeInTheDocument()
      expect(dialog.getByLabelText('Tóm tắt nội dung')).toHaveAttribute('placeholder', 'Mô tả nội dung văn bản...')
      expect(dialog.getByLabelText('Tệp đính kèm')).toHaveAttribute('type', 'file')
      expect(dialog.getByText('Ảnh, PDF, Word hoặc Excel, tối đa 10 MB.')).toBeInTheDocument()
    })

    it('asks for a title', async () => {
      const user = await openCreate()

      await user.type(screen.getByTestId('doc-title-input'), '   ')
      await user.click(screen.getByTestId('create-doc-submit'))

      expect(await screen.findByText('Vui lòng nhập tiêu đề')).toBeInTheDocument()
      expect(createPosts()).toHaveLength(0)
    })

    it('sends only the fields that were filled in, confirms and reads the list again', async () => {
      const user = await openCreate()
      const before = listGets().length

      await user.type(screen.getByLabelText(/Tiêu đề/), 'Quyết định kiện toàn ban chỉ huy')
      await user.selectOptions(screen.getByLabelText('Loại văn bản'), 'quyet_dinh')
      await user.type(screen.getByLabelText('Số hiệu'), '45/QĐ-UBND')
      await user.type(screen.getByLabelText('Cơ quan ban hành'), 'UBND phường')
      fireEvent.change(screen.getByLabelText('Ngày ban hành'), { target: { value: '2026-09-01' } })
      fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '2026-09-15' } })
      await user.type(screen.getByLabelText('Tóm tắt nội dung'), 'Kiện toàn ban chỉ huy quân sự phường')
      await user.click(screen.getByTestId('create-doc-submit'))

      expect(await screen.findByText('Đã tạo văn bản')).toBeInTheDocument()
      expect(createPosts()[0][1]).toStrictEqual({
        title: 'Quyết định kiện toàn ban chỉ huy',
        docType: 'quyet_dinh',
        docNumber: '45/QĐ-UBND',
        issuedBy: 'UBND phường',
        issuedDate: '2026-09-01',
        effectiveDate: '2026-09-15',
        subject: 'Kiện toàn ban chỉ huy quân sự phường',
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(listGets().length).toBeGreaterThan(before))
    })

    it('shows the saving state while the request runs', async () => {
      api.post.mockImplementation((url: string, body: unknown) =>
        url === '/official-documents' ? new Promise(() => {}) : answerPost(url, body),
      )
      const user = await openCreate()

      await user.type(screen.getByTestId('doc-title-input'), 'Công văn mới')
      await user.click(screen.getByTestId('create-doc-submit'))

      await waitFor(() => expect(screen.getByTestId('create-doc-submit')).toHaveTextContent('Đang lưu...'))
      expect(screen.getByTestId('create-doc-submit')).toBeDisabled()
    })

    it.each([
      { status: 400, code: 'validation_failed', errors: ['docType must be a string'], message: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (docType must be a string)' },
      { status: 403, code: 'Forbidden resource', errors: undefined, message: 'Bạn không có quyền thực hiện thao tác này' },
      { status: 500, code: 'internal_error', errors: undefined, message: 'Không thể tạo văn bản' },
    ])('explains a refused document ($status $code) and keeps the form open', async ({ status, code, errors, message }) => {
      api.post.mockImplementation((url: string, body: unknown) =>
        url === '/official-documents' ? Promise.reject(httpError(status, code, errors)) : answerPost(url, body),
      )
      const user = await openCreate()

      await user.type(screen.getByTestId('doc-title-input'), 'Công văn mới')
      await user.click(screen.getByTestId('create-doc-submit'))

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Tạo văn bản mới' })).toBeInTheDocument()
      expect(screen.queryByText('Đã tạo văn bản')).not.toBeInTheDocument()
    })

    it.each(['Đóng', 'Hủy'])('closes the form with "%s"', async (name) => {
      const user = await openCreate()

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(createPosts()).toHaveLength(0)
    })

    it('closes the form when clicking outside it', async () => {
      await openCreate()

      fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  // POST /files/upload (purpose official_document) → FileView; POST /official-documents { fileId }
  describe('attaching a file', () => {
    it('uploads the chosen file for an official document and sends its id', async () => {
      const user = await openCreate()

      await user.type(screen.getByTestId('doc-title-input'), 'Công văn mới')
      await user.upload(screen.getByLabelText('Tệp đính kèm'), pdf())

      expect(await screen.findByText('cong-van-123.pdf')).toBeInTheDocument()
      expect(uploadPosts()).toHaveLength(1)
      const [, body, config] = uploadPosts()[0]
      expect(body).toBeInstanceOf(FormData)
      expect((body as FormData).get('purpose')).toBe('official_document')
      expect(((body as FormData).get('file') as File).name).toBe('cong-van-123.pdf')
      expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })

      await user.click(screen.getByTestId('create-doc-submit'))

      await waitFor(() => expect(createPosts()).toHaveLength(1))
      expect(createPosts()[0][1]).toStrictEqual({ title: 'Công văn mới', docType: 'cong_van', fileId: FILE_ID })
      expect(await screen.findByText('Đã tạo văn bản')).toBeInTheDocument()
    })

    it('lets the user drop the uploaded file', async () => {
      const user = await openCreate()

      await user.upload(screen.getByLabelText('Tệp đính kèm'), pdf())
      await user.click(await screen.findByRole('button', { name: 'Bỏ tệp' }))

      expect(screen.queryByText('cong-van-123.pdf')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Tệp đính kèm')).toHaveAttribute('type', 'file')
      await user.type(screen.getByTestId('doc-title-input'), 'Công văn mới')
      await user.click(screen.getByTestId('create-doc-submit'))
      await waitFor(() => expect(createPosts()).toHaveLength(1))
      expect(createPosts()[0][1]).toStrictEqual({ title: 'Công văn mới', docType: 'cong_van' })
    })

    it('waits for the upload before the document can be created', async () => {
      api.post.mockImplementation((url: string, body: unknown) =>
        url === '/files/upload' ? new Promise(() => {}) : answerPost(url, body),
      )
      const user = await openCreate()

      await user.upload(screen.getByLabelText('Tệp đính kèm'), pdf())

      expect(await screen.findByText('Đang tải tệp lên...')).toBeInTheDocument()
      expect(screen.getByTestId('create-doc-submit')).toBeDisabled()
    })

    it.each([
      {
        problem: 'file_too_large',
        file: () => {
          const big = pdf('lon.pdf')
          Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
          return big
        },
        message: 'Tệp vượt quá dung lượng cho phép (tối đa 10 MB).',
      },
      { problem: 'file_empty', file: () => new File([], 'rong.pdf', { type: 'application/pdf' }), message: 'Tệp không có nội dung. Vui lòng chọn tệp khác.' },
      {
        problem: 'file_type_not_allowed',
        file: () => new File(['heic'], 'anh.heic', { type: 'image/heic' }),
        message: 'Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF, tệp PDF, Word (.docx) hoặc Excel (.xlsx).',
      },
    ])('refuses a $problem file before sending it', async ({ file, message }) => {
      await openCreate()

      fireEvent.change(screen.getByLabelText('Tệp đính kèm'), { target: { files: [file()] } })

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(uploadPosts()).toHaveLength(0)
    })

    it.each([
      { status: 400, code: 'file_type_not_allowed', message: 'Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF, tệp PDF, Word (.docx) hoặc Excel (.xlsx).' },
      { status: 400, code: 'multipart_malformed', message: 'Tệp bị lỗi trong khi gửi. Vui lòng thử lại.' },
      { status: 500, code: 'internal_error', message: 'Không thể tải tệp lên. Vui lòng thử lại.' },
    ])('explains an upload the server refused ($status $code) and sends no file', async ({ status, code, message }) => {
      api.post.mockImplementation((url: string, body: unknown) =>
        url === '/files/upload' ? Promise.reject(httpError(status, code)) : answerPost(url, body),
      )
      const user = await openCreate()

      await user.upload(screen.getByLabelText('Tệp đính kèm'), pdf())

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.queryByText('cong-van-123.pdf')).not.toBeInTheDocument()
      await user.type(screen.getByTestId('doc-title-input'), 'Công văn mới')
      await user.click(screen.getByTestId('create-doc-submit'))
      await waitFor(() => expect(createPosts()).toHaveLength(1))
      expect(createPosts()[0][1]).toStrictEqual({ title: 'Công văn mới', docType: 'cong_van' })
    })

    // files.service.ts attach(): the refusals of the file, answered before any document exists
    it.each([
      { status: 400, code: 'file_not_found', message: 'Tệp đính kèm không tồn tại hoặc không do bạn tải lên. Vui lòng tải lại tệp.' },
      { status: 400, code: 'duplicate_file_ids', message: 'Có tệp đính kèm bị trùng. Vui lòng bỏ tệp trùng.' },
      { status: 400, code: 'file_purpose_mismatch', message: 'Tệp này được tải lên cho mục đích khác. Vui lòng tải lại tệp.' },
      { status: 409, code: 'file_already_attached', message: 'Tệp này đã được đính kèm vào hồ sơ khác. Vui lòng tải lại tệp.' },
    ])('explains a file the document cannot take ($status $code) and asks for it again', async ({ status, code, message }) => {
      api.post.mockImplementation((url: string, body: unknown) =>
        url === '/official-documents' ? Promise.reject(httpError(status, code)) : answerPost(url, body),
      )
      const user = await openCreate()

      await user.type(screen.getByTestId('doc-title-input'), 'Công văn mới')
      await user.upload(screen.getByLabelText('Tệp đính kèm'), pdf())
      await screen.findByText('cong-van-123.pdf')
      await user.click(screen.getByTestId('create-doc-submit'))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      // Shown once, in the form: not as a toast too
      expect(screen.getAllByText(message)).toHaveLength(1)
      expect(screen.queryByText('cong-van-123.pdf')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Tệp đính kèm')).toHaveAttribute('type', 'file')
      expect(screen.getByRole('dialog', { name: 'Tạo văn bản mới' })).toBeInTheDocument()
      expect(screen.queryByText('Đã tạo văn bản')).not.toBeInTheDocument()
    })
  })

  // GET /official-documents/:id answers the file as create does; its content needs the Bearer token
  describe('document detail', () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:document')
    const revokeObjectURL = vi.fn<(url: string) => void>()

    beforeEach(() => {
      createObjectURL.mockClear()
      revokeObjectURL.mockClear()
      // jsdom has no object URLs
      Object.assign(URL, { createObjectURL, revokeObjectURL })
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    async function openDetail(id = 'doc-1') {
      const user = userEvent.setup()
      renderPage()
      const row = within(await screen.findByTestId(`doc-row-${id}`))
      await user.click(row.getByRole('button', { name: 'Xem chi tiết' }))
      return { user, dialog: within(await screen.findByRole('dialog', { name: 'Chi tiết văn bản' })) }
    }

    it('reads the document and shows its fields', async () => {
      const { dialog } = await openDetail()

      expect(await dialog.findByText('123/CV-BCA')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/official-documents/doc-1')
      expect(dialog.getByRole('heading', { name: 'Công văn về huấn luyện DQTV' })).toBeInTheDocument()
      for (const label of ['Số hiệu', 'Loại văn bản', 'Cơ quan ban hành', 'Ngày ban hành', 'Ngày hiệu lực', 'Ngày hết hạn', 'Trạng thái', 'Tóm tắt nội dung', 'Tệp đính kèm']) {
        expect(dialog.getByText(label)).toBeInTheDocument()
      }
      expect(dialog.getByText('Công văn')).toBeInTheDocument()
      expect(dialog.getByText('BCA')).toBeInTheDocument()
      expect(dialog.getByText('15/01/2024')).toBeInTheDocument()
      expect(dialog.getByText('01/02/2024')).toBeInTheDocument()
      expect(dialog.getByText('Hiệu lực')).toBeInTheDocument()
      expect(dialog.getByText('Hướng dẫn thực hiện huấn luyện')).toBeInTheDocument()
      expect(dialog.getByText('Không có tệp đính kèm')).toBeInTheDocument()
      expect(dialog.queryByRole('button', { name: 'Tải tệp đính kèm' })).not.toBeInTheDocument()
    })

    it('shows the attached file by its name and size', async () => {
      server.detailExtra = { fileId: FILE_ID, file: storedFile }
      const { dialog } = await openDetail()

      expect(await dialog.findByText('cong-van-123.pdf')).toBeInTheDocument()
      expect(dialog.getByText('20 KB')).toBeInTheDocument()
      expect(dialog.queryByText('Không có tệp đính kèm')).not.toBeInTheDocument()
    })

    it.each([
      { size: 512, text: '512 B' },
      { size: 1572864, text: '1,5 MB' },
      // BIGINT and NUMERIC columns may still arrive as strings
      { size: '2048', text: '2 KB' },
    ])('writes a file of $size bytes as $text', async ({ size, text }) => {
      server.detailExtra = { fileId: FILE_ID, file: { ...storedFile, size } }
      const { dialog } = await openDetail()

      expect(await dialog.findByText(text)).toBeInTheDocument()
    })

    it('downloads the attached file under its own name through the signed-in client', async () => {
      server.detailExtra = { fileId: FILE_ID, file: storedFile }
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      const { user, dialog } = await openDetail()

      await user.click(await dialog.findByRole('button', { name: 'Tải tệp đính kèm' }))

      await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
      expect(api.get).toHaveBeenCalledWith(`/files/${FILE_ID}`, expect.objectContaining({ responseType: 'blob' }))
      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('cong-van-123.pdf')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:document')
      expect(screen.queryByText('Không thể tải tệp. Vui lòng thử lại.')).not.toBeInTheDocument()
    })

    it('shows the download state while the file is read', async () => {
      server.detailExtra = { fileId: FILE_ID, file: storedFile }
      api.get.mockImplementation((url: string) => (url === `/files/${FILE_ID}` ? new Promise(() => {}) : answerGet(url)))
      const { user, dialog } = await openDetail()

      await user.click(await dialog.findByRole('button', { name: 'Tải tệp đính kèm' }))

      expect(await dialog.findByRole('button', { name: 'Đang tải xuống...' })).toBeDisabled()
    })

    it.each([
      { status: 404, code: 'file_not_found', message: 'Không tìm thấy tệp, hoặc bạn không có quyền xem tệp này.' },
      { status: 500, code: 'internal_error', message: 'Không thể tải tệp. Vui lòng thử lại.' },
    ])('explains a file that could not be downloaded ($status $code)', async ({ status, code, message }) => {
      server.detailExtra = { fileId: FILE_ID, file: storedFile }
      api.get.mockImplementation((url: string) =>
        url === `/files/${FILE_ID}` ? Promise.reject(blobError(status, code)) : answerGet(url),
      )
      const { user, dialog } = await openDetail()

      await user.click(await dialog.findByRole('button', { name: 'Tải tệp đính kèm' }))

      expect(await screen.findByText(message)).toBeInTheDocument()
    })

    it.each([
      { status: 404, code: 'document_not_found', message: 'Không tìm thấy văn bản.' },
      { status: 500, code: 'internal_error', message: 'Không thể tải thông tin văn bản. Vui lòng thử lại.' },
    ])('explains a document that could not be read ($status $code)', async ({ status, code, message }) => {
      api.get.mockImplementation((url: string) =>
        url === '/official-documents/doc-1' ? Promise.reject(httpError(status, code)) : answerGet(url),
      )
      const { dialog } = await openDetail()

      expect(await dialog.findByRole('alert')).toHaveTextContent(message)
    })

    it('closes the detail', async () => {
      const { user, dialog } = await openDetail()

      await user.click(dialog.getByRole('button', { name: 'Đóng' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('revoking a document', () => {
    it('shows revoke confirmation on revoke button', async () => {
      renderPage()
      await waitFor(() => screen.getByTestId('revoke-btn-doc-1'))
      fireEvent.click(screen.getByTestId('revoke-btn-doc-1'))
      expect(screen.getByTestId('confirm-revoke-doc-1')).toHaveTextContent('Xác nhận')
    })

    it('calls revoke API on confirm', async () => {
      renderPage()
      await waitFor(() => screen.getByTestId('revoke-btn-doc-1'))
      fireEvent.click(screen.getByTestId('revoke-btn-doc-1'))
      fireEvent.click(screen.getByTestId('confirm-revoke-doc-1'))
      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/official-documents/doc-1'))
      expect(await screen.findByText('Đã thu hồi văn bản')).toBeInTheDocument()
      expect(screen.queryByTestId('confirm-revoke-doc-1')).not.toBeInTheDocument()
    })

    it('keeps the document when the revoke is cancelled', async () => {
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByTestId('revoke-btn-doc-1'))

      await user.click(within(screen.getByTestId('doc-row-doc-1')).getByRole('button', { name: 'Hủy' }))

      expect(screen.queryByTestId('confirm-revoke-doc-1')).not.toBeInTheDocument()
      expect(api.delete).not.toHaveBeenCalled()
    })

    it.each([
      { status: 403, code: 'Forbidden resource', message: 'Bạn không có quyền thực hiện thao tác này' },
      { status: 500, code: 'internal_error', message: 'Không thể thu hồi văn bản' },
    ])('explains a refused revoke ($status $code)', async ({ status, code, message }) => {
      api.delete.mockRejectedValue(httpError(status, code))
      const user = userEvent.setup()
      renderPage()
      await user.click(await screen.findByTestId('revoke-btn-doc-1'))

      await user.click(screen.getByTestId('confirm-revoke-doc-1'))

      expect(await screen.findByText(message)).toBeInTheDocument()
    })

    it('offers no revoke for a revoked document', async () => {
      server.docs = [{ ...mockDocs[0], status: 'revoked' }]
      renderPage()
      const row = within(await screen.findByTestId('doc-row-doc-1'))
      expect(row.getByText('Thu hồi')).toBeInTheDocument()
      expect(screen.queryByTestId('revoke-btn-doc-1')).not.toBeInTheDocument()
    })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { MilitiaProfilePage } from './MilitiaProfilePage'
import type { TrainingRecord } from '@/api/training'

// Only the HTTP layer and the signed-in user are replaced: useRbac, the edit dialog, the
// downloads and the toasts run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null, fullName: 'Người dùng' }
}

// Error body produced by the backend HttpExceptionFilter
const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

// GET /files/:id is read as a blob, so its JSON error body arrives as a Blob too
const blobError = (status: number, message: string) => ({
  isAxiosError: true,
  response: {
    status,
    data: new Blob([JSON.stringify({ code: 'E00x', message, statusCode: status })], { type: 'application/json' }),
  },
})

// GET /militia/:id (militia.service.ts getMilitiaById)
const mockProfile = {
  id: 'uuid-1',
  userId: null,
  militiaCode: 'DQTV001',
  fullName: 'Nguyễn Văn Minh',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
  status: 'active',
  phone: '0901234567',
  email: 'minh@test.com',
  rank: 'Chiến sĩ',
  avatarUrl: null,
  // NĐ 72/2020 fields:
  occupation: 'Kỹ sư',
  educationLevel: 'Đại học',
  healthStatus: 'good',
  bloodType: 'A+',
  permanentAddress: '123 Đường Lê Lợi, KP1',
  judicialClearanceStatus: 'clear',
}

const mockTrainingRecords: TrainingRecord[] = [
  {
    id: 'tr-1',
    militiaId: 'uuid-1',
    trainingType: 'military',
    fromDate: '2026-01-10',
    toDate: '2026-01-20',
    totalDays: 10,
    location: 'Hà Nội',
    instructor: 'Trần Văn C',
    result: 'pass',
    certificateNo: 'CERT-001',
    notes: null,
    createdAt: '2026-01-20T10:00:00Z',
  },
  {
    id: 'tr-2',
    militiaId: 'uuid-1',
    trainingType: 'political',
    fromDate: '2026-02-05',
    toDate: '2026-02-10',
    totalDays: 5,
    location: null,
    instructor: null,
    result: 'pass',
    certificateNo: null,
    notes: null,
    createdAt: '2026-02-10T10:00:00Z',
  },
]

// files.service.ts FileView rows of GET /militia/:id/documents, newest first
const PDF = {
  id: '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d01',
  url: '/api/v1/mms_core/files/0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d01',
  name: 'giay-khai-sinh.pdf',
  mimeType: 'application/pdf',
  size: 20480,
}
const PNG = {
  id: '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d02',
  url: '/api/v1/mms_core/files/0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d02',
  name: 'anh-the.png',
  mimeType: 'image/png',
  size: 1572864,
}
const DOCX = {
  id: '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d03',
  url: '/api/v1/mms_core/files/0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d03',
  name: 'so-yeu-ly-lich.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 512,
}

type FileRow = Omit<typeof PDF, 'size'> & { size: number | string }

const server = {
  profile: mockProfile as unknown,
  training: mockTrainingRecords as unknown[],
  history: { assignments: [], taskHistory: [] } as unknown,
  rewards: [] as unknown[],
  documents: [] as FileRow[],
  audit: [] as unknown[],
  uploaded: [] as FileRow[],
}

// Answers that replace the server's for one URL
const overrides = new Map<string, () => Promise<unknown>>()
function serve(url: string, answer: () => Promise<unknown>) {
  overrides.set(url, answer)
}

function answerGet(url: string) {
  const override = overrides.get(url)
  if (override) return override()
  switch (url) {
    case '/militia/uuid-1':
      return Promise.resolve({ data: server.profile })
    case '/training':
      return Promise.resolve({ data: { data: server.training, total: server.training.length, page: 1, limit: 100 } })
    case '/militia/uuid-1/history':
      return Promise.resolve({ data: server.history })
    case '/militia/uuid-1/rewards':
      return Promise.resolve({ data: server.rewards })
    case '/militia/uuid-1/documents':
      return Promise.resolve({ data: server.documents })
    case '/audit':
      return Promise.resolve({ data: { data: server.audit, total: server.audit.length, page: 1, limit: 50 } })
    default:
      if (url.startsWith('/files/')) return Promise.resolve({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) })
      return Promise.reject(new Error(`unexpected GET ${url}`))
  }
}

function answerPost(url: string, body: unknown) {
  if (url === '/files/upload') {
    const file = (body as FormData).get('file') as File
    const id = `5a6b7c8d-1e2f-4a3b-8c4d-${String(server.uploaded.length + 1).padStart(12, '0')}`
    const stored = { id, url: `/api/v1/mms_core/files/${id}`, name: file.name, mimeType: file.type, size: file.size }
    server.uploaded.push(stored)
    return Promise.resolve({ data: stored })
  }
  if (url === '/militia/uuid-1/documents') {
    // attachMilitiaDocuments(): the files in the order given; the list reads newest first
    const { fileIds } = body as { fileIds: string[] }
    const attached = fileIds.map((id) => server.uploaded.find((file) => file.id === id) as FileRow)
    server.documents = [...[...attached].reverse(), ...server.documents]
    return Promise.resolve({ data: attached })
  }
  return Promise.reject(new Error(`unexpected POST ${url}`))
}

const profileGets = () => api.get.mock.calls.filter(([url]) => url === '/militia/uuid-1')
const documentGets = () => api.get.mock.calls.filter(([url]) => url === '/militia/uuid-1/documents')
const uploadPosts = () => api.post.mock.calls.filter(([url]) => url === '/files/upload')
const attachPosts = () => api.post.mock.calls.filter(([url]) => url === '/militia/uuid-1/documents')

function renderWithProviders(id = 'uuid-1', retry: boolean | number = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[`/militia/${id}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/militia/:id" element={<MilitiaProfilePage />} />
          <Route path="/militia" element={<div>Danh sách DQTV</div>} />
        </Routes>
        <Toaster theme="light" />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function openTab(tab: string) {
  renderWithProviders()
  await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId(`tab-${tab}`))
}

describe('MilitiaProfilePage', () => {
  beforeEach(() => {
    // mockReset also drops answers queued with mock*Once by an earlier test
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    overrides.clear()
    signInAs('office_staff')
    server.profile = mockProfile
    server.training = mockTrainingRecords
    server.history = { assignments: [], taskHistory: [] }
    server.rewards = []
    server.documents = []
    server.audit = []
    server.uploaded = []
    api.get.mockImplementation(answerGet)
    api.post.mockImplementation(answerPost)
  })

  it('renders profile after load', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument()
    })
  })

  it('renders status badge', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getAllByText('Đang hoạt động').length).toBeGreaterThan(0)
    })
  })

  it('renders the page header with the militia code', async () => {
    renderWithProviders()
    await screen.findByText('Nguyễn Văn Minh')

    expect(screen.getByRole('heading', { level: 1, name: 'Chi tiết Dân Quân Tự Vệ' })).toBeInTheDocument()
    expect(screen.getByText('Thông tin đầy đủ và lịch sử hoạt động')).toBeInTheDocument()
    expect(screen.getByTestId('profile-code')).toHaveTextContent('Mã DQTV: DQTV001')
    expect(screen.getByTestId('back-btn')).toHaveAccessibleName('Quay lại danh sách')
    expect(screen.getByTestId('edit-btn')).toHaveTextContent('Chỉnh sửa')
    expect(screen.getByRole('button', { name: 'Xuất hồ sơ' })).toBeInTheDocument()
  })

  it('renders all 6 tabs', async () => {
    renderWithProviders()
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
    expect(screen.getByTestId('tab-personal')).toHaveTextContent('Hồ sơ cá nhân')
    expect(screen.getByTestId('tab-history')).toHaveTextContent('Quá trình công tác')
    expect(screen.getByTestId('tab-training')).toHaveTextContent('Huấn luyện')
    expect(screen.getByTestId('tab-rewards')).toHaveTextContent('Khen thưởng - Kỷ luật')
    expect(screen.getByTestId('tab-documents')).toHaveTextContent('Hồ sơ đính kèm')
    expect(screen.getByTestId('tab-changelog')).toHaveTextContent('Lịch sử chỉnh sửa')
  })

  it('switches tab content on click', async () => {
    await openTab('history')
    await waitFor(() => expect(screen.getByTestId('history-tab')).toBeInTheDocument())
  })

  it('shows error state when API fails', async () => {
    serve('/militia/uuid-1', () => Promise.reject(new Error('Network error')))
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải thông tin/)).toBeInTheDocument()
    })
  })

  it('explains a profile request that got no answer', async () => {
    serve('/militia/uuid-1', () => Promise.reject({ request: {} }))
    renderWithProviders()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
    )
  })

  it('does not show an empty profile when the answer has none', async () => {
    server.profile = null
    renderWithProviders()

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải thông tin. Vui lòng thử lại.')
    expect(screen.queryByTestId('militia-profile-page')).not.toBeInTheDocument()
  })

  it('has back button', async () => {
    renderWithProviders()
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
    expect(screen.getByTestId('back-btn')).toBeInTheDocument()
  })

  // Web/backend/src/militia/militia.service.ts assertCanReadProfile + common/access/unit-scope.ts
  describe('profile refused by the backend', () => {
    it.each([
      [404, 'militia_not_found', 'Không tìm thấy hồ sơ DQTV này, hoặc bạn không có quyền xem hồ sơ.'],
      [403, 'unit_scope_violation', 'Hồ sơ này thuộc đơn vị nằm ngoài phạm vi quản lý của bạn.'],
      [403, 'no_unit_scope', 'Tài khoản của bạn chưa được gán đơn vị quản lý. Vui lòng liên hệ quản trị viên.'],
      [400, 'Validation failed (uuid is expected)', 'Đường dẫn hồ sơ không hợp lệ.'],
      [403, 'Forbidden resource', 'Bạn không có quyền xem hồ sơ này.'],
      [404, 'Not Found', 'Không tìm thấy hồ sơ DQTV này, hoặc bạn không có quyền xem hồ sơ.'],
    ])('explains HTTP %i %s instead of a blank page', async (status, code, message) => {
      serve('/militia/uuid-1', () => Promise.reject(httpError(status, code)))
      renderWithProviders()

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.queryByTestId('militia-profile-page')).not.toBeInTheDocument()
    })

    it('does not retry a refusal, so the message appears at once', async () => {
      serve('/militia/uuid-1', () => Promise.reject(httpError(404, 'militia_not_found')))
      renderWithProviders('uuid-1', 3)

      expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy hồ sơ DQTV')
      expect(profileGets()).toHaveLength(1)
    })

    it('offers a way back to the list', async () => {
      serve('/militia/uuid-1', () => Promise.reject(httpError(404, 'militia_not_found')))
      renderWithProviders()

      fireEvent.click(await screen.findByRole('button', { name: 'Quay lại danh sách' }))

      expect(await screen.findByText('Danh sách DQTV')).toBeInTheDocument()
    })

    it('explains a refused tab request instead of showing it as empty', async () => {
      serve('/militia/uuid-1/history', () => Promise.reject(httpError(403, 'unit_scope_violation')))
      await openTab('history')

      const tab = within(await screen.findByTestId('history-tab'))
      expect(await tab.findByRole('alert')).toHaveTextContent('Hồ sơ này thuộc đơn vị nằm ngoài phạm vi quản lý của bạn.')
    })

    it('explains a tab the role may not read', async () => {
      serve('/militia/uuid-1/history', () => Promise.reject(httpError(403, 'Forbidden resource')))
      await openTab('history')

      const tab = within(await screen.findByTestId('history-tab'))
      expect(await tab.findByRole('alert')).toHaveTextContent('Bạn không có quyền xem quá trình công tác của hồ sơ này.')
    })
  })

  describe('History tab', () => {
    it('lists the CA assignments and the tasks', async () => {
      server.history = {
        assignments: [{ id: 'as1', caUsername: 'ca.phudinh', assignedAt: '2026-03-02' }],
        taskHistory: [{ id: 'tk1', title: 'Tuần tra khu phố 1', status: 'completed' }],
      }
      await openTab('history')

      const tab = within(await screen.findByTestId('history-tab'))
      expect(await tab.findByText('CA: ca.phudinh — 02/03/2026')).toBeInTheDocument()
      expect(tab.getByText('Phân công CA–DQTV')).toBeInTheDocument()
      expect(tab.getByText('Lịch sử nhiệm vụ')).toBeInTheDocument()
      expect(tab.getByText('Tuần tra khu phố 1')).toBeInTheDocument()
      expect(tab.getByText('completed')).toBeInTheDocument()
    })

    it('says when there is no assignment and no task', async () => {
      await openTab('history')

      const tab = within(await screen.findByTestId('history-tab'))
      expect(await tab.findByText('Chưa có phân công.')).toBeInTheDocument()
      expect(tab.getByText('Chưa có nhiệm vụ nào.')).toBeInTheDocument()
    })
  })

  describe('Rewards tab', () => {
    it('lists rewards and disciplines with their details', async () => {
      server.rewards = [
        { id: 'rw1', rewardType: 'reward', title: 'Giấy khen', description: null, issuedDate: '2026-03-15', issuedBy: 'UBND phường' },
        { id: 'rw2', rewardType: 'discipline', title: 'Khiển trách', description: 'Vắng mặt không lý do', issuedDate: null, issuedBy: null },
      ]
      await openTab('rewards')

      const tab = within(await screen.findByTestId('rewards-tab'))
      expect(await tab.findByText('Giấy khen')).toBeInTheDocument()
      expect(tab.getByText('Khen thưởng')).toBeInTheDocument()
      expect(tab.getByText('Kỷ luật')).toBeInTheDocument()
      expect(tab.getByText('Vắng mặt không lý do')).toBeInTheDocument()
      expect(tab.getByText(/— UBND phường/)).toBeInTheDocument()
    })

    it('says when there is no reward or discipline', async () => {
      await openTab('rewards')
      expect(await within(await screen.findByTestId('rewards-tab')).findByText('Chưa có khen thưởng / kỷ luật')).toBeInTheDocument()
    })

    it('explains when the role may not read rewards', async () => {
      serve('/militia/uuid-1/rewards', () => Promise.reject(httpError(403, 'Forbidden resource')))
      await openTab('rewards')

      const tab = within(await screen.findByTestId('rewards-tab'))
      expect(await tab.findByRole('alert')).toHaveTextContent('Bạn không có quyền xem khen thưởng - kỷ luật của hồ sơ này.')
    })
  })

  // GET /militia/:id/documents → FileView[]; the content needs the Bearer token (GET /files/:id)
  describe('Documents tab', () => {
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

    async function openDocuments() {
      await openTab('documents')
      return within(await screen.findByTestId('documents-tab'))
    }

    it('lists the attached files in the order given, with their type and size', async () => {
      server.documents = [PDF, PNG, DOCX]
      const tab = await openDocuments()

      const items = await tab.findAllByRole('listitem')
      expect(items).toHaveLength(3)
      expect(api.get).toHaveBeenCalledWith('/militia/uuid-1/documents')
      expect(within(items[0]).getByText('giay-khai-sinh.pdf')).toBeInTheDocument()
      expect(within(items[0]).getByText('PDF · 20 KB')).toBeInTheDocument()
      expect(within(items[1]).getByText('anh-the.png')).toBeInTheDocument()
      expect(within(items[1]).getByText('Ảnh · 1,5 MB')).toBeInTheDocument()
      expect(within(items[2]).getByText('so-yeu-ly-lich.docx')).toBeInTheDocument()
      expect(within(items[2]).getByText('Word · 512 B')).toBeInTheDocument()
    })

    it('shows a type it has no name for as the stored type, and a size sent as text', async () => {
      server.documents = [{ ...DOCX, mimeType: 'application/octet-stream', size: '2048' }]
      const tab = await openDocuments()

      expect(await tab.findByText('application/octet-stream · 2 KB')).toBeInTheDocument()
    })

    it('downloads a file under its own name through the signed-in client', async () => {
      server.documents = [PDF, PNG]
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      const user = userEvent.setup()
      const tab = await openDocuments()

      const items = await tab.findAllByRole('listitem')
      await user.click(within(items[1]).getByRole('button', { name: 'Tải xuống' }))

      await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
      expect(api.get).toHaveBeenCalledWith(`/files/${PNG.id}`, expect.objectContaining({ responseType: 'blob' }))
      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('anh-the.png')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:document')
    })

    it('shows the download state on the file being read', async () => {
      server.documents = [PDF, PNG]
      serve(`/files/${PDF.id}`, () => new Promise(() => {}))
      const user = userEvent.setup()
      const tab = await openDocuments()

      const items = await tab.findAllByRole('listitem')
      await user.click(within(items[0]).getByRole('button', { name: 'Tải xuống' }))

      expect(await within(items[0]).findByRole('button', { name: 'Đang tải xuống...' })).toBeDisabled()
      expect(within(items[1]).getByRole('button', { name: 'Tải xuống' })).toBeEnabled()
    })

    it.each([
      { status: 404, code: 'file_not_found', message: 'Không tìm thấy tệp, hoặc bạn không có quyền xem tệp này.' },
      { status: 500, code: 'internal_error', message: 'Không thể tải tệp. Vui lòng thử lại.' },
    ])('explains a file that could not be downloaded ($status $code)', async ({ status, code, message }) => {
      server.documents = [PDF]
      serve(`/files/${PDF.id}`, () => Promise.reject(blobError(status, code)))
      const user = userEvent.setup()
      const tab = await openDocuments()

      await user.click(await tab.findByRole('button', { name: 'Tải xuống' }))

      expect(await screen.findByText(message)).toBeInTheDocument()
    })

    it('says when there is no document', async () => {
      const tab = await openDocuments()
      expect(await tab.findByText('Chưa có tài liệu đính kèm')).toBeInTheDocument()
    })

    it.each([
      [403, 'Forbidden resource', 'Bạn không có quyền xem tài liệu của hồ sơ này.'],
      [404, 'militia_not_found', 'Không tìm thấy hồ sơ DQTV này, hoặc bạn không có quyền xem hồ sơ.'],
      [404, 'Not Found', 'Không tìm thấy hồ sơ DQTV này, hoặc bạn không có quyền xem hồ sơ.'],
      [500, 'internal_error', 'Không thể tải dữ liệu. Vui lòng thử lại.'],
    ])('explains HTTP %i %s', async (status, code, message) => {
      serve('/militia/uuid-1/documents', () => Promise.reject(httpError(status, code)))
      const tab = await openDocuments()

      expect(await tab.findByRole('alert')).toHaveTextContent(message)
    })

    // POST /militia/:id/documents @Roles(...MILITIA_STAFF_ROLES), { fileIds } of uploads for militia_profile
    describe('adding documents', () => {
      const pdfFile = (name: string) => new File(['%PDF-1.4 noi dung'], name, { type: 'application/pdf' })
      const pngFile = (name: string) => new File(['png'], name, { type: 'image/png' })

      it('offers adding documents to militia staff', async () => {
        const tab = await openDocuments()

        const input = await tab.findByLabelText('Thêm giấy tờ')
        expect(input).toHaveAttribute('type', 'file')
        expect(input).toHaveAttribute('multiple')
        expect(tab.getByText('Chọn tối đa 10 tệp: ảnh, PDF, Word hoặc Excel, mỗi tệp tối đa 10 MB.')).toBeInTheDocument()
      })

      it.each(['dqtv_member', 'dqtv'])('does not offer it to %s, who only reads their own documents', async (role) => {
        signInAs(role)
        const tab = await openDocuments()

        await tab.findByText('Chưa có tài liệu đính kèm')
        expect(tab.queryByLabelText('Thêm giấy tờ')).not.toBeInTheDocument()
      })

      it('uploads each file for the profile, attaches them and reads the list again', async () => {
        const user = userEvent.setup()
        const tab = await openDocuments()
        await tab.findByText('Chưa có tài liệu đính kèm')
        const listReads = documentGets().length

        await user.upload(tab.getByLabelText('Thêm giấy tờ'), [pdfFile('giay-khai-sinh.pdf'), pngFile('anh-the.png')])

        expect(await screen.findByText('Đã thêm giấy tờ vào hồ sơ.')).toBeInTheDocument()
        const uploads = uploadPosts()
        expect(uploads).toHaveLength(2)
        for (const [, body, config] of uploads) {
          expect((body as FormData).get('purpose')).toBe('militia_profile')
          expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
        }
        expect(((uploads[0][1] as FormData).get('file') as File).name).toBe('giay-khai-sinh.pdf')
        expect(attachPosts()).toHaveLength(1)
        expect(attachPosts()[0][1]).toStrictEqual({ fileIds: server.uploaded.map((file) => file.id) })
        await waitFor(() => expect(documentGets().length).toBeGreaterThan(listReads))
        expect(await tab.findByText('anh-the.png')).toBeInTheDocument()
        expect(tab.getByText('giay-khai-sinh.pdf')).toBeInTheDocument()
      })

      it('refuses more than ten files at once', async () => {
        const tab = await openDocuments()

        fireEvent.change(await tab.findByLabelText('Thêm giấy tờ'), {
          target: { files: Array.from({ length: 11 }, (_, i) => pdfFile(`giay-${i + 1}.pdf`)) },
        })

        expect(await tab.findByRole('alert')).toHaveTextContent('Chỉ chọn tối đa 10 tệp mỗi lần.')
        expect(uploadPosts()).toHaveLength(0)
      })

      it('refuses a file the server would refuse before sending any', async () => {
        const tab = await openDocuments()

        fireEvent.change(await tab.findByLabelText('Thêm giấy tờ'), {
          target: { files: [pdfFile('giay-khai-sinh.pdf'), new File([], 'rong.pdf', { type: 'application/pdf' })] },
        })

        expect(await tab.findByRole('alert')).toHaveTextContent('rong.pdf: Tệp không có nội dung. Vui lòng chọn tệp khác.')
        expect(uploadPosts()).toHaveLength(0)
      })

      it('explains an upload the server refused and attaches nothing', async () => {
        api.post.mockImplementation((url: string, body: unknown) =>
          url === '/files/upload' ? Promise.reject(httpError(400, 'file_type_not_allowed')) : answerPost(url, body),
        )
        const user = userEvent.setup()
        const tab = await openDocuments()

        await user.upload(await tab.findByLabelText('Thêm giấy tờ'), pdfFile('giay-khai-sinh.pdf'))

        expect(await tab.findByRole('alert')).toHaveTextContent(
          'Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF, tệp PDF, Word (.docx) hoặc Excel (.xlsx).',
        )
        expect(attachPosts()).toHaveLength(0)
      })

      // A refused attach claims no file (one transaction)
      it.each([
        { status: 400, code: 'file_purpose_mismatch', message: 'Tệp này được tải lên cho mục đích khác. Vui lòng tải lại tệp.' },
        { status: 409, code: 'file_already_attached', message: 'Tệp này đã được đính kèm vào hồ sơ khác. Vui lòng tải lại tệp.' },
        { status: 403, code: 'insufficient_role', message: 'Bạn không có quyền thêm giấy tờ vào hồ sơ DQTV.' },
        { status: 403, code: 'unit_scope_violation', message: 'Hồ sơ này thuộc đơn vị nằm ngoài phạm vi quản lý của bạn.' },
        { status: 404, code: 'militia_not_found', message: 'Không tìm thấy hồ sơ DQTV này, hoặc bạn không có quyền xem hồ sơ.' },
        { status: 500, code: 'internal_error', message: 'Không thể thêm giấy tờ vào hồ sơ. Vui lòng thử lại.' },
      ])('explains a refused attach ($status $code)', async ({ status, code, message }) => {
        api.post.mockImplementation((url: string, body: unknown) =>
          url === '/militia/uuid-1/documents' ? Promise.reject(httpError(status, code)) : answerPost(url, body),
        )
        const user = userEvent.setup()
        const tab = await openDocuments()

        await user.upload(await tab.findByLabelText('Thêm giấy tờ'), pdfFile('giay-khai-sinh.pdf'))

        expect(await tab.findByRole('alert')).toHaveTextContent(message)
        expect(tab.getByText('Chưa có tài liệu đính kèm')).toBeInTheDocument()
        expect(screen.queryByText('Đã thêm giấy tờ vào hồ sơ.')).not.toBeInTheDocument()
      })

      it('lets the user try again after a refused attach', async () => {
        let attempts = 0
        api.post.mockImplementation((url: string, body: unknown) => {
          if (url === '/militia/uuid-1/documents' && attempts++ === 0) {
            return Promise.reject(httpError(409, 'file_already_attached'))
          }
          return answerPost(url, body)
        })
        const user = userEvent.setup()
        const tab = await openDocuments()

        await user.upload(await tab.findByLabelText('Thêm giấy tờ'), pdfFile('giay-khai-sinh.pdf'))
        await tab.findByRole('alert')
        await user.upload(tab.getByLabelText('Thêm giấy tờ'), pdfFile('giay-khai-sinh.pdf'))

        expect(await tab.findByText('giay-khai-sinh.pdf')).toBeInTheDocument()
        expect(tab.queryByRole('alert')).not.toBeInTheDocument()
        expect(attachPosts()).toHaveLength(2)
      })

      it('shows the upload state while the files are sent', async () => {
        api.post.mockImplementation((url: string, body: unknown) =>
          url === '/files/upload' ? new Promise(() => {}) : answerPost(url, body),
        )
        const user = userEvent.setup()
        const tab = await openDocuments()

        await user.upload(await tab.findByLabelText('Thêm giấy tờ'), pdfFile('giay-khai-sinh.pdf'))

        expect(await tab.findByText('Đang tải lên...')).toBeInTheDocument()
        expect(tab.getByLabelText('Thêm giấy tờ')).toBeDisabled()
      })
    })
  })

  describe('Changelog tab', () => {
    it('reads the audit log for this profile by entityType and entityId', async () => {
      await openTab('changelog')

      // The audit interceptor records /militia/:id requests under entityType "militia"
      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith('/audit', {
          params: { entityType: 'militia', entityId: 'uuid-1', limit: 50 },
        }),
      )
    })

    it('says when the profile was never edited', async () => {
      await openTab('changelog')
      expect(await within(await screen.findByTestId('changelog-tab')).findByText('Chưa có lịch sử chỉnh sửa')).toBeInTheDocument()
    })

    it('lists the audit entries with their actor', async () => {
      server.audit = [
        { id: 'l1', actorId: 'u9', actorName: 'Trần Văn C', action: 'PATCH:militia', entityType: 'militia', entityId: 'uuid-1', beforeJson: null, afterJson: null, ipAddress: null, createdAt: '2026-09-01T03:00:00Z' },
      ]
      await openTab('changelog')

      expect(await screen.findByText('PATCH:militia')).toBeInTheDocument()
      expect(screen.getByText('bởi Trần Văn C')).toBeInTheDocument()
    })

    it('explains when the role may not read the audit log', async () => {
      serve('/audit', () => Promise.reject(httpError(403, 'Forbidden resource')))
      await openTab('changelog')

      const tab = within(await screen.findByTestId('changelog-tab'))
      expect(await tab.findByRole('alert')).toHaveTextContent('Bạn không có quyền xem lịch sử chỉnh sửa của hồ sơ này.')
    })
  })

  // Training tab tests
  describe('Training tab', () => {
    it('reads the records of this member for the current year', async () => {
      await openTab('training')

      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith('/training', {
          params: { militiaId: 'uuid-1', year: new Date().getFullYear(), limit: 100 },
        }),
      )
    })

    it('renders training records table when data is present', async () => {
      await openTab('training')
      await waitFor(() => {
        expect(screen.getByTestId('training-table')).toBeInTheDocument()
      })
    })

    it('names the columns, the types and the results', async () => {
      server.training = [
        mockTrainingRecords[0],
        { ...mockTrainingRecords[1], trainingType: 'first_aid', result: 'fail' },
        // Values the backend may add later than this screen
        { ...mockTrainingRecords[1], id: 'tr-3', trainingType: 'drone', result: 'unknown' },
      ]
      await openTab('training')

      const table = within(await screen.findByTestId('training-table'))
      expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
        'Loại', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Địa điểm', 'Kết quả',
      ])
      expect(table.getByText('Sơ cứu')).toBeInTheDocument()
      expect(table.getByText('drone')).toBeInTheDocument()
      expect(table.getByText('Đạt')).toBeInTheDocument()
      expect(table.getByText('Không đạt')).toBeInTheDocument()
      expect(table.getByText('Chưa đánh giá')).toBeInTheDocument()
    })

    it('totalDays >= 15 shows green Đạt badge', async () => {
      // 10 + 5 = 15 days → meets requirement
      await openTab('training')
      await waitFor(() => {
        const badge = screen.getByTestId('compliance-badge')
        expect(badge).toBeInTheDocument()
        expect(badge.textContent).toMatch(/Đạt/)
        expect(badge.className).toMatch(/green|2E7D32/)
      })
      expect(screen.getByTestId('compliance-badge')).toHaveTextContent(
        `Năm ${new Date().getFullYear()}: 15/15 ngày — Đạt ✓`,
      )
    })

    // training_records.total_days is DECIMAL(5,1), sent as a JSON number (database/pg-types.ts)
    it('adds up half training days', async () => {
      server.training = [
        { ...mockTrainingRecords[0], totalDays: 10 },
        { ...mockTrainingRecords[1], totalDays: 5.5 },
      ]
      await openTab('training')

      // The badge counts the loaded records: wait for them before reading it
      const table = within(await screen.findByTestId('training-table'))
      expect(screen.getByTestId('compliance-badge')).toHaveTextContent(
        `Năm ${new Date().getFullYear()}: 15.5/15 ngày — Đạt ✓`,
      )
      expect(table.getByText('10')).toBeInTheDocument()
      expect(table.getByText('5.5')).toBeInTheDocument()
    })

    it('totalDays < 15 shows red Chưa đạt badge', async () => {
      server.training = [{ ...mockTrainingRecords[0], totalDays: 8 }]
      await openTab('training')
      // Before the records load the badge reads 0 days, which is also "Chưa đạt"
      await screen.findByTestId('training-table')
      await waitFor(() => {
        const badge = screen.getByTestId('compliance-badge')
        expect(badge.textContent).toMatch(/Chưa đạt/)
        expect(badge.className).toMatch(/red|C62828/)
      })
      expect(screen.getByTestId('compliance-badge')).toHaveTextContent(': 8/15 ngày — Chưa đạt ✗')
    })

    it('empty records shows empty state message', async () => {
      server.training = []
      await openTab('training')
      await waitFor(() => {
        expect(screen.getByTestId('training-empty')).toBeInTheDocument()
        expect(screen.getByText('Chưa có dữ liệu huấn luyện')).toBeInTheDocument()
      })
    })

    it("training type 'military' maps to 'Quân sự'", async () => {
      await openTab('training')
      await waitFor(() => {
        expect(screen.getByText('Quân sự')).toBeInTheDocument()
      })
    })
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

    it('shows training dates as the days they are', async () => {
      await openTab('training')
      const table = within(await screen.findByTestId('training-table'))
      expect(table.getByText('10/01/2026')).toBeInTheDocument()
      expect(table.getByText('20/01/2026')).toBeInTheDocument()
    })

    it('shows the reward issue date as the day it is', async () => {
      server.rewards = [{ id: 'rw1', rewardType: 'reward', title: 'Giấy khen', description: null, issuedDate: '2026-03-15', issuedBy: 'UBND phường' }]
      await openTab('rewards')
      expect(await within(await screen.findByTestId('rewards-tab')).findByText(/15\/03\/2026/)).toBeInTheDocument()
    })
  })

  // NĐ 72/2020 personal tab fields
  describe('Personal tab NĐ 72 fields', () => {
    it('names every field', async () => {
      renderWithProviders()
      await screen.findByText('Nguyễn Văn Minh')

      for (const label of [
        'Mã DQTV', 'Cấp bậc', 'Điện thoại', 'Email', 'Đơn vị', 'Trạng thái', 'Nghề nghiệp',
        'Trình độ học vấn', 'Sức khỏe', 'Nhóm máu', 'Địa chỉ thường trú', 'Lý lịch tư pháp',
      ]) {
        expect(screen.getByText(label)).toBeInTheDocument()
      }
    })

    it('renders occupation and blood type', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByText('Kỹ sư')).toBeInTheDocument()
      expect(screen.getByText('A+')).toBeInTheDocument()
    })

    it('renders education level and health status label', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByText('Đại học')).toBeInTheDocument()
      expect(screen.getByText('Tốt')).toBeInTheDocument()
    })

    it('renders permanent address and judicial clearance label', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByText('123 Đường Lê Lợi, KP1')).toBeInTheDocument()
      expect(screen.getByText('Sạch')).toBeInTheDocument()
    })

    it('shows values this screen has no label for as they are', async () => {
      server.profile = {
        ...mockProfile,
        status: 'suspended',
        healthStatus: 'excellent',
        judicialClearanceStatus: 'flagged',
      }
      renderWithProviders()
      await screen.findByText('Nguyễn Văn Minh')

      expect(screen.getAllByText('suspended')).toHaveLength(2)
      expect(screen.getByText('excellent')).toBeInTheDocument()
      expect(screen.getByText('Có vấn đề')).toBeInTheDocument()
    })
  })

  describe('Profile export', () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:profile')
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

    it('downloads the exported data as a JSON file', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      serve('/militia/me/data-export', () => Promise.resolve({ data: { fullName: 'Nguyễn Văn Minh' } }))
      renderWithProviders()
      await screen.findByText('Nguyễn Văn Minh')

      fireEvent.click(screen.getByRole('button', { name: 'Xuất hồ sơ' }))

      await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
      const anchor = click.mock.contexts[0] as HTMLAnchorElement
      expect(anchor.download).toMatch(/^ho-so-DQTV-Nguyễn Văn Minh-\d{4}-\d{2}-\d{2}\.json$/)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:profile')
      expect(screen.queryByText('Không thể xuất hồ sơ. Vui lòng thử lại.')).not.toBeInTheDocument()
    })

    it('tells when the export failed', async () => {
      serve('/militia/me/data-export', () => Promise.reject(httpError(500, 'internal_error')))
      renderWithProviders()
      await screen.findByText('Nguyễn Văn Minh')

      fireEvent.click(screen.getByRole('button', { name: 'Xuất hồ sơ' }))

      expect(await screen.findByText('Không thể xuất hồ sơ. Vui lòng thử lại.')).toBeInTheDocument()
    })
  })

  describe('Edit button', () => {
    it('renders Chỉnh sửa button', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByTestId('edit-btn')).toBeInTheDocument()
    })

    it('opens edit modal when Chỉnh sửa is clicked', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      fireEvent.click(screen.getByTestId('edit-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('militia-edit-modal')).toBeInTheDocument()
      })
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RecruitmentPage } from './RecruitmentPage'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
// Real useRbac: the page follows the recruitment.controller.ts @Roles
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

const mockApps = [
  {
    id: 'a1',
    name: 'Nguyễn Văn X',
    status: 'new',
    phone: '0901234567',
    address: 'KP1',
    age: 25,
    applyDate: '2026-04-01',
    district: 'Khu phố 1',
    email: 'x@example.com',
    idNumber: '079201001234',
  },
  { id: 'a2', name: 'Trần Thị Y', status: 'approved', phone: '0912345678', address: 'KP2', age: 23, applyDate: '2026-04-10' },
]

// GET /recruitment/applications?status=&page=&limit= answers { data, total } (recruitment.service.ts:20-37)
const server = {
  apps: mockApps as Record<string, unknown>[],
  totals: { all: 45, new: 12, reviewing: 8, approved: 20, rejected: 5 } as Record<string, number>,
}

type ListParams = { status?: string; page?: number; limit?: number }

function answerList(url: string, config?: { params?: ListParams }) {
  if (url !== '/recruitment/applications') return Promise.reject(new Error(`unexpected GET ${url}`))
  const { status, page = 1, limit = 20 } = config?.params ?? {}
  const rows = server.apps.filter((a) => !status || a.status === status)
  return Promise.resolve({
    data: { data: rows.slice((page - 1) * limit, page * limit), total: server.totals[status ?? 'all'] },
  })
}

const listCalls = (match: (params: ListParams) => boolean) =>
  api.get.mock.calls.filter(
    ([url, config]) => url === '/recruitment/applications' && match(((config as { params?: ListParams })?.params ?? {})),
  )

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null, fullName: 'Người dùng' }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/recruitment']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/recruitment" element={<RecruitmentPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('RecruitmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signInAs('system_admin')
    server.apps = mockApps
    api.get.mockImplementation(answerList)
    api.post.mockResolvedValue({ data: { id: 'a3' } })
    api.patch.mockResolvedValue({ data: { id: 'a1', status: 'approved' } })
  })

  it('renders page', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('recruitment-page')).toBeInTheDocument())
  })

  it('shows applicant names after load', async () => {
    wrap()
    await waitFor(() => expect(screen.getByText('Nguyễn Văn X')).toBeInTheDocument())
    expect(screen.getByText('Trần Thị Y')).toBeInTheDocument()
  })

  it('shows create application button', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('create-application-btn')).toBeInTheDocument())
  })

  describe('paging ({ data, total } answer)', () => {
    it('lists the rows of the envelope and asks for one page', async () => {
      wrap()

      expect(await screen.findByTestId('application-row-a1')).toBeInTheDocument()
      expect(screen.getByTestId('application-row-a2')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/recruitment/applications', { params: { page: 1, limit: 20 } })
    })

    it('counts each status from the server totals, not from the rows of the page', async () => {
      wrap()

      await waitFor(() => expect(screen.getByTestId('recruitment-tab-all')).toHaveTextContent('45'))
      expect(screen.getByTestId('recruitment-tab-new')).toHaveTextContent('12')
      expect(screen.getByTestId('recruitment-tab-reviewing')).toHaveTextContent('8')
      expect(screen.getByTestId('recruitment-tab-approved')).toHaveTextContent('20')
      expect(screen.getByTestId('recruitment-tab-rejected')).toHaveTextContent('5')
    })

    it('moves to the next page of the current tab', async () => {
      const user = userEvent.setup()
      wrap()
      await screen.findByTestId('application-row-a1')

      expect(screen.getByTestId('recruitment-page-indicator')).toHaveTextContent('1 / 3')
      await user.click(screen.getByRole('button', { name: 'Trang sau' }))

      await waitFor(() => expect(listCalls((p) => p.page === 2 && p.limit === 20 && !p.status)).toHaveLength(1))
      expect(screen.getByTestId('recruitment-page-indicator')).toHaveTextContent('2 / 3')
    })

    it('asks for the chosen status from its first page', async () => {
      const user = userEvent.setup()
      wrap()
      await screen.findByTestId('application-row-a1')
      await user.click(screen.getByRole('button', { name: 'Trang sau' }))

      await user.click(screen.getByTestId('recruitment-tab-new'))

      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/recruitment/applications', { params: { status: 'new', page: 1, limit: 20 } }))
      expect(await screen.findByTestId('application-row-a1')).toBeInTheDocument()
      expect(screen.queryByTestId('application-row-a2')).not.toBeInTheDocument()
    })
  })

  describe('access (recruitment.controller.ts @Roles)', () => {
    it.each(['police_area', 'ca_ward', 'ca_area', 'ubnd_leader', 'dqtv_member'])(
      'sends %s, who may not list applications, to the forbidden page',
      async (role) => {
        signInAs(role)
        wrap()
        expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
        expect(api.get).not.toHaveBeenCalled()
      },
    )

    it('lets ca_officer read applications but not create or change them', async () => {
      signInAs('ca_officer')
      wrap()

      const row = within(await screen.findByTestId('application-row-a1'))
      expect(row.getByText('Nguyễn Văn X')).toBeInTheDocument()
      expect(screen.queryByTestId('create-application-btn')).not.toBeInTheDocument()
      expect(screen.queryByTestId('approve-btn-a1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('reject-btn-a1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('review-btn-a1')).not.toBeInTheDocument()
    })

    it.each(['office_staff', 'police_ward'])('lets %s create and decide applications', async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByTestId('approve-btn-a1')).toBeInTheDocument()
      expect(screen.getByTestId('create-application-btn')).toBeInTheDocument()
    })
  })

  describe('changing an application', () => {
    it('sends the status with PATCH /recruitment/applications/:id (UpdateApplicationDto)', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('approve-btn-a1'))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/recruitment/applications/a1', { status: 'approved' }))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã duyệt đơn'))
    })
  })

  describe('creating an application', () => {
    it('posts only the CreateApplicationDto fields that were filled in', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-application-btn'))
      await user.type(screen.getByLabelText(/Họ tên/), 'Nguyễn Văn Z')
      await user.type(screen.getByLabelText(/Số điện thoại/), '0909000111')
      await user.click(screen.getByRole('button', { name: 'Tạo đơn' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][0]).toBe('/recruitment/applications')
      // An empty age used to be sent as 0, which @Min(16) rejects
      expect(api.post.mock.calls[0][1]).toStrictEqual({ name: 'Nguyễn Văn Z', phone: '0909000111' })
    })

    it('sends a given age as a number', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-application-btn'))
      await user.type(screen.getByLabelText(/Họ tên/), 'Nguyễn Văn Z')
      await user.type(screen.getByLabelText(/Số điện thoại/), '0909000111')
      await user.type(screen.getByLabelText(/Tuổi/), '25')
      await user.click(screen.getByRole('button', { name: 'Tạo đơn' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][1]).toStrictEqual({ name: 'Nguyễn Văn Z', phone: '0909000111', age: 25 })
    })
  })

  describe('detail modal', () => {
    it('clicking eye icon opens detail modal with member data', async () => {
      wrap()
      await waitFor(() => expect(screen.getByTestId('application-row-a1')).toBeInTheDocument())

      const row = screen.getByTestId('application-row-a1')
      const eyeBtn = row.querySelector('button[title="Xem chi tiết"]')!
      await userEvent.click(eyeBtn)

      expect(screen.getByText('Chi tiết đơn đăng ký')).toBeInTheDocument()
      expect(screen.getAllByText('Nguyễn Văn X').length).toBeGreaterThanOrEqual(2)
    })

    it('modal closes when clicking X button', async () => {
      wrap()
      await waitFor(() => expect(screen.getByTestId('application-row-a1')).toBeInTheDocument())

      const row = screen.getByTestId('application-row-a1')
      await userEvent.click(row.querySelector('button[title="Xem chi tiết"]')!)

      expect(screen.getByText('Chi tiết đơn đăng ký')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Đóng/i }))

      expect(screen.queryByText('Chi tiết đơn đăng ký')).not.toBeInTheDocument()
    })

    it('modal shows all available fields for the selected application', async () => {
      wrap()
      await waitFor(() => expect(screen.getByTestId('application-row-a1')).toBeInTheDocument())

      const row = screen.getByTestId('application-row-a1')
      await userEvent.click(row.querySelector('button[title="Xem chi tiết"]')!)

      const modalHeading = screen.getByText('Chi tiết đơn đăng ký')
      const modal = modalHeading.closest('.space-y-4') as HTMLElement

      expect(within(modal).getByText('0901234567')).toBeInTheDocument()   // phone
      expect(within(modal).getByText('KP1')).toBeInTheDocument()           // address
      expect(within(modal).getByText('01/04/2026')).toBeInTheDocument()    // applyDate (calendar day)
      expect(within(modal).getByText('Khu phố 1')).toBeInTheDocument()    // district
      expect(within(modal).getByText('x@example.com')).toBeInTheDocument() // email
      expect(within(modal).getByText('079201001234')).toBeInTheDocument()  // idNumber
    })

    it('names every field and the status of the application', async () => {
      const user = userEvent.setup()
      wrap()
      const row = within(await screen.findByTestId('application-row-a1'))
      await user.click(row.getByTitle('Xem chi tiết'))

      const modal = within(screen.getByText('Chi tiết đơn đăng ký').closest('.space-y-4') as HTMLElement)
      for (const label of ['Họ tên', 'Tuổi', 'Điện thoại', 'Địa chỉ', 'Quận/Huyện', 'Email', 'CCCD/CMND', 'Ngày nộp', 'Trạng thái']) {
        expect(modal.getByText(label)).toBeInTheDocument()
      }
      expect(modal.getByText('Mới')).toBeInTheDocument()
    })
  })

  // Error body produced by the backend HttpExceptionFilter
  const httpError = (status: number, message: string, errors?: string[]) => ({
    isAxiosError: true,
    response: { status, data: { code: 'E00x', message, statusCode: status, errors } },
  })

  describe('page texts', () => {
    it('shows the header, the summary cards, the tabs and the table columns', async () => {
      wrap()
      await screen.findByTestId('application-row-a1')
      await waitFor(() => expect(screen.getByTestId('recruitment-tab-all')).toHaveTextContent('45'))

      expect(screen.getByRole('heading', { level: 1, name: 'Tuyển dụng DQTV' })).toBeInTheDocument()
      expect(screen.getByText('UBND Phường Phú Định – Tuyển chọn dân quân tự vệ mới')).toBeInTheDocument()
      expect(screen.getByTestId('create-application-btn')).toHaveTextContent('Tạo đơn đăng ký')
      expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeInTheDocument()

      const card = (label: string) => screen.getByText(label, { selector: 'p.text-xs' }).parentElement as HTMLElement
      expect(card('Tổng đơn')).toHaveTextContent('45')
      expect(card('Đã duyệt')).toHaveTextContent('20')
      expect(card('Chờ duyệt')).toHaveTextContent('20')
      expect(card('Từ chối')).toHaveTextContent('5')

      expect(screen.getByTestId('recruitment-tab-all')).toHaveTextContent('Tất cả')
      expect(screen.getByTestId('recruitment-tab-new')).toHaveTextContent('Mới')
      expect(screen.getByTestId('recruitment-tab-reviewing')).toHaveTextContent('Đang xét duyệt')
      expect(screen.getByTestId('recruitment-tab-approved')).toHaveTextContent('Đã duyệt')
      expect(screen.getByTestId('recruitment-tab-rejected')).toHaveTextContent('Từ chối')

      expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
        'STT', 'Họ tên', 'Tuổi', 'Địa chỉ', 'Số điện thoại', 'Ngày nộp', 'Trạng thái', 'Thao tác',
      ])
      expect(within(screen.getByTestId('application-row-a2')).getByText('Đã duyệt')).toBeInTheDocument()
      expect(screen.getByTestId('recruitment-total')).toHaveTextContent('Tổng 45 đơn')
      expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    })

    it('names the row actions of a new application', async () => {
      wrap()
      expect(await screen.findByTestId('review-btn-a1')).toHaveAttribute('title', 'Chuyển xét duyệt')
      expect(screen.getByTestId('approve-btn-a1')).toHaveAttribute('title', 'Duyệt')
      expect(screen.getByTestId('reject-btn-a1')).toHaveAttribute('title', 'Từ chối')
    })

    it('says when a status has no application', async () => {
      server.apps = []
      wrap()
      expect(await screen.findByText('Không có đơn đăng ký nào')).toBeInTheDocument()
    })

    it('explains a list that could not be read and reads it again on "Thử lại"', async () => {
      const user = userEvent.setup()
      api.get.mockResolvedValue({ data: mockApps })
      wrap()

      expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách đơn đăng ký.')
      api.get.mockImplementation(answerList)
      await user.click(screen.getByRole('button', { name: 'Thử lại' }))

      expect(await screen.findByTestId('application-row-a1')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('exporting the page', () => {
    const readBlob = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(blob)
      })

    it('downloads the rows on screen as CSV with Vietnamese headers and status labels', async () => {
      const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:recruitment')
      const revokeObjectURL = vi.fn<(url: string) => void>()
      Object.assign(URL, { createObjectURL, revokeObjectURL })
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      const user = userEvent.setup()
      try {
        wrap()
        await screen.findByTestId('application-row-a1')

        await user.click(screen.getByRole('button', { name: 'Xuất Excel' }))

        expect(click).toHaveBeenCalledTimes(1)
        expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('tuyen-chon-dqtv.csv')
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:recruitment')
        const csv = await readBlob(createObjectURL.mock.calls[0][0])
        // The file starts with a UTF-8 byte order mark so Excel reads the Vietnamese letters
        const lines = csv.replace(String.fromCharCode(0xfeff), '').split('\n')
        expect(lines).toEqual([
          '"Họ tên","Tuổi","Điện thoại","Địa chỉ","Quận/Huyện","Trạng thái","Ngày nộp"',
          '"Nguyễn Văn X","25","0901234567","KP1","Khu phố 1","Mới","2026-04-01"',
          '"Trần Thị Y","23","0912345678","KP2","","Đã duyệt","2026-04-10"',
        ])
      } finally {
        click.mockRestore()
      }
    })
  })

  describe('changing an application (answers)', () => {
    it.each([
      ['review-btn-a1', 'reviewing', 'Đã chuyển sang xét duyệt'],
      ['reject-btn-a1', 'rejected', 'Đã từ chối'],
    ])('confirms %s', async (button, status, message) => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId(button))

      await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/recruitment/applications/a1', { status }))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message))
    })

    it.each([
      [404, 'application_not_found', 'Không tìm thấy đơn đăng ký. Danh sách đã được cập nhật.'],
      // A 404 without that code (a route the server does not know) is not a missing application
      [404, 'Cannot PATCH /api/v1/mms_core/recruitment/applications/a1', 'Không thể cập nhật trạng thái'],
      [403, 'Forbidden resource', 'Bạn không có quyền thực hiện thao tác này'],
      [500, 'internal_error', 'Không thể cập nhật trạng thái'],
    ])('explains HTTP %i %s and reads the list again', async (status, code, message) => {
      api.patch.mockRejectedValue(httpError(status, code))
      const user = userEvent.setup()
      wrap()
      await screen.findByTestId('approve-btn-a1')
      await waitFor(() => expect(screen.getByTestId('recruitment-tab-all')).toHaveTextContent('45'))
      const before = listCalls((p) => p.limit === 20).length

      await user.click(screen.getByTestId('approve-btn-a1'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
      await waitFor(() => expect(listCalls((p) => p.limit === 20).length).toBeGreaterThan(before))
      expect(toast.success).not.toHaveBeenCalled()
    })
  })

  describe('creating an application (form)', () => {
    async function openForm() {
      const user = userEvent.setup()
      wrap()
      await user.click(await screen.findByTestId('create-application-btn'))
      return user
    }

    it('names the fields and their examples', async () => {
      await openForm()

      expect(screen.getByRole('heading', { name: 'Tạo đơn đăng ký' })).toBeInTheDocument()
      expect(screen.getByLabelText(/Họ tên/)).toHaveAttribute('placeholder', 'Nguyễn Văn A')
      expect(screen.getByLabelText('Tuổi')).toBeInTheDocument()
      expect(screen.getByLabelText(/Số điện thoại/)).toBeInTheDocument()
      expect(screen.getByLabelText('CCCD/CMND')).toBeInTheDocument()
      expect(screen.getByLabelText('Khu phố')).toHaveAttribute('placeholder', 'KP 1')
      expect(screen.getByLabelText('Địa chỉ')).toHaveAttribute('placeholder', '123 Đường ABC, KP1')
    })

    it('asks for a name that is not only spaces', async () => {
      const user = await openForm()

      await user.type(screen.getByLabelText(/Họ tên/), '   ')
      await user.type(screen.getByLabelText(/Số điện thoại/), '0909000111')
      await user.click(screen.getByRole('button', { name: 'Tạo đơn' }))

      expect(toast.error).toHaveBeenCalledWith('Vui lòng nhập họ tên')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('asks for a phone number that is not only spaces', async () => {
      const user = await openForm()

      await user.type(screen.getByLabelText(/Họ tên/), 'Nguyễn Văn Z')
      await user.type(screen.getByLabelText(/Số điện thoại/), '   ')
      await user.click(screen.getByRole('button', { name: 'Tạo đơn' }))

      expect(toast.error).toHaveBeenCalledWith('Vui lòng nhập số điện thoại')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('confirms the application, closes the form and reads the list again', async () => {
      const user = await openForm()
      const before = listCalls((p) => p.limit === 20).length

      await user.type(screen.getByLabelText(/Họ tên/), 'Nguyễn Văn Z')
      await user.type(screen.getByLabelText(/Số điện thoại/), '0909000111')
      await user.type(screen.getByLabelText('Địa chỉ'), '12 Lê Lợi')
      await user.type(screen.getByLabelText('Khu phố'), 'KP 3')
      await user.type(screen.getByLabelText('CCCD/CMND'), '079201009999')
      await user.click(screen.getByRole('button', { name: 'Tạo đơn' }))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã tạo đơn đăng ký'))
      expect(api.post.mock.calls[0][1]).toStrictEqual({
        name: 'Nguyễn Văn Z',
        phone: '0909000111',
        address: '12 Lê Lợi',
        district: 'KP 3',
        idNumber: '079201009999',
      })
      expect(screen.queryByRole('heading', { name: 'Tạo đơn đăng ký' })).not.toBeInTheDocument()
      await waitFor(() => expect(listCalls((p) => p.limit === 20).length).toBeGreaterThan(before))
    })

    it('shows the saving state while the request runs', async () => {
      api.post.mockReturnValue(new Promise(() => {}))
      const user = await openForm()

      await user.type(screen.getByLabelText(/Họ tên/), 'Nguyễn Văn Z')
      await user.type(screen.getByLabelText(/Số điện thoại/), '0909000111')
      await user.click(screen.getByRole('button', { name: 'Tạo đơn' }))

      expect(await screen.findByRole('button', { name: 'Đang lưu...' })).toBeDisabled()
    })

    it.each([
      [400, 'validation_failed', ['age must not be less than 16'], 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (age must not be less than 16)'],
      [403, 'Forbidden resource', undefined, 'Bạn không có quyền thực hiện thao tác này'],
      [500, 'internal_error', undefined, 'Không thể tạo đơn đăng ký'],
    ])('explains HTTP %i %s and keeps the form open', async (status, code, errors, message) => {
      api.post.mockRejectedValue(httpError(status, code, errors))
      const user = await openForm()

      await user.type(screen.getByLabelText(/Họ tên/), 'Nguyễn Văn Z')
      await user.type(screen.getByLabelText(/Số điện thoại/), '0909000111')
      await user.click(screen.getByRole('button', { name: 'Tạo đơn' }))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
      expect(screen.getByRole('heading', { name: 'Tạo đơn đăng ký' })).toBeInTheDocument()
    })

    it.each(['Hủy', 'Đóng'])('closes the form with "%s"', async (name) => {
      const user = await openForm()

      await user.click(screen.getByRole('button', { name }))

      expect(screen.queryByRole('heading', { name: 'Tạo đơn đăng ký' })).not.toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })
  })
})

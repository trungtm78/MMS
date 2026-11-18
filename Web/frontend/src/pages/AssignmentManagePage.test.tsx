import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { t } from '@/test/i18n'
import type { TranslationKey } from '@/i18n/types'
import { AssignmentManagePage } from './AssignmentManagePage'

// Only the HTTP layer and the signed-in user are replaced: api/assignments.ts and useRbac run
// for real, so URLs, bodies and permissions are checked
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

type Row = Record<string, unknown>

function signInAs(role: string, id = 'me', fullName = 'Người dùng') {
  session.user = { id, username: id, fullName, role, roles: [role], unitScope: 'WARD_01' }
}

// GET /admin/users?role= rows (admin.service.ts UserListItem), one request per CA role
const wardOfficers: Row[] = [
  { id: 'ca-1', fullName: 'Nguyễn Văn Hùng', role: 'police_ward', unitScope: 'WARD_01' },
  { id: 'ca-2', fullName: 'Trần Thị Lan', role: 'police_ward', unitScope: 'WARD_01' },
]
const areaOfficers: Row[] = [{ id: 'ca-3', fullName: 'Lê Minh Khang', role: 'police_area', unitScope: 'KP1' }]

// GET /assignments?caUserId= rows (assignments.service.ts listByCa)
const assignmentRow = {
  id: 'assign-1',
  caUserId: 'ca-1',
  dqtvUserId: 'dqtv-1',
  dqtvFullName: 'Nguyễn Văn A',
  dqtvUnitCode: 'WARD_01',
  assignedBy: 'admin',
  assignedAt: '2026-04-14T05:00:00Z',
}

// GET /militia?excludeAssignedTo= rows (militia.service.ts searchMilitia)
const availableMilitia: Row[] = [
  { id: 'mp-2', userId: 'dqtv-2', militiaCode: 'DQ-002', fullName: 'Lê Văn B', phone: null, rank: null, status: 'active', unitCode: 'KP1', unitName: 'Khu phố 1' },
  { id: 'mp-3', userId: 'dqtv-3', militiaCode: 'DQ-003', fullName: 'Phạm Thị C', phone: null, rank: null, status: 'active', unitCode: 'KP2', unitName: 'Khu phố 2' },
]

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = {
  officers: {} as Record<string, Row[]>,
  assignments: [assignmentRow] as Row[],
  available: [] as Row[],
  officersError: null as unknown,
  assignmentsError: null as unknown,
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

// The text of every key in a group, as users read it
function expectTexts(texts: ReadonlyArray<readonly [TranslationKey, string]>) {
  for (const [key, text] of texts) expect(t(key)).toBe(text)
}

async function selectOfficer(id = 'ca-1') {
  fireEvent.click(await screen.findByTestId(`ca-row-${id}`))
}

async function openAddModal() {
  await selectOfficer()
  fireEvent.click(await screen.findByTestId('add-dqtv-btn'))
  return screen.findByRole('dialog')
}

const assignmentListCalls = () => api.get.mock.calls.filter(([url]) => url === '/assignments').length
const officerCalls = () => api.get.mock.calls.filter(([url]) => url === '/admin/users')

describe('AssignmentManagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued mock*Once answers; an unused one must not leak into the next test
    api.get.mockReset()
    api.post.mockReset()
    api.delete.mockReset()
    signInAs('system_admin', 'admin-1', 'Quản trị viên')
    server.officers = { police_ward: wardOfficers, police_area: areaOfficers }
    server.assignments = [assignmentRow]
    server.available = []
    server.officersError = null
    server.assignmentsError = null
    api.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/admin/users') {
        if (server.officersError) return Promise.reject(server.officersError)
        const rows = server.officers[String(config?.params?.role)] ?? []
        const page = Number(config?.params?.page ?? 1)
        return Promise.resolve({ data: { data: page === 1 ? rows : [], total: rows.length, page, limit: 100 } })
      }
      if (url === '/assignments') {
        return server.assignmentsError ? Promise.reject(server.assignmentsError) : Promise.resolve({ data: server.assignments })
      }
      if (url === '/militia') {
        return Promise.resolve({ data: { data: server.available, total: server.available.length, page: 1, limit: 50 } })
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    api.post.mockImplementation((_url: string, body: { caUserId: string; dqtvUserId: string }) =>
      Promise.resolve({ data: { ...assignmentRow, id: `assign-${body.dqtvUserId}`, dqtvUserId: body.dqtvUserId } }),
    )
    api.delete.mockResolvedValue({ data: undefined })
  })

  it('renders page heading', async () => {
    wrap(<AssignmentManagePage />)
    expect(screen.getByTestId('assignment-manage-page')).toBeInTheDocument()
    expect(screen.getByText('Phân Công')).toBeInTheDocument()
    await screen.findByTestId('ca-row-ca-1')
  })

  it('shows the page texts, the officer panel and the prompt to pick an officer', async () => {
    expectTexts([
      ['users.assignments.page.breadcrumb', 'Trang chủ › Phân Công'],
      ['users.assignments.page.title', 'Phân Công'],
      ['users.assignments.page.desktopOnly', 'Vui lòng sử dụng trên máy tính để quản lý phân công.'],
      ['users.assignments.officers.heading', 'Cán bộ CA'],
      ['users.assignments.officers.searchLabel', 'Tìm cán bộ CA'],
      ['users.assignments.officers.searchPlaceholder', 'Tìm theo tên...'],
      ['users.assignments.officers.pickPrompt', '← Chọn một cán bộ CA để xem phân công'],
    ])
    wrap(<AssignmentManagePage />)

    expect(screen.getByText('Trang chủ › Phân Công')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng sử dụng trên máy tính để quản lý phân công.')).toBeInTheDocument()
    expect(screen.getByText('Cán bộ CA')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Tìm cán bộ CA' })).toHaveAttribute('placeholder', 'Tìm theo tên...')
    expect(await screen.findByText('← Chọn một cán bộ CA để xem phân công')).toBeInTheDocument()
  })

  // Web/backend/src/common/constants/roles.ts CA_ROLES
  it('lists the officers of every CA role for a system admin', async () => {
    server.officers = {
      ...server.officers,
      ca_officer: [{ id: 'ca-5', fullName: 'Hồ Văn Tâm', role: 'ca_officer', unitScope: 'KP1' }],
      ca_ward: [{ id: 'ca-6', fullName: 'Vũ Thị Hoa', role: 'ca_ward', unitScope: null }],
      ca_area: [{ id: 'ca-7', fullName: 'Đinh Công Sơn', role: 'ca_area', unitScope: 'KP2' }],
    }
    wrap(<AssignmentManagePage />)

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Hùng')).toBeInTheDocument()
      expect(screen.getByText('Trần Thị Lan')).toBeInTheDocument()
    })
    for (const name of ['Lê Minh Khang', 'Hồ Văn Tâm', 'Vũ Thị Hoa', 'Đinh Công Sơn']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    for (const role of ['police_ward', 'police_area', 'ca_officer', 'ca_ward', 'ca_area']) {
      expect(api.get).toHaveBeenCalledWith('/admin/users', { params: { role, page: 1, limit: 100 } })
    }
  })

  it('labels each officer by the kind of CA post', async () => {
    expectTexts([
      ['users.assignments.roleBadge.ward', 'CA Phường'],
      ['users.assignments.roleBadge.area', 'CA Khu Vực'],
      ['users.assignments.roleBadge.other', 'CA'],
    ])
    // The role filter matches any held role while `role` is the primary one
    server.officers = {
      ...server.officers,
      ca_ward: [{ id: 'ca-4', fullName: 'Đỗ Quang Vinh', role: 'system_admin', unitScope: null }],
    }
    wrap(<AssignmentManagePage />)

    expect(within(await screen.findByTestId('ca-row-ca-1')).getByText('CA Phường')).toBeInTheDocument()
    expect(within(screen.getByTestId('ca-row-ca-3')).getByText('CA Khu Vực')).toBeInTheDocument()
    expect(within(screen.getByTestId('ca-row-ca-4')).getByText('CA')).toBeInTheDocument()
  })

  it('shows instruction text when no CA is selected', async () => {
    wrap(<AssignmentManagePage />)
    await waitFor(() => {
      expect(screen.getByText(/Chọn một cán bộ CA/)).toBeInTheDocument()
    })
  })

  it('says so when no officer matches the search', async () => {
    expectTexts([['users.assignments.officers.empty', 'Không có cán bộ CA']])
    const user = userEvent.setup()
    wrap(<AssignmentManagePage />)
    await screen.findByTestId('ca-row-ca-1')

    await user.type(screen.getByRole('textbox', { name: 'Tìm cán bộ CA' }), 'không ai')

    expect(await screen.findByText('Không có cán bộ CA')).toBeInTheDocument()
  })

  it('explains an officer list that cannot be loaded instead of showing it empty', async () => {
    expectTexts([['users.assignments.officers.loadError', 'Không thể tải danh sách cán bộ CA.']])
    server.officersError = httpError(403, 'insufficient_role')
    wrap(<AssignmentManagePage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không thể tải danh sách cán bộ CA.')
    expect(alert).toHaveTextContent('Bạn không có quyền thực hiện thao tác này')
    expect(screen.queryByText('Không có cán bộ CA')).not.toBeInTheDocument()
  })

  it('pages through more than ten officers', async () => {
    server.officers = {
      police_ward: Array.from({ length: 11 }, (_, i) => ({ id: `ca-${i + 1}`, fullName: `Cán bộ ${String(i + 1).padStart(2, '0')}`, role: 'police_ward', unitScope: 'WARD_01' })),
    }
    wrap(<AssignmentManagePage />)
    await screen.findByTestId('ca-row-ca-1')

    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(await screen.findByTestId('ca-row-ca-11')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(await screen.findByTestId('ca-row-ca-1')).toBeInTheDocument()
  })

  it('selecting a CA loads their assignments', async () => {
    wrap(<AssignmentManagePage />)
    await waitFor(() => screen.getByTestId('ca-row-ca-1'))
    fireEvent.click(screen.getByTestId('ca-row-ca-1'))
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    })
    expect(api.get).toHaveBeenCalledWith('/assignments', { params: { caUserId: 'ca-1' } })
  })

  it('lists the assigned militia with their unit and assignment day', async () => {
    expectTexts([
      ['users.assignments.list.columns.name', 'Tên DQTV'],
      ['users.assignments.list.columns.unit', 'Đơn vị'],
      ['users.assignments.list.columns.assignedAt', 'Ngày phân công'],
    ])
    server.assignments = [assignmentRow, { ...assignmentRow, id: 'assign-2', dqtvFullName: 'Trịnh Văn D', assignedAt: null }]
    wrap(<AssignmentManagePage />)
    await selectOfficer()

    expect(await screen.findByText('DQTV phân công (2)')).toBeInTheDocument()
    expect(t('users.assignments.list.count', { count: 2 })).toBe('DQTV phân công (2)')
    for (const name of ['Tên DQTV', 'Đơn vị', 'Ngày phân công']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    expect(within(screen.getByTestId('assignment-row-assign-1')).getByText('14/04/2026')).toBeInTheDocument()
    expect(within(screen.getByTestId('assignment-row-assign-2')).getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xóa phân công Nguyễn Văn A' })).toBeInTheDocument()
    expect(t('users.assignments.remove.label', { name: 'Nguyễn Văn A' })).toBe('Xóa phân công Nguyễn Văn A')
  })

  it('invites to add militia when the officer has none', async () => {
    expectTexts([
      ['users.assignments.list.empty', 'Chưa có DQTV nào được phân công'],
      ['users.assignments.list.addNow', 'Thêm ngay'],
    ])
    server.assignments = []
    wrap(<AssignmentManagePage />)
    await selectOfficer()

    expect(await screen.findByText('Chưa có DQTV nào được phân công')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thêm ngay' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('shows error message when assignments API fails', async () => {
    server.assignmentsError = new Error('fail')
    wrap(<AssignmentManagePage />)
    await waitFor(() => screen.getByTestId('ca-row-ca-1'))
    fireEvent.click(screen.getByTestId('ca-row-ca-1'))
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải/)).toBeInTheDocument()
    })
    expect(screen.getByText('Vui lòng thử lại sau ít phút.')).toBeInTheDocument()
  })

  // assignments.service.ts listByCa: ForbiddenException('forbidden'); RolesGuard: insufficient_role
  it.each(['insufficient_role', 'forbidden'])('explains an assignment list the user may not read (403 %s)', async (code) => {
    expectTexts([
      ['users.assignments.list.loadError', 'Không thể tải danh sách phân công.'],
      ['errors.assignments.list.insufficient_role', 'Bạn không có quyền xem phân công của cán bộ này.'],
    ])
    server.assignmentsError = httpError(403, code)
    wrap(<AssignmentManagePage />)
    await selectOfficer()

    expect(await screen.findByText('Không thể tải danh sách phân công.')).toBeInTheDocument()
    expect(screen.getByText('Bạn không có quyền xem phân công của cán bộ này.')).toBeInTheDocument()
  })

  // GET /assignments answers a CA officer (every CA_ROLES role) with their own list only, and
  // GET /admin/users is system_admin/office_staff only: these viewers see their own assignments
  describe.each([
    ['ca_officer', 'ca-self', 'Hồ Văn Tâm', 'CA Phường'],
    ['police_ward', 'pw-self', 'Nguyễn Văn Hùng', 'CA Phường'],
    ['police_area', 'pa-self', 'Lê Minh Khang', 'CA Khu Vực'],
  ])('signed in as %s', (role, id, fullName, badge) => {
    beforeEach(() => signInAs(role, id, fullName))

    it('shows their own assignments without an officer list', async () => {
      expectTexts([['users.assignments.self.notice', 'Bạn chỉ xem được các DQTV được phân công cho chính mình.']])
      wrap(<AssignmentManagePage />)

      expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(screen.getByText('Bạn chỉ xem được các DQTV được phân công cho chính mình.')).toBeInTheDocument()
      expect(screen.getByText(fullName)).toBeInTheDocument()
      expect(screen.getByText(badge)).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/assignments', { params: { caUserId: id } })
      expect(officerCalls()).toHaveLength(0)
      expect(screen.queryByText('Cán bộ CA')).not.toBeInTheDocument()
      expect(screen.queryByText('← Chọn một cán bộ CA để xem phân công')).not.toBeInTheDocument()
    })

    // POST and DELETE /assignments are system_admin only
    it('offers no way to add or remove assignments', async () => {
      wrap(<AssignmentManagePage />)

      await screen.findByText('Nguyễn Văn A')
      expect(screen.queryByTestId('add-dqtv-btn')).not.toBeInTheDocument()
      expect(screen.queryByTestId('delete-btn-assign-1')).not.toBeInTheDocument()
    })

    it('shows an empty list without the invitation to add', async () => {
      server.assignments = []
      wrap(<AssignmentManagePage />)

      expect(await screen.findByText('Chưa có DQTV nào được phân công')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Thêm ngay' })).not.toBeInTheDocument()
    })
  })

  describe('add militia', () => {
    it('clicking Add DQTV button opens modal', async () => {
      wrap(<AssignmentManagePage />)
      await waitFor(() => screen.getByTestId('ca-row-ca-1'))
      fireEvent.click(screen.getByTestId('ca-row-ca-1'))
      await waitFor(() => screen.getByTestId('add-dqtv-btn'))
      fireEvent.click(screen.getByTestId('add-dqtv-btn'))
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('Thêm DQTV vào danh sách')).toBeInTheDocument()
      })
    })

    it('names the officer, the search box and the state of the list', async () => {
      expectTexts([
        ['users.assignments.list.addButton', 'Thêm DQTV'],
        ['users.assignments.add.title', 'Thêm DQTV vào danh sách'],
        ['users.assignments.add.searchPlaceholder', 'Tìm dân quân tự vệ...'],
        ['users.assignments.add.allAssigned', 'Tất cả DQTV đã được phân công'],
        ['users.assignments.add.noResults', 'Không tìm thấy kết quả'],
        ['users.assignments.add.submit', 'Thêm DQTV'],
      ])
      const user = userEvent.setup()
      wrap(<AssignmentManagePage />)

      const dialog = within(await openAddModal())
      expect(dialog.getByRole('heading', { name: 'Thêm DQTV vào danh sách' })).toBeInTheDocument()
      expect(dialog.getByText('Phân công cho:', { exact: false })).toHaveTextContent('Phân công cho: Nguyễn Văn Hùng')
      expect(dialog.getByText('Nguyễn Văn Hùng').tagName).toBe('STRONG')
      expect(dialog.getByRole('button', { name: 'Đóng' })).toBeInTheDocument()
      expect(await dialog.findByText('Tất cả DQTV đã được phân công')).toBeInTheDocument()
      expect(dialog.getByRole('button', { name: 'Thêm DQTV' })).toBeDisabled()

      await user.type(dialog.getByPlaceholderText('Tìm dân quân tự vệ...'), 'Lan')

      expect(await dialog.findByText('Không tìm thấy kết quả')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/militia', { params: { q: 'Lan', limit: 50, excludeAssignedTo: 'ca-1' } })
    })

    it('assigns every chosen militia member and confirms how many were added', async () => {
      expectTexts([['users.assignments.add.pending', 'Đang thêm...']])
      expect(t('users.assignments.add.submitCount', { count: 2 })).toBe('Thêm 2 DQTV')
      expect(t('users.assignments.add.success', { count: 2 })).toBe('Đã thêm 2 DQTV')
      server.available = availableMilitia
      wrap(<AssignmentManagePage />)

      const dialog = within(await openAddModal())
      fireEvent.click(await dialog.findByRole('checkbox', { name: /Lê Văn B/ }))
      fireEvent.click(dialog.getByRole('checkbox', { name: /Phạm Thị C/ }))
      expect(dialog.getByTestId('add-dqtv-submit')).toHaveTextContent('Thêm 2 DQTV')
      fireEvent.click(dialog.getByTestId('add-dqtv-submit'))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã thêm 2 DQTV'))
      expect(api.post).toHaveBeenCalledWith('/assignments', { caUserId: 'ca-1', dqtvUserId: 'dqtv-2' })
      expect(api.post).toHaveBeenCalledWith('/assignments', { caUserId: 'ca-1', dqtvUserId: 'dqtv-3' })
      expect(toast.error).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    // CreateAssignmentDto.dqtvUserId is a required UUID: a member without an account cannot be assigned
    it('shows members without an account as not assignable and never posts them', async () => {
      expectTexts([['users.assignments.add.noAccount', 'Chưa có tài khoản hệ thống — không thể phân công']])
      server.available = [
        ...availableMilitia,
        { id: 'mp-9', userId: null, militiaCode: 'DQ-009', fullName: 'Chưa Có Tài Khoản', phone: null, rank: null, status: 'active', unitCode: 'KP3', unitName: 'Khu phố 3' },
      ]
      wrap(<AssignmentManagePage />)

      const dialog = within(await openAddModal())
      const noAccount = await dialog.findByRole('checkbox', { name: /Chưa Có Tài Khoản/ })
      expect(noAccount).toBeDisabled()
      expect(noAccount).toHaveAccessibleDescription('Chưa có tài khoản hệ thống — không thể phân công')
      fireEvent.click(noAccount)
      expect(noAccount).not.toBeChecked()
      expect(dialog.getByTestId('add-dqtv-submit')).toBeDisabled()

      fireEvent.click(dialog.getByRole('checkbox', { name: /Lê Văn B/ }))
      fireEvent.click(dialog.getByTestId('add-dqtv-submit'))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã thêm 1 DQTV'))
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/assignments', { caUserId: 'ca-1', dqtvUserId: 'dqtv-2' })
    })

    it('can take a choice back before adding', async () => {
      server.available = availableMilitia
      wrap(<AssignmentManagePage />)

      const dialog = within(await openAddModal())
      const checkbox = await dialog.findByRole('checkbox', { name: /Lê Văn B/ })
      fireEvent.click(checkbox)
      expect(dialog.getByTestId('add-dqtv-submit')).toHaveTextContent('Thêm 1 DQTV')
      fireEvent.click(checkbox)
      expect(dialog.getByTestId('add-dqtv-submit')).toHaveTextContent('Thêm DQTV')
      expect(dialog.getByTestId('add-dqtv-submit')).toBeDisabled()
    })

    it('shows that the assignments are being sent', async () => {
      server.available = availableMilitia
      api.post.mockReturnValue(new Promise(() => {}))
      wrap(<AssignmentManagePage />)

      const dialog = within(await openAddModal())
      fireEvent.click(await dialog.findByRole('checkbox', { name: /Lê Văn B/ }))
      fireEvent.click(dialog.getByTestId('add-dqtv-submit'))

      await waitFor(() => expect(dialog.getByTestId('add-dqtv-submit')).toHaveTextContent('Đang thêm...'))
      expect(dialog.getByTestId('add-dqtv-submit')).toBeDisabled()
    })

    // assignments.service.ts createAssignment: ConflictException('assignment_already_exists'); RolesGuard: insufficient_role
    it.each([
      [409, 'assignment_already_exists', 'DQTV đã được phân công cho cán bộ này.'],
      [403, 'insufficient_role', 'Chỉ quản trị hệ thống được thêm phân công.'],
    ])('explains why some militia could not be added (%i %s)', async (status, code, reason) => {
      expectTexts([
        ['errors.assignments.create.assignment_already_exists', 'DQTV đã được phân công cho cán bộ này.'],
        ['errors.assignments.create.insufficient_role', 'Chỉ quản trị hệ thống được thêm phân công.'],
      ])
      expect(t('users.assignments.add.partialError', { count: 1, reason: 'X' })).toBe('1 DQTV không thể thêm: X')
      server.available = availableMilitia
      api.post
        .mockResolvedValueOnce({ data: { ...assignmentRow, id: 'assign-new' } })
        .mockRejectedValueOnce(httpError(status, code))
      wrap(<AssignmentManagePage />)

      const dialog = within(await openAddModal())
      fireEvent.click(await dialog.findByRole('checkbox', { name: /Lê Văn B/ }))
      fireEvent.click(dialog.getByRole('checkbox', { name: /Phạm Thị C/ }))
      fireEvent.click(dialog.getByTestId('add-dqtv-submit'))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã thêm 1 DQTV'))
      expect(toast.error).toHaveBeenCalledWith(`1 DQTV không thể thêm: ${reason}`)
    })

    it('falls back to a generic reason when nothing could be added', async () => {
      expectTexts([['users.assignments.add.reasonFallback', 'Vui lòng thử lại.']])
      server.available = availableMilitia
      api.post.mockRejectedValue(httpError(500, 'Internal server error'))
      wrap(<AssignmentManagePage />)

      const dialog = within(await openAddModal())
      fireEvent.click(await dialog.findByRole('checkbox', { name: /Lê Văn B/ }))
      fireEvent.click(dialog.getByTestId('add-dqtv-submit'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('1 DQTV không thể thêm: Vui lòng thử lại.'))
      expect(toast.success).not.toHaveBeenCalled()
    })

    it.each([
      ['the Close button', () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đóng' }))],
      ['the Cancel button', () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }))],
      ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
      ['a click outside', () => fireEvent.click(screen.getByRole('dialog').parentElement!)],
    ])('closes with %s without adding anyone', async (_how, close) => {
      wrap(<AssignmentManagePage />)
      await openAddModal()

      close()

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  describe('remove assignment', () => {
    it('clicking trash icon shows inline confirm', async () => {
      wrap(<AssignmentManagePage />)
      await waitFor(() => screen.getByTestId('ca-row-ca-1'))
      fireEvent.click(screen.getByTestId('ca-row-ca-1'))
      await waitFor(() => screen.getByText('Nguyễn Văn A'))
      fireEvent.click(screen.getByTestId('delete-btn-assign-1'))
      await waitFor(() => {
        expect(screen.getByTestId('confirm-delete-assign-1')).toBeInTheDocument()
        expect(screen.getByText('Hủy')).toBeInTheDocument()
      })
    })

    it('keeps the assignment when the confirmation is cancelled', async () => {
      expectTexts([['users.assignments.remove.confirm', 'Xác nhận xóa']])
      wrap(<AssignmentManagePage />)
      await selectOfficer()
      fireEvent.click(await screen.findByTestId('delete-btn-assign-1'))

      expect(screen.getByTestId('confirm-delete-assign-1')).toHaveTextContent('Xác nhận xóa')
      fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))

      expect(await screen.findByTestId('delete-btn-assign-1')).toBeInTheDocument()
      expect(api.delete).not.toHaveBeenCalled()
    })

    it('confirming delete calls removeAssignment', async () => {
      expectTexts([['users.assignments.remove.success', 'Đã xóa phân công']])
      wrap(<AssignmentManagePage />)
      await waitFor(() => screen.getByTestId('ca-row-ca-1'))
      fireEvent.click(screen.getByTestId('ca-row-ca-1'))
      // Wait for assignment table to fully render
      await waitFor(() => screen.getByText('Nguyễn Văn A'))
      fireEvent.click(screen.getByTestId('delete-btn-assign-1'))
      await waitFor(() => screen.getByTestId('confirm-delete-assign-1'))
      fireEvent.click(screen.getByTestId('confirm-delete-assign-1'))
      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/assignments/assign-1')
      })
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã xóa phân công'))
    })

    // assignments.service.ts removeAssignment: NotFoundException('assignment_not_found'); RolesGuard: insufficient_role
    it.each([
      [404, 'assignment_not_found', 'Phân công không còn tồn tại. Danh sách đã được cập nhật.'],
      [403, 'insufficient_role', 'Chỉ quản trị hệ thống được xóa phân công.'],
    ])('explains a refused removal (%i %s) and refreshes the list', async (status, code, text) => {
      expectTexts([
        ['errors.assignments.remove.assignment_not_found', 'Phân công không còn tồn tại. Danh sách đã được cập nhật.'],
        ['errors.assignments.remove.insufficient_role', 'Chỉ quản trị hệ thống được xóa phân công.'],
      ])
      api.delete.mockRejectedValueOnce(httpError(status, code))
      wrap(<AssignmentManagePage />)
      await selectOfficer()
      fireEvent.click(await screen.findByTestId('delete-btn-assign-1'))
      const before = assignmentListCalls()

      fireEvent.click(screen.getByTestId('confirm-delete-assign-1'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(text))
      await waitFor(() => expect(assignmentListCalls()).toBeGreaterThan(before))
    })

    it('falls back to a generic text when removing fails otherwise', async () => {
      expectTexts([['users.assignments.remove.error', 'Không thể xóa phân công']])
      api.delete.mockRejectedValueOnce(httpError(500, 'Internal server error'))
      wrap(<AssignmentManagePage />)
      await selectOfficer()
      fireEvent.click(await screen.findByTestId('delete-btn-assign-1'))
      fireEvent.click(screen.getByTestId('confirm-delete-assign-1'))

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể xóa phân công'))
    })
  })
})

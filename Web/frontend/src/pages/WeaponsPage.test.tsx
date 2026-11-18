import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { firstDayOfYearInVietnam, todayInVietnam } from '@/lib/dates'
import { WeaponsPage } from './WeaponsPage'

// Only the HTTP layer and the signed-in user are replaced: useRbac, Dialog and FormField run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// A timezone behind UTC, where `new Date('2020-01-01')` reads as 31 December
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

// Web/backend/src/weapons/weapons.service.ts WeaponListItem — GET /weapons answers the active weapons
const weapon = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  type: 'Súng trường',
  serialNumber: 'SN-001',
  acquiredAt: '2020-01-01',
  condition: 'good',
  storageLocation: 'Kho 1',
  responsiblePersonId: 'm2',
  responsiblePersonName: 'Trần A',
  status: 'active',
  createdAt: '2020-01-02T03:00:00.000Z',
  updatedAt: '2020-01-02T03:00:00.000Z',
  ...patch,
})

// weapons.service.ts getInventoryReport row
const reportRow = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  weaponType: 'Súng trường',
  serialNumber: 'SN-001',
  condition: 'good',
  storageLocation: 'Kho 1',
  acquiredAt: '2019-12-31T17:00:00.000Z',
  status: 'active',
  responsiblePersonName: 'Trần A',
  currentHolder: null,
  issuedAt: null,
  returnedAt: null,
  overdue: false,
  ...patch,
})

// weapons.service.ts AllocationListItem — GET /weapons/allocations, newest first
const allocation = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  weaponId: 'w1',
  recipientId: 'm1',
  issuedAt: '2026-04-01T00:00:00.000Z',
  purpose: 'Tuần tra',
  returnedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  weaponSerialNumber: 'SN-001',
  weaponType: 'Súng trường',
  recipientName: 'Nguyễn B',
  recipientCode: 'DQ-001',
  ...patch,
})

// weapon-inventory.service.ts InventoryCheckRecord
const check = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  checkDate: '2026-09-10',
  performedBy: 'u1',
  performedByName: 'Lê Văn C',
  expectedCount: 2,
  confirmedCount: 2,
  discrepancy: 0,
  notes: null,
  itemCount: 2,
  verifiedCount: 0,
  missingCount: 0,
  createdAt: '2026-09-10T02:00:00.000Z',
  ...patch,
})

// weapon-inventory.service.ts InventoryItemRecord
const item = (patch: Record<string, unknown> = {}) => ({
  weaponId: 'w1',
  weaponType: 'Súng trường',
  serialNumber: 'SN-001',
  condition: 'good',
  storageLocation: 'Kho 1',
  holderMilitiaId: null,
  holderName: null,
  found: null,
  observedCondition: null,
  ...patch,
})

const httpError = (status: number, message: string, errors?: string[]) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status, ...(errors ? { errors } : {}) } },
})

type Weapon = ReturnType<typeof weapon>
type InventoryBody = { confirmedCount: number; notes?: string; items?: { weaponId: string; found: boolean; observedCondition?: string }[] }

const server = {
  weapons: [] as Weapon[],
  report: [] as ReturnType<typeof reportRow>[],
  allocations: [] as ReturnType<typeof allocation>[],
  checks: [] as ReturnType<typeof check>[],
  details: {} as Record<string, ReturnType<typeof check> & { items: ReturnType<typeof item>[] }>,
  /** URL → error the GET answers with */
  failures: {} as Record<string, unknown>,
}

/** What POST /weapons/inventory answers: the check with a snapshot of the register */
function recorded(body: InventoryBody) {
  const items = server.weapons.map((w) => {
    const entry = body.items?.find((i) => i.weaponId === w.id)
    return item({
      weaponId: w.id,
      weaponType: w.type,
      serialNumber: w.serialNumber,
      condition: w.condition,
      storageLocation: w.storageLocation,
      found: entry ? entry.found : null,
      observedCondition: entry?.observedCondition ?? null,
    })
  })
  return {
    ...check('c-new', {
      checkDate: todayInVietnam(),
      expectedCount: items.length,
      confirmedCount: body.confirmedCount,
      discrepancy: body.confirmedCount - items.length,
      notes: body.notes ?? null,
      itemCount: items.length,
      verifiedCount: items.filter((i) => i.found !== null).length,
      missingCount: items.filter((i) => i.found === false).length,
    }),
    items,
  }
}

function signInAs(role: string, unitScope: string | null = null) {
  session.user = { id: 'me', role, roles: [role], unitScope }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/weapons']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/weapons" element={<WeaponsPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

type User = ReturnType<typeof userEvent.setup>

const getCount = (url: string) => api.get.mock.calls.filter(([called]) => called === url).length

async function openTab(user: User, tab: 'log' | 'inventory') {
  await user.click(await screen.findByTestId(`weapons-tab-${tab}`))
}

async function openRecordDialog(user: User) {
  await openTab(user, 'inventory')
  await user.click(await screen.findByTestId('confirm-inventory-btn'))
  return screen.findByRole('dialog', { name: 'Ghi nhận kết quả kiểm kê' })
}

async function openChecklist(user: User) {
  const dialog = await openRecordDialog(user)
  await user.click(within(dialog).getByRole('radio', { name: 'Kiểm theo danh sách' }))
  await within(dialog).findByTestId('inventory-item-w1')
  return dialog
}

describe('WeaponsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-answers; a test that stops early must not leave one behind
    api.get.mockReset()
    api.post.mockReset()
    signInAs('office_staff')
    server.weapons = [
      weapon('w1'),
      weapon('w2', {
        type: 'Súng ngắn K54',
        serialNumber: 'SN-002',
        condition: 'maintenance',
        storageLocation: 'Kho 2',
        responsiblePersonId: null,
        responsiblePersonName: null,
      }),
    ]
    server.report = [
      reportRow('w1'),
      reportRow('w2', {
        weaponType: 'Súng ngắn K54',
        serialNumber: 'SN-002',
        condition: 'maintenance',
        storageLocation: 'Kho 2',
        responsiblePersonName: null,
        currentHolder: 'Nguyễn B',
        issuedAt: '2026-01-01T00:00:00.000Z',
        overdue: true,
      }),
    ]
    server.allocations = [allocation('al1')]
    server.checks = []
    server.details = {}
    server.failures = {}
    api.get.mockImplementation((url: string) => {
      if (url in server.failures) return Promise.reject(server.failures[url])
      if (url === '/weapons') return Promise.resolve({ data: server.weapons })
      if (url === '/weapons/allocations') return Promise.resolve({ data: server.allocations })
      if (url === '/weapons/inventory-report') return Promise.resolve({ data: server.report })
      if (url === '/weapons/inventory') return Promise.resolve({ data: server.checks })
      if (url === '/weapons/export') return Promise.resolve({ data: new Blob(['xlsx']) })
      const detail = /^\/weapons\/inventory\/([^/]+)$/.exec(url)
      if (detail) {
        const found = server.details[detail[1]]
        return found ? Promise.resolve({ data: found }) : Promise.reject(httpError(404, 'inventory_check_not_found'))
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    api.post.mockImplementation((url: string, body: unknown) => {
      if (url === '/weapons/inventory') return Promise.resolve({ data: recorded(body as InventoryBody) })
      if (url === '/weapons') return Promise.resolve({ data: weapon('w9', body as Record<string, unknown>) })
      return Promise.reject(new Error(`unexpected POST ${url}`))
    })
  })

  it('renders page', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('weapons-page')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Vũ khí & Trang thiết bị' })).toBeInTheDocument()
    expect(screen.getByText('UBND Phường Phú Định – Quản lý vũ khí ANTT')).toBeInTheDocument()
  })

  it('shows weapons tab', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('weapons-tab-catalog')).toBeInTheDocument())
    expect(screen.getByRole('tab', { name: 'Danh mục' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Log cấp phát' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Kiểm kê' })).toBeInTheDocument()
  })

  it('shows weapon rows after load, with the acquisition date as a calendar day', async () => {
    wrap()
    const row = within(await screen.findByTestId('weapon-row-w1'))
    expect(row.getByText('01/01/2020')).toBeInTheDocument()
  })

  it('shows add weapon button', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('add-weapon-btn')).toBeInTheDocument())
  })

  it('switches to allocation log tab', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('weapons-tab-log')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('weapons-tab-log'))
    await waitFor(() => expect(screen.getByText('Nguyễn B')).toBeInTheDocument())
  })

  // weapons.controller.ts class-level @Roles('system_admin', 'office_staff', 'police_ward')
  it.each(['system_admin', 'office_staff', 'police_ward'])('opens for %s', async (role) => {
    signInAs(role)
    wrap()
    expect(await screen.findByTestId('weapon-row-w1')).toBeInTheDocument()
  })

  it.each(['ubnd_leader', 'police_area', 'ca_ward', 'ca_officer', 'dqtv'])(
    'sends %s, who is outside the weapons @Roles, to the forbidden page',
    async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalled()
    },
  )

  describe('catalog', () => {
    it('labels the condition and names the responsible person from the GET /weapons row', async () => {
      // The report no longer supplies the name: the catalog reads it from its own row
      server.report = []
      wrap()
      const first = within(await screen.findByTestId('weapon-row-w1'))
      expect(first.getByText('SN-001')).toBeInTheDocument()
      expect(first.getByText('Súng trường')).toBeInTheDocument()
      expect(first.getByText('Tốt')).toBeInTheDocument()
      expect(first.getByText('Kho 1')).toBeInTheDocument()
      expect(first.getByText('Trần A')).toBeInTheDocument()

      const second = within(screen.getByTestId('weapon-row-w2'))
      expect(second.getByText('Bảo trì')).toBeInTheDocument()
      expect(second.getByText('—')).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'Người chịu trách nhiệm' })).toBeInTheDocument()
      expect(api.get.mock.calls.map(([url]) => url)).toEqual(['/weapons'])
    })

    it('shows an empty state', async () => {
      server.weapons = []
      wrap()
      expect(await screen.findByText('Chưa có vũ khí nào')).toBeInTheDocument()
    })

    it('explains a catalog that cannot be loaded', async () => {
      server.failures['/weapons'] = httpError(500, 'Internal server error')
      wrap()
      expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh mục vũ khí.')
    })
  })

  describe('adding a weapon', () => {
    it('posts only the CreateWeaponDto fields', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('add-weapon-btn'))
      await user.type(screen.getByLabelText(/Loại vũ khí/), 'Súng K54')
      await user.type(screen.getByLabelText(/Số hiệu/), 'K54-0001')
      fireEvent.change(screen.getByLabelText(/Ngày nhập/), { target: { value: '2024-05-10' } })
      await user.type(screen.getByLabelText(/Nơi cất/), 'Kho A')
      await user.click(screen.getByRole('button', { name: 'Thêm' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][0]).toBe('/weapons')
      expect(api.post.mock.calls[0][1]).toStrictEqual({
        type: 'Súng K54',
        serialNumber: 'K54-0001',
        acquiredAt: '2024-05-10',
        condition: 'good',
        storageLocation: 'Kho A',
      })
    })

    it('requires the acquisition date and storage place that CreateWeaponDto requires', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('add-weapon-btn'))
      await user.type(screen.getByLabelText(/Loại vũ khí/), 'Súng K54')
      await user.type(screen.getByLabelText(/Số hiệu/), 'K54-0001')
      await user.click(screen.getByRole('button', { name: 'Thêm' }))

      expect(toast.error).toHaveBeenCalledWith('Vui lòng điền đầy đủ các trường bắt buộc')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('marks every missing field in a dialog with the add-weapon labels', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('add-weapon-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Thêm vũ khí / trang thiết bị' })
      expect(within(dialog).getByPlaceholderText('VD: Súng AK-47')).toBeInTheDocument()
      expect(within(dialog).getByPlaceholderText('VD: AK-2024-001')).toBeInTheDocument()
      expect(within(dialog).getByPlaceholderText('VD: Kho vũ khí A')).toBeInTheDocument()
      expect(within(dialog).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tốt', 'Hỏng', 'Bảo trì'])
      await user.type(within(dialog).getByLabelText(/Loại vũ khí/), '   ')
      await user.click(within(dialog).getByRole('button', { name: 'Thêm' }))

      expect(within(dialog).getByTestId('weapon-type-error')).toHaveTextContent('Vui lòng nhập loại vũ khí')
      expect(within(dialog).getByTestId('weapon-serial-error')).toHaveTextContent('Vui lòng nhập số hiệu')
      expect(within(dialog).getByTestId('weapon-acquired-at-error')).toHaveTextContent('Vui lòng chọn ngày nhập')
      expect(within(dialog).getByTestId('weapon-storage-error')).toHaveTextContent('Vui lòng nhập nơi cất')

      await user.type(within(dialog).getByLabelText(/Nơi cất/), 'Kho A')
      expect(within(dialog).queryByTestId('weapon-storage-error')).not.toBeInTheDocument()
    })

    it('adds the weapon with the chosen condition, confirms it and reloads the catalog', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('add-weapon-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Thêm vũ khí / trang thiết bị' })
      await user.type(within(dialog).getByLabelText(/Loại vũ khí/), '  Súng K54 ')
      await user.type(within(dialog).getByLabelText(/Số hiệu/), ' K54-0002 ')
      await user.selectOptions(within(dialog).getByLabelText(/Tình trạng/), 'damaged')
      fireEvent.change(within(dialog).getByLabelText(/Ngày nhập/), { target: { value: '2024-05-10' } })
      await user.type(within(dialog).getByLabelText(/Nơi cất/), 'Kho B')
      const loads = getCount('/weapons')
      await user.click(within(dialog).getByRole('button', { name: 'Thêm' }))

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã thêm vũ khí'))
      expect(api.post).toHaveBeenCalledWith('/weapons', {
        type: 'Súng K54',
        serialNumber: 'K54-0002',
        acquiredAt: '2024-05-10',
        condition: 'damaged',
        storageLocation: 'Kho B',
      })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(getCount('/weapons')).toBeGreaterThan(loads))
    })

    it.each([
      [httpError(409, 'serial_number_already_exists'), 'Số hiệu này đã có trong danh mục vũ khí.'],
      [
        httpError(400, 'validation_failed', ['serialNumber must be shorter than or equal to 100 characters']),
        'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại (serialNumber must be shorter than or equal to 100 characters)',
      ],
      [httpError(500, 'Internal server error'), 'Không thể thêm vũ khí'],
    ])('explains a refused weapon in the form (%#)', async (error, message) => {
      api.post.mockRejectedValueOnce(error)
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('add-weapon-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Thêm vũ khí / trang thiết bị' })
      await user.type(within(dialog).getByLabelText(/Loại vũ khí/), 'Súng K54')
      await user.type(within(dialog).getByLabelText(/Số hiệu/), 'K54-0001')
      fireEvent.change(within(dialog).getByLabelText(/Ngày nhập/), { target: { value: '2024-05-10' } })
      await user.type(within(dialog).getByLabelText(/Nơi cất/), 'Kho A')
      await user.click(within(dialog).getByRole('button', { name: 'Thêm' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    })

    it('closes the form without sending on cancel', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('add-weapon-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Thêm vũ khí / trang thiết bị' })
      await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })
  })

  describe('allocation log', () => {
    it('shows each allocation in the server order, naming the weapon and recipient from the row', async () => {
      server.allocations = [
        allocation('al2', {
          weaponId: 'w-retired',
          recipientId: 'm7',
          issuedAt: '2026-05-01T00:00:00.000Z',
          purpose: 'Diễn tập',
          returnedAt: '2026-05-02T00:00:00.000Z',
          weaponSerialNumber: 'SN-090',
          weaponType: 'Súng CKC',
          recipientName: 'Phạm Văn E',
          recipientCode: 'DQ-007',
        }),
        // Same day as al1: the server breaks the tie by id, the page must not reorder
        allocation('al3', { weaponId: 'w2', weaponSerialNumber: 'SN-002', weaponType: 'Súng ngắn K54' }),
        allocation('al1'),
      ]
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'log')

      const open = within(await screen.findByTestId('allocation-row-al1'))
      expect(open.getByText('01/04/2026')).toBeInTheDocument()
      expect(open.getByText('Súng trường')).toBeInTheDocument()
      expect(open.getByText('SN-001')).toBeInTheDocument()
      expect(open.getByText('Nguyễn B')).toBeInTheDocument()
      expect(open.getByText('DQ-001')).toBeInTheDocument()
      expect(open.getByText('Tuần tra')).toBeInTheDocument()
      expect(open.getByText('Chưa trả')).toBeInTheDocument()

      // A weapon retired since keeps its name: it comes with the allocation, not from the active register
      const returned = within(screen.getByTestId('allocation-row-al2'))
      expect(returned.getByText('Súng CKC')).toBeInTheDocument()
      expect(returned.getByText('SN-090')).toBeInTheDocument()
      expect(returned.getByText('Phạm Văn E')).toBeInTheDocument()
      expect(returned.getByText('DQ-007')).toBeInTheDocument()
      expect(returned.getByText('02/05/2026')).toBeInTheDocument()

      expect(screen.getAllByTestId(/^allocation-row-/).map((row) => row.dataset.testid)).toEqual([
        'allocation-row-al2',
        'allocation-row-al3',
        'allocation-row-al1',
      ])
      for (const header of ['Ngày', 'Vũ khí', 'Người nhận', 'Mục đích', 'Ngày trả']) {
        expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
      }
    })

    it('loads the log with exactly one GET /weapons/allocations and no per-row militia lookup', async () => {
      server.allocations = [
        allocation('al1'),
        allocation('al3', { weaponId: 'w2', recipientId: 'm2', recipientName: 'Trần A', recipientCode: 'DQ-002', issuedAt: '2026-03-01T00:00:00.000Z' }),
      ]
      const user = userEvent.setup()
      wrap()
      await screen.findByTestId('weapon-row-w1')
      const before = api.get.mock.calls.length
      await openTab(user, 'log')

      expect(within(await screen.findByTestId('allocation-row-al3')).getByText('Trần A')).toBeInTheDocument()
      await waitFor(() => expect(api.get.mock.calls.slice(before)).toEqual([['/weapons/allocations']]))
      expect(api.get.mock.calls.some(([url]) => String(url).startsWith('/militia/'))).toBe(false)
    })

    it('shows an empty state', async () => {
      server.allocations = []
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'log')
      expect(await screen.findByText('Chưa có log cấp phát nào')).toBeInTheDocument()
    })

    it('explains a log that cannot be loaded', async () => {
      server.failures['/weapons/allocations'] = httpError(500, 'Internal server error')
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'log')
      expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải log cấp phát.')
    })
  })

  describe('inventory overview', () => {
    it('counts the register by condition and the allocations overdue', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      await waitFor(() => expect(screen.getByTestId('inventory-card-overdue')).toHaveTextContent('1Quá hạn (>180 ngày)'))
      expect(screen.getByTestId('inventory-card-good')).toHaveTextContent('1Tình trạng tốt')
      expect(screen.getByTestId('inventory-card-maintenance')).toHaveTextContent('1Đang bảo trì')
      expect(screen.getByTestId('inventory-card-damaged')).toHaveTextContent('0Hỏng')
      expect(screen.getByTestId('inventory-register-total')).toHaveTextContent('Tổng số vũ khí / trang thiết bị đang hoạt động theo sổ sách: 2')
    })

    it('lists the inventory report with condition labels, holders and overdue allocations', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      const overdue = within(await screen.findByTestId('inventory-report-row-w2'))
      expect(overdue.getByText('Bảo trì')).toBeInTheDocument()
      expect(overdue.queryByText('maintenance')).not.toBeInTheDocument()
      expect(overdue.getByText('Nguyễn B')).toBeInTheDocument()
      expect(overdue.getByText('Quá hạn')).toBeInTheDocument()

      const kept = within(screen.getByTestId('inventory-report-row-w1'))
      expect(kept.getByText('Tốt')).toBeInTheDocument()
      expect(kept.getByText('Trần A')).toBeInTheDocument()
      expect(kept.queryByText('Quá hạn')).not.toBeInTheDocument()
      for (const header of ['Loại', 'Số hiệu', 'Tình trạng', 'Nơi cất', 'Người chịu TN', 'Đang cấp phát', 'Quá hạn']) {
        expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
      }
    })

    it('explains a report that cannot be loaded', async () => {
      server.failures['/weapons/inventory-report'] = httpError(500, 'Internal server error')
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')
      expect(await screen.findByText('Không thể tải báo cáo tồn kho vũ khí.')).toBeInTheDocument()
    })
  })

  describe('export', () => {
    it('downloads the internal inventory record as xlsx', async () => {
      const revokeObjectURL = vi.fn()
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:weapons'), revokeObjectURL })
      const downloads: string[] = []
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download)
      })
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      const button = await screen.findByTestId('export-inventory-btn')
      expect(button).toHaveTextContent('Biên bản kiểm kê (nội bộ)')
      await user.click(button)

      await waitFor(() => expect(downloads).toEqual([`KiemKe_VuKhi_${todayInVietnam()}.xlsx`]))
      expect(api.get).toHaveBeenCalledWith('/weapons/export', { responseType: 'blob' })
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:weapons')
      click.mockRestore()
    })

    it.each([
      [403, JSON.stringify({ code: 'E003', message: 'forbidden', statusCode: 403 }), 'Bạn không có quyền xuất biên bản kiểm kê.'],
      [500, '<html>Bad gateway</html>', 'Không thể xuất biên bản kiểm kê'],
    ])('explains a failed export answered %i', async (status, body, message) => {
      server.failures['/weapons/export'] = { isAxiosError: true, request: {}, response: { status, data: new Blob([body]) } }
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      await user.click(await screen.findByTestId('export-inventory-btn'))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
      await waitFor(() => expect(screen.getByTestId('export-inventory-btn')).toBeEnabled())
    })
  })

  describe('recording a counted check', () => {
    it('sends the counted number with the notes, not the size of the register', async () => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openRecordDialog(user)

      expect(within(dialog).getByRole('radio', { name: 'Nhập số lượng' })).toBeChecked()
      expect(await within(dialog).findByText('Theo sổ sách hiện có 2 vũ khí đang hoạt động.')).toBeInTheDocument()
      await user.type(within(dialog).getByLabelText(/Số lượng xác nhận có mặt/), '1')
      await user.type(within(dialog).getByLabelText('Ghi chú kiểm kê'), '  Thiếu khẩu SN-002  ')
      expect(within(dialog).getByPlaceholderText('Ghi chú về tình trạng kiểm kê...')).toBeInTheDocument()
      const historyLoads = getCount('/weapons/inventory')
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0]).toStrictEqual(['/weapons/inventory', { confirmedCount: 1, notes: 'Thiếu khẩu SN-002' }])
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã xác nhận kiểm kê'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      const result = await screen.findByTestId('inventory-result')
      expect(result).toHaveTextContent(`Kết quả kiểm kê ngày ${todayInVietnam().split('-').reverse().join('/')}`)
      expect(within(result).getByTestId('check-summary-expected')).toHaveTextContent('Theo sổ sách2')
      expect(within(result).getByTestId('check-summary-confirmed')).toHaveTextContent('Xác nhận có mặt1')
      expect(within(result).getByTestId('check-summary-discrepancy')).toHaveTextContent('Chênh lệch-1')
      expect(within(result).getByText('Thiếu 1 vũ khí so với sổ sách')).toBeInTheDocument()
      await waitFor(() => expect(getCount('/weapons/inventory')).toBeGreaterThan(historyLoads))
    })

    it.each([
      ['2', 'Số lượng khớp với sổ sách'],
      ['3', 'Thừa 1 vũ khí so với sổ sách'],
    ])('leaves blank notes out and says how a count of %s compares with the register', async (count, verdict) => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openRecordDialog(user)

      await user.type(within(dialog).getByLabelText(/Số lượng xác nhận có mặt/), count)
      await user.type(within(dialog).getByLabelText('Ghi chú kiểm kê'), '   ')
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/weapons/inventory', { confirmedCount: Number(count) }))
      expect(within(await screen.findByTestId('inventory-result')).getByText(verdict)).toBeInTheDocument()
    })

    it.each([
      ['', 'Vui lòng nhập số lượng xác nhận có mặt'],
      ['1.5', 'Số lượng phải là số nguyên từ 0 đến 100.000'],
      ['-1', 'Số lượng phải là số nguyên từ 0 đến 100.000'],
      ['100001', 'Số lượng phải là số nguyên từ 0 đến 100.000'],
    ])('refuses the count %j before sending it', async (value, message) => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openRecordDialog(user)

      fireEvent.change(within(dialog).getByLabelText(/Số lượng xác nhận có mặt/), { target: { value } })
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      expect(within(dialog).getByTestId('inventory-confirmed-count-error')).toHaveTextContent(message)
      expect(api.post).not.toHaveBeenCalled()

      fireEvent.change(within(dialog).getByLabelText(/Số lượng xác nhận có mặt/), { target: { value: '0' } })
      expect(within(dialog).queryByTestId('inventory-confirmed-count-error')).not.toBeInTheDocument()
    })

    it.each([
      [403, 'ward_scope_required', 'Chỉ tài khoản cấp phường mới được kiểm kê vũ khí.'],
      [400, 'inventory_count_mismatch', 'Số lượng xác nhận không khớp với số vũ khí được đánh dấu có mặt.'],
      [400, 'observed_condition_without_found', 'Chỉ ghi tình trạng cho vũ khí có mặt khi kiểm kê.'],
      [500, 'Internal server error', 'Không thể xác nhận kiểm kê'],
    ])('explains %i %s in the form', async (status, code, message) => {
      api.post.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap()
      const dialog = await openRecordDialog(user)

      await user.type(within(dialog).getByLabelText(/Số lượng xác nhận có mặt/), '2')
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('closes without sending on cancel', async () => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openRecordDialog(user)

      await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it('does not offer a unit-limited account to record a check', async () => {
      signInAs('office_staff', 'KP1')
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      expect(await screen.findByTestId('confirm-inventory-btn')).toBeDisabled()
      expect(screen.getByText('Chỉ tài khoản cấp phường mới được kiểm kê vũ khí.')).toBeInTheDocument()
    })

    it('lets a ward police officer record a check whatever the unit scope', async () => {
      signInAs('police_ward', 'KP1')
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      expect(await screen.findByTestId('confirm-inventory-btn')).toBeEnabled()
      expect(screen.queryByText('Chỉ tài khoản cấp phường mới được kiểm kê vũ khí.')).not.toBeInTheDocument()
    })
  })

  describe('recording a check by checklist', () => {
    it('lists every active weapon with its recorded condition, none found yet', async () => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openChecklist(user)

      const first = within(within(dialog).getByTestId('inventory-item-w1'))
      expect(first.getByText('SN-001')).toBeInTheDocument()
      expect(first.getByText('Súng trường')).toBeInTheDocument()
      expect(first.getByText('Kho 1')).toBeInTheDocument()
      expect(first.getByText('Tốt')).toBeInTheDocument()
      expect(first.getByRole('checkbox', { name: 'Có mặt: SN-001' })).not.toBeChecked()
      const second = within(within(dialog).getByTestId('inventory-item-w2'))
      expect(second.getByText('Bảo trì')).toBeInTheDocument()
      expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
      expect(within(dialog).getByTestId('inventory-found-count')).toHaveTextContent('Xác nhận có mặt: 0/2')
      expect(within(dialog).queryByLabelText(/Số lượng xác nhận có mặt/)).not.toBeInTheDocument()
    })

    it('sends every active weapon, the observed condition of found ones only, and the found count', async () => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openChecklist(user)

      await user.click(within(dialog).getByRole('checkbox', { name: 'Có mặt: SN-001' }))
      const observed = within(dialog).getByRole('combobox', { name: 'Tình trạng khi kiểm kê: SN-001' })
      expect(observed).toHaveValue('good')
      await user.selectOptions(observed, 'damaged')
      expect(within(dialog).getByTestId('inventory-found-count')).toHaveTextContent('Xác nhận có mặt: 1/2')
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0]).toStrictEqual([
        '/weapons/inventory',
        {
          confirmedCount: 1,
          items: [
            { weaponId: 'w1', found: true, observedCondition: 'damaged' },
            { weaponId: 'w2', found: false },
          ],
        },
      ])
      const result = await screen.findByTestId('inventory-result')
      expect(within(result).getByText('Thiếu 1 vũ khí so với sổ sách')).toBeInTheDocument()
      expect(within(result).getByText('Không có mặt (1): SN-002')).toBeInTheDocument()
    })

    it('marks all weapons found with their recorded condition, and hides the condition of an unmarked one', async () => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openChecklist(user)

      await user.click(within(dialog).getByRole('button', { name: 'Đánh dấu tất cả có mặt' }))
      expect(within(dialog).getByTestId('inventory-found-count')).toHaveTextContent('Xác nhận có mặt: 2/2')
      expect(within(dialog).getByRole('combobox', { name: 'Tình trạng khi kiểm kê: SN-002' })).toHaveValue('maintenance')

      await user.click(within(dialog).getByRole('checkbox', { name: 'Có mặt: SN-002' }))
      expect(within(dialog).queryByRole('combobox', { name: 'Tình trạng khi kiểm kê: SN-002' })).not.toBeInTheDocument()
      await user.click(within(dialog).getByRole('checkbox', { name: 'Có mặt: SN-002' }))
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/weapons/inventory', {
          confirmedCount: 2,
          items: [
            { weaponId: 'w1', found: true, observedCondition: 'good' },
            { weaponId: 'w2', found: true, observedCondition: 'maintenance' },
          ],
        }),
      )
      expect(within(await screen.findByTestId('inventory-result')).getByText('Số lượng khớp với sổ sách')).toBeInTheDocument()
    })

    it('rebuilds the checklist from the register when it changed during the check', async () => {
      api.post.mockRejectedValueOnce(httpError(409, 'inventory_register_changed'))
      const user = userEvent.setup()
      wrap()
      const dialog = await openChecklist(user)

      await user.click(within(dialog).getByRole('checkbox', { name: 'Có mặt: SN-001' }))
      server.weapons = [...server.weapons, weapon('w3', { type: 'Súng AK', serialNumber: 'SN-003', condition: 'damaged' })]
      const loads = getCount('/weapons')
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Danh sách vũ khí đã thay đổi trong lúc kiểm kê. Vui lòng tải lại và kiểm kê lại.',
      )
      await waitFor(() => expect(getCount('/weapons')).toBeGreaterThan(loads))
      expect(await within(dialog).findByTestId('inventory-item-w3')).toBeInTheDocument()
      expect(within(dialog).getByRole('checkbox', { name: 'Có mặt: SN-003' })).not.toBeChecked()
      expect(within(dialog).getByTestId('inventory-found-count')).toHaveTextContent('Xác nhận có mặt: 1/3')
    })

    it('records an empty register as nothing found', async () => {
      server.weapons = []
      const user = userEvent.setup()
      wrap()
      const dialog = await openRecordDialog(user)
      await user.click(within(dialog).getByRole('radio', { name: 'Kiểm theo danh sách' }))

      expect(await within(dialog).findByText('Không có vũ khí nào đang hoạt động trong sổ sách.')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/weapons/inventory', { confirmedCount: 0, items: [] }))
    })

    it('does not send a checklist whose register cannot be loaded', async () => {
      server.failures['/weapons'] = httpError(500, 'Internal server error')
      const user = userEvent.setup()
      wrap()
      const dialog = await openRecordDialog(user)
      await user.click(within(dialog).getByRole('radio', { name: 'Kiểm theo danh sách' }))

      expect(await within(dialog).findByText('Không thể tải danh sách vũ khí để kiểm kê.')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    })

    it('goes back to a counted check without items', async () => {
      const user = userEvent.setup()
      wrap()
      const dialog = await openChecklist(user)

      await user.click(within(dialog).getByRole('checkbox', { name: 'Có mặt: SN-001' }))
      await user.click(within(dialog).getByRole('radio', { name: 'Nhập số lượng' }))
      await user.type(within(dialog).getByLabelText(/Số lượng xác nhận có mặt/), '2')
      await user.click(within(dialog).getByRole('button', { name: 'Lưu kết quả' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/weapons/inventory', { confirmedCount: 2 }))
    })
  })

  describe('inventory history', () => {
    beforeEach(() => {
      server.checks = [
        check('c1', {
          confirmedCount: 1,
          discrepancy: -1,
          notes: 'Khẩu K54 đang sửa',
          verifiedCount: 2,
          missingCount: 1,
        }),
        check('c2', { checkDate: '2026-06-30', performedByName: 'Phạm D' }),
        check('c3', { checkDate: '2026-03-01', expectedCount: 1, confirmedCount: 2, discrepancy: 1, itemCount: 1 }),
      ]
      server.details = {
        c1: {
          ...server.checks[0],
          items: [
            item({ weaponId: 'w1', found: true, observedCondition: 'damaged' }),
            item({
              weaponId: 'w2',
              weaponType: 'Súng ngắn K54',
              serialNumber: 'SN-002',
              condition: 'maintenance',
              storageLocation: 'Kho 2',
              holderMilitiaId: 'm1',
              holderName: 'Nguyễn B',
              found: false,
            }),
          ],
        },
        c2: { ...server.checks[1], items: [item({ weaponId: 'w1' })] },
      }
    })

    it('loads the checks of the Vietnamese year so far', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith('/weapons/inventory', { params: { from: firstDayOfYearInVietnam(), to: todayInVietnam() } }),
      )
      expect(screen.getByLabelText('Từ ngày')).toHaveValue(firstDayOfYearInVietnam())
      expect(screen.getByLabelText('Đến ngày')).toHaveValue(todayInVietnam())
    })

    it('shows each check with its counts, discrepancy, itemised results and notes', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      const missing = within(await screen.findByTestId('inventory-check-row-c1'))
      expect(missing.getByText('10/09/2026')).toBeInTheDocument()
      expect(missing.getByText('Lê Văn C')).toBeInTheDocument()
      expect(missing.getByText('-1')).toBeInTheDocument()
      expect(missing.getByText('Thiếu 1')).toBeInTheDocument()
      expect(missing.getByText('Đã kiểm 2/2 · Không có mặt 1')).toBeInTheDocument()
      expect(missing.getByText('Khẩu K54 đang sửa')).toBeInTheDocument()

      const counted = within(screen.getByTestId('inventory-check-row-c2'))
      expect(counted.getByText('30/06/2026')).toBeInTheDocument()
      expect(counted.getByText('Khớp')).toBeInTheDocument()
      expect(counted.getByText('Chỉ nhập số lượng')).toBeInTheDocument()
      expect(counted.getByText('—')).toBeInTheDocument()

      const surplus = within(screen.getByTestId('inventory-check-row-c3'))
      expect(surplus.getByText('+1')).toBeInTheDocument()
      expect(surplus.getByText('Thừa 1')).toBeInTheDocument()
      for (const header of ['Ngày kiểm kê', 'Người kiểm kê', 'Theo sổ sách', 'Xác nhận có mặt', 'Chênh lệch', 'Kiểm theo danh sách', 'Ghi chú']) {
        expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
      }
    })

    it('reloads the checks for the chosen dates', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')
      await screen.findByTestId('inventory-check-row-c1')

      fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2020-01-01' } })
      await waitFor(() =>
        expect(api.get).toHaveBeenCalledWith('/weapons/inventory', { params: { from: '2020-01-01', to: todayInVietnam() } }),
      )
    })

    it('refuses a range that ends before it starts without asking the server', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')
      await screen.findByTestId('inventory-check-row-c1')

      fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2020-01-01' } })
      fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2020-02-01' } })

      expect(await screen.findByTestId('inventory-history-to-error')).toHaveTextContent('Ngày kết thúc không được trước ngày bắt đầu.')
      expect(api.get).not.toHaveBeenCalledWith('/weapons/inventory', { params: { from: '2020-02-01', to: '2020-01-01' } })
      expect(screen.queryByTestId('inventory-check-row-c1')).not.toBeInTheDocument()
    })

    it('shows an empty state', async () => {
      server.checks = []
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')
      expect(await screen.findByText('Chưa có lần kiểm kê nào trong khoảng thời gian đã chọn.')).toBeInTheDocument()
    })

    it('explains a history that cannot be loaded', async () => {
      server.failures['/weapons/inventory'] = httpError(500, 'Internal server error')
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')
      expect(await screen.findByText('Không thể tải lịch sử kiểm kê.')).toBeInTheDocument()
    })

    it('shows the snapshot of a checklist check: found, not found, observed against recorded condition', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      await user.click(within(await screen.findByTestId('inventory-check-row-c1')).getByRole('button', { name: 'Xem chi tiết' }))
      const dialog = await screen.findByRole('dialog', { name: 'Phiếu kiểm kê ngày 10/09/2026' })
      expect(dialog).toHaveAccessibleDescription('Người kiểm kê: Lê Văn C')

      const found = within(await within(dialog).findByTestId('inventory-check-item-w1'))
      expect(found.getByText('SN-001')).toBeInTheDocument()
      expect(found.getByText('Có mặt')).toBeInTheDocument()
      expect(found.getByText('Tốt → Hỏng')).toBeInTheDocument()
      const lost = within(within(dialog).getByTestId('inventory-check-item-w2'))
      expect(lost.getByText('Không có mặt')).toBeInTheDocument()
      expect(lost.getByText('Nguyễn B')).toBeInTheDocument()
      expect(lost.getByText('Bảo trì')).toBeInTheDocument()
      expect(within(dialog).getByTestId('check-summary-discrepancy')).toHaveTextContent('Chênh lệch-1')
      expect(within(dialog).getByText('Khẩu K54 đang sửa')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/weapons/inventory/c1')
    })

    it('says which weapons a counted check did not itemise', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      await user.click(within(await screen.findByTestId('inventory-check-row-c2')).getByRole('button', { name: 'Xem chi tiết' }))
      const dialog = await screen.findByRole('dialog', { name: 'Phiếu kiểm kê ngày 30/06/2026' })
      const row = within(await within(dialog).findByTestId('inventory-check-item-w1'))
      expect(row.getByText('Không kiểm theo danh sách')).toBeInTheDocument()
      expect(within(dialog).getByText('Số lượng khớp với sổ sách')).toBeInTheDocument()
    })

    it('says when a check was saved while no weapon was active', async () => {
      server.checks = [check('c4', { checkDate: '2026-02-01', expectedCount: 0, confirmedCount: 0, itemCount: 0 })]
      server.details = { c4: { ...server.checks[0], items: [] } }
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      await user.click(within(await screen.findByTestId('inventory-check-row-c4')).getByRole('button', { name: 'Xem chi tiết' }))
      const dialog = await screen.findByRole('dialog', { name: 'Phiếu kiểm kê ngày 01/02/2026' })
      expect(await within(dialog).findByText('Phiếu kiểm kê không có vũ khí nào.')).toBeInTheDocument()
      expect(within(dialog).getByText('Số lượng khớp với sổ sách')).toBeInTheDocument()
    })

    it('explains a check that no longer exists', async () => {
      const user = userEvent.setup()
      wrap()
      await openTab(user, 'inventory')

      await user.click(within(await screen.findByTestId('inventory-check-row-c3')).getByRole('button', { name: 'Xem chi tiết' }))
      const dialog = await screen.findByRole('dialog', { name: 'Phiếu kiểm kê ngày 01/03/2026' })
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không tìm thấy phiếu kiểm kê.')

      await user.click(within(dialog).getByRole('button', { name: 'Đóng' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

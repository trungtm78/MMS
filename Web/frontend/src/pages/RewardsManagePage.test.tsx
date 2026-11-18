import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RewardsManagePage } from './RewardsManagePage'

// Only the HTTP layer and the signed-in user are replaced: useRbac, SmartSelect and the dialogs run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// A timezone behind UTC, where `new Date('2026-03-15')` reads as 14 March
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

const MILITIA_ID = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01'

// GET /militia/search row
const militia = [
  { id: MILITIA_ID, userId: null, militiaCode: 'DQ-001', fullName: 'Nguyễn Văn A', phone: null, rank: null, status: 'active', unitCode: 'KP1', unitName: 'Khu phố 1' },
]

// Web/backend/src/rewards/rewards.service.ts RewardRecord
const reward = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  militiaId: MILITIA_ID,
  militiaName: 'Nguyễn Văn A',
  militiaCode: 'DQ-001',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
  rewardType: 'giay_khen',
  rewardTypeLabel: 'Giấy khen',
  issuingAuthority: 'commune',
  issuingAuthorityLabel: 'Chủ tịch UBND cấp xã',
  basis: 'achievement',
  criteria: 'Hoàn thành xuất sắc nhiệm vụ',
  decisionNumber: '12/QĐ-UBND',
  issuedDate: '2026-03-15',
  createdBy: 'u1',
  createdByName: 'Cán bộ văn phòng',
  createdAt: '2026-03-15T02:00:00.000Z',
  ...patch,
})

// Web/backend/src/rewards/discipline.service.ts DisciplineRecord
const decision = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  militiaId: 'm2',
  militiaName: 'Trần Văn B',
  militiaCode: 'DQ-002',
  unitCode: 'KP2',
  unitName: 'Khu phố 2',
  disciplineType: 'khien_trach',
  disciplineTypeLabel: 'Khiển trách',
  violation: 'Vắng trực không lý do',
  violationDate: '2026-03-30',
  decisionDate: '2026-04-02',
  decisionNumber: '05/QĐ-UBND',
  issuedBy: 'Chủ tịch UBND phường',
  status: 'active',
  appealedAt: null,
  appealRounds: 0,
  createdBy: 'u1',
  createdByName: 'Cán bộ văn phòng',
  createdAt: '2026-04-02T02:00:00.000Z',
  updatedAt: '2026-04-02T02:00:00.000Z',
  ...patch,
})

// Web/backend/src/rewards/discipline.service.ts AppealRecord (GET /discipline/:id appeals)
const appeal = (patch: Record<string, unknown> = {}) => ({
  id: 'a1',
  round: 1,
  reason: 'Hôm đó có giấy nghỉ ốm của trạm y tế',
  filedDate: '2026-04-06',
  filedBy: 'u9',
  filedByName: 'Trần Văn B',
  outcome: null,
  resolution: null,
  decidedDate: null,
  decidedBy: null,
  decidedByName: null,
  createdAt: '2026-04-06T02:00:00.000Z',
  decidedAt: null,
  ...patch,
})

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

const server = {
  rewards: [] as ReturnType<typeof reward>[],
  discipline: [] as ReturnType<typeof decision>[],
  appeals: [] as ReturnType<typeof appeal>[],
}

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/rewards']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/rewards" element={<RewardsManagePage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

type User = ReturnType<typeof userEvent.setup>

async function chooseMember(user: User, name: string) {
  const input = screen.getByTestId(`smart-select-${name}-input`)
  await user.click(input)
  await user.type(input, 'DQ-001')
  await user.click(await screen.findByRole('option', { name: /DQ-001/ }))
}

const optionLabels = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent)

async function openDisciplineTab(user: User) {
  await user.click(await screen.findByTestId('tab-discipline'))
}

describe('RewardsManagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps queued once-answers; a test that stops early must not leave one behind
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    signInAs('office_staff')
    server.rewards = [reward('r1')]
    server.discipline = [decision('d1')]
    server.appeals = [appeal()]
    api.get.mockImplementation((url: string) => {
      if (url === '/rewards') return Promise.resolve({ data: server.rewards })
      if (url === '/discipline') return Promise.resolve({ data: server.discipline })
      if (url === '/militia/search') return Promise.resolve({ data: militia })
      const detail = /^\/discipline\/([^/]+)$/.exec(url)
      if (detail) {
        const record = server.discipline.find((d) => d.id === detail[1])
        return record
          ? Promise.resolve({ data: { ...record, appeals: server.appeals } })
          : Promise.reject(httpError(404, 'discipline_decision_not_found'))
      }
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    api.post.mockResolvedValue({ data: { id: 'new' } })
    api.patch.mockResolvedValue({ data: { id: 'd1' } })
  })

  // rewards.roles.ts: staff read and decide; DQTV members read their own decisions and may appeal
  describe('access', () => {
    it.each(['system_admin', 'police_ward', 'office_staff', 'dqtv', 'dqtv_member'])('opens for the reader %s', async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByTestId('reward-row-r1')).toBeInTheDocument()
    })

    it.each(['police_area', 'ca_ward', 'ca_officer', 'ubnd_leader'])('sends %s to the forbidden page', async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalled()
    })

    it('does not offer DQTV members to create decisions', async () => {
      signInAs('dqtv')
      const user = userEvent.setup()
      wrap()
      await screen.findByTestId('reward-row-r1')
      expect(screen.queryByTestId('create-reward-btn')).not.toBeInTheDocument()

      await openDisciplineTab(user)
      await screen.findByTestId('discipline-row-d1')
      expect(screen.queryByTestId('create-discipline-btn')).not.toBeInTheDocument()
    })
  })

  describe('rewards', () => {
    it('lists GET /rewards with the labels the backend sends', async () => {
      wrap()

      const row = within(await screen.findByTestId('reward-row-r1'))
      expect(row.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(row.getByText('DQ-001')).toBeInTheDocument()
      expect(row.getByText('Giấy khen')).toBeInTheDocument()
      expect(row.getByText('Chủ tịch UBND cấp xã')).toBeInTheDocument()
      expect(row.getByText('12/QĐ-UBND')).toBeInTheDocument()
      expect(row.getByText('15/03/2026')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/rewards')
    })

    it('shows an empty state', async () => {
      server.rewards = []
      wrap()
      expect(await screen.findByText('Chưa có quyết định khen thưởng nào')).toBeInTheDocument()
    })

    it('explains a list that cannot be loaded', async () => {
      api.get.mockImplementation((url: string) =>
        url === '/rewards' ? Promise.reject(httpError(500, 'Internal server error')) : Promise.resolve({ data: [] }),
      )
      wrap()
      expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách khen thưởng.')
    })

    it('offers the legal reward forms only, with their backend labels', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })

      const forms = optionLabels(within(dialog).getByLabelText(/Hình thức khen thưởng/))
      expect(forms).toEqual([
        '-- Chọn hình thức --',
        'Chiến sĩ thi đua toàn quốc',
        'Chiến sĩ thi đua toàn quân',
        'Chiến sĩ thi đua cơ sở',
        'Chiến sĩ tiên tiến',
        'Huân chương',
        'Huy chương',
        'Danh hiệu vinh dự nhà nước',
        'Giải thưởng Hồ Chí Minh, Giải thưởng Nhà nước',
        'Kỷ niệm chương "Vì sự nghiệp vũ trang quần chúng"',
        'Bằng khen',
        'Giấy khen',
      ])
      expect(optionLabels(within(dialog).getByLabelText(/Căn cứ khen thưởng/))).toEqual([
        '-- Không ghi --',
        'Thành tích thường xuyên',
        'Đột xuất',
        'Theo chuyên đề',
        'Quá trình cống hiến',
      ])
    })

    // reward-codes.ts REWARD_FORM_AUTHORITIES; district-level authorities ended on 2025-07-01
    it('offers the authorities that may confer the chosen form on the decision date', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      const authority = within(dialog).getByLabelText(/Cấp ra quyết định/)

      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'huan_chuong')
      expect(optionLabels(authority)).toEqual(['-- Chọn cấp --', 'Chủ tịch nước'])

      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'giay_khen')
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2025-06-30' } })
      expect(optionLabels(authority)).toContain('Chủ tịch UBND cấp huyện')

      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2025-07-01' } })
      expect(optionLabels(authority)).toEqual([
        '-- Chọn cấp --',
        'Thủ trưởng cấp quân khu, quân chủng',
        'Thủ trưởng Bộ Chỉ huy quân sự, Bộ Chỉ huy Bộ đội biên phòng tỉnh',
        'Chủ tịch UBND cấp xã',
      ])
    })

    it('creates a decision for the chosen member with backend codes (an exceptional deed is basis ad_hoc)', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      await chooseMember(user, 'reward-militia')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'giay_khen')
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2026-03-10' } })
      await user.selectOptions(within(dialog).getByLabelText(/Cấp ra quyết định/), 'commune')
      await user.selectOptions(within(dialog).getByLabelText(/Căn cứ khen thưởng/), 'ad_hoc')
      await user.type(within(dialog).getByLabelText(/Số quyết định/), '15/QĐ-UBND')
      await user.type(within(dialog).getByLabelText(/Tiêu chí/), 'Cứu người đuối nước')
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][0]).toBe('/rewards')
      expect(api.post.mock.calls[0][1]).toStrictEqual({
        militiaId: MILITIA_ID,
        rewardType: 'giay_khen',
        issuingAuthority: 'commune',
        basis: 'ad_hoc',
        criteria: 'Cứu người đuối nước',
        decisionNumber: '15/QĐ-UBND',
        issuedDate: '2026-03-10',
      })
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã tạo quyết định khen thưởng'))
      expect(api.get.mock.calls.filter(([url]) => url === '/rewards').length).toBeGreaterThan(1)
    })

    it('sends only the fields that were filled in', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      await chooseMember(user, 'reward-militia')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'huan_chuong')
      await user.selectOptions(within(dialog).getByLabelText(/Cấp ra quyết định/), 'state')
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2026-03-10' } })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][1]).toStrictEqual({
        militiaId: MILITIA_ID,
        rewardType: 'huan_chuong',
        issuingAuthority: 'state',
        issuedDate: '2026-03-10',
      })
    })

    it('refuses a decision dated after today before sending it', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      await chooseMember(user, 'reward-militia')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'huan_chuong')
      await user.selectOptions(within(dialog).getByLabelText(/Cấp ra quyết định/), 'state')
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2999-01-01' } })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      expect(within(dialog).getByTestId('reward-issued-date-error')).toHaveTextContent('Ngày quyết định không được sau ngày hôm nay.')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('drops the chosen authority once it can no longer confer the form', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      const authority = within(dialog).getByLabelText(/Cấp ra quyết định/)
      expect(authority).toBeDisabled()

      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'giay_khen')
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2025-06-30' } })
      await user.selectOptions(authority, 'district')
      expect(authority).toHaveValue('district')

      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2025-07-01' } })
      expect(authority).toHaveValue('')

      await user.selectOptions(authority, 'commune')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'huan_chuong')
      expect(authority).toHaveValue('')
    })

    it('closes the form without sending on cancel', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      await user.click(within(dialog).getByRole('button', { name: 'Hủy' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it('says which required fields are missing and sends nothing', async () => {
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      expect(within(dialog).getByText('Vui lòng chọn DQTV')).toBeInTheDocument()
      expect(within(dialog).getByText('Vui lòng chọn hình thức khen thưởng')).toBeInTheDocument()
      expect(within(dialog).getByText('Vui lòng chọn cấp ra quyết định')).toBeInTheDocument()
      expect(within(dialog).getByText('Vui lòng chọn ngày quyết định')).toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it.each([
      [400, 'decision_date_in_future', 'Ngày quyết định không được sau ngày hôm nay.'],
      [400, 'reward_authority_not_allowed', 'Cấp ra quyết định này không có thẩm quyền trao hình thức khen thưởng đã chọn vào ngày quyết định.'],
      [404, 'militia_not_found', 'Không tìm thấy DQTV đã chọn, hoặc DQTV nằm ngoài phạm vi quản lý của bạn.'],
      [500, 'Internal server error', 'Không thể tạo quyết định khen thưởng'],
    ])('explains %i %s in the form', async (status, code, message) => {
      api.post.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap()

      await user.click(await screen.findByTestId('create-reward-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định khen thưởng' })
      await chooseMember(user, 'reward-militia')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức khen thưởng/), 'huan_chuong')
      await user.selectOptions(within(dialog).getByLabelText(/Cấp ra quyết định/), 'state')
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2026-03-10' } })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    })
  })

  describe('discipline', () => {
    it('lists GET /discipline with the type label, the status and the decision date', async () => {
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      const row = within(await screen.findByTestId('discipline-row-d1'))
      expect(row.getByText('Trần Văn B')).toBeInTheDocument()
      expect(row.getByText('Khiển trách')).toBeInTheDocument()
      expect(row.getByText('Hiệu lực')).toBeInTheDocument()
      expect(row.getByText(/02\/04\/2026/)).toBeInTheDocument()
      expect(row.getByText('Vắng trực không lý do')).toBeInTheDocument()
      expect(api.get).toHaveBeenCalledWith('/discipline')
    })

    it('shows the decision number, the signer and the appeal rounds used', async () => {
      server.discipline = [decision('d1', { appealRounds: 1 })]
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      const row = within(await screen.findByTestId('discipline-row-d1'))
      expect(row.getByText('Số 05/QĐ-UBND')).toBeInTheDocument()
      expect(row.getByText('Người ký: Chủ tịch UBND phường')).toBeInTheDocument()
      expect(row.getByText('Đã kháng cáo 1/2 lần')).toBeInTheDocument()
    })

    it('leaves out a missing decision number and signer', async () => {
      server.discipline = [decision('d1', { decisionNumber: null, issuedBy: null })]
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      const row = within(await screen.findByTestId('discipline-row-d1'))
      expect(row.queryByText(/^Số /)).not.toBeInTheDocument()
      expect(row.queryByText(/Người ký/)).not.toBeInTheDocument()
      expect(row.queryByText(/Đã kháng cáo/)).not.toBeInTheDocument()
    })

    it('shows an empty state', async () => {
      server.discipline = []
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)
      expect(await screen.findByText('Chưa có quyết định kỷ luật nào')).toBeInTheDocument()
    })

    it('explains a list that cannot be loaded', async () => {
      api.get.mockImplementation((url: string) =>
        url === '/discipline' ? Promise.reject(httpError(400, 'invalid_date_range')) : Promise.resolve({ data: [] }),
      )
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Khoảng thời gian không hợp lệ: ngày bắt đầu phải trước hoặc trùng ngày kết thúc.',
      )
    })

    it.each([
      ['appealed', 'Đang kháng cáo'],
      ['overturned', 'Đã hủy'],
    ])('shows the %s status', async (status, label) => {
      server.discipline = [decision('d1', { status, appealRounds: 1 })]
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)
      expect(within(await screen.findByTestId('discipline-row-d1')).getByText(label)).toBeInTheDocument()
    })

    it('offers the five legal discipline forms only', async () => {
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      await user.click(await screen.findByTestId('create-discipline-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định kỷ luật' })
      expect(optionLabels(within(dialog).getByLabelText(/Hình thức kỷ luật/))).toEqual([
        '-- Chọn hình thức --',
        'Khiển trách',
        'Cảnh cáo',
        'Giáng chức',
        'Cách chức',
        'Tước danh hiệu Dân quân tự vệ',
      ])
    })

    it('creates a decision for the chosen member with the legal code', async () => {
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      await user.click(await screen.findByTestId('create-discipline-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định kỷ luật' })
      await chooseMember(user, 'discipline-militia')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức kỷ luật/), 'canh_cao')
      await user.type(within(dialog).getByLabelText(/Hành vi vi phạm/), 'Bỏ vị trí trực')
      fireEvent.change(within(dialog).getByLabelText(/Ngày vi phạm/), { target: { value: '2026-04-01' } })
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2026-04-05' } })
      await user.type(within(dialog).getByLabelText(/Số quyết định/), '07/QĐ-UBND')
      await user.type(within(dialog).getByLabelText(/Người ký/), 'Chủ tịch UBND phường')
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
      expect(api.post.mock.calls[0][0]).toBe('/discipline')
      expect(api.post.mock.calls[0][1]).toStrictEqual({
        militiaId: MILITIA_ID,
        disciplineType: 'canh_cao',
        violation: 'Bỏ vị trí trực',
        violationDate: '2026-04-01',
        decisionDate: '2026-04-05',
        decisionNumber: '07/QĐ-UBND',
        issuedBy: 'Chủ tịch UBND phường',
      })
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã tạo quyết định kỷ luật'))
    })

    it('warns that demotion and dismissal apply to command positions only', async () => {
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      await user.click(await screen.findByTestId('create-discipline-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định kỷ luật' })
      const hint = 'Hình thức này chỉ áp dụng với người giữ chức vụ chỉ huy.'
      expect(within(dialog).queryByText(hint)).not.toBeInTheDocument()

      await user.selectOptions(within(dialog).getByLabelText(/Hình thức kỷ luật/), 'giang_chuc')
      expect(within(dialog).getByText(hint)).toBeInTheDocument()
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức kỷ luật/), 'cach_chuc')
      expect(within(dialog).getByText(hint)).toBeInTheDocument()
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức kỷ luật/), 'canh_cao')
      expect(within(dialog).queryByText(hint)).not.toBeInTheDocument()
    })

    it('refuses a violation after the decision and a decision dated after today before sending', async () => {
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      await user.click(await screen.findByTestId('create-discipline-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định kỷ luật' })
      await chooseMember(user, 'discipline-militia')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức kỷ luật/), 'khien_trach')
      await user.type(within(dialog).getByLabelText(/Hành vi vi phạm/), 'Vắng trực')
      fireEvent.change(within(dialog).getByLabelText(/Ngày vi phạm/), { target: { value: '2026-04-06' } })
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2026-04-05' } })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))
      expect(within(dialog).getByTestId('discipline-violation-date-error')).toHaveTextContent('Ngày vi phạm không được sau ngày ra quyết định.')

      fireEvent.change(within(dialog).getByLabelText(/Ngày vi phạm/), { target: { value: '' } })
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2999-01-01' } })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))
      expect(within(dialog).getByTestId('discipline-decision-date-error')).toHaveTextContent('Ngày quyết định không được sau ngày hôm nay.')
      expect(api.post).not.toHaveBeenCalled()
    })

    it('says which required fields are missing', async () => {
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      await user.click(await screen.findByTestId('create-discipline-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định kỷ luật' })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      expect(within(dialog).getByText('Vui lòng chọn DQTV')).toBeInTheDocument()
      expect(within(dialog).getByText('Vui lòng chọn hình thức kỷ luật')).toBeInTheDocument()
      expect(within(dialog).getByText('Vui lòng nhập hành vi vi phạm')).toBeInTheDocument()
      expect(within(dialog).getByText('Vui lòng chọn ngày quyết định')).toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it.each([
      [400, 'decision_date_in_future', 'Ngày quyết định không được sau ngày hôm nay.'],
      [400, 'violation_after_decision', 'Ngày vi phạm không được sau ngày ra quyết định.'],
      [404, 'militia_not_found', 'Không tìm thấy DQTV đã chọn, hoặc DQTV nằm ngoài phạm vi quản lý của bạn.'],
    ])('explains %i %s when creating a decision', async (status, code, message) => {
      api.post.mockRejectedValueOnce(httpError(status, code))
      const user = userEvent.setup()
      wrap()
      await openDisciplineTab(user)

      await user.click(await screen.findByTestId('create-discipline-btn'))
      const dialog = await screen.findByRole('dialog', { name: 'Tạo quyết định kỷ luật' })
      await chooseMember(user, 'discipline-militia')
      await user.selectOptions(within(dialog).getByLabelText(/Hình thức kỷ luật/), 'khien_trach')
      await user.type(within(dialog).getByLabelText(/Hành vi vi phạm/), 'Vắng trực')
      fireEvent.change(within(dialog).getByLabelText(/Ngày quyết định/), { target: { value: '2026-04-05' } })
      await user.click(within(dialog).getByRole('button', { name: 'Tạo quyết định' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    })

    describe('appeals', () => {
      it.each([
        ['an active decision with no appeal', { status: 'active', appealRounds: 0 }, true],
        ['an active decision after one upheld appeal', { status: 'active', appealRounds: 1 }, true],
        ['an active decision with both appeal rounds used', { status: 'active', appealRounds: 2 }, false],
        ['a decision under appeal', { status: 'appealed', appealRounds: 1 }, false],
        ['an overturned decision', { status: 'overturned', appealRounds: 1 }, false],
      ])('offers an appeal on %s: %s', async (_, patch, offered) => {
        server.discipline = [decision('d1', patch)]
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        const row = within(await screen.findByTestId('discipline-row-d1'))
        expect(row.queryByRole('button', { name: 'Kháng cáo' }) !== null).toBe(offered)
      })

      it('files an appeal with its reason and, when given, the filing date', async () => {
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d1')).getByRole('button', { name: 'Kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kháng cáo quyết định kỷ luật' })
        await user.type(within(dialog).getByLabelText(/Lý do kháng cáo/), 'Có giấy nghỉ ốm')
        fireEvent.change(within(dialog).getByLabelText(/Ngày nộp đơn/), { target: { value: '2026-04-06' } })
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))

        await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/discipline/d1/appeal', { reason: 'Có giấy nghỉ ốm', filedDate: '2026-04-06' }))
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã gửi đơn kháng cáo'))
      })

      it('leaves out a blank filing date and requires the reason', async () => {
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d1')).getByRole('button', { name: 'Kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kháng cáo quyết định kỷ luật' })
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))
        expect(within(dialog).getByText('Vui lòng nhập lý do kháng cáo')).toBeInTheDocument()
        expect(api.patch).not.toHaveBeenCalled()

        await user.type(within(dialog).getByLabelText(/Lý do kháng cáo/), 'Có giấy nghỉ ốm')
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))
        await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/discipline/d1/appeal', { reason: 'Có giấy nghỉ ốm' }))
      })

      it.each([
        [400, 'appeal_date_in_future', 'Ngày nộp đơn không được sau ngày hôm nay.'],
        [400, 'appeal_before_decision', 'Ngày nộp đơn không được trước ngày ra quyết định.'],
        [409, 'appeal_already_open', 'Quyết định này đang có đơn kháng cáo chờ giải quyết.'],
        [409, 'discipline_decision_overturned', 'Quyết định này đã bị hủy nên không thể kháng cáo.'],
        [409, 'appeal_rounds_exhausted', 'Đã hết số lần kháng cáo cho quyết định này.'],
      ])('explains %i %s when filing an appeal', async (status, code, message) => {
        api.patch.mockRejectedValueOnce(httpError(status, code))
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d1')).getByRole('button', { name: 'Kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kháng cáo quyết định kỷ luật' })
        await user.type(within(dialog).getByLabelText(/Lý do kháng cáo/), 'Có giấy nghỉ ốm')
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      })

      it('refuses a filing date after today or before the decision before sending', async () => {
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d1')).getByRole('button', { name: 'Kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kháng cáo quyết định kỷ luật' })
        expect(dialog).toHaveAccessibleDescription('Trần Văn B · Khiển trách · Ngày QĐ 02/04/2026')
        await user.type(within(dialog).getByLabelText(/Lý do kháng cáo/), 'Có giấy nghỉ ốm')

        fireEvent.change(within(dialog).getByLabelText(/Ngày nộp đơn/), { target: { value: '2999-01-01' } })
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))
        expect(within(dialog).getByTestId('appeal-filed-date-error')).toHaveTextContent('Ngày nộp đơn không được sau ngày hôm nay.')

        fireEvent.change(within(dialog).getByLabelText(/Ngày nộp đơn/), { target: { value: '2026-04-01' } })
        expect(within(dialog).queryByTestId('appeal-filed-date-error')).not.toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))
        expect(within(dialog).getByTestId('appeal-filed-date-error')).toHaveTextContent('Ngày nộp đơn không được trước ngày ra quyết định.')
        expect(api.patch).not.toHaveBeenCalled()
      })

      it('reloads the list when the decision changed meanwhile', async () => {
        api.patch.mockRejectedValueOnce(httpError(409, 'invalid_status_transition'))
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d1')).getByRole('button', { name: 'Kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kháng cáo quyết định kỷ luật' })
        await user.type(within(dialog).getByLabelText(/Lý do kháng cáo/), 'Có giấy nghỉ ốm')
        const listLoads = api.get.mock.calls.filter(([url]) => url === '/discipline').length
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Trạng thái của quyết định đã thay đổi. Danh sách đã được cập nhật.')
        await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/discipline').length).toBeGreaterThan(listLoads))
      })

      it('keeps the list as it is after a filing error that is not a conflict', async () => {
        api.patch.mockRejectedValueOnce(httpError(500, 'Internal server error'))
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d1')).getByRole('button', { name: 'Kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Kháng cáo quyết định kỷ luật' })
        await user.type(within(dialog).getByLabelText(/Lý do kháng cáo/), 'Có giấy nghỉ ốm')
        const listLoads = api.get.mock.calls.filter(([url]) => url === '/discipline').length
        await user.click(within(dialog).getByRole('button', { name: 'Gửi kháng cáo' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không thể gửi đơn kháng cáo')
        expect(api.get.mock.calls.filter(([url]) => url === '/discipline').length).toBe(listLoads)
      })

      it('lets a DQTV member appeal a decision issued against them', async () => {
        signInAs('dqtv_member')
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        expect(within(await screen.findByTestId('discipline-row-d1')).getByRole('button', { name: 'Kháng cáo' })).toBeInTheDocument()
      })

      it('lets staff decide an open appeal with outcome and resolution', async () => {
        server.discipline = [decision('d3', { status: 'appealed', appealRounds: 1, appealedAt: '2026-04-06T02:00:00.000Z' })]
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d3')).getByRole('button', { name: 'Giải quyết kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Giải quyết kháng cáo' })
        await user.click(within(dialog).getByRole('radio', { name: 'Hủy quyết định' }))
        await user.type(within(dialog).getByLabelText(/Nội dung giải quyết/), 'Có căn cứ vắng mặt hợp lệ')
        fireEvent.change(within(dialog).getByLabelText(/Ngày giải quyết/), { target: { value: '2026-04-10' } })
        await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận kết quả' }))

        await waitFor(() =>
          expect(api.patch).toHaveBeenCalledWith('/discipline/d3/appeal/decision', {
            outcome: 'overturned',
            resolution: 'Có căn cứ vắng mặt hợp lệ',
            decidedDate: '2026-04-10',
          }),
        )
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã ghi nhận kết quả giải quyết kháng cáo'))
      })

      it('shows the grounds of the appeal being decided', async () => {
        server.discipline = [decision('d3', { status: 'appealed', appealRounds: 2 })]
        server.appeals = [
          appeal({ id: 'a0', round: 1, reason: 'Lần đầu', outcome: 'upheld', resolution: 'Giữ nguyên', decidedDate: '2026-04-08' }),
          appeal({ id: 'a1', round: 2, filedDate: '2026-04-09' }),
        ]
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d3')).getByRole('button', { name: 'Giải quyết kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Giải quyết kháng cáo' })
        const summary = within(within(dialog).getByTestId('open-appeal'))
        expect(await summary.findByText('Đơn kháng cáo lần 2, nộp ngày 09/04/2026')).toBeInTheDocument()
        expect(summary.getByText('Hôm đó có giấy nghỉ ốm của trạm y tế')).toBeInTheDocument()
        expect(summary.getByText('Người nộp: Trần Văn B')).toBeInTheDocument()
        expect(summary.queryByText('Lần đầu')).not.toBeInTheDocument()
        expect(api.get).toHaveBeenCalledWith('/discipline/d3')
      })

      it('refuses a decision date after today or before the filing date before sending', async () => {
        server.discipline = [decision('d3', { status: 'appealed', appealRounds: 1 })]
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d3')).getByRole('button', { name: 'Giải quyết kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Giải quyết kháng cáo' })
        await within(dialog).findByText('Đơn kháng cáo lần 1, nộp ngày 06/04/2026')
        await user.type(within(dialog).getByLabelText(/Nội dung giải quyết/), 'Vi phạm có thật')

        fireEvent.change(within(dialog).getByLabelText(/Ngày giải quyết/), { target: { value: '2999-01-01' } })
        await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận kết quả' }))
        expect(within(dialog).getByTestId('appeal-decided-date-error')).toHaveTextContent('Ngày giải quyết không được sau ngày hôm nay.')

        fireEvent.change(within(dialog).getByLabelText(/Ngày giải quyết/), { target: { value: '2026-04-05' } })
        expect(within(dialog).queryByTestId('appeal-decided-date-error')).not.toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận kết quả' }))
        expect(within(dialog).getByTestId('appeal-decided-date-error')).toHaveTextContent('Ngày giải quyết không được trước ngày nộp đơn kháng cáo.')
        expect(api.patch).not.toHaveBeenCalled()
      })

      it('still records the outcome when the appeal cannot be loaded, and reloads the list on a conflict', async () => {
        server.discipline = [decision('d3', { status: 'appealed', appealRounds: 1 })]
        const listed = api.get.getMockImplementation()
        api.get.mockImplementation((url: string) =>
          url === '/discipline/d3' ? Promise.reject(httpError(500, 'Internal server error')) : listed!(url),
        )
        api.patch.mockRejectedValueOnce(httpError(409, 'no_open_appeal'))
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d3')).getByRole('button', { name: 'Giải quyết kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Giải quyết kháng cáo' })
        expect(await within(dialog).findByText('Không thể tải nội dung đơn kháng cáo.')).toBeInTheDocument()
        await user.type(within(dialog).getByLabelText(/Nội dung giải quyết/), 'Vi phạm có thật')
        fireEvent.change(within(dialog).getByLabelText(/Ngày giải quyết/), { target: { value: '2026-04-01' } })
        const listLoads = api.get.mock.calls.filter(([url]) => url === '/discipline').length
        await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận kết quả' }))

        await waitFor(() =>
          expect(api.patch).toHaveBeenCalledWith('/discipline/d3/appeal/decision', {
            outcome: 'upheld',
            resolution: 'Vi phạm có thật',
            decidedDate: '2026-04-01',
          }),
        )
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Quyết định này không có đơn kháng cáo đang chờ giải quyết.')
        await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/discipline').length).toBeGreaterThan(listLoads))
      })

      it('keeps the decision by default and requires a resolution', async () => {
        server.discipline = [decision('d3', { status: 'appealed', appealRounds: 1 })]
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d3')).getByRole('button', { name: 'Giải quyết kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Giải quyết kháng cáo' })
        expect(within(dialog).getByRole('radio', { name: 'Giữ nguyên quyết định' })).toBeChecked()
        await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận kết quả' }))
        expect(within(dialog).getByText('Vui lòng nhập nội dung giải quyết')).toBeInTheDocument()

        await user.type(within(dialog).getByLabelText(/Nội dung giải quyết/), 'Vi phạm có thật')
        await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận kết quả' }))
        await waitFor(() =>
          expect(api.patch).toHaveBeenCalledWith('/discipline/d3/appeal/decision', { outcome: 'upheld', resolution: 'Vi phạm có thật' }),
        )
      })

      it.each([
        [400, 'decided_date_in_future', 'Ngày giải quyết không được sau ngày hôm nay.'],
        [400, 'decided_before_filed', 'Ngày giải quyết không được trước ngày nộp đơn kháng cáo.'],
        [409, 'no_open_appeal', 'Quyết định này không có đơn kháng cáo đang chờ giải quyết.'],
      ])('explains %i %s when deciding an appeal', async (status, code, message) => {
        server.discipline = [decision('d3', { status: 'appealed', appealRounds: 1 })]
        api.patch.mockRejectedValueOnce(httpError(status, code))
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        await user.click(within(await screen.findByTestId('discipline-row-d3')).getByRole('button', { name: 'Giải quyết kháng cáo' }))
        const dialog = await screen.findByRole('dialog', { name: 'Giải quyết kháng cáo' })
        await user.type(within(dialog).getByLabelText(/Nội dung giải quyết/), 'Vi phạm có thật')
        await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận kết quả' }))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      })

      it('does not let DQTV members decide appeals', async () => {
        signInAs('dqtv')
        server.discipline = [decision('d3', { status: 'appealed', appealRounds: 1 })]
        const user = userEvent.setup()
        wrap()
        await openDisciplineTab(user)

        const row = within(await screen.findByTestId('discipline-row-d3'))
        expect(row.queryByRole('button', { name: 'Giải quyết kháng cáo' })).not.toBeInTheDocument()
      })
    })
  })
})

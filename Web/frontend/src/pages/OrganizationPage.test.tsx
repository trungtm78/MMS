import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { OrganizationPage } from './OrganizationPage'

// Only the HTTP layer and the signed-in user are replaced: useRbac and the toasts run for real
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const session = vi.hoisted(() => ({ user: {} as Record<string, unknown> }))

vi.mock('@/api/client', () => ({ default: api }))
// Real useRbac: the page follows the organization.controller.ts @Roles
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isAuthenticated: true }),
}))

// organization-unit.entity.ts as GET /organization/structure answers it: organization.service.ts
// getStructure() is repo.find({ relations: ['children'] }), so a unit carries no member count and
// no commander name, and its children one level deep with no children of their own
function unitRow(fields: Record<string, unknown>) {
  return {
    id: 'u0',
    type: 'tieu_doi',
    name: 'Tiểu đội',
    commanderId: null,
    parentId: null,
    capacity: 10,
    wardId: null,
    createdAt: '2026-01-05T02:00:00.000Z',
    updatedAt: '2026-01-05T02:00:00.000Z',
    ...fields,
  }
}

const structure = [
  unitRow({
    id: 'u1',
    type: 'dai_doi',
    name: 'Đại đội 1',
    capacity: 100,
    children: [unitRow({ id: 'u2', type: 'trung_doi', name: 'Trung đội 1', parentId: 'u1', capacity: 30 })],
  }),
]

// The same structure with the member count and commander a backend COUNT and join would add
function countedStructure(unitCount: number | string, childCount: number | string) {
  return [
    unitRow({
      id: 'u1',
      type: 'dai_doi',
      name: 'Đại đội 1',
      capacity: 100,
      memberCount: unitCount,
      commanderName: 'Lê Văn Hùng',
      children: [unitRow({ id: 'u2', type: 'trung_doi', name: 'Trung đội 1', parentId: 'u1', capacity: 30, memberCount: childCount })],
    }),
  ]
}

// Error body produced by the backend HttpExceptionFilter
const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

function signInAs(role: string) {
  session.user = { id: 'me', role, roles: [role], unitScope: null }
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/organization']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/organization" element={<OrganizationPage />} />
          <Route path="/forbidden" element={<p>Trang cấm truy cập</p>} />
        </Routes>
        <Toaster theme="light" />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function openAddUnitModal() {
  signInAs('system_admin')
  const user = userEvent.setup()
  wrap()
  await user.click(await screen.findByTestId('add-unit-btn'))
  return user
}

const submitUnitButton = () =>
  within(screen.getByLabelText('Loại đơn vị').closest('form') as HTMLElement).getByRole('button', { name: 'Thêm đơn vị' })

describe('OrganizationPage', () => {
  beforeEach(() => {
    // mockReset also drops answers queued with mock*Once by an earlier test
    api.get.mockReset()
    api.post.mockReset()
    signInAs('office_staff')
    api.get.mockResolvedValue({ data: structure })
    api.post.mockResolvedValue({ data: unitRow({ id: 'u9', type: 'trung_doi', name: 'Trung đội 2', capacity: 30 }) })
  })

  it('explains a structure that could not be loaded instead of showing it as empty', async () => {
    api.get.mockRejectedValue(httpError(500, 'internal_error'))
    const user = userEvent.setup()
    wrap()

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải cơ cấu tổ chức.')
    expect(screen.queryByText('Chưa có đơn vị nào')).not.toBeInTheDocument()

    api.get.mockResolvedValue({ data: structure })
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByTestId('unit-card-u1')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders heading', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('organization-page')).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Tổ chức biên chế' })).toBeInTheDocument()
    expect(screen.getByText(/Cơ cấu tổ chức/)).toBeInTheDocument()
  })

  it('renders unit cards after load', async () => {
    wrap()
    await waitFor(() => expect(screen.getByTestId('unit-card-u1')).toBeInTheDocument())
    expect(screen.getByText('Đại đội 1')).toBeInTheDocument()
  })

  it('shows each unit with its type and staffing', async () => {
    wrap()
    const card = within(await screen.findByTestId('unit-card-u1'))

    expect(card.getByText('Đại đội')).toBeInTheDocument()
    expect(card.getByText('Biên chế')).toBeInTheDocument()
    expect(within(screen.getByTestId('unit-card-u2')).getByText('Trung đội')).toBeInTheDocument()
  })

  describe('staffing (the structure has no member count today)', () => {
    it('shows the capacity alone, never a ratio it cannot compute', async () => {
      wrap()
      const card = await screen.findByTestId('unit-card-u1')

      expect(within(card).getByText('100')).toBeInTheDocument()
      expect(within(card).getByText('Chưa có số liệu quân số')).toBeInTheDocument()
      expect(card).not.toHaveTextContent(/NaN|undefined|\d+\/\d+/)
      expect(within(screen.getByTestId('unit-card-u2')).getByText('30')).toBeInTheDocument()
    })

    it('shows no member total it cannot know', async () => {
      wrap()
      await screen.findByTestId('unit-card-u1')

      expect(screen.getByText('Tổng biên chế')).toBeInTheDocument()
      expect(screen.getByTestId('summary-capacity')).toHaveTextContent('100')
      expect(screen.getByText('Thực tế')).toBeInTheDocument()
      expect(screen.getByTestId('summary-members')).toHaveTextContent('—')
      expect(screen.getByText('Số đơn vị')).toBeInTheDocument()
      expect(screen.getByTestId('summary-units')).toHaveTextContent('1')
      expect(screen.getByTestId('organization-page')).not.toHaveTextContent(/NaN|undefined/)
    })

    it.each([
      { kind: 'a number', unitCount: 85, childCount: 28 },
      // COUNT(*) is BIGINT, which node-postgres sends as text
      { kind: 'BIGINT text', unitCount: '85', childCount: '28' },
    ])('shows the ratio and the total when the member count arrives as $kind', async ({ unitCount, childCount }) => {
      api.get.mockResolvedValue({ data: countedStructure(unitCount, childCount) })
      wrap()

      const card = within(await screen.findByTestId('unit-card-u1'))
      expect(card.getByText('85/100')).toBeInTheDocument()
      expect(card.queryByText('Chưa có số liệu quân số')).not.toBeInTheDocument()
      expect(within(screen.getByTestId('unit-card-u2')).getByText('28/30')).toBeInTheDocument()
      expect(screen.getByTestId('summary-members')).toHaveTextContent(/^85$/)
    })

    it('shows no total while any top-level unit lacks a count', async () => {
      api.get.mockResolvedValue({
        data: [...countedStructure(85, 28), unitRow({ id: 'u3', type: 'dai_doi', name: 'Đại đội 2', capacity: 50 })],
      })
      wrap()

      expect(within(await screen.findByTestId('unit-card-u1')).getByText('85/100')).toBeInTheDocument()
      expect(within(screen.getByTestId('unit-card-u3')).getByText('Chưa có số liệu quân số')).toBeInTheDocument()
      expect(screen.getByTestId('summary-capacity')).toHaveTextContent('150')
      expect(screen.getByTestId('summary-members')).toHaveTextContent('—')
    })

    it('names the commander only when the structure has one', async () => {
      wrap()
      await screen.findByTestId('unit-card-u1')
      expect(screen.queryByText(/CHT:/)).not.toBeInTheDocument()
    })

    it('names the commander a backend join would add', async () => {
      api.get.mockResolvedValue({ data: countedStructure(85, 28) })
      wrap()
      expect(within(await screen.findByTestId('unit-card-u1')).getByText('CHT: Lê Văn Hùng')).toBeInTheDocument()
    })
  })

  it('folds and unfolds the sub-units of a unit', async () => {
    const user = userEvent.setup()
    wrap()
    await screen.findByTestId('unit-card-u2')

    await user.click(screen.getByTestId('unit-card-u1'))
    expect(screen.queryByTestId('unit-card-u2')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('unit-card-u1'))
    expect(screen.getByTestId('unit-card-u2')).toBeInTheDocument()
  })

  it('renders every level the structure has, without assuming one', async () => {
    api.get.mockResolvedValue({
      data: [
        unitRow({
          id: 'u1',
          type: 'dai_doi',
          name: 'Đại đội 1',
          capacity: 100,
          children: [
            unitRow({
              id: 'u2',
              type: 'trung_doi',
              name: 'Trung đội 1',
              parentId: 'u1',
              capacity: 30,
              children: [unitRow({ id: 'u3', name: 'Tiểu đội 1', parentId: 'u2', capacity: 10 })],
            }),
          ],
        }),
      ],
    })
    const user = userEvent.setup()
    wrap()

    await screen.findByTestId('unit-card-u2')
    expect(screen.queryByTestId('unit-card-u3')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('unit-card-u2'))

    const deepest = within(await screen.findByTestId('unit-card-u3'))
    expect(deepest.getByText('Tiểu đội 1')).toBeInTheDocument()
    expect(deepest.getByText('10')).toBeInTheDocument()
  })

  it('says so when there is no unit yet', async () => {
    api.get.mockResolvedValue({ data: [] })
    wrap()
    expect(await screen.findByText('Chưa có đơn vị nào')).toBeInTheDocument()
  })

  // GET /organization/structure @Roles('system_admin', 'office_staff', 'police_ward', 'police_area')
  it.each(['system_admin', 'office_staff', 'police_ward', 'police_area'])('reads the structure as %s', async (role) => {
    signInAs(role)
    wrap()
    expect(await screen.findByTestId('unit-card-u1')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/organization/structure')
  })

  it.each(['ca_ward', 'ca_area', 'ca_officer', 'ubnd_leader', 'dqtv_member'])(
    'sends %s, who is outside GET /organization/structure @Roles, to the forbidden page',
    async (role) => {
      signInAs(role)
      wrap()
      expect(await screen.findByText('Trang cấm truy cập')).toBeInTheDocument()
      expect(api.get).not.toHaveBeenCalled()
    },
  )

  // POST /organization/units @Roles('system_admin')
  it('offers "Thêm đơn vị" to system_admin', async () => {
    signInAs('system_admin')
    wrap()
    expect(await screen.findByTestId('add-unit-btn')).toHaveTextContent('Thêm đơn vị')
  })

  it.each(['office_staff', 'police_ward', 'police_area'])('hides "Thêm đơn vị" from %s', async (role) => {
    signInAs(role)
    wrap()
    await screen.findByTestId('unit-card-u1')
    expect(screen.queryByTestId('add-unit-btn')).not.toBeInTheDocument()
  })

  describe('adding a unit', () => {
    it('shows the form with the unit types from the largest', async () => {
      await openAddUnitModal()

      expect(screen.getByRole('heading', { name: 'Thêm đơn vị mới' })).toBeInTheDocument()
      const type = screen.getByLabelText('Loại đơn vị')
      expect(within(type).getAllByRole('option').map((o) => o.textContent)).toEqual(['Đại đội', 'Trung đội', 'Tiểu đội'])
      expect(type).toHaveValue('tieu_doi')
      expect(screen.getByLabelText(/Tên đơn vị/)).toHaveAttribute('placeholder', 'VD: Trung đội 1')
      expect(screen.getByLabelText(/Biên chế \(người\)/)).toHaveAttribute('placeholder', 'VD: 30')
    })

    // CreateUnitDto names a commander by user id (commanderId), not by a typed name, and the global
    // ValidationPipe (forbidNonWhitelisted) refuses a body carrying commanderName
    it('offers no free-text commander the backend would refuse', async () => {
      await openAddUnitModal()
      expect(screen.queryByLabelText('Tên chỉ huy trưởng')).not.toBeInTheDocument()
    })

    it('asks for the unit name first', async () => {
      const user = await openAddUnitModal()

      await user.click(submitUnitButton())

      expect(await screen.findByText('Vui lòng nhập tên đơn vị')).toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it('asks for a positive staffing', async () => {
      const user = await openAddUnitModal()

      await user.type(screen.getByLabelText(/Tên đơn vị/), 'Trung đội 2')
      await user.click(submitUnitButton())

      expect(await screen.findByText('Vui lòng nhập biên chế hợp lệ')).toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })

    it('posts only the fields CreateUnitDto accepts, confirms and reads the structure again', async () => {
      const user = await openAddUnitModal()

      await user.selectOptions(screen.getByLabelText('Loại đơn vị'), 'trung_doi')
      await user.type(screen.getByLabelText(/Tên đơn vị/), 'Trung đội 2')
      await user.type(screen.getByLabelText(/Biên chế \(người\)/), '30')
      await user.click(submitUnitButton())

      expect(await screen.findByText('Đã thêm đơn vị mới')).toBeInTheDocument()
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post.mock.calls[0][0]).toBe('/organization/units')
      expect(api.post.mock.calls[0][1]).toStrictEqual({
        type: 'trung_doi',
        name: 'Trung đội 2',
        capacity: 30,
      })
      expect(screen.queryByRole('heading', { name: 'Thêm đơn vị mới' })).not.toBeInTheDocument()
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    })

    it('shows the saving state while the request runs', async () => {
      api.post.mockReturnValue(new Promise(() => {}))
      const user = await openAddUnitModal()

      await user.type(screen.getByLabelText(/Tên đơn vị/), 'Trung đội 2')
      await user.type(screen.getByLabelText(/Biên chế \(người\)/), '30')
      await user.click(submitUnitButton())

      expect(await screen.findByRole('button', { name: 'Đang lưu...' })).toBeDisabled()
    })

    it.each([
      [403, 'Forbidden resource', 'Bạn không có quyền thực hiện thao tác này'],
      [500, 'internal_error', 'Không thể thêm đơn vị'],
    ])('explains a refused request (HTTP %i %s)', async (status, code, message) => {
      api.post.mockRejectedValue(httpError(status, code))
      const user = await openAddUnitModal()

      await user.type(screen.getByLabelText(/Tên đơn vị/), 'Trung đội 2')
      await user.type(screen.getByLabelText(/Biên chế \(người\)/), '30')
      await user.click(submitUnitButton())

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Thêm đơn vị mới' })).toBeInTheDocument()
    })

    it.each(['Hủy', 'Đóng'])('closes the form with "%s"', async (name) => {
      const user = await openAddUnitModal()

      await user.click(screen.getByRole('button', { name }))

      expect(screen.queryByRole('heading', { name: 'Thêm đơn vị mới' })).not.toBeInTheDocument()
      expect(api.post).not.toHaveBeenCalled()
    })
  })
})

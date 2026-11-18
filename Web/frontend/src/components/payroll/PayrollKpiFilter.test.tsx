import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { t } from '@/test/i18n'
import { PayrollKpiFilter } from './PayrollKpiFilter'

// Only the HTTP layer is replaced
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api }))

// GET /units/search rows (Web/backend/src/users/users.service.ts UnitSearchItem)
const units = [{ id: 'unit-kp2', code: 'KP2', name: 'Khu phố 2', type: 'neighborhood', parentCode: 'PD' }]

// GET /militia/search rows (Web/backend/src/militia/militia.service.ts MilitiaSearchItem)
const militia = [
  {
    id: 'mil-1',
    userId: 'user-1',
    militiaCode: 'DQTV001',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    rank: null,
    status: 'active',
    unitCode: 'KP2',
    unitName: 'Khu phố 2',
  },
]

function renderFilter() {
  const onFilter = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PayrollKpiFilter onFilter={onFilter} />
    </QueryClientProvider>,
  )
  return onFilter
}

type User = ReturnType<typeof userEvent.setup>

async function chooseUnit(user: User) {
  const input = screen.getByTestId('smart-select-unit-input')
  await user.click(input)
  await user.type(input, 'Khu')
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/units/search', { params: { q: 'Khu', limit: 20 } }))
  await user.click(await screen.findByRole('option', { name: /Khu phố 2/ }))
}

describe('PayrollKpiFilter', () => {
  beforeEach(() => {
    api.get.mockReset()
    // 10:00 on 15 April 2026 in Vietnam
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-04-15T03:00:00.000Z'))
    api.get.mockImplementation((url: string) => {
      if (url === '/units/search') return Promise.resolve({ data: units })
      if (url === '/militia/search') return Promise.resolve({ data: militia })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads its texts from the payroll locale', () => {
    expect([
      t('payroll.kpiFilter.header.title'),
      t('payroll.kpiFilter.fields.month'),
      t('payroll.kpiFilter.fields.monthOption', { month: 7 }),
      t('payroll.kpiFilter.fields.unit'),
      t('payroll.kpiFilter.fields.unitPlaceholder'),
      t('payroll.kpiFilter.fields.militia'),
      t('payroll.kpiFilter.fields.militiaPlaceholder'),
      t('payroll.kpiFilter.fields.militiaPlaceholderNoUnit'),
      t('payroll.kpiFilter.actions.reset'),
      t('payroll.kpiFilter.actions.apply'),
    ]).toEqual([
      'Lọc KPI / Lương',
      'Tháng',
      'Tháng 7',
      'Đơn vị / Khu phố',
      'Tất cả đơn vị...',
      'Cán bộ dân quân',
      'Lọc theo dân quân...',
      'Chọn đơn vị trước...',
      'Xoá lọc',
      'Áp dụng',
    ])
  })

  it('labels the filter, its fields and its actions', () => {
    renderFilter()

    expect(screen.getByRole('heading', { name: 'Lọc KPI / Lương' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tháng')).toHaveValue('4')
    expect(screen.getByLabelText('Năm')).toHaveValue('2026')
    expect(within(screen.getByLabelText('Tháng')).getAllByRole('option').map((option) => option.textContent)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`),
    )
    expect(screen.getByText('Đơn vị / Khu phố')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Tất cả đơn vị...')).toBeInTheDocument()
    expect(screen.getByText('Cán bộ dân quân')).toBeInTheDocument()
    // No unit chosen yet
    expect(screen.getByPlaceholderText('Chọn đơn vị trước...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xoá lọc' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeInTheDocument()
  })

  it('applies the chosen period, unit and militia member of that unit', async () => {
    const user = userEvent.setup()
    const onFilter = renderFilter()

    await user.selectOptions(screen.getByLabelText('Tháng'), '3')
    await user.selectOptions(screen.getByLabelText('Năm'), '2025')
    await chooseUnit(user)

    const militiaInput = screen.getByPlaceholderText('Lọc theo dân quân...')
    await user.click(militiaInput)
    await user.type(militiaInput, 'Nguyễn')
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/militia/search', { params: { q: 'Nguyễn', unitCode: 'KP2', limit: 20 } }),
    )
    await user.click(await screen.findByRole('option', { name: /DQTV001 — Nguyễn Văn A/ }))
    await user.click(screen.getByRole('button', { name: 'Áp dụng' }))

    expect(onFilter).toHaveBeenCalledWith({ unitId: 'unit-kp2', unitCode: 'KP2', militiaId: 'mil-1', month: 3, year: 2025 })
  })

  it('clears every filter with Xoá lọc', async () => {
    const user = userEvent.setup()
    const onFilter = renderFilter()

    await user.selectOptions(screen.getByLabelText('Tháng'), '3')
    await chooseUnit(user)
    await user.click(screen.getByRole('button', { name: 'Xoá lọc' }))

    expect(onFilter).toHaveBeenCalledWith({})
    expect(screen.getByLabelText('Tháng')).toHaveValue('4')
    expect(screen.getByPlaceholderText('Tất cả đơn vị...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Chọn đơn vị trước...')).toBeInTheDocument()
  })
})

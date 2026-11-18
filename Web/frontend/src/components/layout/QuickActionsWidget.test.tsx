import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/test/i18n'
import { QuickActionsWidget } from './QuickActionsWidget'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Replaces texts of the locale files for one test, to prove the widget reads them from there
const restoreTexts: (() => void)[] = []
function overrideText(key: string, value: string) {
  const previous: unknown = i18n.getResource('vi', 'translation', key)
  i18n.addResource('vi', 'translation', key, value)
  restoreTexts.push(() => {
    if (typeof previous === 'string') i18n.addResource('vi', 'translation', key, previous)
  })
}

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

// Every quick action: test id, label, description, destination
const ACTIONS = [
  ['new-task', 'Giao việc mới', 'Tạo và giao nhiệm vụ mới', '/tasks/new'],
  ['militia-list', 'Danh sách DQTV', 'Quản lý nhân sự', '/militia'],
  ['task-list', 'Danh sách công việc', 'Xem và quản lý nhiệm vụ', '/tasks/list'],
  ['reports', 'Báo cáo & Thống kê', 'Xuất báo cáo thống kê', '/reports/attendance'],
  ['timesheet', 'Chấm công', 'Quản lý chấm công', '/timesheet'],
  ['approvals', 'Duyệt đơn từ', 'Phê duyệt đơn từ', '/approvals'],
  ['kpi', 'Dashboard Chỉ tiêu', 'Theo dõi Chỉ tiêu KPI', '/kpi/dashboard'],
  ['payroll', 'Bảng lương', 'Lương và KPI', '/payroll'],
] as const

describe('QuickActionsWidget', () => {
  afterEach(() => {
    mockNavigate.mockClear()
    for (const restore of restoreTexts.splice(0).reverse()) restore()
  })

  it('renders FAB button', () => {
    wrap(<QuickActionsWidget />)
    expect(screen.getByTestId('quick-actions-fab')).toBeInTheDocument()
  })

  it('opens panel on FAB click', () => {
    wrap(<QuickActionsWidget />)
    fireEvent.click(screen.getByTestId('quick-actions-fab'))
    expect(screen.getByText('Thao tác nhanh')).toBeInTheDocument()
  })

  it('closes panel on close button', () => {
    wrap(<QuickActionsWidget />)
    fireEvent.click(screen.getByTestId('quick-actions-fab'))
    fireEvent.click(screen.getByTestId('quick-actions-close'))
    expect(screen.queryByTestId('quick-actions-close')).not.toBeInTheDocument()
  })

  it('navigates on action click', () => {
    wrap(<QuickActionsWidget />)
    fireEvent.click(screen.getByTestId('quick-actions-fab'))
    fireEvent.click(screen.getByTestId('quick-action-militia-list'))
    expect(mockNavigate).toHaveBeenCalledWith('/militia')
  })

  it('titles the toggle button and the panel, with a hint and a named close button', () => {
    wrap(<QuickActionsWidget />)
    expect(screen.getByTestId('quick-actions-fab')).toHaveAttribute('title', 'Thao tác nhanh')

    fireEvent.click(screen.getByTestId('quick-actions-fab'))

    expect(screen.getByRole('heading', { name: 'Thao tác nhanh' })).toBeInTheDocument()
    expect(screen.getByText('Truy cập nhanh các chức năng')).toBeInTheDocument()
    expect(screen.getByText('Bấm vào để điều hướng nhanh')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đóng' })).toBe(screen.getByTestId('quick-actions-close'))
  })

  it.each(ACTIONS)('offers the %s action with its label and description, and goes there', (id, label, description, path) => {
    wrap(<QuickActionsWidget />)
    fireEvent.click(screen.getByTestId('quick-actions-fab'))
    const action = screen.getByTestId(`quick-action-${id}`)

    expect(within(action).getByText(label)).toBeInTheDocument()
    expect(within(action).getByText(description)).toBeInTheDocument()

    fireEvent.click(action)

    expect(mockNavigate).toHaveBeenCalledWith(path)
    expect(screen.queryByTestId(`quick-action-${id}`)).not.toBeInTheDocument()
  })

  it('reads its texts from the locale file', () => {
    overrideText('layout.quickActions.fab.title', 'FAB')
    overrideText('layout.quickActions.panel.title', 'PANEL')
    overrideText('layout.quickActions.panel.subtitle', 'SUBTITLE')
    overrideText('layout.quickActions.panel.hint', 'HINT')
    overrideText('layout.quickActions.actions.newTask.label', 'NEW_TASK')
    overrideText('layout.quickActions.actions.newTask.description', 'NEW_TASK_DESCRIPTION')
    overrideText('layout.quickActions.actions.payroll.label', 'PAYROLL')
    overrideText('layout.quickActions.actions.payroll.description', 'PAYROLL_DESCRIPTION')
    overrideText('common.actions.close', 'CLOSE')
    wrap(<QuickActionsWidget />)
    expect(screen.getByTestId('quick-actions-fab')).toHaveAttribute('title', 'FAB')

    fireEvent.click(screen.getByTestId('quick-actions-fab'))

    expect(screen.getByRole('heading', { name: 'PANEL' })).toBeInTheDocument()
    expect(screen.getByText('SUBTITLE')).toBeInTheDocument()
    expect(screen.getByText('HINT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CLOSE' })).toBeInTheDocument()
    expect(screen.getByTestId('quick-action-new-task')).toHaveTextContent('NEW_TASKNEW_TASK_DESCRIPTION')
    expect(screen.getByTestId('quick-action-payroll')).toHaveTextContent('PAYROLLPAYROLL_DESCRIPTION')
  })
})

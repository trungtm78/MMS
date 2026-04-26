import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AssignmentManagePage } from './AssignmentManagePage'
import * as api from '@/api/assignments'

vi.mock('@/api/assignments', () => ({
  getCaOfficers: vi.fn(),
  getAssignments: vi.fn(),
  createAssignment: vi.fn(),
  removeAssignment: vi.fn(),
  getAvailableDqtv: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockCaOfficers = [
  { id: 'ca-1', fullName: 'Nguyễn Văn Hùng', role: 'ca_officer', unitScope: 'WARD_01' },
  { id: 'ca-2', fullName: 'Trần Thị Lan', role: 'ca_officer', unitScope: 'WARD_01' },
]

const mockAssignments = [
  {
    id: 'assign-1',
    caUserId: 'ca-1',
    dqtvUserId: 'dqtv-1',
    dqtvFullName: 'Nguyễn Văn A',
    dqtvUnitCode: 'WARD_01',
    assignedBy: 'admin',
    assignedAt: '2026-04-14T00:00:00Z',
  },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('AssignmentManagePage', () => {
  beforeEach(() => {
    vi.mocked(api.getCaOfficers).mockResolvedValue(mockCaOfficers)
    vi.mocked(api.getAssignments).mockResolvedValue(mockAssignments)
    vi.mocked(api.getAvailableDqtv).mockResolvedValue([])
    vi.mocked(api.createAssignment).mockResolvedValue(mockAssignments[0])
    vi.mocked(api.removeAssignment).mockResolvedValue(undefined)
  })

  it('renders page heading', async () => {
    wrap(<AssignmentManagePage />)
    expect(screen.getByTestId('assignment-manage-page')).toBeInTheDocument()
    expect(screen.getByText('Phân Công')).toBeInTheDocument()
  })

  it('renders CA officer list after load', async () => {
    wrap(<AssignmentManagePage />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Hùng')).toBeInTheDocument()
      expect(screen.getByText('Trần Thị Lan')).toBeInTheDocument()
    })
  })

  it('shows instruction text when no CA is selected', async () => {
    wrap(<AssignmentManagePage />)
    await waitFor(() => {
      expect(screen.getByText(/Chọn một cán bộ CA/)).toBeInTheDocument()
    })
  })

  it('selecting a CA loads their assignments', async () => {
    wrap(<AssignmentManagePage />)
    await waitFor(() => screen.getByTestId('ca-row-ca-1'))
    fireEvent.click(screen.getByTestId('ca-row-ca-1'))
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    })
  })

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

  it('confirming delete calls removeAssignment', async () => {
    wrap(<AssignmentManagePage />)
    await waitFor(() => screen.getByTestId('ca-row-ca-1'))
    fireEvent.click(screen.getByTestId('ca-row-ca-1'))
    // Wait for assignment table to fully render
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    fireEvent.click(screen.getByTestId('delete-btn-assign-1'))
    await waitFor(() => screen.getByTestId('confirm-delete-assign-1'))
    fireEvent.click(screen.getByTestId('confirm-delete-assign-1'))
    await waitFor(() => {
      expect(api.removeAssignment).toHaveBeenCalledWith('assign-1', expect.anything())
    })
  })

  it('shows error message when assignments API fails', async () => {
    vi.mocked(api.getAssignments).mockRejectedValue(new Error('fail'))
    wrap(<AssignmentManagePage />)
    await waitFor(() => screen.getByTestId('ca-row-ca-1'))
    fireEvent.click(screen.getByTestId('ca-row-ca-1'))
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải/)).toBeInTheDocument()
    })
  })
})

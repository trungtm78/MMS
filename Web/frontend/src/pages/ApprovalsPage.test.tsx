import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApprovalsPage } from './ApprovalsPage'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/client', () => ({ default: api }))
vi.mock('sonner', () => ({ toast }))

// GET /approvals rows (Web/backend/src/leave/leave.service.ts listApprovals)
const mockApprovals = [
  {
    id: 'apr-1', type: 'leave', submittedBy: 'Nguyễn Văn A',
    title: 'Xin nghỉ phép 3 ngày', description: 'Việc gia đình',
    submittedAt: '2026-04-15T09:00:00Z', status: 'pending',
  },
  {
    id: 'apr-2', type: 'task', submittedBy: 'Trần Văn B',
    title: 'Hoàn thành nhiệm vụ NV-001', description: '',
    submittedAt: '2026-04-14T14:00:00Z', status: 'approved',
  },
]

const httpError = (status: number, message: string) => ({
  isAxiosError: true,
  request: {},
  response: { status, data: { code: 'E00x', message, statusCode: status } },
})

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: mockApprovals })
    api.put.mockResolvedValue({ data: {} })
  })

  it('renders heading', () => {
    wrap(<ApprovalsPage />)
    expect(screen.getByText('Phê Duyệt')).toBeInTheDocument()
  })

  it('renders approval tabs', () => {
    wrap(<ApprovalsPage />)
    expect(screen.getByTestId('tab-pending')).toBeInTheDocument()
    expect(screen.getByTestId('tab-approved')).toBeInTheDocument()
    expect(screen.getByTestId('tab-rejected')).toBeInTheDocument()
  })

  it('renders approval items after load', async () => {
    wrap(<ApprovalsPage />)
    await waitFor(() => {
      expect(screen.getByText('Xin nghỉ phép 3 ngày')).toBeInTheDocument()
    })
  })

  it('shows approve/reject buttons for pending items', async () => {
    wrap(<ApprovalsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('approve-apr-1')).toBeInTheDocument()
      expect(screen.getByTestId('reject-apr-1')).toBeInTheDocument()
    })
  })

  // Banner removed — no longer rendered
  it('does NOT render coming-soon banner', () => {
    wrap(<ApprovalsPage />)
    expect(screen.queryByTestId('coming-soon-banner')).not.toBeInTheDocument()
  })

  // Error state
  it('shows error banner when API fails', async () => {
    api.get.mockRejectedValue(new Error('Network error'))
    wrap(<ApprovalsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument()
      expect(screen.getByText(/Không thể tải danh sách phê duyệt/)).toBeInTheDocument()
    })
  })

  it('error banner has retry button', async () => {
    api.get.mockRejectedValue(new Error('Network error'))
    wrap(<ApprovalsPage />)
    await waitFor(() => {
      expect(screen.getByTestId('retry-btn')).toBeInTheDocument()
    })
  })

  it('explains a role that may not review leave', async () => {
    api.get.mockRejectedValue(httpError(403, 'insufficient_role_to_view_approvals'))
    wrap(<ApprovalsPage />)
    expect(await screen.findByTestId('error-banner')).toHaveTextContent('Bạn không có quyền xem danh sách phê duyệt.')
  })

  // Approve mutation
  it('approve button calls PUT /approvals/:id/approve', async () => {
    wrap(<ApprovalsPage />)
    await waitFor(() => expect(screen.getByTestId('approve-apr-1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('approve-apr-1'))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/approvals/apr-1/approve')
    })
  })

  it('reject button calls PUT /approvals/:id/reject', async () => {
    wrap(<ApprovalsPage />)
    fireEvent.click(await screen.findByTestId('reject-apr-1'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/approvals/apr-1/reject'))
  })

  // Web/backend/src/leave/leave.service.ts reviewLeaveRequest
  it.each([
    [409, 'leave_request_not_pending', 'Đơn này đã được xử lý trước đó. Danh sách đã được cập nhật.'],
    [409, 'insufficient_leave_balance', 'Người đề nghị không còn đủ số ngày phép để duyệt đơn này.'],
    [403, 'cannot_review_own_request', 'Bạn không thể tự duyệt đơn nghỉ phép của chính mình.'],
    [404, 'leave_request_not_found', 'Không tìm thấy đơn nghỉ phép, hoặc đơn không thuộc phạm vi của bạn.'],
  ])('explains HTTP %i %s', async (status, code, message) => {
    api.put.mockRejectedValueOnce(httpError(status, code))
    wrap(<ApprovalsPage />)

    fireEvent.click(await screen.findByTestId('approve-apr-1'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
  })

  it('refetches the list when the request was already decided', async () => {
    api.put.mockRejectedValueOnce(httpError(409, 'leave_request_not_pending'))
    wrap(<ApprovalsPage />)
    await screen.findByTestId('approve-apr-1')
    const before = api.get.mock.calls.length

    fireEvent.click(screen.getByTestId('approve-apr-1'))

    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(before))
  })

  it('counts the pending requests and names their status and type', async () => {
    wrap(<ApprovalsPage />)

    expect(await screen.findByTestId('pending-count')).toHaveTextContent('1 đơn chờ duyệt')
    const leaveItem = within(screen.getByTestId('approval-apr-1'))
    expect(leaveItem.getByText('Chờ duyệt')).toBeInTheDocument()
    expect(leaveItem.getByText('Nghỉ phép')).toBeInTheDocument()
    expect(leaveItem.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument()
    const taskItem = within(screen.getByTestId('approval-apr-2'))
    expect(taskItem.getByText('Đã duyệt')).toBeInTheDocument()
    expect(taskItem.getByText('Nhiệm vụ')).toBeInTheDocument()
  })

  it('labels the tabs and asks for every status on "Tất cả"', async () => {
    wrap(<ApprovalsPage />)

    expect(screen.getByTestId('tab-all')).toHaveTextContent('Tất cả')
    expect(screen.getByTestId('tab-rejected')).toHaveTextContent('Từ chối')
    fireEvent.click(screen.getByTestId('tab-all'))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/approvals', { params: {} }))
  })

  it('shows a loading text, then says when there is nothing to review', async () => {
    api.get.mockResolvedValue({ data: [] })
    wrap(<ApprovalsPage />)

    expect(screen.getByText('Đang tải...')).toBeInTheDocument()
    expect(await screen.findByText('Không có yêu cầu nào')).toBeInTheDocument()
    expect(screen.queryByTestId('pending-count')).not.toBeInTheDocument()
  })

  it.each([
    ['approve-apr-1', 'Đã phê duyệt'],
    ['reject-apr-1', 'Đã từ chối'],
  ])('confirms %s', async (button, message) => {
    wrap(<ApprovalsPage />)

    fireEvent.click(await screen.findByTestId(button))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message))
  })

  it('falls back to a generic text when a decision fails for another reason', async () => {
    api.put.mockRejectedValueOnce(httpError(500, 'internal_error'))
    wrap(<ApprovalsPage />)

    fireEvent.click(await screen.findByTestId('approve-apr-1'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Thao tác thất bại'))
  })
})

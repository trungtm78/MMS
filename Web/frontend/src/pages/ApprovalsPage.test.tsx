import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApprovalsPage } from './ApprovalsPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => {
  const get = vi.fn()
  const put = vi.fn()
  return { default: { get, put } }
})

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

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockApprovals })
    vi.mocked(apiClient.default.put).mockResolvedValue({ data: {} })
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
})

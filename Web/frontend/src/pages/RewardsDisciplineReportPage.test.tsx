import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RewardsDisciplineReportPage } from './RewardsDisciplineReportPage'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'r1',
          fullName: 'Nguyễn Văn A',
          militiaCode: 'DQTV001',
          unitName: 'Khu phố 1',
          rewardType: 'reward',
          description: 'Khen thưởng tiêu biểu',
          content: 'Đạt thành tích xuất sắc',
          decisionNo: 'QĐ-001/2026',
          decisionDate: '2026-03-15',
        },
        {
          id: 'r2',
          fullName: 'Trần Thị B',
          militiaCode: 'DQTV002',
          unitName: 'Khu phố 2',
          rewardType: 'discipline',
          description: 'Xử lý kỷ luật',
          content: 'Vi phạm quy định',
          decisionNo: 'QĐ-002/2026',
          decisionDate: '2026-04-01',
        },
      ],
    }),
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RewardsDisciplineReportPage />
    </QueryClientProvider>,
  )
}

describe('RewardsDisciplineReportPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the page with heading', () => {
    wrap()
    expect(screen.getByTestId('rewards-discipline-page')).toBeInTheDocument()
  })

  it('renders Khen thưởng tab button', async () => {
    wrap()
    await waitFor(() => {
      expect(screen.getAllByText(/khen thưởng/i).length).toBeGreaterThan(0)
    })
  })

  it('renders reward data after load (Nguyễn Văn A in reward tab)', async () => {
    wrap()
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    })
  })

  it('switches to kỷ luật tab and shows discipline data', async () => {
    wrap()
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    // Find the tab button specifically (not the heading or filter option)
    const tabs = screen.getAllByRole('button', { name: /kỷ luật/i })
    fireEvent.click(tabs[0])
    await waitFor(() => {
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    })
  })

  it('renders export button', async () => {
    wrap()
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getByTestId('rewards-export-btn')).toBeInTheDocument()
  })

  it('export button is not disabled when data is present', async () => {
    wrap()
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getByTestId('rewards-export-btn')).not.toBeDisabled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MilitiaProfilePage } from './MilitiaProfilePage'
import * as militiaApi from '@/api/militia'
import * as trainingApiModule from '@/api/training'
import type { TrainingRecord } from '@/api/training'

vi.mock('@/api/militia', () => ({
  getMilitiaById: vi.fn(),
}))

vi.mock('@/api/training', () => ({
  trainingApi: {
    listRecords: vi.fn(),
  },
}))

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { assignments: [], taskHistory: [] } }),
  },
}))

const mockProfile = {
  id: 'uuid-1',
  userId: null,
  militiaCode: 'DQTV001',
  fullName: 'Nguyễn Văn Minh',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
  status: 'active',
  phone: '0901234567',
  email: 'minh@test.com',
  rank: 'Chiến sĩ',
  avatarUrl: null,
  // NĐ 72/2020 fields:
  occupation: 'Kỹ sư',
  educationLevel: 'Đại học',
  healthStatus: 'good',
  bloodType: 'A+',
  permanentAddress: '123 Đường Lê Lợi, KP1',
  judicialClearanceStatus: 'clear',
}

const mockTrainingRecords: TrainingRecord[] = [
  {
    id: 'tr-1',
    militiaId: 'uuid-1',
    trainingType: 'military',
    fromDate: '2026-01-10',
    toDate: '2026-01-20',
    totalDays: 10,
    location: 'Hà Nội',
    instructor: 'Trần Văn C',
    result: 'pass',
    certificateNo: 'CERT-001',
    notes: null,
    createdAt: '2026-01-20T10:00:00Z',
  },
  {
    id: 'tr-2',
    militiaId: 'uuid-1',
    trainingType: 'political',
    fromDate: '2026-02-05',
    toDate: '2026-02-10',
    totalDays: 5,
    location: null,
    instructor: null,
    result: 'pass',
    certificateNo: null,
    notes: null,
    createdAt: '2026-02-10T10:00:00Z',
  },
]

function renderWithProviders(id = 'uuid-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[`/militia/${id}`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/militia/:id" element={<MilitiaProfilePage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('MilitiaProfilePage', () => {
  beforeEach(() => {
    vi.mocked(militiaApi.getMilitiaById).mockResolvedValue(mockProfile)
    vi.mocked(trainingApiModule.trainingApi.listRecords).mockResolvedValue({
      data: mockTrainingRecords,
      total: 2,
      page: 1,
      limit: 100,
    })
  })

  it('renders profile after load', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument()
    })
  })

  it('renders status badge', async () => {
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getAllByText('Đang hoạt động').length).toBeGreaterThan(0)
    })
  })

  it('renders all 6 tabs', async () => {
    renderWithProviders()
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
    expect(screen.getByTestId('tab-personal')).toBeInTheDocument()
    expect(screen.getByTestId('tab-history')).toBeInTheDocument()
    expect(screen.getByTestId('tab-training')).toBeInTheDocument()
    expect(screen.getByTestId('tab-rewards')).toBeInTheDocument()
    expect(screen.getByTestId('tab-documents')).toBeInTheDocument()
    expect(screen.getByTestId('tab-changelog')).toBeInTheDocument()
  })

  it('switches tab content on click', async () => {
    renderWithProviders()
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('tab-history'))
    await waitFor(() => expect(screen.getByTestId('history-tab')).toBeInTheDocument())
  })

  it('shows error state when API fails', async () => {
    vi.mocked(militiaApi.getMilitiaById).mockRejectedValue(new Error('Network error'))
    renderWithProviders()
    await waitFor(() => {
      expect(screen.getByText(/Không thể tải thông tin/)).toBeInTheDocument()
    })
  })

  it('has back button', async () => {
    renderWithProviders()
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
    expect(screen.getByTestId('back-btn')).toBeInTheDocument()
  })

  // Training tab tests
  describe('Training tab', () => {
    async function openTrainingTab() {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      fireEvent.click(screen.getByTestId('tab-training'))
    }

    it('renders training records table when data is present', async () => {
      await openTrainingTab()
      await waitFor(() => {
        expect(screen.getByTestId('training-table')).toBeInTheDocument()
      })
    })

    it('totalDays >= 15 shows green Đạt badge', async () => {
      // 10 + 5 = 15 days → meets requirement
      await openTrainingTab()
      await waitFor(() => {
        const badge = screen.getByTestId('compliance-badge')
        expect(badge).toBeInTheDocument()
        expect(badge.textContent).toMatch(/Đạt/)
        expect(badge.className).toMatch(/green|2E7D32/)
      })
    })

    it('totalDays < 15 shows red Chưa đạt badge', async () => {
      vi.mocked(trainingApiModule.trainingApi.listRecords).mockResolvedValue({
        data: [{ ...mockTrainingRecords[0], totalDays: 8 }],
        total: 1,
        page: 1,
        limit: 100,
      })
      await openTrainingTab()
      await waitFor(() => {
        const badge = screen.getByTestId('compliance-badge')
        expect(badge.textContent).toMatch(/Chưa đạt/)
        expect(badge.className).toMatch(/red|C62828/)
      })
    })

    it('empty records shows empty state message', async () => {
      vi.mocked(trainingApiModule.trainingApi.listRecords).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 100,
      })
      await openTrainingTab()
      await waitFor(() => {
        expect(screen.getByTestId('training-empty')).toBeInTheDocument()
        expect(screen.getByText('Chưa có dữ liệu huấn luyện')).toBeInTheDocument()
      })
    })

    it("training type 'military' maps to 'Quân sự'", async () => {
      await openTrainingTab()
      await waitFor(() => {
        expect(screen.getByText('Quân sự')).toBeInTheDocument()
      })
    })
  })

  // NĐ 72/2020 personal tab fields
  describe('Personal tab NĐ 72 fields', () => {
    it('renders occupation and blood type', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByText('Kỹ sư')).toBeInTheDocument()
      expect(screen.getByText('A+')).toBeInTheDocument()
    })

    it('renders education level and health status label', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByText('Đại học')).toBeInTheDocument()
      expect(screen.getByText('Tốt')).toBeInTheDocument()
    })

    it('renders permanent address and judicial clearance label', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByText('123 Đường Lê Lợi, KP1')).toBeInTheDocument()
      expect(screen.getByText('Sạch')).toBeInTheDocument()
    })
  })

  describe('Edit button', () => {
    it('renders Chỉnh sửa button', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      expect(screen.getByTestId('edit-btn')).toBeInTheDocument()
    })

    it('opens edit modal when Chỉnh sửa is clicked', async () => {
      renderWithProviders()
      await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())
      fireEvent.click(screen.getByTestId('edit-btn'))
      await waitFor(() => {
        expect(screen.getByTestId('militia-edit-modal')).toBeInTheDocument()
      })
    })
  })
})

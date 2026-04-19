import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MilitiaProfilePage } from './MilitiaProfilePage'
import * as militiaApi from '@/api/militia'

vi.mock('@/api/militia', () => ({
  getMilitiaById: vi.fn(),
}))

const mockProfile = {
  id: 'uuid-1',
  militiaCode: 'DQTV001',
  fullName: 'Nguyễn Văn Minh',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
  status: 'active',
  phone: '0901234567',
  email: 'minh@test.com',
  rank: 'Chiến sĩ',
  avatarUrl: null,
}

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
    expect(screen.getByText('Chưa có dữ liệu quá trình công tác')).toBeInTheDocument()
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
})

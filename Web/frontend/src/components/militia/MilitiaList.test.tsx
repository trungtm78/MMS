import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MilitiaList } from './MilitiaList'
import * as militiaApi from '@/api/militia'

vi.mock('@/api/militia', () => ({
  searchMilitia: vi.fn(),
}))

const mockData = {
  data: [
    {
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
    },
    {
      id: 'uuid-2',
      militiaCode: 'DQTV002',
      fullName: 'Trần Thanh Tùng',
      unitCode: 'KP2',
      unitName: 'Khu phố 2',
      status: 'reserve',
      phone: null,
      email: null,
      rank: null,
      avatarUrl: null,
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
}

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('MilitiaList', () => {
  beforeEach(() => {
    vi.mocked(militiaApi.searchMilitia).mockResolvedValue(mockData)
  })

  it('renders heading', async () => {
    renderWithProviders(<MilitiaList />)
    expect(screen.getByText('Danh sách Dân Quân Tự Vệ')).toBeInTheDocument()
  })

  it('renders militia rows after load', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument()
      expect(screen.getByText('Trần Thanh Tùng')).toBeInTheDocument()
    })
  })

  it('shows status badges', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => {
      expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()
      expect(screen.getByText('Dự bị')).toBeInTheDocument()
    })
  })

  it('calls searchMilitia with status filter when changed', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())

    const selects = screen.getAllByRole('combobox')
    // Second select is status filter
    fireEvent.change(selects[1], { target: { value: 'active' } })

    await waitFor(() => {
      expect(vi.mocked(militiaApi.searchMilitia)).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' }),
      )
    })
  })

  it('calls searchMilitia with unit filter when changed', async () => {
    renderWithProviders(<MilitiaList />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'KP1' } })

    await waitFor(() => {
      expect(vi.mocked(militiaApi.searchMilitia)).toHaveBeenCalledWith(
        expect.objectContaining({ unitCode: 'KP1' }),
      )
    })
  })

  it('calls onViewProfile callback when eye button clicked', async () => {
    const onViewProfile = vi.fn()
    renderWithProviders(<MilitiaList onViewProfile={onViewProfile} />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn Minh')).toBeInTheDocument())

    const eyeButtons = screen.getAllByTitle('Xem chi tiết')
    fireEvent.click(eyeButtons[0])
    expect(onViewProfile).toHaveBeenCalledWith('uuid-1')
  })

  it('shows empty state when no results', async () => {
    vi.mocked(militiaApi.searchMilitia).mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 })
    renderWithProviders(<MilitiaList />)
    await waitFor(() => {
      expect(screen.getByText('Chưa có dữ liệu dân quân')).toBeInTheDocument()
    })
  })

  it('shows Xuất Excel button', () => {
    renderWithProviders(<MilitiaList />)
    expect(screen.getByText('Xuất Excel')).toBeInTheDocument()
  })
})

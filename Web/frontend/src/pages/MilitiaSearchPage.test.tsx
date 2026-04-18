import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MilitiaSearchPage } from './MilitiaSearchPage'

vi.mock('@/api/militia', () => ({
  searchMilitia: vi.fn().mockResolvedValue([
    { id: 'm1', militiaCode: 'DQTV001', fullName: 'Nguyễn Văn A', status: 'active', unitCode: 'P01', unitName: 'Phường 1', rank: 'Tiểu đội trưởng', phone: '0901000001' },
    { id: 'm2', militiaCode: 'DQTV002', fullName: 'Trần Thị B', status: 'inactive', unitCode: 'P01', unitName: 'Phường 1', rank: null, phone: null },
  ]),
}))

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('MilitiaSearchPage', () => {
  it('renders search form', () => {
    renderWithQuery(<MilitiaSearchPage />)
    expect(screen.getByTestId('militia-search-input')).toBeInTheDocument()
    expect(screen.getByTestId('search-btn')).toBeInTheDocument()
    expect(screen.getByTestId('reset-search-btn')).toBeInTheDocument()
  })

  it('does not show results before search', () => {
    renderWithQuery(<MilitiaSearchPage />)
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()
  })

  it('shows results after clicking search', async () => {
    renderWithQuery(<MilitiaSearchPage />)
    await userEvent.click(screen.getByTestId('search-btn'))
    await waitFor(() => screen.getByTestId('search-results'))
    await waitFor(() => screen.getByText('Nguyễn Văn A'))
    expect(screen.getByText('DQTV001')).toBeInTheDocument()
  })

  it('shows empty state when no results', async () => {
    const { searchMilitia } = await import('@/api/militia')
    vi.mocked(searchMilitia).mockResolvedValueOnce([])
    renderWithQuery(<MilitiaSearchPage />)
    await userEvent.click(screen.getByTestId('search-btn'))
    await waitFor(() => screen.getByTestId('empty-state'))
  })

  it('resets form on reset button click', async () => {
    renderWithQuery(<MilitiaSearchPage />)
    await userEvent.type(screen.getByTestId('militia-search-input'), 'test')
    await userEvent.click(screen.getByTestId('search-btn'))
    await waitFor(() => screen.getByTestId('search-results'))
    await userEvent.click(screen.getByTestId('reset-search-btn'))
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument()
    expect(screen.getByTestId('militia-search-input')).toHaveValue('')
  })
})

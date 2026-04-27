import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { OfficialDocumentsPage } from './OfficialDocumentsPage'

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockDocs = [
  {
    id: 'doc-1',
    docNumber: '123/CV-BCA',
    docType: 'cong_van',
    title: 'Công văn về huấn luyện DQTV',
    issuedBy: 'BCA',
    issuedDate: '2024-01-15T00:00:00Z',
    effectiveDate: '2024-02-01T00:00:00Z',
    expiryDate: null,
    status: 'active',
    subject: 'Hướng dẫn thực hiện huấn luyện',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'doc-2',
    docNumber: null,
    docType: 'quyet_dinh',
    title: 'Quyết định thành lập ban chỉ huy',
    issuedBy: 'UBND',
    issuedDate: '2024-03-01T00:00:00Z',
    effectiveDate: null,
    expiryDate: null,
    status: 'draft',
    subject: null,
    createdAt: '2024-03-01T09:00:00Z',
  },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <OfficialDocumentsPage />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('OfficialDocumentsPage', () => {
  let mockClient: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    const { default: client } = await import('@/api/client')
    mockClient = client as typeof mockClient
    vi.clearAllMocks()
    mockClient.get.mockResolvedValue({ data: { data: mockDocs, total: 2, page: 1, limit: 20 } })
  })

  it('renders page heading', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('official-documents-page')).toBeInTheDocument())
    expect(screen.getByText('Văn bản pháp lý')).toBeInTheDocument()
  })

  it('renders document rows', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('doc-row-doc-1')).toBeInTheDocument())
    expect(screen.getByText('Công văn về huấn luyện DQTV')).toBeInTheDocument()
    expect(screen.getByTestId('doc-row-doc-2')).toBeInTheDocument()
  })

  it('shows status badge', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Hiệu lực')).toBeInTheDocument())
    expect(screen.getByText('Nháp')).toBeInTheDocument()
  })

  it('shows create modal on button click', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('create-doc-btn'))
    fireEvent.click(screen.getByTestId('create-doc-btn'))
    expect(screen.getByTestId('doc-title-input')).toBeInTheDocument()
    expect(screen.getByTestId('doc-type-select')).toBeInTheDocument()
  })

  it('submits create form and closes modal', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'doc-3', title: 'New Doc', docType: 'cong_van', status: 'active' } })
    renderPage()
    await waitFor(() => screen.getByTestId('create-doc-btn'))
    fireEvent.click(screen.getByTestId('create-doc-btn'))

    fireEvent.change(screen.getByTestId('doc-title-input'), { target: { value: 'Công văn mới' } })
    fireEvent.click(screen.getByTestId('create-doc-submit'))

    await waitFor(() => expect(mockClient.post).toHaveBeenCalledWith(
      '/official-documents',
      expect.objectContaining({ title: 'Công văn mới', docType: 'cong_van' }),
    ))
  })

  it('shows revoke confirmation on revoke button', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('revoke-btn-doc-1'))
    fireEvent.click(screen.getByTestId('revoke-btn-doc-1'))
    expect(screen.getByTestId('confirm-revoke-doc-1')).toBeInTheDocument()
  })

  it('calls revoke API on confirm', async () => {
    mockClient.delete.mockResolvedValue({ data: {} })
    renderPage()
    await waitFor(() => screen.getByTestId('revoke-btn-doc-1'))
    fireEvent.click(screen.getByTestId('revoke-btn-doc-1'))
    fireEvent.click(screen.getByTestId('confirm-revoke-doc-1'))
    await waitFor(() => expect(mockClient.delete).toHaveBeenCalledWith('/official-documents/doc-1'))
  })

  it('filters by type using select', async () => {
    renderPage()
    await waitFor(() => screen.getByTestId('type-filter'))
    fireEvent.change(screen.getByTestId('type-filter'), { target: { value: 'cong_van' } })
    await waitFor(() => expect(mockClient.get).toHaveBeenCalledWith(
      '/official-documents',
      expect.objectContaining({ params: expect.objectContaining({ type: 'cong_van' }) }),
    ))
  })

  it('shows empty state when no documents', async () => {
    mockClient.get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
    renderPage()
    await waitFor(() => expect(screen.getByText('Chưa có văn bản nào')).toBeInTheDocument())
  })
})

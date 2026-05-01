import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MilitiaCreateForm } from './MilitiaCreateForm'
import * as militiaApiModule from '@/api/militia'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/api/militia', () => ({
  militiaApi: {
    quickCreate: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MilitiaCreateForm />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MilitiaCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders all required fields', () => {
      renderForm()
      expect(screen.getByTestId('fullName-input')).toBeInTheDocument()
      expect(screen.getByTestId('militiaCode-input')).toBeInTheDocument()
      expect(screen.getByTestId('unitCode-input')).toBeInTheDocument()
      expect(screen.getByTestId('submit-btn')).toBeInTheDocument()
    })

    it('renders back button that navigates to /militia', async () => {
      renderForm()
      await userEvent.click(screen.getByTestId('back-btn'))
      expect(mockNavigate).toHaveBeenCalledWith('/militia')
    })
  })

  describe('validation', () => {
    it('shows required errors when submitting empty form', async () => {
      renderForm()
      await userEvent.click(screen.getByTestId('submit-btn'))
      await waitFor(() => {
        expect(screen.getByText(/Họ tên tối thiểu 2 ký tự/i)).toBeInTheDocument()
      })
    })

    it('validates militiaCode allows only uppercase letters, digits, hyphens', async () => {
      renderForm()
      await userEvent.type(screen.getByTestId('militiaCode-input'), 'invalid code!')
      await userEvent.click(screen.getByTestId('submit-btn'))
      await waitFor(() => {
        expect(screen.getByText(/chỉ gồm chữ hoa, số và dấu gạch ngang/i)).toBeInTheDocument()
      })
    })

    it('validates phone number format', async () => {
      renderForm()
      await userEvent.type(screen.getByTestId('phone-input'), '12345')
      await userEvent.click(screen.getByTestId('submit-btn'))
      await waitFor(() => {
        expect(screen.getByText(/Số điện thoại không hợp lệ/i)).toBeInTheDocument()
      })
    })
  })

  describe('submission', () => {
    it('calls quickCreate and navigates to /militia on success', async () => {
      const { toast } = await import('sonner')
      vi.mocked(militiaApiModule.militiaApi.quickCreate).mockResolvedValueOnce({
        id: 'new-id', fullName: 'Test', militiaCode: 'TEST-001',
        unitCode: 'KP1', unitName: null, status: 'active',
        phone: null, rank: null, avatarUrl: null,
      })

      renderForm()
      await userEvent.type(screen.getByTestId('fullName-input'), 'Nguyen Van A')
      await userEvent.type(screen.getByTestId('militiaCode-input'), 'KP1-001')
      await userEvent.type(screen.getByTestId('unitCode-input'), 'KP1')
      await userEvent.click(screen.getByTestId('submit-btn'))

      await waitFor(() => {
        expect(militiaApiModule.militiaApi.quickCreate).toHaveBeenCalledWith(
          expect.objectContaining({ fullName: 'Nguyen Van A', militiaCode: 'KP1-001', unitCode: 'KP1' }),
        )
        expect(toast.success).toHaveBeenCalledWith('Thêm dân quân tự vệ thành công')
        expect(mockNavigate).toHaveBeenCalledWith('/militia')
      })
    })

    it('shows duplicate code error on 409 response', async () => {
      const { toast } = await import('sonner')
      const err = Object.assign(new Error('Conflict'), { response: { status: 409 } })
      vi.mocked(militiaApiModule.militiaApi.quickCreate).mockRejectedValueOnce(err)

      renderForm()
      await userEvent.type(screen.getByTestId('fullName-input'), 'Test User')
      await userEvent.type(screen.getByTestId('militiaCode-input'), 'DUP-001')
      await userEvent.type(screen.getByTestId('unitCode-input'), 'KP1')
      await userEvent.click(screen.getByTestId('submit-btn'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Mã DQTV đã tồn tại'))
      })
    })

    it('shows generic error on other failures', async () => {
      const { toast } = await import('sonner')
      vi.mocked(militiaApiModule.militiaApi.quickCreate).mockRejectedValueOnce(new Error('Server error'))

      renderForm()
      await userEvent.type(screen.getByTestId('fullName-input'), 'Test User')
      await userEvent.type(screen.getByTestId('militiaCode-input'), 'KP1-002')
      await userEvent.type(screen.getByTestId('unitCode-input'), 'KP1')
      await userEvent.click(screen.getByTestId('submit-btn'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Có lỗi xảy ra. Vui lòng thử lại.')
      })
    })
  })
})

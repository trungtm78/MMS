import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MilitiaEditModal } from './MilitiaEditModal'
import * as militiaApiModule from '@/api/militia'
import type { MilitiaListItem } from '@/api/militia'

vi.mock('@/api/militia', () => ({
  militiaApi: { update: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockProfile: MilitiaListItem = {
  id: 'uuid-1',
  userId: null,
  militiaCode: 'DQTV001',
  fullName: 'Nguyễn Văn Minh',
  unitCode: 'KP1',
  unitName: 'Khu phố 1',
  status: 'active',
  phone: '0901234567',
  email: null,
  rank: 'Chiến sĩ',
  avatarUrl: null,
  occupation: null,
  educationLevel: null,
  healthStatus: null,
  bloodType: null,
  permanentAddress: '123 Đường ABC',
  judicialClearanceStatus: null,
}

const mockOnClose = vi.fn()

function renderModal(open = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MilitiaEditModal open={open} onClose={mockOnClose} id="uuid-1" profile={mockProfile} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MilitiaEditModal', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('rendering', () => {
    it('renders nothing when open=false', () => {
      renderModal(false)
      expect(screen.queryByTestId('militia-edit-modal')).not.toBeInTheDocument()
    })

    it('pre-populates phone and address from profile', () => {
      renderModal()
      expect(screen.getByTestId('edit-phone-input')).toHaveValue('0901234567')
      expect(screen.getByTestId('edit-address-input')).toHaveValue('123 Đường ABC')
    })

    it('shows Hủy and Lưu thay đổi buttons', () => {
      renderModal()
      expect(screen.getByTestId('cancel-btn')).toBeInTheDocument()
      expect(screen.getByTestId('save-btn')).toBeInTheDocument()
    })
  })

  describe('dismiss behavior', () => {
    it('closes when Hủy is clicked and form is clean', async () => {
      renderModal()
      await userEvent.click(screen.getByTestId('cancel-btn'))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })

    it('closes when X button is clicked and form is clean', async () => {
      renderModal()
      await userEvent.click(screen.getByTestId('close-modal-btn'))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })

    it('prompts confirmation when form is dirty and user cancels', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderModal()
      await userEvent.clear(screen.getByTestId('edit-phone-input'))
      await userEvent.type(screen.getByTestId('edit-phone-input'), '0909999999')
      await userEvent.click(screen.getByTestId('cancel-btn'))
      expect(confirmSpy).toHaveBeenCalled()
      expect(mockOnClose).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('closes via backdrop click when form is clean', async () => {
      renderModal()
      fireEvent.click(screen.getByTestId('militia-edit-modal'))
      expect(mockOnClose).toHaveBeenCalledOnce()
    })
  })

  describe('submission', () => {
    it('calls update and closes modal on success', async () => {
      const { toast } = await import('sonner')
      vi.mocked(militiaApiModule.militiaApi.update).mockResolvedValueOnce({
        ...mockProfile, phone: '0909000000',
      } as ReturnType<typeof militiaApiModule.militiaApi.update> extends Promise<infer T> ? T : never)

      renderModal()
      await userEvent.click(screen.getByTestId('save-btn'))

      await waitFor(() => {
        expect(militiaApiModule.militiaApi.update).toHaveBeenCalledWith(
          'uuid-1',
          expect.objectContaining({ phone: '0901234567' }),
        )
        expect(toast.success).toHaveBeenCalledWith('Cập nhật thành công')
        expect(mockOnClose).toHaveBeenCalled()
      })
    })

    it('shows error toast on update failure', async () => {
      const { toast } = await import('sonner')
      vi.mocked(militiaApiModule.militiaApi.update).mockRejectedValueOnce(new Error('Server error'))

      renderModal()
      await userEvent.click(screen.getByTestId('save-btn'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Có lỗi xảy ra. Vui lòng thử lại.')
      })
    })
  })
})

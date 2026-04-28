import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { RecruitmentPage } from './RecruitmentPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useRbac', () => ({ useRbac: () => ({ can: { manageMilitia: true } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'system_admin', fullName: 'Admin' } }) }))

const mockApps = [
  {
    id: 'a1',
    name: 'Nguyễn Văn X',
    status: 'new',
    phone: '0901234567',
    address: 'KP1',
    age: 25,
    applyDate: '2026-04-01',
    district: 'Khu phố 1',
    email: 'x@example.com',
    idNumber: '079201001234',
  },
  { id: 'a2', name: 'Trần Thị Y', status: 'approved', phone: '0912345678', address: 'KP2', age: 23, applyDate: '2026-04-10' },
]

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('RecruitmentPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockApps })
  })

  it('renders page', async () => {
    wrap(<RecruitmentPage />)
    await waitFor(() => expect(screen.getByTestId('recruitment-page')).toBeInTheDocument())
  })

  it('shows applicant names after load', async () => {
    wrap(<RecruitmentPage />)
    await waitFor(() => expect(screen.getByText('Nguyễn Văn X')).toBeInTheDocument())
    expect(screen.getByText('Trần Thị Y')).toBeInTheDocument()
  })

  it('shows create application button', async () => {
    wrap(<RecruitmentPage />)
    await waitFor(() => expect(screen.getByTestId('create-application-btn')).toBeInTheDocument())
  })

  // FIX D: Export CSV / Xuất Excel
  describe('"Xuất Excel" button calls exportCSV and triggers download', () => {
    it('creates an object URL and triggers anchor click on export', async () => {
      const mockObjectURL = 'blob:http://localhost/mock-url'
      const createObjectURL = vi.fn().mockReturnValue(mockObjectURL)
      const revokeObjectURL = vi.fn()
      Object.defineProperty(globalThis.URL, 'createObjectURL', { value: createObjectURL, writable: true })
      Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true })

      // Capture anchor click instead of real navigation
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      wrap(<RecruitmentPage />)
      await waitFor(() => expect(screen.getByText('Nguyễn Văn X')).toBeInTheDocument())

      await userEvent.click(screen.getByRole('button', { name: /Xuất Excel/i }))

      expect(createObjectURL).toHaveBeenCalledOnce()
      expect(clickSpy).toHaveBeenCalledOnce()
      expect(revokeObjectURL).toHaveBeenCalledWith(mockObjectURL)

      clickSpy.mockRestore()
    })
  })

  // FIX E: Detail modal via eye icon
  describe('detail modal', () => {
    it('clicking eye icon opens detail modal with member data', async () => {
      wrap(<RecruitmentPage />)
      await waitFor(() => expect(screen.getByTestId('application-row-a1')).toBeInTheDocument())

      const row = screen.getByTestId('application-row-a1')
      const eyeBtn = row.querySelector('button[title="Xem chi tiết"]')!
      await userEvent.click(eyeBtn)

      const heading = screen.getByText('Chi tiết đơn đăng ký')
      expect(heading).toBeInTheDocument()
      // Name appears both in the table row and in the modal — confirm at least once inside the modal
      expect(screen.getAllByText('Nguyễn Văn X').length).toBeGreaterThanOrEqual(2)
    })

    it('modal closes when clicking X button', async () => {
      wrap(<RecruitmentPage />)
      await waitFor(() => expect(screen.getByTestId('application-row-a1')).toBeInTheDocument())

      const row = screen.getByTestId('application-row-a1')
      await userEvent.click(row.querySelector('button[title="Xem chi tiết"]')!)

      // The modal heading is present; find the Đóng button inside the modal footer
      expect(screen.getByText('Chi tiết đơn đăng ký')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Đóng/i }))

      expect(screen.queryByText('Chi tiết đơn đăng ký')).not.toBeInTheDocument()
    })

    it('modal shows all available fields for the selected application', async () => {
      wrap(<RecruitmentPage />)
      await waitFor(() => expect(screen.getByTestId('application-row-a1')).toBeInTheDocument())

      const row = screen.getByTestId('application-row-a1')
      await userEvent.click(row.querySelector('button[title="Xem chi tiết"]')!)

      // Scope all assertions to the modal container to avoid ambiguity with table rows
      const modalHeading = screen.getByText('Chi tiết đơn đăng ký')
      expect(modalHeading).toBeInTheDocument()
      const modal = modalHeading.closest('.space-y-4') as HTMLElement

      expect(within(modal).getByText('0901234567')).toBeInTheDocument()   // phone
      expect(within(modal).getByText('KP1')).toBeInTheDocument()           // address
      expect(within(modal).getByText('2026-04-01')).toBeInTheDocument()    // applyDate
      expect(within(modal).getByText('Khu phố 1')).toBeInTheDocument()    // district
      expect(within(modal).getByText('x@example.com')).toBeInTheDocument() // email
      expect(within(modal).getByText('079201001234')).toBeInTheDocument()  // idNumber
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPasswordPage } from './SettingsPasswordPage'

vi.mock('@/api/profile', () => ({
  changePassword: vi.fn().mockResolvedValue(undefined),
}))

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('SettingsPasswordPage', () => {
  it('renders all password fields', () => {
    renderWithQuery(<SettingsPasswordPage />)
    expect(screen.getByTestId('current-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('new-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-password-input')).toBeInTheDocument()
    expect(screen.getByTestId('change-password-btn')).toBeInTheDocument()
  })

  it('shows validation error when submitting empty form', async () => {
    renderWithQuery(<SettingsPasswordPage />)
    await userEvent.click(screen.getByTestId('change-password-btn'))
    expect(screen.getByText('Vui lòng nhập mật khẩu hiện tại')).toBeInTheDocument()
  })

  it('shows error when passwords do not match', async () => {
    renderWithQuery(<SettingsPasswordPage />)
    await userEvent.type(screen.getByTestId('current-password-input'), 'OldPass@1')
    await userEvent.type(screen.getByTestId('new-password-input'), 'NewPass@1')
    await userEvent.type(screen.getByTestId('confirm-password-input'), 'Mismatch@1')
    await userEvent.click(screen.getByTestId('change-password-btn'))
    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
  })

  it('shows password strength meter when typing', async () => {
    renderWithQuery(<SettingsPasswordPage />)
    await userEvent.type(screen.getByTestId('new-password-input'), 'StrongPass@1')
    expect(screen.getByText('Mạnh')).toBeInTheDocument()
  })

  it('shows weak strength for short password', async () => {
    renderWithQuery(<SettingsPasswordPage />)
    await userEvent.type(screen.getByTestId('new-password-input'), 'abc')
    expect(screen.getByText('Yếu')).toBeInTheDocument()
  })
})

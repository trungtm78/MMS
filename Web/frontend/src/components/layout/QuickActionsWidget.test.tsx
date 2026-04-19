import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QuickActionsWidget } from './QuickActionsWidget'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('QuickActionsWidget', () => {
  it('renders FAB button', () => {
    wrap(<QuickActionsWidget />)
    expect(screen.getByTestId('quick-actions-fab')).toBeInTheDocument()
  })

  it('opens panel on FAB click', () => {
    wrap(<QuickActionsWidget />)
    fireEvent.click(screen.getByTestId('quick-actions-fab'))
    expect(screen.getByText('Thao tác nhanh')).toBeInTheDocument()
  })

  it('closes panel on close button', () => {
    wrap(<QuickActionsWidget />)
    fireEvent.click(screen.getByTestId('quick-actions-fab'))
    fireEvent.click(screen.getByTestId('quick-actions-close'))
    expect(screen.queryByTestId('quick-actions-close')).not.toBeInTheDocument()
  })

  it('navigates on action click', () => {
    wrap(<QuickActionsWidget />)
    fireEvent.click(screen.getByTestId('quick-actions-fab'))
    fireEvent.click(screen.getByTestId('quick-action-militia-list'))
    expect(mockNavigate).toHaveBeenCalledWith('/militia')
  })
})

import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock useRbac — manageMilitia: true so the page renders its full content
vi.mock('@/hooks/useRbac', () => ({
  useRbac: () => ({
    can: { manageMilitia: true, manageWeapons: false, manageRecruitment: false },
    role: 'office_staff',
    hasRole: vi.fn(),
    hasMinRole: vi.fn(() => true),
    canAccessUnit: vi.fn(() => true),
  }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { fullName: 'Test User', role: 'office_staff' },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}))

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

// Build dates relative to today
function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Mock @tanstack/react-query — intercept useQuery for exemptions
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn().mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = Array.isArray(queryKey) ? queryKey[0] : queryKey
      if (key === 'exemptions') {
        return {
          data: [
            {
              id: 'rec-1',
              militiaId: 'mil-001',
              type: 'deferral',
              reason: 'Lý do hoãn nghĩa vụ',
              legalBasis: 'Điều 41 Luật DQTV',
              effectiveDate: '2025-01-01',
              expiryDate: daysFromNow(25), // within 30-day warning window
              status: 'active',
              documents: [],
            },
            {
              id: 'rec-2',
              militiaId: 'mil-002',
              type: 'exemption',
              reason: 'Miễn hoàn toàn',
              legalBasis: 'Điều 42 Luật DQTV',
              effectiveDate: '2025-01-01',
              expiryDate: daysFromNow(60), // outside 30-day window
              status: 'active',
              documents: [],
            },
          ],
          isLoading: false,
          isError: false,
        }
      }
      return { data: undefined, isLoading: false, isError: false }
    }),
  }
})

import { ExemptionPage } from './ExemptionPage'

describe('ExemptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Sắp hết hạn" badge for record expiring within 30 days', () => {
    render(
      <MemoryRouter>
        <ExemptionPage />
      </MemoryRouter>
    )

    const warnings = screen.queryAllByTestId('expiry-warning')
    expect(warnings.length).toBeGreaterThanOrEqual(1)
  })

  it('does NOT show "Sắp hết hạn" badge for record expiring in 60 days', () => {
    render(
      <MemoryRouter>
        <ExemptionPage />
      </MemoryRouter>
    )

    // There should be exactly 1 warning badge (only rec-1), not one for rec-2
    const warnings = screen.queryAllByTestId('expiry-warning')
    expect(warnings.length).toBe(1)
  })
})

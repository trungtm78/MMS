import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CustomReportPage } from './CustomReportPage'
import * as apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn() } }))

const mockResult = {
  title: 'Báo cáo chấm công',
  generatedAt: '2026-04-20T08:00:00Z',
  rows: [
    { label: 'Tổng ngày công', value: 20 },
    { label: 'Nghỉ phép', value: 2 },
  ],
}

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('CustomReportPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.default.get).mockResolvedValue({ data: mockResult })
  })

  it('renders heading', () => {
    wrap(<CustomReportPage />)
    expect(screen.getByTestId('custom-report-page')).toBeInTheDocument()
    expect(screen.getByText('Báo Cáo Tùy Chỉnh')).toBeInTheDocument()
  })

  it('renders report type selector and generate button', () => {
    wrap(<CustomReportPage />)
    expect(screen.getByTestId('report-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('generate-btn')).toBeInTheDocument()
  })

  it('renders report results after clicking generate', async () => {
    wrap(<CustomReportPage />)
    fireEvent.click(screen.getByTestId('generate-btn'))
    await waitFor(() => {
      expect(screen.getByText('Tổng ngày công')).toBeInTheDocument()
    })
  })
})

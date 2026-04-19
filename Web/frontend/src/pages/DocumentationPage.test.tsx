import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DocumentationPage } from './DocumentationPage'

describe('DocumentationPage', () => {
  it('renders heading', () => {
    render(<DocumentationPage />)
    expect(screen.getByText('Tài Liệu Hướng Dẫn')).toBeInTheDocument()
  })

  it('renders all 4 sections', () => {
    render(<DocumentationPage />)
    expect(screen.getByTestId('section-attendance')).toBeInTheDocument()
    expect(screen.getByTestId('section-tasks')).toBeInTheDocument()
    expect(screen.getByTestId('section-kpi')).toBeInTheDocument()
    expect(screen.getByTestId('section-faq')).toBeInTheDocument()
  })

  it('expands section on click and shows articles', () => {
    render(<DocumentationPage />)
    fireEvent.click(screen.getByTestId('section-attendance'))
    expect(screen.getByText('Cách chấm công vào đầu ca')).toBeInTheDocument()
  })

  it('collapses section on second click', () => {
    render(<DocumentationPage />)
    const btn = screen.getByTestId('section-attendance')
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByText('Cách chấm công vào đầu ca')).not.toBeInTheDocument()
  })
})

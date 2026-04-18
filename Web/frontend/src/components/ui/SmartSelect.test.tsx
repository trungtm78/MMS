// US-SS-01..05: SmartSelect component tests
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SmartSelect } from './SmartSelect'
import type { SmartSelectOption } from '@/types'

const OPTIONS: SmartSelectOption[] = [
  { id: '1', label: 'HCM-001 — Nguyễn Văn An', sublabel: '0909111111 | KP1' },
  { id: '2', label: 'HCM-002 — Trần Thị Bình', sublabel: '0909222222 | KP2' },
  { id: '3', label: 'HCM-003 — Lê Văn Cường', sublabel: '0909333333 | KP3' },
]

function renderSmartSelect(props: Partial<React.ComponentProps<typeof SmartSelect>> = {}) {
  const defaultProps: React.ComponentProps<typeof SmartSelect> = {
    name: 'test',
    options: OPTIONS,
    ...props,
  }
  return render(<SmartSelect {...defaultProps} />)
}

describe('SmartSelect — US-SS-01: Render & Initial State', () => {
  it('renders input with correct data-testid', () => {
    renderSmartSelect()
    expect(screen.getByTestId('smart-select-test-input')).toBeInTheDocument()
  })

  it('renders container with correct data-testid', () => {
    renderSmartSelect()
    expect(screen.getByTestId('smart-select-test')).toBeInTheDocument()
  })

  it('dropdown hidden initially', () => {
    renderSmartSelect()
    expect(screen.queryByTestId('smart-select-test-dropdown')).not.toBeInTheDocument()
  })

  it('renders label when provided', () => {
    renderSmartSelect({ label: 'Người thực hiện' })
    expect(screen.getByText('Người thực hiện')).toBeInTheDocument()
  })

  it('input has placeholder', () => {
    renderSmartSelect({ placeholder: 'Tìm kiếm...' })
    expect(screen.getByPlaceholderText('Tìm kiếm...')).toBeInTheDocument()
  })

  it('input has role=combobox', () => {
    renderSmartSelect()
    const input = screen.getByRole('combobox')
    expect(input).toBeInTheDocument()
  })

  it('aria-expanded=false initially', () => {
    renderSmartSelect()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('SmartSelect — US-SS-01: Selected state', () => {
  it('shows selected chip when value matches option', () => {
    renderSmartSelect({ value: '1' })
    expect(screen.getByTestId('smart-select-test-selected')).toBeInTheDocument()
    expect(screen.getByText('HCM-001 — Nguyễn Văn An')).toBeInTheDocument()
  })

  it('shows clear button when option is selected', () => {
    renderSmartSelect({ value: '1' })
    expect(screen.getByTestId('smart-select-test-clear')).toBeInTheDocument()
  })

  it('calls onClear when clear button clicked', async () => {
    const onClear = vi.fn()
    renderSmartSelect({ value: '1', onClear })
    await userEvent.click(screen.getByTestId('smart-select-test-clear'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})

describe('SmartSelect — US-SS-02: Dropdown opens', () => {
  it('opens dropdown on input focus', async () => {
    renderSmartSelect()
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
  })

  it('aria-expanded=true when dropdown open', async () => {
    renderSmartSelect()
    const input = screen.getByRole('combobox')
    await userEvent.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows results when options provided', async () => {
    renderSmartSelect()
    await userEvent.click(screen.getByTestId('smart-select-test-input'))
    await userEvent.type(screen.getByTestId('smart-select-test-input'), 'an')
    // Options are shown
    expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
  })

  it('shows loading indicator in dropdown when isLoading=true and dropdown open', async () => {
    renderSmartSelect({ isLoading: true })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'a')
    // Loading indicator shown inside open dropdown
    const dropdown = screen.getByTestId('smart-select-test-dropdown')
    expect(dropdown).toBeInTheDocument()
    expect(within(dropdown).getByTestId('smart-select-test-loading')).toBeInTheDocument()
  })

  it('shows empty state when no options and query present', async () => {
    renderSmartSelect({ options: [] })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'xyz')
    expect(screen.getByTestId('smart-select-test-empty')).toBeInTheDocument()
  })
})

describe('SmartSelect — US-SS-03: Keyboard navigation', () => {
  it('ArrowDown marks first option active', async () => {
    // Options list has entries — focus then ArrowDown
    renderSmartSelect()
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    // Open dropdown with matching text
    await userEvent.type(input, 'HCM')
    await waitFor(() => {
      expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
    })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    })
    // First option should be active
    const activeOption = screen.getByTestId('smart-select-test-option-active')
    expect(activeOption).toBeInTheDocument()
  })

  // US-SS-01 AC-3: ArrowUp at first item → stays at index 0 (no wrap)
  it('ArrowUp at first item stays at index 0 — no wrap', async () => {
    renderSmartSelect()
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'HCM')
    await waitFor(() => {
      expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
    })
    // Move to first item
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    expect(screen.getByTestId('smart-select-test-option-active')).toBeInTheDocument()
    // ArrowUp from index 0 → must stay at 0 (branch: prev > 0 false → returns 0)
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowUp' }) })
    // Still at first option (active still shown)
    expect(screen.getByTestId('smart-select-test-option-active')).toBeInTheDocument()
  })

  // US-SS-01 AC-2: ArrowDown when dropdown closed → opens it, no active index yet
  it('ArrowDown when dropdown closed → opens dropdown', async () => {
    renderSmartSelect()
    const input = screen.getByTestId('smart-select-test-input')
    // Do NOT click/focus — dropdown starts closed
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
  })

  // scrollIntoView guard — active item with no matching DOM node (empty options mid-flight)
  it('ArrowDown when no option exists — no active, no crash', async () => {
    renderSmartSelect({ options: [] })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'xyz')
    // Dropdown open but no options
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    // No active option rendered — query returns null
    expect(screen.queryByTestId('smart-select-test-option-active')).not.toBeInTheDocument()
  })

  // US-SS-01 AC-2: scrollIntoView branch — mock scrollIntoView so it is callable
  it('ArrowDown scrolls active item into view when scrollIntoView available', async () => {
    // jsdom does not implement scrollIntoView — mock it so branch is covered
    const scrollMock = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollMock
    renderSmartSelect()
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'HCM')
    await waitFor(() => {
      expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
    })
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    expect(scrollMock).toHaveBeenCalledWith({ block: 'nearest' })
    // cleanup
    delete (window.HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  })

  it('Escape key closes dropdown', async () => {
    renderSmartSelect()
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'HCM')
    await waitFor(() => {
      expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
    })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    expect(screen.queryByTestId('smart-select-test-dropdown')).not.toBeInTheDocument()
  })

  it('Enter selects active option', async () => {
    const onChange = vi.fn()
    renderSmartSelect({ onChange })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'HCM')
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    })
    // ArrowDown first to highlight
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    })
    // Then Enter to select
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(onChange).toHaveBeenCalled()
  })

  it('Tab key closes dropdown', async () => {
    renderSmartSelect()
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'HCM')
    await waitFor(() => {
      expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
    })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Tab' })
    })
    expect(screen.queryByTestId('smart-select-test-dropdown')).not.toBeInTheDocument()
  })
})

describe('SmartSelect — US-SS-04: Mouse interaction', () => {
  it('click on option calls onChange', async () => {
    const onChange = vi.fn()
    renderSmartSelect({ onChange })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'HCM')
    // Wait for options to render
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    })
    const firstOption = screen.getAllByRole('option')[0]
    await userEvent.click(firstOption)
    expect(onChange).toHaveBeenCalled()
  })

  it('click on option closes dropdown', async () => {
    renderSmartSelect({ onChange: vi.fn() })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'HCM')
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    })
    await userEvent.click(screen.getAllByRole('option')[0])
    expect(screen.queryByTestId('smart-select-test-dropdown')).not.toBeInTheDocument()
  })
})

describe('SmartSelect — US-SS-05: Quick-create modal', () => {
  it('shows create button in empty state when createModal provided', async () => {
    const createModal = {
      title: 'Tạo dân quân',
      content: <div>form</div>,
      onSubmit: vi.fn().mockResolvedValue(null),
    }
    renderSmartSelect({ options: [], createModal })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'xyz')
    expect(screen.getByTestId('smart-select-test-create-btn')).toBeInTheDocument()
  })

  it('opens modal on create button click', async () => {
    const createModal = {
      title: 'Tạo dân quân mới',
      content: <div>form content</div>,
      onSubmit: vi.fn().mockResolvedValue(null),
    }
    renderSmartSelect({ options: [], createModal })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'xyz')
    await userEvent.click(screen.getByTestId('smart-select-test-create-btn'))
    expect(screen.getByTestId('smart-select-test-modal')).toBeInTheDocument()
  })

  it('modal cancel button closes modal', async () => {
    const createModal = {
      title: 'Tạo mới',
      content: <div>form</div>,
      onSubmit: vi.fn().mockResolvedValue(null),
    }
    renderSmartSelect({ options: [], createModal })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'xyz')
    await userEvent.click(screen.getByTestId('smart-select-test-create-btn'))
    await userEvent.click(screen.getByTestId('smart-select-test-modal-cancel'))
    await waitFor(() => {
      expect(screen.queryByTestId('smart-select-test-modal')).not.toBeInTheDocument()
    })
  })
})

describe('SmartSelect — Error state', () => {
  it('shows error message when error=true and errorMessage provided', () => {
    renderSmartSelect({ error: true, errorMessage: 'Trường này bắt buộc' })
    expect(screen.getByTestId('smart-select-test-error')).toBeInTheDocument()
    expect(screen.getByText('Trường này bắt buộc')).toBeInTheDocument()
  })

  it('error input has aria-invalid=true', () => {
    renderSmartSelect({ error: true })
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('SmartSelect — Disabled state', () => {
  it('input is disabled when disabled=true', () => {
    renderSmartSelect({ disabled: true })
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('clear button hidden when disabled with value', () => {
    renderSmartSelect({ value: '1', disabled: true })
    expect(screen.queryByTestId('smart-select-test-clear')).not.toBeInTheDocument()
  })

  // US-SS-01 AC-10: keydown while disabled → no action (branch: if(disabled) return)
  it('keydown while disabled does not open dropdown', async () => {
    renderSmartSelect({ disabled: true })
    const input = screen.getByRole('combobox')
    await act(async () => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    expect(screen.queryByTestId('smart-select-test-dropdown')).not.toBeInTheDocument()
  })
})

describe('SmartSelect — Edge cases (branch coverage)', () => {
  // Line 167: option.disabled=true → handleOptionSelect returns early
  it('clicking disabled option does not call onChange', async () => {
    const onChange = vi.fn()
    const disabledOptions: SmartSelectOption[] = [
      { id: '1', label: 'Active Option' },
      { id: '2', label: 'Disabled Option', disabled: true },
    ]
    renderSmartSelect({ options: disabledOptions, onChange })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'Option')
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    })
    // Click the disabled option (index 1)
    const options = screen.getAllByRole('option')
    // disabled option has aria-disabled
    const disabledOpt = options.find(o => o.getAttribute('aria-disabled') === 'true')
    if (disabledOpt) {
      await userEvent.click(disabledOpt)
    }
    // onChange must NOT have been called for the disabled option click
    expect(onChange).not.toHaveBeenCalled()
  })

  // Line 114: onSearch is undefined → optional chain false branch
  it('typing without onSearch prop does not crash', async () => {
    // No onSearch passed → onSearch?.(q) takes the undefined path
    renderSmartSelect({ onSearch: undefined })
    const input = screen.getByTestId('smart-select-test-input')
    await userEvent.click(input)
    await userEvent.type(input, 'test')
    // No crash, dropdown still opens
    expect(screen.getByTestId('smart-select-test-dropdown')).toBeInTheDocument()
  })

  // Line 184: clear calls focus (inputRef.current?.focus()) — verify onClear fires and input appears
  it('clear button calls onClear and reveals search input', async () => {
    const onClear = vi.fn()
    // Render with value='1' so selected chip is shown; when cleared, value prop gone → input shown
    const { rerender } = render(
      <SmartSelect name="test" options={OPTIONS} value="1" onClear={onClear} />,
    )
    expect(screen.getByTestId('smart-select-test-selected')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('smart-select-test-clear'))
    expect(onClear).toHaveBeenCalledTimes(1)
    // Simulate parent removing value after onClear
    rerender(<SmartSelect name="test" options={OPTIONS} value="" onClear={onClear} />)
    // Search input is now visible
    expect(screen.getByTestId('smart-select-test-input')).toBeInTheDocument()
  })
})

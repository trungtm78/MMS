// useSmartSelect: the state machine behind SmartSelect (debounced search, keyboard navigation,
// selection, clear, blur)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useSmartSelect, type UseSmartSelectOptions } from './useSmartSelect'
import type { SmartSelectOption } from '@/types'

const OPTIONS: SmartSelectOption[] = [
  { id: '1', label: 'HCM-001 — Nguyễn Văn An' },
  { id: '2', label: 'HCM-002 — Trần Thị Bình' },
  { id: '3', label: 'HCM-003 — Lê Văn Cường' },
]

function keyEvent(key: string) {
  const preventDefault = vi.fn()
  return { event: { key, preventDefault } as unknown as KeyboardEvent<HTMLInputElement>, preventDefault }
}

function typed(value: string) {
  return { target: { value } } as ChangeEvent<HTMLInputElement>
}

function setup(props: Partial<UseSmartSelectOptions> = {}) {
  const hook = renderHook((current: UseSmartSelectOptions) => useSmartSelect(current), {
    initialProps: { options: OPTIONS, ...props },
  })
  const press = (key: string) => {
    const { event, preventDefault } = keyEvent(key)
    act(() => hook.result.current.handleKeyDown(event))
    return preventDefault
  }
  const type = (value: string) => act(() => hook.result.current.handleInputChange(typed(value)))
  return { ...hook, press, type }
}

describe('useSmartSelect', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('debounced search', () => {
    it('opens the list and searches once with the last text after 300 ms', () => {
      vi.useFakeTimers()
      const onSearch = vi.fn()
      const { result, type } = setup({ onSearch })

      type('a')
      act(() => vi.advanceTimersByTime(100))
      type('an')
      expect(result.current.inputValue).toBe('an')
      expect(result.current.isOpen).toBe(true)

      act(() => vi.advanceTimersByTime(299))
      expect(onSearch).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(onSearch).toHaveBeenCalledTimes(1)
      expect(onSearch).toHaveBeenCalledWith('an')
    })

    it('honours a custom delay', () => {
      vi.useFakeTimers()
      const onSearch = vi.fn()
      const { type } = setup({ onSearch, debounceMs: 50 })

      type('bình')
      act(() => vi.advanceTimersByTime(49))
      expect(onSearch).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(onSearch).toHaveBeenCalledWith('bình')
    })

    it('does not search after unmounting', () => {
      vi.useFakeTimers()
      const onSearch = vi.fn()
      const { type, unmount } = setup({ onSearch })

      type('an')
      unmount()
      act(() => vi.advanceTimersByTime(1000))

      expect(onSearch).not.toHaveBeenCalled()
    })

    it('drops the highlighted option when the text changes', () => {
      const { result, press, type } = setup()
      press('ArrowDown')
      press('ArrowDown')
      expect(result.current.activeIndex).toBe(0)

      type('HCM')

      expect(result.current.activeIndex).toBe(-1)
    })
  })

  describe('keyboard navigation', () => {
    it('opens a closed list on ArrowDown without highlighting, then moves down and stops at the last option', () => {
      const { result, press } = setup()

      const preventDefault = press('ArrowDown')
      expect(preventDefault).toHaveBeenCalled()
      expect(result.current.isOpen).toBe(true)
      expect(result.current.activeIndex).toBe(-1)

      press('ArrowDown')
      expect(result.current.activeIndex).toBe(0)
      press('ArrowDown')
      press('ArrowDown')
      expect(result.current.activeIndex).toBe(2)
      press('ArrowDown')
      expect(result.current.activeIndex).toBe(2)
    })

    it('moves up on ArrowUp and stops at the first option', () => {
      const { result, press } = setup()
      press('ArrowDown')
      press('ArrowDown')
      press('ArrowDown')
      expect(result.current.activeIndex).toBe(1)

      expect(press('ArrowUp')).toHaveBeenCalled()
      expect(result.current.activeIndex).toBe(0)
      press('ArrowUp')
      expect(result.current.activeIndex).toBe(0)
    })

    it('selects the highlighted option on Enter, then closes and empties the search', () => {
      const onChange = vi.fn()
      const { result, press, type } = setup({ onChange })
      type('HCM')
      press('ArrowDown')
      press('ArrowDown')

      expect(press('Enter')).toHaveBeenCalled()

      expect(onChange).toHaveBeenCalledWith('2', OPTIONS[1])
      expect(result.current.isOpen).toBe(false)
      expect(result.current.inputValue).toBe('')
      expect(result.current.activeIndex).toBe(-1)
    })

    it('selects nothing on Enter without a highlighted option', () => {
      const onChange = vi.fn()
      const { result, press } = setup({ onChange })
      press('ArrowDown')

      press('Enter')

      expect(onChange).not.toHaveBeenCalled()
      expect(result.current.isOpen).toBe(true)
    })

    it('selects with the latest onChange of the caller', () => {
      const first = vi.fn()
      const latest = vi.fn()
      const { rerender, result, press } = setup({ onChange: first })
      act(() => result.current.handleInputFocus())

      rerender({ options: OPTIONS, onChange: latest })
      press('ArrowDown')
      press('Enter')

      expect(latest).toHaveBeenCalledWith('1', OPTIONS[0])
      expect(first).not.toHaveBeenCalled()
    })

    it('closes on Escape', () => {
      const { result, press } = setup()
      press('ArrowDown')
      press('ArrowDown')

      expect(press('Escape')).toHaveBeenCalled()

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIndex).toBe(-1)
    })

    it('closes on Tab without keeping the focus from moving on', () => {
      const { result, press } = setup()
      press('ArrowDown')
      press('ArrowDown')

      expect(press('Tab')).not.toHaveBeenCalled()

      expect(result.current.isOpen).toBe(false)
      expect(result.current.activeIndex).toBe(-1)
    })

    it('ignores keys and focus while disabled', () => {
      const { result, press } = setup({ disabled: true })

      press('ArrowDown')
      act(() => result.current.handleInputFocus())

      expect(result.current.isOpen).toBe(false)
    })
  })

  describe('selection', () => {
    it('lists enabled options plus the selected one, and derives the selected option from the value', () => {
      const options: SmartSelectOption[] = [
        { id: '1', label: 'Đang hoạt động' },
        { id: '2', label: 'Ngừng hoạt động', disabled: true },
        { id: '3', label: 'Đã chọn', disabled: true },
      ]
      const { result, rerender } = setup({ options, value: '3' })

      expect(result.current.filteredOptions.map((o) => o.id)).toEqual(['1', '3'])
      expect(result.current.selectedOption).toEqual(options[2])

      rerender({ options, value: 'khong-co' })
      expect(result.current.selectedOption).toBeNull()
    })

    it('selects a clicked option and ignores a disabled one', () => {
      const onChange = vi.fn()
      const { result, type } = setup({ onChange })
      type('HCM')

      act(() => result.current.handleOptionClick({ id: '9', label: 'Không chọn được', disabled: true }))
      expect(onChange).not.toHaveBeenCalled()
      expect(result.current.isOpen).toBe(true)

      act(() => result.current.handleOptionClick(OPTIONS[2]))
      expect(onChange).toHaveBeenCalledWith('3', OPTIONS[2])
      expect(result.current.isOpen).toBe(false)
      expect(result.current.inputValue).toBe('')
    })

    it('selects a clicked option with the latest onChange of the caller', () => {
      const first = vi.fn()
      const latest = vi.fn()
      const { rerender, result } = setup({ onChange: first })

      rerender({ options: OPTIONS, onChange: latest })
      act(() => result.current.handleOptionClick(OPTIONS[0]))

      expect(latest).toHaveBeenCalledWith('1', OPTIONS[0])
      expect(first).not.toHaveBeenCalled()
    })

    it('drops the highlighted option when the options change', () => {
      const { result, rerender, press } = setup()
      press('ArrowDown')
      press('ArrowDown')
      expect(result.current.activeIndex).toBe(0)

      rerender({ options: [...OPTIONS] })

      expect(result.current.activeIndex).toBe(-1)
    })
  })

  it('clears the search and tells the caller', () => {
    const onClear = vi.fn()
    const { result, press, type } = setup({ onClear })
    type('HCM')
    press('ArrowDown')

    act(() => result.current.handleClear())

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(result.current.inputValue).toBe('')
    expect(result.current.isOpen).toBe(false)
    expect(result.current.activeIndex).toBe(-1)
  })

  it('closes 150 ms after the input loses focus', () => {
    vi.useFakeTimers()
    const { result } = setup()
    act(() => result.current.handleInputFocus())
    expect(result.current.isOpen).toBe(true)

    act(() => result.current.handleInputBlur())
    act(() => vi.advanceTimersByTime(149))
    expect(result.current.isOpen).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.isOpen).toBe(false)
  })
})

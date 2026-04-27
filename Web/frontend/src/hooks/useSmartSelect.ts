// US-SS-01..04: useSmartSelect — core state machine for SmartSelect component
// Manages: open/close, keyboard nav, debounced search, selection, clear
import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import type { KeyboardEvent } from 'react'
import type { SmartSelectOption } from '@/types'

export interface UseSmartSelectOptions {
  /** Unique field name — used for data-testid attributes */
  name: string
  /** Controlled value (selected option id) */
  value?: string
  /** Called when user selects an option */
  onChange?: (id: string, option: SmartSelectOption) => void
  /** Called when user clears selection */
  onClear?: () => void
  /** Options list (static or from remote) */
  options: SmartSelectOption[]
  /** Loading state from parent (API fetching) */
  isLoading?: boolean
  /** Whether the select is disabled */
  disabled?: boolean
  /** Debounce delay in ms (default 300) */
  debounceMs?: number
  /** Called when the search text changes (after debounce) */
  onSearch?: (q: string) => void
}

export interface UseSmartSelectReturn {
  // State
  isOpen: boolean
  inputValue: string
  activeIndex: number
  selectedOption: SmartSelectOption | null
  // Handlers
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  handleOptionClick: (option: SmartSelectOption) => void
  handleClear: () => void
  handleInputFocus: () => void
  handleInputBlur: () => void
  // Refs
  containerRef: React.RefObject<HTMLDivElement>
  inputRef: React.RefObject<HTMLInputElement>
  listRef: React.RefObject<HTMLUListElement>
  // F2: individual option refs for O(1) scroll-into-view (replaces querySelectorAll)
  optionRefs: React.MutableRefObject<(HTMLElement | null)[]>
  // Derived
  filteredOptions: SmartSelectOption[]
}

export function useSmartSelect({
  // name param used for testid prefix in the component, not in the hook
  name: _name, // eslint-disable-line @typescript-eslint/no-unused-vars
  value,
  onChange,
  onClear,
  options,
  isLoading: _isLoading = false, // eslint-disable-line @typescript-eslint/no-unused-vars
  disabled = false,
  debounceMs = 300,
  onSearch,
}: UseSmartSelectOptions): UseSmartSelectReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  // F10: keep state for rendering the active highlight, sync with ref to avoid
  //       including activeIndex in handleKeyDown's dependency array
  const [activeIndex, setActiveIndex] = useState(-1)
  const activeIndexRef = useRef(-1)

  const containerRef = useRef<HTMLDivElement>(null!)
  const inputRef = useRef<HTMLInputElement>(null!)
  const listRef = useRef<HTMLUListElement>(null!)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // F3: store blur-delay timer ID so it can be cleared on unmount
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMouseDownOnList = useRef(false)
  // F2: individual refs per option — avoids querySelectorAll on every arrow key
  const optionRefs = useRef<(HTMLElement | null)[]>([])

  // F10: helper that keeps state + ref in sync
  const updateActiveIndex = useCallback((val: number) => {
    activeIndexRef.current = val
    setActiveIndex(val)
  }, [])

  // US-SS-01 AC-3: Derive selected option from value + options list
  const selectedOption = value
    ? (options.find((o) => o.id === value) ?? null)
    : null

  // F11: keep filteredOptions in a ref so handleKeyDown can read it without
  //       being listed as a dependency (new array reference every render otherwise)
  const filteredOptions = options.filter((o) => !o.disabled || o.id === value)
  const filteredOptionsRef = useRef<SmartSelectOption[]>(filteredOptions)
  filteredOptionsRef.current = filteredOptions

  // US-SS-03 AC-4: Reset active index when options change
  useEffect(() => {
    updateActiveIndex(-1)
    // Reset option refs array length to match new options list
    optionRefs.current = []
  }, [options, updateActiveIndex])

  // US-SS-04 AC-3: Click outside → close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        updateActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [updateActiveIndex])

  // F3: cleanup both timers on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [])

  // Debounced search handler
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value
      setInputValue(q)
      setIsOpen(true)
      updateActiveIndex(-1)

      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        onSearch?.(q)
      }, debounceMs)
    },
    [debounceMs, onSearch, updateActiveIndex],
  )

  // US-SS-03: Keyboard navigation
  // F10+F11: reads activeIndexRef + filteredOptionsRef instead of state/derived values
  //          so this callback only re-creates when disabled or isOpen changes
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (!isOpen) {
            setIsOpen(true)
            return
          }
          updateActiveIndex(
            activeIndexRef.current < filteredOptionsRef.current.length - 1
              ? activeIndexRef.current + 1
              : activeIndexRef.current,
          )
          break

        case 'ArrowUp':
          e.preventDefault()
          updateActiveIndex(activeIndexRef.current > 0 ? activeIndexRef.current - 1 : 0)
          break

        case 'Enter': {
          e.preventDefault()
          const idx = activeIndexRef.current
          const opts = filteredOptionsRef.current
          if (isOpen && idx >= 0 && opts[idx]) {
            handleOptionSelect(opts[idx])
          }
          break
        }

        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          updateActiveIndex(-1)
          inputRef.current?.blur()
          break

        case 'Tab':
          setIsOpen(false)
          updateActiveIndex(-1)
          break
      }
    },
    // F10+F11: deps collapse from [disabled, isOpen, activeIndex, filteredOptions] → [disabled, isOpen]
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, isOpen, updateActiveIndex],
  )

  function handleOptionSelect(option: SmartSelectOption) {
    if (option.disabled) return
    setIsOpen(false)
    setInputValue('')
    updateActiveIndex(-1)
    onChange?.(option.id, option)
  }

  const handleOptionClick = useCallback((option: SmartSelectOption) => {
    handleOptionSelect(option)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange])

  const handleClear = useCallback(() => {
    setInputValue('')
    updateActiveIndex(-1)
    setIsOpen(false)
    onClear?.()
    inputRef.current?.focus()
  }, [onClear, updateActiveIndex])

  const handleInputFocus = useCallback(() => {
    if (!disabled) {
      setIsOpen(true)
    }
  }, [disabled])

  const handleInputBlur = useCallback(() => {
    // F3: store timer ID so it can be cancelled on unmount or re-blur
    if (!isMouseDownOnList.current) {
      blurTimerRef.current = setTimeout(() => {
        setIsOpen(false)
        updateActiveIndex(-1)
      }, 150)
    }
    isMouseDownOnList.current = false
  }, [updateActiveIndex])

  // F2: scroll active option into view using direct ref access — O(1), no DOM scan
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    const target = optionRefs.current[activeIndex]
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, isOpen])

  return {
    isOpen,
    inputValue,
    activeIndex,
    selectedOption,
    handleInputChange,
    handleKeyDown,
    handleOptionClick,
    handleClear,
    handleInputFocus,
    handleInputBlur,
    containerRef,
    inputRef,
    listRef,
    optionRefs,
    filteredOptions,
  }
}

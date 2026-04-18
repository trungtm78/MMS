// US-SS-01..05: SmartSelect — FK lookup component (Odoo-style many2one)
// Features: debounced search, keyboard nav, mouse interaction, click-outside,
//           quick-create inline modal, unaccent backend search
import { useState, useCallback, ReactNode, useId } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, ChevronDown, Loader2, Search, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSmartSelect } from '@/hooks/useSmartSelect'
import type { SmartSelectOption } from '@/types'
import { Button } from './Button'

export interface SmartSelectProps {
  /** Unique field name — prefixes all data-testid attributes */
  name: string
  /** Label shown above the component */
  label?: string
  /** Placeholder text for the search input */
  placeholder?: string
  /** Controlled selected option id */
  value?: string
  /** Callback when selection changes */
  onChange?: (id: string, option: SmartSelectOption) => void
  /** Callback when selection is cleared */
  onClear?: () => void
  /** Options returned by search (set by parent from API/local) */
  options: SmartSelectOption[]
  /** True while API is fetching */
  isLoading?: boolean
  /** Error state for form validation */
  error?: boolean
  /** Error message to display */
  errorMessage?: string
  /** Whether field is required */
  required?: boolean
  /** Whether the field is disabled */
  disabled?: boolean
  /** Called with raw query string (debounced) — parent fetches and sets options */
  onSearch?: (q: string) => void
  /** If provided, "Tạo mới" button appears in empty state and opens this modal */
  createModal?: {
    title: string
    content: ReactNode
    onSubmit: () => Promise<SmartSelectOption | null>
  }
  /** Additional CSS class */
  className?: string
}

export function SmartSelect({
  name,
  label,
  placeholder = 'Tìm kiếm...',
  value,
  onChange,
  onClear,
  options,
  isLoading = false,
  error = false,
  errorMessage,
  required = false,
  disabled = false,
  onSearch,
  createModal,
  className,
}: SmartSelectProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSubmitting, setModalSubmitting] = useState(false)
  const labelId = useId()

  const {
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
  } = useSmartSelect({
    name,
    value,
    onChange,
    onClear,
    options,
    isLoading,
    disabled,
    onSearch,
  })

  const showDropdown = isOpen && !selectedOption
  const showEmpty = showDropdown && !isLoading && filteredOptions.length === 0 && inputValue.length > 0
  const showResults = showDropdown && !isLoading && filteredOptions.length > 0
  const showInitialHint = showDropdown && !isLoading && filteredOptions.length === 0 && !inputValue
  // US-SS-03 AC-9: partial results (<5) → show results AND create button simultaneously
  const showPartialCreate = showResults && createModal && filteredOptions.length < 5 && inputValue.length > 0

  // F12: memoize so the Button receives a stable reference across renders
  const handleModalSubmit = useCallback(async () => {
    if (!createModal) return
    setModalSubmitting(true)
    try {
      const newOption = await createModal.onSubmit()
      if (newOption) {
        onChange?.(newOption.id, newOption)
        setModalOpen(false)
      }
    } finally {
      setModalSubmitting(false)
    }
  }, [createModal, onChange])

  return (
    <div
      ref={containerRef}
      data-testid={`smart-select-${name}`}
      className={cn('relative flex flex-col gap-1', className)}
    >
      {/* Label */}
      {label && (
        <label
          id={labelId}
          htmlFor={`smart-select-${name}-input`}
          className="text-sm font-medium text-slate-700"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Selected display OR search input */}
      {selectedOption ? (
        // US-SS-01 AC-2: Show selected chip
        <div
          data-testid={`smart-select-${name}-selected`}
          className={cn(
            'flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2',
            'bg-blue-50 text-sm text-slate-800',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <span className="flex-1 truncate">{selectedOption.label}</span>
          {!disabled && (
            <button
              type="button"
              data-testid={`smart-select-${name}-clear`}
              onClick={handleClear}
              aria-label="Xoá lựa chọn"
              className="text-slate-400 hover:text-slate-600 focus:outline-none flex-shrink-0"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        // US-SS-02: Search input
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <Search size={14} className="text-slate-400" />
          </div>
          <input
            ref={inputRef}
            id={`smart-select-${name}-input`}
            data-testid={`smart-select-${name}-input`}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={isOpen ? `smart-select-${name}-dropdown` : undefined}
            aria-activedescendant={
              activeIndex >= 0 ? `smart-select-${name}-option-${filteredOptions[activeIndex]?.id}` : undefined
            }
            aria-labelledby={label ? labelId : undefined}
            aria-required={required}
            aria-invalid={error}
            disabled={disabled}
            placeholder={placeholder}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className={cn(
              'w-full rounded-md border pl-8 pr-8 py-2 text-sm text-slate-800 placeholder-slate-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
              'disabled:bg-slate-50 disabled:cursor-not-allowed',
              error
                ? 'border-red-400 focus:ring-red-400'
                : 'border-slate-300',
            )}
            autoComplete="off"
          />
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            {isLoading
              ? <Loader2 size={14} className="text-blue-500 animate-spin" aria-hidden="true" />
              : <ChevronDown size={14} className="text-slate-400" />
            }
          </div>
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <ul
          id={`smart-select-${name}-dropdown`}
          data-testid={`smart-select-${name}-dropdown`}
          ref={listRef}
          role="listbox"
          aria-label={label ?? 'Tuỳ chọn'}
          className={cn(
            'absolute z-50 top-full mt-1 w-full rounded-md border border-slate-200',
            'bg-white shadow-lg max-h-60 overflow-y-auto',
          )}
          onMouseDown={() => { /* prevent blur */ }}
        >
          {/* Loading skeleton */}
          {isLoading && (
            <li
              data-testid={`smart-select-${name}-loading`}
              className="px-3 py-2 text-sm text-slate-400 flex items-center gap-2"
            >
              <Loader2 size={14} className="animate-spin" />
              Đang tìm kiếm...
            </li>
          )}

          {/* Initial hint */}
          {showInitialHint && (
            <li className="px-3 py-2 text-sm text-slate-400">
              Nhập để tìm kiếm...
            </li>
          )}

          {/* Results */}
          {showResults &&
            filteredOptions.map((opt, idx) => {
              const isActive = idx === activeIndex
              return (
                <li
                  key={opt.id}
                  // F2: individual ref per option — O(1) scroll-into-view in useSmartSelect
                  ref={(el) => { optionRefs.current[idx] = el }}
                  id={`smart-select-${name}-option-${opt.id}`}
                  data-testid={
                    isActive
                      ? `smart-select-${name}-option-active`
                      : `smart-select-${name}-option-${opt.id}`
                  }
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={opt.disabled}
                  onClick={() => !opt.disabled && handleOptionClick(opt)}
                  onMouseDown={(e) => { e.preventDefault() }} // prevent blur before click
                  className={cn(
                    'px-3 py-2 cursor-pointer select-none',
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-800 hover:bg-slate-50',
                    opt.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-xs text-slate-500 mt-0.5">{opt.sublabel}</div>
                  )}
                </li>
              )
            })
          }

          {/* US-SS-03 AC-9: partial results + create button shown together */}
          {showPartialCreate && (
            <li
              className="px-3 py-1 border-t border-slate-100"
              onMouseDown={(e) => { e.preventDefault() }}
            >
              <button
                type="button"
                data-testid={`smart-select-${name}-create-btn`}
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium py-1"
              >
                <PlusCircle size={12} />
                Tạo mới &quot;{inputValue}&quot;
              </button>
            </li>
          )}

          {/* Empty state */}
          {showEmpty && (
            <li
              data-testid={`smart-select-${name}-empty`}
              className="px-3 py-2 text-sm text-slate-500"
            >
              <span>Không tìm thấy kết quả cho &quot;{inputValue}&quot;</span>
              {createModal && (
                <button
                  type="button"
                  data-testid={`smart-select-${name}-create-btn`}
                  onClick={() => setModalOpen(true)}
                  className="mt-1 flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
                >
                  <PlusCircle size={12} />
                  Tạo mới &quot;{inputValue}&quot;
                </button>
              )}
            </li>
          )}
        </ul>
      )}

      {/* Error message */}
      {error && errorMessage && (
        <p
          data-testid={`smart-select-${name}-error`}
          role="alert"
          className="text-xs text-red-500"
        >
          {errorMessage}
        </p>
      )}

      {/* US-SS-05: Quick-create modal */}
      {createModal && (
        <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
            <Dialog.Content
              data-testid={`smart-select-${name}-modal`}
              className={cn(
                'fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                'bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4',
              )}
              aria-describedby={undefined}
            >
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-lg font-semibold text-slate-800">
                  {createModal.title}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Đóng"
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </Dialog.Close>
              </div>

              <div>{createModal.content}</div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  data-testid={`smart-select-${name}-modal-cancel`}
                  onClick={() => setModalOpen(false)}
                >
                  Huỷ
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={modalSubmitting}
                  data-testid={`smart-select-${name}-modal-submit`}
                  onClick={handleModalSubmit}
                >
                  Tạo mới
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  )
}

// Phase 2: Unit tests for utility functions
import { describe, test, expect } from 'vitest'
import { cn, formatDate, formatDateTime, formatMonth } from './utils'

describe('cn (className utility)', () => {
  test('test_utility_happy_merges_classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  test('test_utility_happy_resolves_tailwind_conflict', () => {
    // twMerge should resolve conflicting classes
    const result = cn('px-2', 'px-4')
    expect(result).toBe('px-4')
  })

  test('test_utility_happy_ignores_falsy_values', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar')
  })

  test('test_utility_boundary_empty_input', () => {
    expect(cn()).toBe('')
  })

  test('test_utility_boundary_single_class', () => {
    expect(cn('only')).toBe('only')
  })
})

describe('formatDate', () => {
  test('test_utility_happy_formats_iso_date', () => {
    const result = formatDate('2026-03-08T00:00:00.000Z')
    // Should be a valid Vietnamese date string
    expect(result).toMatch(/\d+\/\d+\/\d+/)
  })

  test('test_utility_boundary_start_of_month', () => {
    const result = formatDate('2026-01-01T00:00:00.000Z')
    expect(result).toBeTruthy()
  })
})

describe('formatDateTime', () => {
  test('test_utility_happy_formats_datetime', () => {
    const result = formatDateTime('2026-03-08T14:30:00.000Z')
    expect(result).toMatch(/\d/)
  })
})

describe('formatMonth', () => {
  test('test_utility_happy_formats_month_year', () => {
    expect(formatMonth(3, 2026)).toBe('Tháng 3/2026')
  })

  test('test_utility_boundary_month_1', () => {
    expect(formatMonth(1, 2026)).toBe('Tháng 1/2026')
  })

  test('test_utility_boundary_month_12', () => {
    expect(formatMonth(12, 2026)).toBe('Tháng 12/2026')
  })
})

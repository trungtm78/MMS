// Unit tests for search.ts — US-SS-02: Client-side search utilities
import { describe, it, expect } from 'vitest'
import { normalizeVi, toAcronym, rankStaticOptions } from './search'
import type { SmartSelectOption } from '@/types'

describe('normalizeVi', () => {
  it('lowercases ASCII text', () => {
    expect(normalizeVi('Hello')).toBe('hello')
  })

  it('removes Vietnamese diacritics', () => {
    expect(normalizeVi('Nguyễn')).toBe('nguyen')
    expect(normalizeVi('Đà Nẵng')).toBe('da nang')
    expect(normalizeVi('Phú Định')).toBe('phu dinh')
  })

  it('handles đ/Đ specifically', () => {
    expect(normalizeVi('Đại học')).toBe('dai hoc')
    expect(normalizeVi('đường')).toBe('duong')
  })

  it('trims whitespace', () => {
    expect(normalizeVi('  An  ')).toBe('an')
  })

  it('handles empty string', () => {
    expect(normalizeVi('')).toBe('')
  })

  it('handles compound Vietnamese name', () => {
    expect(normalizeVi('Nguyễn Văn An')).toBe('nguyen van an')
  })

  it('handles ổ, ờ, ụ etc.', () => {
    expect(normalizeVi('Tổ dân phố')).toBe('to dan pho')
    expect(normalizeVi('Trần Thị Bình')).toBe('tran thi binh')
  })
})

describe('toAcronym', () => {
  it('creates acronym from first letters', () => {
    expect(toAcronym('Nguyễn Văn An')).toBe('nva')
  })

  it('handles single word', () => {
    expect(toAcronym('Admin')).toBe('a')
  })

  it('handles mixed Vietnamese + code', () => {
    expect(toAcronym('Khu Phố 1')).toBe('kp1')
  })

  it('handles empty string', () => {
    expect(toAcronym('')).toBe('')
  })

  it('collapses multiple spaces', () => {
    expect(toAcronym('  Trần   Thị  Bình  ')).toBe('ttb')
  })
})

describe('rankStaticOptions', () => {
  const options: SmartSelectOption[] = [
    { id: '1', label: 'Nguyễn Văn An' },
    { id: '2', label: 'Nguyễn Thị Bình' },
    { id: '3', label: 'Trần Văn Cường' },
    { id: '4', label: 'HCM-PHD-T12-0001 — Lê Thị Dung' },
    { id: '5', label: 'Khu Phố 1' },
  ]

  it('returns all options for empty query', () => {
    const result = rankStaticOptions(options, '')
    expect(result).toHaveLength(5)
  })

  it('filters by unaccented Vietnamese name', () => {
    const result = rankStaticOptions(options, 'nguyen')
    expect(result.map((r) => r.id)).toContain('1')
    expect(result.map((r) => r.id)).toContain('2')
    expect(result.map((r) => r.id)).not.toContain('3')
  })

  it('exact match ranks first (rank=0)', () => {
    const result = rankStaticOptions(options, 'Nguyễn Văn An')
    expect(result[0].id).toBe('1')
  })

  it('prefix match ranks above contains match', () => {
    const localOptions: SmartSelectOption[] = [
      { id: 'a', label: 'contains nguyen middle' },
      { id: 'b', label: 'nguyen starts here' },
    ]
    const result = rankStaticOptions(localOptions, 'nguyen')
    expect(result[0].id).toBe('b')
  })

  it('acronym match for "nva" → Nguyễn Văn An', () => {
    const result = rankStaticOptions(options, 'nva')
    expect(result.map((r) => r.id)).toContain('1')
  })

  it('acronym "kp1" → Khu Phố 1', () => {
    const result = rankStaticOptions(options, 'kp1')
    expect(result.map((r) => r.id)).toContain('5')
  })

  it('code search — HCM matches code-prefixed label', () => {
    const result = rankStaticOptions(options, 'HCM')
    expect(result.map((r) => r.id)).toContain('4')
  })

  it('returns empty for no match', () => {
    const result = rankStaticOptions(options, 'zzz-no-match')
    expect(result).toHaveLength(0)
  })

  it('sort order is stable for equal rank', () => {
    // Both "Nguyễn Văn An" and "Nguyễn Thị Bình" start with "nguyen" → rank 1
    const result = rankStaticOptions(options, 'nguyen')
    // "Nguyễn Thị Bình" < "Nguyễn Văn An" alphabetically in Vietnamese
    const ids = result.map((r) => r.id)
    expect(ids.indexOf('2')).toBeLessThan(ids.indexOf('1'))
  })
})

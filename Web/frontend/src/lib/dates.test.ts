import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  calendarDaysBetween,
  dayOfMonth,
  firstDayOfMonthInVietnam,
  firstDayOfYearInVietnam,
  formatCalendarDate,
  isCalendarDate,
  lastDayOfMonthInVietnam,
  todayInVietnam,
} from './dates'

// A timezone behind UTC: `new Date('2026-01-10')` would read as 9 January here
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

describe('isCalendarDate', () => {
  it('accepts real YYYY-MM-DD days only', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true)
    expect(isCalendarDate('2024-02-29')).toBe(true)
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-9-14')).toBe(false)
    expect(isCalendarDate('2026-09-14T00:00:00Z')).toBe(false)
    expect(isCalendarDate(null)).toBe(false)
  })
})

describe('formatCalendarDate', () => {
  it('shows a DATE column as the same calendar day in any browser timezone', () => {
    expect(new Date('2026-01-10').getDate()).toBe(9) // the bug this helper avoids
    expect(formatCalendarDate('2026-01-10')).toBe('10/01/2026')
    expect(formatCalendarDate('1990-05-15')).toBe('15/05/1990')
  })

  it('shows a timestamp as its Vietnamese calendar day', () => {
    // 01:30 on 14 September in Hà Nội
    expect(formatCalendarDate('2026-09-13T18:30:00.000Z')).toBe('14/09/2026')
  })

  it('shows a dash for a missing or unreadable value', () => {
    expect(formatCalendarDate(null)).toBe('—')
    expect(formatCalendarDate(undefined)).toBe('—')
    expect(formatCalendarDate('')).toBe('—')
    expect(formatCalendarDate('không phải ngày')).toBe('—')
  })
})

describe('todayInVietnam', () => {
  it('returns the Vietnamese calendar day, not the UTC one', () => {
    expect(todayInVietnam(new Date('2026-09-13T16:59:59.000Z'))).toBe('2026-09-13')
    expect(todayInVietnam(new Date('2026-09-13T17:00:00.000Z'))).toBe('2026-09-14')
  })
})

describe('month and year boundaries in Vietnam', () => {
  it('gives the first and last day of the current Vietnamese month', () => {
    // 01:00 on 1 September in Hà Nội, still 31 August in UTC and in Los Angeles
    const now = new Date('2026-08-31T18:00:00.000Z')
    expect(firstDayOfMonthInVietnam(now)).toBe('2026-09-01')
    expect(lastDayOfMonthInVietnam(now)).toBe('2026-09-30')
  })

  it('knows the length of February in a leap year', () => {
    const now = new Date('2024-02-10T05:00:00.000Z')
    expect(firstDayOfMonthInVietnam(now)).toBe('2024-02-01')
    expect(lastDayOfMonthInVietnam(now)).toBe('2024-02-29')
  })

  it('gives the first day of the current Vietnamese year', () => {
    // 00:30 on 1 January 2026 in Hà Nội
    expect(firstDayOfYearInVietnam(new Date('2025-12-31T17:30:00.000Z'))).toBe('2026-01-01')
  })
})

describe('calendarDaysBetween', () => {
  it('counts whole calendar days without a timezone shift', () => {
    expect(calendarDaysBetween('2026-09-14', '2026-10-14')).toBe(30)
    expect(calendarDaysBetween('2026-09-14', '2026-09-13')).toBe(-1)
    expect(calendarDaysBetween('2024-02-28', '2024-03-01')).toBe(2)
  })

  it('gives a plain zero, never -0, for the same day', () => {
    expect(Object.is(calendarDaysBetween('2026-09-14', '2026-09-14'), 0)).toBe(true)
  })

  it('refuses a value that is not a calendar date', () => {
    expect(calendarDaysBetween('2026-09-14', '2026-09-14T00:00:00Z')).toBeNaN()
  })
})

describe('dayOfMonth', () => {
  it('reads the day from the calendar date without a timezone shift', () => {
    expect(dayOfMonth('2026-04-01')).toBe(1)
    expect(dayOfMonth('2026-04-30')).toBe(30)
  })
})

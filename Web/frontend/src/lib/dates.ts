// Calendar dates. DATE columns (leave from/to, attendance work_date, training dates, date of
// birth…) arrive as 'YYYY-MM-DD' and mean that exact day: building a Date from them would move
// the day in browsers behind UTC. Timestamps are shown as their day in Vietnam, where the ward
// operates and where the backend draws its business days.

export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh'

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const vietnamDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIETNAM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** A real calendar day written YYYY-MM-DD (mirrors isIsoDate in the backend business-date.ts) */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = CALENDAR_DATE.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function vietnamIsoDate(date: Date): string {
  const parts: Record<string, string> = {}
  for (const part of vietnamDayFormat.formatToParts(date)) parts[part.type] = part.value
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** DD/MM/YYYY for a calendar date (as is) or a timestamp (its Vietnamese day) */
export function formatCalendarDate(value: string | null | undefined, empty = '—'): string {
  if (!value) return empty
  let iso: string | null = isCalendarDate(value) ? value : null
  if (!iso) {
    const date = new Date(value)
    iso = isNaN(date.getTime()) ? null : vietnamIsoDate(date)
  }
  if (!iso) return empty
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** Today's Vietnamese calendar day as YYYY-MM-DD (not the UTC day of toISOString) */
export function todayInVietnam(now: Date = new Date()): string {
  return vietnamIsoDate(now)
}

/** First day (YYYY-MM-DD) of the Vietnamese month that contains `now` */
export function firstDayOfMonthInVietnam(now: Date = new Date()): string {
  return `${todayInVietnam(now).slice(0, 7)}-01`
}

/** Last day (YYYY-MM-DD) of the Vietnamese month that contains `now` */
export function lastDayOfMonthInVietnam(now: Date = new Date()): string {
  const [year, month] = todayInVietnam(now).split('-').map(Number)
  // Day 0 of the next month is the last day of this one; UTC keeps the arithmetic zone-free
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${todayInVietnam(now).slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
}

/** First day (YYYY-MM-DD) of the Vietnamese year that contains `now` */
export function firstDayOfYearInVietnam(now: Date = new Date()): string {
  return `${todayInVietnam(now).slice(0, 4)}-01-01`
}

const DAY_MS = 86_400_000

function utcDayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * Whole calendar days from one YYYY-MM-DD date to another: negative when `to` is earlier, 0 (never
 * -0) on the same day, NaN when either value is not a calendar date. No timezone is involved.
 */
export function calendarDaysBetween(from: string, to: string): number {
  if (!isCalendarDate(from) || !isCalendarDate(to)) return NaN
  const days = Math.round((utcDayOf(to) - utcDayOf(from)) / DAY_MS)
  return days === 0 ? 0 : days
}

/** Day of the month of a YYYY-MM-DD date, without a timezone conversion */
export function dayOfMonth(date: string): number {
  const match = CALENDAR_DATE.exec(date)
  return match ? Number(match[3]) : NaN
}

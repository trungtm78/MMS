// Timestamps shown as the time and day in Vietnam (HH:mm DD/MM/YYYY), where the ward operates,
// whatever the time zone of the browser
import { VIETNAM_TIME_ZONE, formatCalendarDate } from './dates'

const vietnamTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: VIETNAM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** HH:mm DD/MM/YYYY in Vietnam for a timestamp; `empty` when there is none or it is not a date */
export function formatVietnamDateTime(value: string | null | undefined, empty = '—'): string {
  if (!value) return empty
  const date = new Date(value)
  if (isNaN(date.getTime())) return empty
  return `${vietnamTimeFormat.format(date)} ${formatCalendarDate(value, empty)}`
}

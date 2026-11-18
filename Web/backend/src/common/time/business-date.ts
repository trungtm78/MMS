// The ward works on Vietnamese calendar days while servers run on UTC, so "today"
// and "this month" must be taken in the business timezone, never from the host clock.
export const BUSINESS_TZ = 'Asia/Ho_Chi_Minh';

// Today's date in the business timezone, for SQL
export const BUSINESS_TODAY_SQL = `(now() AT TIME ZONE '${BUSINESS_TZ}')::date`;

export interface BusinessDate {
  year: number;
  month: number;
  day: number;
  isoDate: string; // YYYY-MM-DD
}

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Calendar arithmetic on a YYYY-MM-DD date, independent of any timezone. */
export function shiftIsoDate(isoDate: string, days: number): string {
  if (!isIsoDate(isoDate)) {
    throw new Error(
      `Expected a YYYY-MM-DD date, got ${JSON.stringify(isoDate)}`,
    );
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// Instants bounding a business day given as a SQL date expression, e.g. a bind parameter:
// created_at >= businessDayStartSql('$1') AND created_at < businessDayEndSql('$2')
export const businessDayStartSql = (dateSql: string) =>
  `(${dateSql}::date::timestamp AT TIME ZONE '${BUSINESS_TZ}')`;
export const businessDayEndSql = (dateSql: string) =>
  `((${dateSql}::date + 1)::timestamp AT TIME ZONE '${BUSINESS_TZ}')`;

export function businessDate(now: Date = new Date()): BusinessDate {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(now))
    parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

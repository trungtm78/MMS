import { BadRequestException } from '@nestjs/common';
import { shiftIsoDate } from '../time/business-date';

/** Refuses a from/to filter (YYYY-MM-DD) whose end falls before its start. */
export function assertDateRange(from?: string, to?: string): void {
  // YYYY-MM-DD strings compare in calendar order
  if (from && to && from > to) {
    throw new BadRequestException('invalid_date_range');
  }
}

const DAY_MS = 86_400_000;

const utcDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

/** Calendar days from `from` to `to` (YYYY-MM-DD), both included. */
export function inclusiveDays(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS) + 1;
}

/**
 * Refuses an unordered range, or one spanning more than `maxDays` calendar days, so a
 * report or grid built day by day stays bounded whatever the client asks for.
 */
export function assertBoundedDateRange(
  from: string,
  to: string,
  maxDays: number,
): void {
  assertDateRange(from, to);
  if (inclusiveDays(from, to) > maxDays) {
    throw new BadRequestException('date_range_too_long');
  }
}

/** First and last calendar day of a month. */
export function monthRange(
  year: number,
  month: number,
): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/** Every calendar day from `from` to `to` in order; empty when the range is unordered. */
export function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = from; day <= to; day = shiftIsoDate(day, 1)) dates.push(day);
  return dates;
}

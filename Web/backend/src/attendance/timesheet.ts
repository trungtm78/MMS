// Timesheet (bảng chấm công): a day-by-day grid per militia member with totals by status,
// assembled from attendance records and approved leave.
import { BadRequestException } from '@nestjs/common';
import type { YearMonth } from '../common/pipes/query-pipes';
import {
  assertBoundedDateRange,
  monthRange,
} from '../common/validation/date-range';

// A grid is members x days: two consecutive long months at most
export const TIMESHEET_MAX_DAYS = 62;

export type TimesheetDayStatus =
  | 'present'
  | 'late'
  | 'early_leave'
  | 'absent'
  | 'leave'
  | null;

// attendance_records.status (migration 004) as the status of the day
const RECORD_STATUS: Readonly<Record<string, TimesheetDayStatus>> = {
  checked_in: 'present',
  checked_out: 'present',
  late: 'late',
  early_leave: 'early_leave',
  absent: 'absent',
};

export interface TimesheetMember {
  militiaId: string;
  userId: string | null;
  fullName: string;
  militiaCode: string;
  unitCode: string;
  unitName: string;
}

export interface TimesheetRecord {
  militiaId: string;
  workDate: string;
  status: string;
  /** HH:MM in Vietnam */
  checkIn: string | null;
  checkOut: string | null;
  workHours: number | null;
}

/** Approved leave of a user, clipped to the grid. */
export interface TimesheetLeave {
  userId: string;
  from: string;
  to: string;
}

export interface TimesheetDay {
  date: string;
  status: TimesheetDayStatus;
  checkIn: string | null;
  checkOut: string | null;
  workHours: number | null;
  /** Approved leave covers the day, whatever was recorded */
  onLeave: boolean;
}

export interface TimesheetTotals {
  present: number;
  late: number;
  earlyLeave: number;
  absent: number;
  leave: number;
  /** Days up to today with neither a record nor approved leave */
  unrecorded: number;
}

export interface TimesheetRow extends TimesheetMember {
  days: TimesheetDay[];
  totals: TimesheetTotals;
}

/**
 * The days a request covers: a month (YYYY-MM), an explicit from/to of at most 62 days, or
 * by default the business month of today. A month and a range together are refused rather
 * than one silently winning.
 */
export function resolveTimesheetRange(
  query: { month?: YearMonth; from?: string; to?: string },
  today: string,
): { from: string; to: string } {
  const { month, from, to } = query;
  if (month && (from || to)) {
    throw new BadRequestException('month_conflicts_with_range');
  }
  if (month) return monthRange(month.year, month.month);
  if (from || to) {
    if (!from || !to) throw new BadRequestException('incomplete_date_range');
    assertBoundedDateRange(from, to, TIMESHEET_MAX_DAYS);
    return { from, to };
  }
  const [year, currentMonth] = today.split('-').map(Number);
  return monthRange(year, currentMonth);
}

/**
 * One member's row. What was recorded wins over approved leave it contradicts (the day
 * stays marked onLeave); approved leave fills the days without a record, future days too.
 */
export function buildTimesheetRow(
  member: TimesheetMember,
  dates: string[],
  records: TimesheetRecord[],
  leaves: TimesheetLeave[],
  today: string,
): TimesheetRow {
  const recordByDate = new Map(
    records
      .filter((r) => r.militiaId === member.militiaId)
      .map((r) => [r.workDate, r]),
  );
  const memberLeaves = member.userId
    ? leaves.filter((l) => l.userId === member.userId)
    : [];
  const totals: TimesheetTotals = {
    present: 0,
    late: 0,
    earlyLeave: 0,
    absent: 0,
    leave: 0,
    unrecorded: 0,
  };

  const days = dates.map((date): TimesheetDay => {
    const record = recordByDate.get(date);
    const onLeave = memberLeaves.some((l) => l.from <= date && date <= l.to);
    const status: TimesheetDayStatus = record
      ? (RECORD_STATUS[record.status] ?? null)
      : onLeave
        ? 'leave'
        : null;

    switch (status) {
      case 'present':
        totals.present++;
        break;
      case 'late':
        totals.late++;
        break;
      case 'early_leave':
        totals.earlyLeave++;
        break;
      case 'absent':
        totals.absent++;
        break;
      case 'leave':
        totals.leave++;
        break;
      default:
        if (date <= today) totals.unrecorded++;
    }

    return {
      date,
      status,
      checkIn: record?.checkIn ?? null,
      checkOut: record?.checkOut ?? null,
      workHours: record?.workHours ?? null,
      onLeave,
    };
  });

  return { ...member, days, totals };
}

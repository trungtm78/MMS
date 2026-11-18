import { BadRequestException } from '@nestjs/common';
import {
  TIMESHEET_MAX_DAYS,
  buildTimesheetRow,
  resolveTimesheetRange,
  type TimesheetLeave,
  type TimesheetMember,
  type TimesheetRecord,
} from './timesheet';

describe('resolveTimesheetRange', () => {
  const today = '2026-10-01';

  it('bounds a grid to 62 days, two long months', () => {
    expect(TIMESHEET_MAX_DAYS).toBe(62);
  });

  it('defaults to the business month of today', () => {
    expect(resolveTimesheetRange({}, today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it('spans a requested month, leap day included', () => {
    expect(
      resolveTimesheetRange({ month: { year: 2028, month: 2 } }, today),
    ).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('takes an explicit range of up to 62 days', () => {
    expect(
      resolveTimesheetRange({ from: '2026-08-01', to: '2026-10-01' }, today),
    ).toEqual({ from: '2026-08-01', to: '2026-10-01' });
  });

  it.each([
    [{ month: { year: 2026, month: 9 }, from: '2026-09-01' }],
    [{ month: { year: 2026, month: 9 }, to: '2026-09-30' }],
  ])('refuses a month together with a range: %p', (query) => {
    expect(() => resolveTimesheetRange(query, today)).toThrow(
      new BadRequestException('month_conflicts_with_range'),
    );
  });

  it.each([[{ from: '2026-09-01' }], [{ to: '2026-09-30' }]])(
    'refuses half a range: %p',
    (query) => {
      expect(() => resolveTimesheetRange(query, today)).toThrow(
        new BadRequestException('incomplete_date_range'),
      );
    },
  );

  it('refuses an unordered or overlong range', () => {
    expect(() =>
      resolveTimesheetRange({ from: '2026-09-02', to: '2026-09-01' }, today),
    ).toThrow(new BadRequestException('invalid_date_range'));
    expect(() =>
      resolveTimesheetRange({ from: '2026-08-01', to: '2026-10-02' }, today),
    ).toThrow(new BadRequestException('date_range_too_long'));
  });
});

describe('buildTimesheetRow', () => {
  const member: TimesheetMember = {
    militiaId: 'm1',
    userId: 'u1',
    fullName: 'Nguyễn Văn An',
    militiaCode: 'DQ-1',
    unitCode: 'KV-A',
    unitName: 'Khu vực A',
  };
  const dates = [
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
  ];
  const record = (
    workDate: string,
    status: string,
    change: Partial<TimesheetRecord> = {},
  ): TimesheetRecord => ({
    militiaId: 'm1',
    workDate,
    status,
    checkIn: null,
    checkOut: null,
    workHours: null,
    ...change,
  });

  it('maps every recorded day, lets approved leave fill the unrecorded days and totals by status', () => {
    const records = [
      record('2026-09-28', 'checked_out', {
        checkIn: '07:30',
        checkOut: '17:00',
        workHours: 9.5,
      }),
      record('2026-09-29', 'late', { checkIn: '08:10' }),
      record('2026-09-30', 'absent'),
      record('2026-10-01', 'early_leave', {
        checkIn: '07:30',
        checkOut: '11:00',
        workHours: 3.5,
      }),
      // another member's record is not this member's day
      record('2026-10-02', 'checked_in', { militiaId: 'm2' }),
    ];
    const leaves: TimesheetLeave[] = [
      { userId: 'u1', from: '2026-10-01', to: '2026-10-03' },
      { userId: 'u2', from: '2026-09-28', to: '2026-09-28' },
    ];

    const row = buildTimesheetRow(member, dates, records, leaves, '2026-10-02');

    expect(row).toEqual({
      ...member,
      days: [
        {
          date: '2026-09-28',
          status: 'present',
          checkIn: '07:30',
          checkOut: '17:00',
          workHours: 9.5,
          onLeave: false,
        },
        {
          date: '2026-09-29',
          status: 'late',
          checkIn: '08:10',
          checkOut: null,
          workHours: null,
          onLeave: false,
        },
        {
          date: '2026-09-30',
          status: 'absent',
          checkIn: null,
          checkOut: null,
          workHours: null,
          onLeave: false,
        },
        // what was recorded wins over the leave it contradicts, which stays visible
        {
          date: '2026-10-01',
          status: 'early_leave',
          checkIn: '07:30',
          checkOut: '11:00',
          workHours: 3.5,
          onLeave: true,
        },
        {
          date: '2026-10-02',
          status: 'leave',
          checkIn: null,
          checkOut: null,
          workHours: null,
          onLeave: true,
        },
        // approved leave is known ahead of the day
        {
          date: '2026-10-03',
          status: 'leave',
          checkIn: null,
          checkOut: null,
          workHours: null,
          onLeave: true,
        },
      ],
      totals: {
        present: 1,
        late: 1,
        earlyLeave: 1,
        absent: 1,
        leave: 2,
        unrecorded: 0,
      },
    });
  });

  it('counts unrecorded days up to today only', () => {
    const row = buildTimesheetRow(member, dates, [], [], '2026-09-30');

    expect(row.days.map((d) => d.status)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(row.totals).toEqual({
      present: 0,
      late: 0,
      earlyLeave: 0,
      absent: 0,
      leave: 0,
      unrecorded: 3,
    });
  });

  it('ignores leave for a member without an account', () => {
    const row = buildTimesheetRow(
      { ...member, userId: null },
      ['2026-10-01'],
      [],
      [{ userId: 'u1', from: '2026-10-01', to: '2026-10-01' }],
      '2026-10-01',
    );
    expect(row.days[0]).toMatchObject({ status: null, onLeave: false });
    expect(row.totals.unrecorded).toBe(1);
  });
});

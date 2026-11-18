import { BadRequestException } from '@nestjs/common';
import {
  TASK_REPORT_MAX_DAYS,
  completionRate,
  resolveTaskReportRange,
} from './task-report';

describe('resolveTaskReportRange', () => {
  const today = '2026-10-01';

  it('bounds a report to a year and a day', () => {
    expect(TASK_REPORT_MAX_DAYS).toBe(366);
  });

  it('defaults to the twelve business months ending today', () => {
    expect(resolveTaskReportRange({}, today)).toEqual({
      from: '2025-11-01',
      to: '2026-10-01',
    });
  });

  it('starts twelve months before an explicit end, and ends an open range today', () => {
    expect(resolveTaskReportRange({ to: '2026-03-15' }, today)).toEqual({
      from: '2025-04-01',
      to: '2026-03-15',
    });
    expect(resolveTaskReportRange({ from: '2026-09-01' }, today)).toEqual({
      from: '2026-09-01',
      to: '2026-10-01',
    });
  });

  it('takes 366 days but refuses more, or an unordered range', () => {
    expect(
      resolveTaskReportRange({ from: '2025-01-01', to: '2026-01-01' }, today),
    ).toEqual({ from: '2025-01-01', to: '2026-01-01' });
    expect(() =>
      resolveTaskReportRange({ from: '2025-01-01', to: '2026-01-02' }, today),
    ).toThrow(new BadRequestException('date_range_too_long'));
    expect(() => resolveTaskReportRange({ from: '2026-10-02' }, today)).toThrow(
      new BadRequestException('invalid_date_range'),
    );
  });
});

describe('completionRate', () => {
  it('is the share of completed tasks among those not cancelled, to one decimal', () => {
    expect(completionRate(3, 10, 1)).toBe(33.3);
    expect(completionRate(5, 5, 0)).toBe(100);
  });

  it('is 0 when nothing was left to complete', () => {
    expect(completionRate(0, 0, 0)).toBe(0);
    expect(completionRate(0, 2, 2)).toBe(0);
  });
});

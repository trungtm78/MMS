import { BadRequestException } from '@nestjs/common';
import {
  evaluationWindow,
  resolveKpiPeriod,
  trendRange,
} from './kpi-dashboard';

describe('resolveKpiPeriod', () => {
  const today = '2026-10-01';

  it('defaults to the business month of today', () => {
    expect(resolveKpiPeriod({}, today)).toEqual({ year: 2026, month: 10 });
  });

  it('takes a year and month, or a period id', () => {
    expect(resolveKpiPeriod({ year: 2026, month: 9 }, today)).toEqual({
      year: 2026,
      month: 9,
    });
    expect(resolveKpiPeriod({ periodId: 'p-1' }, today)).toEqual({
      periodId: 'p-1',
    });
  });

  it.each([[{ periodId: 'p-1', year: 2026 }], [{ periodId: 'p-1', month: 9 }]])(
    'refuses a period id with a year or month: %p',
    (query) => {
      expect(() => resolveKpiPeriod(query, today)).toThrow(
        new BadRequestException('period_conflict'),
      );
    },
  );

  it.each([[{ year: 2026 }], [{ month: 9 }]])(
    'refuses half a period: %p',
    (query) => {
      expect(() => resolveKpiPeriod(query, today)).toThrow(
        new BadRequestException('incomplete_period'),
      );
    },
  );
});

describe('evaluationWindow', () => {
  it.each<[number, 'monthly' | 'quarterly' | 'yearly', string, string]>([
    [8, 'monthly', '2026-08-01', '2026-08-31'],
    [8, 'quarterly', '2026-07-01', '2026-09-30'],
    [12, 'quarterly', '2026-10-01', '2026-12-31'],
    [1, 'quarterly', '2026-01-01', '2026-03-31'],
    [2, 'yearly', '2026-01-01', '2026-12-31'],
  ])('month %p of a %p period runs %p to %p', (month, period, from, to) => {
    expect(evaluationWindow(2026, month, period)).toEqual({ from, to });
  });
});

describe('trendRange', () => {
  it('starts the given number of months back, across a year end', () => {
    expect(trendRange(2026, 3, 6)).toEqual({
      from: '2025-10-01',
      to: '2026-03-01',
    });
    expect(trendRange(2026, 9, 1)).toEqual({
      from: '2026-09-01',
      to: '2026-09-01',
    });
  });
});

// Period arithmetic of the KPI dashboard (GET /kpi/dashboard)
import { BadRequestException } from '@nestjs/common';
import { monthRange } from '../common/validation/date-range';
import type { EvaluationPeriod } from '../settings/kpi-targets.service';

export interface KpiPeriodQuery {
  periodId?: string;
  year?: number;
  month?: number;
}

export type ResolvedKpiPeriod =
  | { year: number; month: number }
  | { periodId: string };

/**
 * A month given as year and month, or as a payroll period id (as /kpi/summary-report
 * takes it); the business month of today by default. Both forms together, or half a
 * month, are refused rather than guessed.
 */
export function resolveKpiPeriod(
  query: KpiPeriodQuery,
  today: string,
): ResolvedKpiPeriod {
  const { periodId, year, month } = query;
  if (periodId && (year !== undefined || month !== undefined)) {
    throw new BadRequestException('period_conflict');
  }
  if (periodId) return { periodId };
  if ((year === undefined) !== (month === undefined)) {
    throw new BadRequestException('incomplete_period');
  }
  if (year !== undefined && month !== undefined) return { year, month };
  const [currentYear, currentMonth] = today.split('-').map(Number);
  return { year: currentYear, month: currentMonth };
}

/** The evaluation period (month, quarter or year) containing a month. */
export function evaluationWindow(
  year: number,
  month: number,
  period: EvaluationPeriod,
): { from: string; to: string } {
  switch (period) {
    case 'yearly':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'quarterly': {
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      return {
        from: monthRange(year, first).from,
        to: monthRange(year, first + 2).to,
      };
    }
    default:
      return monthRange(year, month);
  }
}

/** First days of the first and last month of a trend of `months` months ending in a month. */
export function trendRange(
  year: number,
  month: number,
  months: number,
): { from: string; to: string } {
  const first = new Date(Date.UTC(year, month - months, 1));
  return {
    from: first.toISOString().slice(0, 10),
    to: monthRange(year, month).from,
  };
}

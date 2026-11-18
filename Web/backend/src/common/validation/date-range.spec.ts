import { BadRequestException } from '@nestjs/common';
import { assertDateRange } from './date-range';

describe('assertDateRange', () => {
  it('accepts open, single-day and ordered ranges', () => {
    expect(() => assertDateRange()).not.toThrow();
    expect(() => assertDateRange('2026-01-01')).not.toThrow();
    expect(() => assertDateRange(undefined, '2026-01-01')).not.toThrow();
    expect(() => assertDateRange('2026-01-01', '2026-01-01')).not.toThrow();
    expect(() => assertDateRange('2025-12-31', '2026-01-01')).not.toThrow();
  });

  it('refuses a range that ends before it starts', () => {
    expect(() => assertDateRange('2026-01-02', '2026-01-01')).toThrow(
      new BadRequestException('invalid_date_range'),
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import {
  assertBoundedDateRange,
  datesInRange,
  inclusiveDays,
  monthRange,
} from './date-range';

describe('inclusiveDays', () => {
  it('counts both ends of the range', () => {
    expect(inclusiveDays('2026-09-01', '2026-09-01')).toBe(1);
    expect(inclusiveDays('2026-09-01', '2026-09-30')).toBe(30);
    expect(inclusiveDays('2028-02-01', '2028-03-01')).toBe(30);
    expect(inclusiveDays('2026-12-31', '2027-01-01')).toBe(2);
  });
});

describe('assertBoundedDateRange', () => {
  it('accepts an ordered range up to the limit', () => {
    expect(() =>
      assertBoundedDateRange('2026-09-01', '2026-09-01', 1),
    ).not.toThrow();
    expect(() =>
      assertBoundedDateRange('2026-08-01', '2026-10-01', 62),
    ).not.toThrow();
  });

  it('refuses a range that ends before it starts', () => {
    expect(() =>
      assertBoundedDateRange('2026-09-02', '2026-09-01', 62),
    ).toThrow(new BadRequestException('invalid_date_range'));
  });

  it('refuses a range longer than the limit', () => {
    expect(() =>
      assertBoundedDateRange('2026-08-01', '2026-10-02', 62),
    ).toThrow(new BadRequestException('date_range_too_long'));
  });
});

describe('monthRange', () => {
  it('spans the calendar month, leap years included', () => {
    expect(monthRange(2026, 9)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(monthRange(2028, 2)).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(monthRange(2026, 12)).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });
});

describe('datesInRange', () => {
  it('lists every calendar day in order, across a year end', () => {
    expect(datesInRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('is empty for an unordered range', () => {
    expect(datesInRange('2026-09-02', '2026-09-01')).toEqual([]);
  });
});

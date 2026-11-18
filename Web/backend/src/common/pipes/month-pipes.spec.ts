// Month query parameters end up in date SQL: anything malformed is refused with 400 first
import { BadRequestException } from '@nestjs/common';
import { MonthPipe, YearMonthPipe } from './query-pipes';

describe('YearMonthPipe', () => {
  const pipe = new YearMonthPipe();

  it('reads a YYYY-MM month', () => {
    expect(pipe.transform('2026-09')).toEqual({ year: 2026, month: 9 });
    expect(pipe.transform('2100-12')).toEqual({ year: 2100, month: 12 });
  });

  it.each([undefined, ''])('treats %p as an absent month', (value) => {
    expect(pipe.transform(value)).toBeUndefined();
  });

  it.each([
    '2026-13',
    '2026-00',
    '2026-9',
    '26-09',
    '2026-09-01',
    '1899-12',
    'x',
  ])('refuses %p', (value) => {
    expect(() => pipe.transform(value)).toThrow(
      new BadRequestException('invalid_month'),
    );
  });
});

describe('MonthPipe', () => {
  const pipe = new MonthPipe();

  it('reads a month number', () => {
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('09')).toBe(9);
    expect(pipe.transform('12')).toBe(12);
  });

  it.each([undefined, ''])('treats %p as an absent month', (value) => {
    expect(pipe.transform(value)).toBeUndefined();
  });

  it.each(['0', '13', '1.5', '9x', '-1', '001'])('refuses %p', (value) => {
    expect(() => pipe.transform(value)).toThrow(
      new BadRequestException('invalid_month'),
    );
  });
});

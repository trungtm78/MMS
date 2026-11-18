// Query parameters that reach date, integer or uuid SQL must be refused with 400 first;
// otherwise PostgreSQL rejects them and the client gets a 500 (Codex round 2)
import { BadRequestException } from '@nestjs/common';
import { IsoDatePipe, YearPipe } from './query-pipes';

describe('IsoDatePipe', () => {
  const pipe = new IsoDatePipe();

  it('passes a real calendar day through', () => {
    expect(pipe.transform('2026-02-28')).toBe('2026-02-28');
    expect(pipe.transform('2028-02-29')).toBe('2028-02-29');
  });

  it.each([undefined, ''])('treats %p as an absent filter', (value) => {
    expect(pipe.transform(value)).toBeUndefined();
  });

  it.each([
    'bad',
    '2026-02-30',
    '2026-02-29',
    '2026-13-01',
    '13-01-2026',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
  ])('refuses %p', (value) => {
    expect(() => pipe.transform(value)).toThrow(
      new BadRequestException('invalid_date'),
    );
  });
});

describe('YearPipe', () => {
  const pipe = new YearPipe();

  it('reads a four-digit year', () => {
    expect(pipe.transform('2026')).toBe(2026);
  });

  it.each([undefined, ''])('treats %p as an absent year', (value) => {
    expect(pipe.transform(value)).toBeUndefined();
  });

  // parseInt('2026junk') is 2026: a typo must not silently select a report year
  it.each([
    'x',
    '2026junk',
    '26',
    '99999',
    '1899',
    '2101',
    '-2026',
    '2026.5',
    ' 2026',
  ])('refuses %p', (value) => {
    expect(() => pipe.transform(value)).toThrow(
      new BadRequestException('invalid_year'),
    );
  });
});

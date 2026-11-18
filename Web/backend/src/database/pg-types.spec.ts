// node-postgres turns DATE columns into JavaScript Dates at local midnight, which serialise
// as the previous day on hosts east of UTC. Calendar dates must reach clients as YYYY-MM-DD.
import { types } from 'pg';
import './pg-types';

type TextParser = (value: string) => unknown;

describe('pg type parsers', () => {
  it('returns DATE columns as the YYYY-MM-DD text Postgres sent', () => {
    const parse = types.getTypeParser(
      types.builtins.DATE,
      'text',
    ) as TextParser;

    expect(parse('2027-03-01')).toBe('2027-03-01');
  });

  // T31a: leave days, coordinates, scores and amounts reached clients as "10.0"
  it('returns NUMERIC columns as JavaScript numbers', () => {
    const parse = types.getTypeParser(
      types.builtins.NUMERIC,
      'text',
    ) as TextParser;

    expect(parse('10.0')).toBe(10);
    expect(parse('0.5')).toBe(0.5);
    expect(parse('-106.66012345')).toBe(-106.66012345);
    // DECIMAL(12,2), the widest column: exact to the cent
    expect(parse('9999999999.99')).toBe(9999999999.99);
  });

  // Counts stay strings: BIGINT may exceed Number.MAX_SAFE_INTEGER and callers parse them
  it('leaves BIGINT counts as the text Postgres sent', () => {
    const parse = types.getTypeParser(
      types.builtins.INT8,
      'text',
    ) as TextParser;

    expect(parse('9007199254740993')).toBe('9007199254740993');
  });

  it('leaves timestamps as Date objects', () => {
    const parse = types.getTypeParser(
      types.builtins.TIMESTAMPTZ,
      'text',
    ) as TextParser;

    expect(parse('2027-03-01 00:30:00+07')).toBeInstanceOf(Date);
  });
});

import {
  BUSINESS_TODAY_SQL,
  businessDate,
  shiftIsoDate,
} from './business-date';

// The ward works on Vietnamese calendar days; the server clock is UTC in production
describe('businessDate', () => {
  it('uses the Asia/Ho_Chi_Minh day once Vietnamese midnight has passed', () => {
    // 2026-09-30 18:30 UTC is 1 October 01:30 in Vietnam
    expect(businessDate(new Date('2026-09-30T18:30:00Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 1,
      isoDate: '2026-10-01',
    });
  });

  it('keeps the same day until 17:00 UTC', () => {
    expect(businessDate(new Date('2026-09-30T16:59:59Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 30,
      isoDate: '2026-09-30',
    });
  });

  it('rolls the year over at Vietnamese midnight', () => {
    expect(businessDate(new Date('2026-12-31T17:00:00Z'))).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
    });
  });
});

// Calendar arithmetic on YYYY-MM-DD, independent of the host timezone and DST
describe('shiftIsoDate', () => {
  it('moves back across a month boundary', () => {
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('moves forward across a year boundary', () => {
    expect(shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('shifts by whole days', () => {
    expect(shiftIsoDate('2026-10-01', -30)).toBe('2026-09-01');
    expect(shiftIsoDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('rejects anything but a real YYYY-MM-DD date', () => {
    expect(() => shiftIsoDate('2026-9-1', 1)).toThrow(/YYYY-MM-DD/);
    expect(() => shiftIsoDate('2026-02-30', 1)).toThrow(/YYYY-MM-DD/);
  });
});

describe('BUSINESS_TODAY_SQL', () => {
  it('is the current date in the business timezone', () => {
    expect(BUSINESS_TODAY_SQL).toBe(
      "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date",
    );
  });
});

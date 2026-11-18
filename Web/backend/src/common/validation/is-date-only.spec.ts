import { validate } from 'class-validator';
import { IsDateOnly } from './is-date-only';

class Probe {
  @IsDateOnly()
  day!: unknown;
}

const errorsFor = async (day: unknown) => {
  const probe = new Probe();
  probe.day = day;
  return validate(probe);
};

describe('IsDateOnly', () => {
  it('accepts a real calendar day written YYYY-MM-DD', async () => {
    await expect(errorsFor('2026-02-28')).resolves.toEqual([]);
    await expect(errorsFor('2028-02-29')).resolves.toEqual([]);
  });

  it.each([
    ['an impossible day', '2026-02-30'],
    ['a day without leading zeros', '2026-2-3'],
    ['a timestamp', '2026-02-28T00:00:00Z'],
    ['a number', 20260228],
    ['an empty string', ''],
  ])('refuses %s', async (_label, value) => {
    const errors = await errorsFor(value);
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {})).toEqual([
      'day must be a YYYY-MM-DD date',
    ]);
  });
});

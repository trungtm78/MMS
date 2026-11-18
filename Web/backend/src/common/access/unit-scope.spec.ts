import { ForbiddenException } from '@nestjs/common';
import { assertUnitInScope, effectiveUnit } from './unit-scope';

describe('effectiveUnit', () => {
  it('lets wide roles see every unit or narrow to a requested one', () => {
    expect(effectiveUnit({ role: 'system_admin', unitScope: null })).toBeNull();
    expect(
      effectiveUnit({ role: 'police_ward', unitScope: 'KV1' }, 'KV3'),
    ).toBe('KV3');
  });

  it('locks other roles to their own unit whatever they request', () => {
    expect(
      effectiveUnit({ role: 'police_area', unitScope: 'KV2' }, 'KV9'),
    ).toBe('KV2');
    expect(effectiveUnit({ role: 'office_staff', unitScope: 'KV2' })).toBe(
      'KV2',
    );
  });

  // An area officer whose scope row is missing must not fall back to the whole ward
  it.each(['police_area', 'ca_area', 'ca_officer'])(
    'refuses area role %s without a unit scope',
    (role) => {
      expect(() => effectiveUnit({ role, unitScope: null })).toThrow(
        new ForbiddenException('no_unit_scope'),
      );
    },
  );

  // Ward-level accounts carry no unit: null scope means the whole ward
  it.each(['office_staff', 'ca_ward', 'ubnd_leader'])(
    'gives ward-level role %s without a unit scope the whole ward',
    (role) => {
      expect(effectiveUnit({ role, unitScope: null })).toBeNull();
      expect(effectiveUnit({ role, unitScope: null }, 'KV4')).toBe('KV4');
    },
  );
});

describe('assertUnitInScope', () => {
  it('accepts a unit inside the scope', () => {
    expect(() =>
      assertUnitInScope({ role: 'police_area', unitScope: 'KV2' }, 'KV2'),
    ).not.toThrow();
  });

  it('refuses a unit outside the scope', () => {
    expect(() =>
      assertUnitInScope({ role: 'office_staff', unitScope: 'KV2' }, 'KV1'),
    ).toThrow(new ForbiddenException('unit_scope_violation'));
  });

  it('accepts any unit for wide and ward-level actors', () => {
    expect(() =>
      assertUnitInScope({ role: 'police_ward', unitScope: 'KV2' }, 'KV1'),
    ).not.toThrow();
    expect(() =>
      assertUnitInScope({ role: 'ca_ward', unitScope: null }, 'KV1'),
    ).not.toThrow();
  });

  it('refuses an area role without a unit scope', () => {
    expect(() =>
      assertUnitInScope({ role: 'police_area', unitScope: null }, 'KV1'),
    ).toThrow(new ForbiddenException('no_unit_scope'));
  });
});

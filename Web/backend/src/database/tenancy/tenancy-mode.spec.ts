import { thrownBy } from '../../../test/support/thrown-by';
import {
  TenancyConfigError,
  isTenancyEnforced,
  tenancyMode,
} from './tenancy-mode';

describe('tenancyMode', () => {
  it('defaults to legacy', () => {
    expect(tenancyMode({})).toBe('legacy');
    expect(isTenancyEnforced({})).toBe(false);
  });

  it('reads enforced regardless of case and spaces', () => {
    expect(tenancyMode({ TENANCY_MODE: ' Enforced ' })).toBe('enforced');
    expect(isTenancyEnforced({ TENANCY_MODE: 'enforced' })).toBe(true);
  });

  it('refuses any other value so a typo cannot silently disable isolation', () => {
    expect(() => tenancyMode({ TENANCY_MODE: 'enforce' })).toThrow(
      /Invalid TENANCY_MODE "enforce"/,
    );
  });

  it('reports it as a configuration error, which startup never retries', () => {
    const error = thrownBy(() => tenancyMode({ TENANCY_MODE: 'enforce' }));
    expect(error).toBeInstanceOf(TenancyConfigError);
    expect(error).toMatchObject({ name: 'TenancyConfigError' });
  });
});

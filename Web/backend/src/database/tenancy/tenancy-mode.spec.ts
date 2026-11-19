import { thrownBy } from '../../../test/support/thrown-by';
import {
  TenancyConfigError,
  freezeTenancySettings,
  isTenancyEnforced,
  readTenancySettings,
  tenancyMode,
  tenancySettings,
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

describe('tenancy settings', () => {
  const previousMode = process.env.TENANCY_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
  });

  it('refuses an empty TENANCY_MODE: an unset compose variable must not pick a mode', () => {
    expect(
      thrownBy(() => readTenancySettings({ TENANCY_MODE: '' })),
    ).toMatchObject({
      name: 'TenancyConfigError',
    });
  });

  it('reads LEGACY_DEFAULT_TENANT_CODE lower-cased, and null when unset or blank', () => {
    expect(
      readTenancySettings({ LEGACY_DEFAULT_TENANT_CODE: ' Phu-Dinh ' }),
    ).toEqual({
      mode: 'legacy',
      legacyDefaultTenantCode: 'phu-dinh',
    });
    expect(
      readTenancySettings({ LEGACY_DEFAULT_TENANT_CODE: '  ' })
        .legacyDefaultTenantCode,
    ).toBeNull();
    expect(readTenancySettings({}).legacyDefaultTenantCode).toBeNull();
  });

  it('refuses a LEGACY_DEFAULT_TENANT_CODE that cannot be a tenant code', () => {
    expect(
      thrownBy(() =>
        readTenancySettings({ LEGACY_DEFAULT_TENANT_CODE: "x'; --" }),
      ),
    ).toMatchObject({
      name: 'TenancyConfigError',
      message: expect.stringContaining(
        'Invalid LEGACY_DEFAULT_TENANT_CODE',
      ) as unknown,
    });
  });

  // First in order: nothing in this file has frozen the settings yet
  it('follows the environment until startup freezes the settings', () => {
    process.env.TENANCY_MODE = 'enforced';
    expect(isTenancyEnforced()).toBe(true);
    process.env.TENANCY_MODE = 'legacy';
    expect(isTenancyEnforced()).toBe(false);
  });

  it('keeps the settings frozen at startup whatever the environment does later', () => {
    freezeTenancySettings({ TENANCY_MODE: 'enforced' });
    process.env.TENANCY_MODE = 'legacy';
    expect(isTenancyEnforced()).toBe(true);
    expect(tenancySettings().mode).toBe('enforced');
    // An explicit environment is read as given, frozen or not
    expect(isTenancyEnforced({ TENANCY_MODE: 'legacy' })).toBe(false);
    // The next startup freezes again
    freezeTenancySettings({ TENANCY_MODE: 'legacy' });
    expect(isTenancyEnforced()).toBe(false);
  });
});

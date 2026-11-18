import { assertNoLegacyTenantDefault } from './legacy-default-guard';

describe('assertNoLegacyTenantDefault', () => {
  it('accepts a database with no app.tenant_id default', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      assertNoLegacyTenantDefault({ query }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a database default and says how to remove it', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { setting: 'app.tenant_id=a1000000-0000-4000-8000-000000000001' },
      ]);
    await expect(assertNoLegacyTenantDefault({ query })).rejects.toThrow(
      /legacy_tenant_default_present.*RESET app\.tenant_id/,
    );
  });
});

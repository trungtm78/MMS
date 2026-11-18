import {
  assertNoLegacyTenantDefault,
  assertRuntimeRoleEnforcesRls,
} from './boot-guards';
import { TenancyConfigError } from './tenancy-mode';

describe('assertNoLegacyTenantDefault', () => {
  it('accepts a database with no app.tenant_id default', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      assertNoLegacyTenantDefault({ query }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a database default and says how to remove it', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        setting: 'app.tenant_id=a1000000-0000-4000-8000-000000000001',
      },
    ]);
    await expect(assertNoLegacyTenantDefault({ query })).rejects.toThrow(
      /legacy_tenant_default_present.*RESET app\.tenant_id/,
    );
  });

  it('reports a configuration error, which is never worth retrying', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ setting: 'app.tenant_id=whatever' }]);
    await expect(assertNoLegacyTenantDefault({ query })).rejects.toBeInstanceOf(
      TenancyConfigError,
    );
  });

  it('matches the setting by its exact prefix, not as a LIKE pattern', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await assertNoLegacyTenantDefault({ query });
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toContain(`starts_with(c, 'app.tenant_id=')`);
    expect(sql).not.toMatch(/\bLIKE\b/i);
  });
});

describe('assertRuntimeRoleEnforcesRls', () => {
  it('accepts a role that neither is a superuser nor bypasses RLS', async () => {
    const query = jest.fn().mockResolvedValue([{ bypass: false }]);
    await expect(
      assertRuntimeRoleEnforcesRls({ query }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a superuser or BYPASSRLS role and names the role to use', async () => {
    const query = jest.fn().mockResolvedValue([{ bypass: true }]);
    await expect(assertRuntimeRoleEnforcesRls({ query })).rejects.toThrow(
      /runtime_role_bypasses_rls.*NOSUPERUSER NOBYPASSRLS.*mms_app/,
    );
  });

  it('reports a configuration error, which is never worth retrying', async () => {
    const query = jest.fn().mockResolvedValue([{ bypass: true }]);
    await expect(
      assertRuntimeRoleEnforcesRls({ query }),
    ).rejects.toBeInstanceOf(TenancyConfigError);
  });

  it('refuses when the role cannot be looked up, rather than assume it is safe', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(assertRuntimeRoleEnforcesRls({ query })).rejects.toThrow(
      /runtime_role_bypasses_rls/,
    );
  });

  it('asks about the role the session runs as', async () => {
    const query = jest.fn().mockResolvedValue([{ bypass: false }]);
    await assertRuntimeRoleEnforcesRls({ query });
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/rolsuper\s+OR\s+rolbypassrls/);
    expect(sql).toMatch(/rolname\s*=\s*current_user/);
  });
});

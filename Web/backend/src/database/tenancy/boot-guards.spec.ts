import {
  assertLegacyRoleSeesTenantData,
  assertLegacyTenantDefaultPresent,
  assertNoLegacyTenantDefault,
  assertRuntimeRoleEnforcesRls,
} from './boot-guards';
import { TenancyConfigError } from './tenancy-mode';

// What a plain checkout sees after RESET: the effective default of a session, wherever it
// was set (pg_db_role_setting, postgresql.conf, ALTER SYSTEM, connection options)
const fakeRunner = (effective: string | null = null) => ({
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue([{ tenant: effective }]),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  isTransactionActive: true,
});
let runner = fakeRunner();
const source = (query: jest.Mock) =>
  ({
    query,
    createQueryRunner: jest.fn(() => runner),
  }) as unknown as Parameters<typeof assertNoLegacyTenantDefault>[0];

beforeEach(() => {
  runner = fakeRunner();
});

describe('assertNoLegacyTenantDefault', () => {
  it('accepts a database with no app.tenant_id default', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      assertNoLegacyTenantDefault(source(query)),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a database default and says how to remove it', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        setting: 'app.tenant_id=a1000000-0000-4000-8000-000000000001',
      },
    ]);
    await expect(assertNoLegacyTenantDefault(source(query))).rejects.toThrow(
      /legacy_tenant_default_present.*RESET app\.tenant_id/,
    );
  });

  it('reports a configuration error, which is never worth retrying', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ setting: 'app.tenant_id=whatever' }]);
    await expect(
      assertNoLegacyTenantDefault(source(query)),
    ).rejects.toBeInstanceOf(TenancyConfigError);
  });

  it('matches the setting by its exact prefix, not as a LIKE pattern', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await assertNoLegacyTenantDefault(source(query));
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toContain(`starts_with(c, 'app.tenant_id=')`);
    expect(sql).not.toMatch(/\bLIKE\b/i);
  });
  it('refuses a default that no catalog row shows, such as postgresql.conf or a connection option', async () => {
    const query = jest.fn().mockResolvedValue([]);
    runner = fakeRunner('a1000000-0000-4000-8000-000000000001');
    await expect(assertNoLegacyTenantDefault(source(query))).rejects.toThrow(
      /legacy_tenant_default_present.*a1000000-0000-4000-8000-000000000001.*RESET app\.tenant_id/,
    );
    await expect(
      assertNoLegacyTenantDefault(source(query)),
    ).rejects.toBeInstanceOf(TenancyConfigError);
  });

  it('reads the effective default on one dedicated client, inside a transaction it rolls back', async () => {
    const query = jest.fn().mockResolvedValue([]);
    runner = fakeRunner(null);
    await assertNoLegacyTenantDefault(source(query));
    const statements = runner.query.mock.calls.map((call) =>
      String((call as unknown[])[0]),
    );
    expect(statements[0]).toMatch(/^RESET app\.tenant_id$/);
    expect(statements[1]).toMatch(/current_setting\('app\.tenant_id', true\)/);
    expect(runner.startTransaction).toHaveBeenCalledTimes(1);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('puts the client back even when the default is refused or the check fails', async () => {
    const query = jest.fn().mockResolvedValue([]);
    runner = fakeRunner('a1000000-0000-4000-8000-000000000001');
    await expect(assertNoLegacyTenantDefault(source(query))).rejects.toThrow(
      /legacy_tenant_default_present/,
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);

    runner = fakeRunner(null);
    runner.query.mockRejectedValueOnce(new Error('connection lost'));
    await expect(assertNoLegacyTenantDefault(source(query))).rejects.toThrow(
      'connection lost',
    );
    expect(runner.release).toHaveBeenCalledTimes(1);
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

const FIRST_TENANT = 'a1000000-0000-4000-8000-000000000001';

describe('assertLegacyTenantDefaultPresent', () => {
  it('accepts a database whose sessions default to the first tenant', async () => {
    const query = jest.fn().mockResolvedValue([{ tenant: FIRST_TENANT }]);
    await expect(
      assertLegacyTenantDefaultPresent({ query }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unset', null],
    ['empty', ''],
    ['another tenant', 'b1000000-0000-4000-8000-000000000002'],
  ])(
    'refuses a database whose default tenant is %s and says how to restore it',
    async (_name, tenant) => {
      const query = jest.fn().mockResolvedValue([{ tenant }]);
      await expect(assertLegacyTenantDefaultPresent({ query })).rejects.toThrow(
        /legacy_tenant_default_missing.*ALTER DATABASE <db> SET app\.tenant_id = 'a1000000-0000-4000-8000-000000000001'.*pg_dump --create/,
      );
    },
  );

  it('reports a configuration error, which is never worth retrying', async () => {
    const query = jest.fn().mockResolvedValue([{ tenant: null }]);
    await expect(
      assertLegacyTenantDefaultPresent({ query }),
    ).rejects.toBeInstanceOf(TenancyConfigError);
  });

  it('refuses when the answer is missing altogether', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(assertLegacyTenantDefaultPresent({ query })).rejects.toThrow(
      /legacy_tenant_default_missing/,
    );
  });

  it('reads what a plain session sees, not a catalog', async () => {
    const query = jest.fn().mockResolvedValue([{ tenant: FIRST_TENANT }]);
    await assertLegacyTenantDefaultPresent({ query });
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/current_setting\('app\.tenant_id', true\)/);
  });
});

describe('assertLegacyRoleSeesTenantData', () => {
  it('accepts a role that Row-Level Security does not block', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: true }]);
    await expect(
      assertLegacyRoleSeesTenantData({ query }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a plain role: FORCE ROW LEVEL SECURITY would show it empty tables', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: false }]);
    await expect(assertLegacyRoleSeesTenantData({ query })).rejects.toThrow(
      /legacy_role_blocked_by_rls.*superuser.*BYPASSRLS.*mms_app/,
    );
  });

  it('reports a configuration error, which is never worth retrying', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: false }]);
    await expect(
      assertLegacyRoleSeesTenantData({ query }),
    ).rejects.toBeInstanceOf(TenancyConfigError);
  });

  it('refuses when the role cannot be looked up, rather than assume it is fine', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(assertLegacyRoleSeesTenantData({ query })).rejects.toThrow(
      /legacy_role_blocked_by_rls/,
    );
  });

  it('asks about superuser, BYPASSRLS and membership of mms_app for the session role', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: true }]);
    await assertLegacyRoleSeesTenantData({ query });
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/rolsuper\s+OR\s+\S*rolbypassrls/);
    expect(sql).toMatch(/rolname\s*=\s*'mms_app'/);
    expect(sql).toMatch(/pg_has_role\(current_user/);
    expect(sql).toMatch(/rolname\s*=\s*current_user/);
  });
});

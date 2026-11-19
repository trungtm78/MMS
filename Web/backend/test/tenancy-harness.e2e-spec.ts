// The two-mode e2e harness (M1a): what an enforced run (E2E_TENANCY=enforced) changes for
// the pre-existing suites, and the role hygiene after a run.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import * as path from 'path';
import lockApplicationRoles from './support/e2e-roles.global-teardown';
import {
  backendTenancyEnv,
  e2eTenancy,
  fixtureConnectionOptions,
  prepareDatabaseForTenancy,
  storedContentPath,
} from './support/e2e-tenancy';
import { withClient } from './support/db';
import { thrownBy } from './support/thrown-by';
import {
  APP_PASSWORD,
  TENANT_1,
  createTenantDatabase,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

describe('two-mode e2e harness (e2e)', () => {
  const previous = process.env.E2E_TENANCY;
  afterEach(() => {
    if (previous === undefined) delete process.env.E2E_TENANCY;
    else process.env.E2E_TENANCY = previous;
  });

  it('reads the mode, legacy by default, and refuses anything else', () => {
    expect(e2eTenancy({})).toBe('legacy');
    expect(e2eTenancy({ E2E_TENANCY: ' Enforced ' })).toBe('enforced');
    expect(
      thrownBy(() => e2eTenancy({ E2E_TENANCY: 'enforce' })),
    ).toMatchObject({
      message: expect.stringContaining('Invalid E2E_TENANCY') as unknown,
    });
  });

  it('changes nothing in a legacy run', () => {
    process.env.E2E_TENANCY = 'legacy';
    expect(backendTenancyEnv()).toEqual({});
    expect(fixtureConnectionOptions()).toBeUndefined();
    expect(storedContentPath('/uploads', 'key')).toBe(
      path.join('/uploads', 'key'),
    );
  });

  it('runs the backend as mms_app, enforced, with the transitional tenant code, in an enforced run', () => {
    process.env.E2E_TENANCY = 'enforced';
    expect(backendTenancyEnv()).toEqual({
      TENANCY_MODE: 'enforced',
      DB_USER: 'mms_app',
      DB_PASSWORD: APP_PASSWORD,
      LEGACY_DEFAULT_TENANT_CODE: 'phu-dinh',
    });
    expect(fixtureConnectionOptions()).toBe(`-c app.tenant_id=${TENANT_1}`);
    expect(storedContentPath('/uploads', 'key')).toBe(
      path.join('/uploads', TENANT_1, 'key'),
    );
  });

  it('uses a password that is not in the repository', () => {
    expect(APP_PASSWORD).not.toBe('mms_app_e2e');
    expect(APP_PASSWORD.length).toBeGreaterThanOrEqual(24);
  });

  describe('on a database', () => {
    let db: TenantDatabase;

    beforeAll(async () => {
      db = await createTenantDatabase({ keepLegacyDefault: true });
    });

    afterAll(async () => {
      await db?.drop();
    });

    it('makes a migrated database an enforced one, and lands fixture rows in the first tenant', async () => {
      process.env.E2E_TENANCY = 'enforced';
      await prepareDatabaseForTenancy(db.name);

      const defaults = await db.admin(
        async (c) =>
          (
            await c.query<{ n: string }>(
              `SELECT count(*) AS n FROM pg_db_role_setting s
               CROSS JOIN LATERAL unnest(s.setconfig) AS c
              WHERE s.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
                AND starts_with(c, 'app.tenant_id=')`,
            )
          ).rows[0].n,
      );
      expect(defaults).toBe('0');
      const tenant = await withClient(
        db.adminUrl,
        async (c) =>
          (
            await c.query<{ tenant: string }>(
              `INSERT INTO kpi_criteria (code, name, category, max_score, weight)
             VALUES ('harness', 'x', 'task', 1, 1) RETURNING tenant_id::text AS tenant`,
            )
          ).rows[0].tenant,
      );
      expect(tenant).toBe(TENANT_1);
      await db.app(TENANT_1, async (c) => {
        expect((await c.query('SELECT 1')).rowCount).toBe(1);
      });
    });

    it('locks the application roles again after the run', async () => {
      await lockApplicationRoles();
      const roles = await db.admin(
        async (c) =>
          (
            await c.query<{ rolname: string; rolcanlogin: boolean }>(
              `SELECT rolname, rolcanlogin FROM pg_roles
                WHERE rolname IN ('mms_app', 'mms_platform') ORDER BY rolname`,
            )
          ).rows,
      );
      expect(roles).toEqual([
        { rolname: 'mms_app', rolcanlogin: false },
        { rolname: 'mms_platform', rolcanlogin: false },
      ]);
    });
  });
});

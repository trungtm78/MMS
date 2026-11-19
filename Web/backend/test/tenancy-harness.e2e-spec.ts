// The two-mode e2e harness (M1a): what an enforced run (E2E_TENANCY=enforced) changes for
// the pre-existing suites, the mode a run really applied, the runner's arguments and the role
// hygiene after a run.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
// The environment module comes first: AppModule reads its configuration when it is loaded.
import { E2E_ADMIN_URL, E2E_DB_NAME, E2E_DB_URL } from './support/app-env';
import * as fs from 'fs';
import * as path from 'path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { tenancySettings } from '../src/database/tenancy/tenancy-mode';
import {
  PINNED_ENV,
  childEnv,
  modesOf,
  parseArgs,
  selectSuites,
} from '../scripts/run-e2e-args.cjs';
import lockApplicationRoles from './support/e2e-roles.global-teardown';
import {
  APPLICATION_ROLES,
  lockApplicationRoles as lockRoles,
  retryConcurrentRoleUpdate,
} from './support/e2e-roles.cjs';
import {
  assertAppliedTenancyMode,
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
  alterRole,
  createTenantDatabase,
  creationFailure,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

// The mode this process was started in, read before any test changes E2E_TENANCY
const RUN_MODE = e2eTenancy();

const concurrentUpdate = () =>
  Object.assign(new Error('tuple concurrently updated'), { code: 'XX000' });

const roleLogins = (url: string) =>
  withClient(
    url,
    async (c) =>
      (
        await c.query<{ rolname: string; rolcanlogin: boolean }>(
          `SELECT rolname, rolcanlogin FROM pg_roles
          WHERE rolname IN ('mms_app', 'mms_platform') ORDER BY rolname`,
        )
      ).rows,
  );

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

  it('pins the legacy mode in a legacy run, and changes nothing else', () => {
    process.env.E2E_TENANCY = 'legacy';
    expect(backendTenancyEnv()).toEqual({
      TENANCY_MODE: 'legacy',
      LEGACY_DEFAULT_TENANT_CODE: '',
    });
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

  describe('the mode a run applied', () => {
    it('fails loudly when the environment differs from the mode asked for', () => {
      const enforced = {
        E2E_TENANCY: 'enforced',
        TENANCY_MODE: 'enforced',
        DB_USER: 'mms_app',
      };
      expect(() => assertAppliedTenancyMode(enforced)).not.toThrow();
      expect(() =>
        assertAppliedTenancyMode({ E2E_TENANCY: 'legacy' }),
      ).not.toThrow();
      expect(() =>
        assertAppliedTenancyMode({
          E2E_TENANCY: 'legacy',
          TENANCY_MODE: 'legacy',
        }),
      ).not.toThrow();

      expect(
        thrownBy(() =>
          assertAppliedTenancyMode({ ...enforced, TENANCY_MODE: 'legacy' }),
        ),
      ).toMatchObject({
        message: expect.stringContaining('TENANCY_MODE') as unknown,
      });
      expect(
        thrownBy(() =>
          assertAppliedTenancyMode({ ...enforced, TENANCY_MODE: undefined }),
        ),
      ).toMatchObject({
        message: expect.stringContaining('TENANCY_MODE') as unknown,
      });
      expect(
        thrownBy(() =>
          assertAppliedTenancyMode({ ...enforced, DB_USER: 'mms' }),
        ),
      ).toMatchObject({
        message: expect.stringContaining('DB_USER') as unknown,
      });
      expect(
        thrownBy(() =>
          assertAppliedTenancyMode({
            E2E_TENANCY: 'legacy',
            TENANCY_MODE: 'enforced',
          }),
        ),
      ).toMatchObject({
        message: expect.stringContaining('TENANCY_MODE') as unknown,
      });
    });

    describe('on a booted application', () => {
      let app: INestApplication;

      beforeAll(async () => {
        await withClient(E2E_ADMIN_URL, (c) =>
          c.query(`CREATE DATABASE ${E2E_DB_NAME}`),
        );
        await migrateDatabase({
          connectionString: E2E_DB_URL,
          directory: path.join(__dirname, '..', 'migrations'),
        });
        await prepareDatabaseForTenancy(E2E_DB_NAME);
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
      });

      afterAll(async () => {
        await app?.close();
        await withClient(E2E_ADMIN_URL, (c) =>
          c.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`),
        );
      });

      it('applied the environment of the mode the run asked for', () => {
        expect(process.env.E2E_TENANCY ?? 'legacy').toBe(RUN_MODE);
        const adminUser = decodeURIComponent(new URL(E2E_ADMIN_URL).username);
        if (RUN_MODE === 'enforced') {
          expect(process.env.TENANCY_MODE).toBe('enforced');
          expect(process.env.DB_USER).toBe('mms_app');
        } else {
          expect(process.env.TENANCY_MODE).toBe('legacy');
          expect(process.env.DB_USER).toBe(adminUser);
        }
      });

      it('booted in that mode, as that role', async () => {
        expect(tenancySettings().mode).toBe(RUN_MODE);
        const user = (
          await app
            .get(DataSource)
            .query<{ current_user: string }[]>('SELECT current_user')
        )[0].current_user;
        if (RUN_MODE === 'enforced') {
          expect(user).toBe('mms_app');
        } else {
          expect(user).toBe(
            decodeURIComponent(new URL(E2E_ADMIN_URL).username),
          );
        }
      });
    });
  });

  describe('the runner arguments', () => {
    const files = [
      'app.e2e-spec.ts',
      'tenancy-rls.e2e-spec.ts',
      'tenancy-slice.e2e-spec.ts',
    ];

    it('reads --mode as --mode=x or --mode x, both by default', () => {
      expect(parseArgs([])).toEqual({ mode: 'both', fragments: [] });
      expect(parseArgs(['--mode=legacy'])).toEqual({
        mode: 'legacy',
        fragments: [],
      });
      expect(parseArgs(['--mode', 'Enforced', 'slice'])).toEqual({
        mode: 'enforced',
        fragments: ['slice'],
      });
      expect(parseArgs(['rls', '--mode=both'])).toEqual({
        mode: 'both',
        fragments: ['rls'],
      });
      expect(modesOf('both')).toEqual(['legacy', 'enforced']);
      expect(modesOf('legacy')).toEqual(['legacy']);
    });

    it('refuses an unknown mode, a missing value, an unknown flag and a repeated mode', () => {
      for (const argv of [
        ['--mode=strict'],
        ['--mode'],
        ['--mode', '--verbose'],
        ['--verbose'],
        ['-x'],
        ['--mode=legacy', '--mode', 'enforced'],
      ]) {
        expect(thrownBy(() => parseArgs(argv))).toMatchObject({
          name: 'UsageError',
        });
      }
    });

    it('runs every suite without a filter, and refuses a filter that matches none', () => {
      expect(selectSuites(files, [])).toEqual(files);
      expect(selectSuites(files, ['tenancy'])).toEqual(files.slice(1));
      expect(selectSuites(files, ['app', 'slice'])).toEqual([
        files[0],
        files[2],
      ]);
      expect(thrownBy(() => selectSuites(files, ['nothing']))).toMatchObject({
        name: 'UsageError',
        message: expect.stringContaining('"nothing"') as unknown,
      });
      expect(
        thrownBy(() => selectSuites(files, ['app', 'nope'])),
      ).toMatchObject({ name: 'UsageError' });
      expect(thrownBy(() => selectSuites([], []))).toMatchObject({
        name: 'UsageError',
      });
    });

    it('gives each process the mode asked for and none of the shell tenancy state', () => {
      const shell = {
        PATH: '/bin',
        TENANCY_MODE: 'enforced',
        LEGACY_DEFAULT_TENANT_CODE: 'x-y',
        DB_USER: 'someone',
        DB_PASSWORD: 'secret',
        E2E_TENANCY: 'enforced',
      };
      expect(childEnv(shell, 'legacy')).toEqual({
        PATH: '/bin',
        E2E_TENANCY: 'legacy',
      });
      for (const name of PINNED_ENV) {
        expect(childEnv(shell, 'enforced')).not.toHaveProperty(name);
      }
      expect(shell.TENANCY_MODE).toBe('enforced');
    });
  });

  describe('role hygiene helpers', () => {
    it('retries a concurrent role update with backoff, and only that', async () => {
      const operation = jest
        .fn<Promise<string>, []>()
        .mockRejectedValueOnce(concurrentUpdate())
        .mockRejectedValueOnce(concurrentUpdate())
        .mockResolvedValue('done');
      await expect(
        retryConcurrentRoleUpdate(operation, { baseDelayMs: 1 }),
      ).resolves.toBe('done');
      expect(operation).toHaveBeenCalledTimes(3);

      const other = jest
        .fn<Promise<string>, []>()
        .mockRejectedValue(
          Object.assign(new Error('role does not exist'), { code: '42704' }),
        );
      await expect(
        retryConcurrentRoleUpdate(other, { baseDelayMs: 1 }),
      ).rejects.toMatchObject({ code: '42704' });
      expect(other).toHaveBeenCalledTimes(1);

      const internal = jest
        .fn<Promise<string>, []>()
        .mockRejectedValue(
          Object.assign(new Error('something else broke'), { code: 'XX000' }),
        );
      await expect(
        retryConcurrentRoleUpdate(internal, { baseDelayMs: 1 }),
      ).rejects.toMatchObject({ message: 'something else broke' });
      expect(internal).toHaveBeenCalledTimes(1);
    });

    it('gives up after its attempts, with the last error', async () => {
      const operation = jest
        .fn<Promise<string>, []>()
        .mockRejectedValue(concurrentUpdate());
      await expect(
        retryConcurrentRoleUpdate(operation, { attempts: 3, baseDelayMs: 1 }),
      ).rejects.toMatchObject({ code: 'XX000' });
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('waits longer after every failed attempt, and never past its ceiling', async () => {
      const delays: number[] = [];
      const timers = jest.spyOn(global, 'setTimeout').mockImplementation(((
        fn: () => void,
        ms?: number,
      ) => {
        delays.push(ms ?? 0);
        fn();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
      try {
        await expect(
          retryConcurrentRoleUpdate(
            jest
              .fn<Promise<string>, []>()
              .mockRejectedValue(concurrentUpdate()),
            { attempts: 6, baseDelayMs: 100, maxDelayMs: 500, random: () => 1 },
          ),
        ).rejects.toMatchObject({ code: 'XX000' });
      } finally {
        timers.mockRestore();
      }
      expect(delays).toEqual([100, 200, 400, 500, 500]);
    });

    it('reports a failed cleanup with the text of both errors', () => {
      const created = new Error('migration failed');
      const dropped = new Error('database is being accessed');
      const failure = creationFailure('mms_tn_1', created, dropped);
      expect(failure).toBeInstanceOf(AggregateError);
      expect(failure.errors).toEqual([created, dropped]);
      expect(failure.cause).toBe(created);
      expect(failure.message).toContain('mms_tn_1');
      expect(failure.message).toContain('migration failed');
      expect(failure.message).toContain('database is being accessed');
    });
  });

  describe('the global teardown', () => {
    it('is wired into the e2e Jest configuration', () => {
      const config = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'jest-e2e.json'), 'utf8'),
      ) as { rootDir: string; globalTeardown?: string };
      expect(config.globalTeardown).toBe(
        '<rootDir>/support/e2e-roles.global-teardown.ts',
      );
      expect(
        fs.existsSync(
          path.join(__dirname, 'support', 'e2e-roles.global-teardown.ts'),
        ),
      ).toBe(true);
    });

    it('locks every application role, whatever state a test left them in', async () => {
      expect(APPLICATION_ROLES).toEqual(['mms_app', 'mms_platform']);
      const adminUrl = E2E_ADMIN_URL;
      await withClient(adminUrl, async (c) => {
        await alterRole(c, 'mms_app', APP_PASSWORD);
        await alterRole(c, 'mms_platform', APP_PASSWORD);
      });
      expect(await roleLogins(adminUrl)).toEqual([
        { rolname: 'mms_app', rolcanlogin: true },
        { rolname: 'mms_platform', rolcanlogin: true },
      ]);

      await lockRoles(adminUrl);

      expect(await roleLogins(adminUrl)).toEqual([
        { rolname: 'mms_app', rolcanlogin: false },
        { rolname: 'mms_platform', rolcanlogin: false },
      ]);
    });
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
      expect(await roleLogins(db.adminUrl)).toEqual([
        { rolname: 'mms_app', rolcanlogin: false },
        { rolname: 'mms_platform', rolcanlogin: false },
      ]);
    });
  });
});

// The connection hook on a real pool: connections are reused between tenants and
// the tenant a query sees is always the tenant of the code that issued it.
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { bindTenantToConnections } from '../src/database/tenancy/bind-tenant';
import {
  assertNoLegacyTenantDefault,
  assertRuntimeRoleEnforcesRls,
} from '../src/database/tenancy/boot-guards';
import { TenantContext } from '../src/database/tenancy/tenant-context';
import { TenancyConfigError } from '../src/database/tenancy/tenancy-mode';
import {
  buildTypeOrmOptions,
  tenantAwareDataSource,
} from '../src/database/typeorm.options';
import { eventually } from './support/eventually';
import {
  TENANT_1,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

// The cluster's admin URL, and the user it names (as the other suites read it)
const adminUrlOfRun = (): URL => {
  const url = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!url) throw new Error('MIGRATION_TEST_ADMIN_URL is not set');
  return new URL(url);
};

describe('tenant binding on a real pool (e2e)', () => {
  let db: TenantDatabase;
  let ds: DataSource;
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    db = await createTenantDatabase();
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    ds = new DataSource({
      type: 'postgres',
      url: db.appUrl,
      synchronize: false,
      installExtensions: false,
      extra: { min: 1, max: 2 },
    });
    bindTenantToConnections(ds);
    await ds.initialize();
  });

  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  const titles = (): Promise<string[]> =>
    ds
      .query<{ title: string }[]>(`SELECT title FROM tasks ORDER BY title`)
      .then((rows) => rows.map((r) => r.title));

  it('shows nothing without a scope', async () => {
    await expect(titles()).resolves.toEqual([]);
  });

  it('keeps 200 interleaved calls apart on a two-connection pool', async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        TenantContext.runAs({ tenantId: i % 2 ? a.id : b.id }, async () => ({
          wanted: i % 2 ? 'Task CANARY-A' : 'Task CANARY-B',
          got: await titles(),
        })),
      ),
    );
    results.forEach(({ wanted, got }) => expect(got).toEqual([wanted]));
  });

  it('applies the scope to transactions and to repositories alike', async () => {
    const viaTransaction = await TenantContext.runAs({ tenantId: a.id }, () =>
      ds.transaction(async (mgr) => {
        const first = await mgr.query<{ title: string }[]>(
          `SELECT title FROM tasks`,
        );
        await new Promise((resolve) => setImmediate(resolve));
        const second = await mgr.query<{ title: string }[]>(
          `SELECT title FROM tasks`,
        );
        return [first, second].map((rows) => rows.map((r) => r.title));
      }),
    );
    expect(viaTransaction).toEqual([['Task CANARY-A'], ['Task CANARY-A']]);
  });

  it('refuses a transaction that changes tenant half way', async () => {
    await expect(
      TenantContext.runAs({ tenantId: a.id }, () =>
        ds.transaction(async (mgr) => {
          await mgr.query(`SELECT 1`);
          // The inner scope does not move the transaction's connection to tenant B
          await TenantContext.runAs({ tenantId: b.id }, () =>
            mgr.query(`SELECT title FROM tasks`),
          );
        }),
      ),
    ).rejects.toMatchObject({ code: 'tenant_scope_mismatch' });
  });

  it('refuses a manually created query runner used under another scope', async () => {
    const runner = ds.createQueryRunner();
    try {
      await TenantContext.runAs({ tenantId: a.id }, () =>
        runner.query(`SELECT 1`),
      );
      await expect(
        TenantContext.runAs({ tenantId: b.id }, () => runner.query(`SELECT 1`)),
      ).rejects.toMatchObject({ code: 'tenant_scope_mismatch' });
    } finally {
      await runner.release();
    }
  });

  it('does not let a rolled-back transaction leak its tenant to the next user of the connection', async () => {
    await expect(
      TenantContext.runAs({ tenantId: a.id }, () =>
        ds.transaction(async (mgr) => {
          await mgr.query(`SELECT 1`);
          throw new Error('rollback');
        }),
      ),
    ).rejects.toThrow('rollback');
    await expect(titles()).resolves.toEqual([]);
  });

  // The store is shared and mutable: code that adopts a tenant while a transaction taken
  // under "no scope" is open makes the COMMIT, and then the ROLLBACK, mismatch. TypeORM
  // swallows the failed rollback and releases the client, which must NOT go back to the pool
  // still inside the transaction: the next tenant would write into it and lose the write.
  it('destroys the connection of a transaction that met a scope change, so no tenant writes inside it', async () => {
    const single = new DataSource({
      type: 'postgres',
      url: db.appUrl,
      synchronize: false,
      installExtensions: false,
      extra: { min: 1, max: 1 },
    });
    bindTenantToConnections(single);
    await single.initialize();
    try {
      await expect(
        TenantContext.start(() =>
          single.transaction(async (mgr) => {
            await mgr.query(`SELECT 1`);
            TenantContext.adopt({ tenantId: a.id });
          }),
        ),
      ).rejects.toMatchObject({ code: 'tenant_scope_mismatch' });

      // The only connection of the pool was the poisoned one: tenant B gets a clean one
      await TenantContext.runAs({ tenantId: b.id }, () =>
        single.query(`UPDATE tasks SET title = $1 WHERE id = $2`, [
          'B wrote this',
          b.taskId,
        ]),
      );

      const committed = await db.admin((c) =>
        c.query<{ title: string }>(`SELECT title FROM tasks WHERE id = $1`, [
          b.taskId,
        ]),
      );
      expect(committed.rows[0].title).toBe('B wrote this');
      await eventually(
        async () =>
          (
            await db.admin((c) =>
              c.query<{ n: string }>(
                `SELECT count(*) AS n FROM pg_stat_activity
                WHERE datname = $1 AND state = 'idle in transaction'`,
                [db.name],
              ),
            )
          ).rows[0].n === '0',
        'no connection left idle in a transaction',
      );
    } finally {
      await single.destroy();
      await db.admin((c) =>
        c.query(`UPDATE tasks SET title = 'Task CANARY-B' WHERE id = $1`, [
          b.taskId,
        ]),
      );
    }
  });
});

// What the databases and roles of an enforced deployment must look like, checked on real
// Postgres catalogs (the settings live in pg_db_role_setting, the role flags in pg_roles)
describe('boot guards (e2e)', () => {
  const dbs: TenantDatabase[] = [];
  const sources: DataSource[] = [];

  const database = async (
    options?: Parameters<typeof createTenantDatabase>[0],
  ): Promise<TenantDatabase> => {
    const created = await createTenantDatabase(options);
    dbs.push(created);
    return created;
  };
  const connect = async (url: string): Promise<DataSource> => {
    const ds = await new DataSource({
      type: 'postgres',
      url,
      installExtensions: false,
    }).initialize();
    sources.push(ds);
    return ds;
  };
  const setForAppRole = (db: TenantDatabase, tenantId: string) =>
    db.admin((c) =>
      c.query(
        `ALTER ROLE mms_app IN DATABASE ${db.name} SET app.tenant_id = '${tenantId}'`,
      ),
    );

  afterEach(async () => {
    await Promise.all(sources.splice(0).map((ds) => ds.destroy()));
    await Promise.all(dbs.splice(0).map((db) => db.drop()));
  });

  describe('assertNoLegacyTenantDefault', () => {
    it('passes on an enforced database and refuses one that kept the legacy default', async () => {
      const enforced = await database();
      const legacy = await database({ keepLegacyDefault: true });
      const good = await connect(enforced.appUrl);
      const bad = await connect(legacy.appUrl);

      await expect(assertNoLegacyTenantDefault(good)).resolves.toBeUndefined();
      await expect(assertNoLegacyTenantDefault(bad)).rejects.toThrow(
        /legacy_tenant_default_present/,
      );
    });

    it('refuses a default set for a role in this database', async () => {
      const db = await database();
      await setForAppRole(db, TENANT_1);
      const ds = await connect(db.appUrl);

      await expect(assertNoLegacyTenantDefault(ds)).rejects.toThrow(
        /legacy_tenant_default_present.*app\.tenant_id=a1000000/,
      );
    });

    // pg_db_role_setting does not list postgresql.conf, ALTER SYSTEM or connection options;
    // a connection option is the one of these a test can set without touching the cluster
    it('refuses a default that no catalog row shows, here a connection option', async () => {
      const db = await database();
      const ds = await new DataSource({
        type: 'postgres',
        url: db.appUrl,
        installExtensions: false,
        extra: { options: `-c app.tenant_id=${TENANT_1}` },
      }).initialize();
      sources.push(ds);

      await expect(assertNoLegacyTenantDefault(ds)).rejects.toThrow(
        /legacy_tenant_default_present.*app\.tenant_id=a1000000.*not in pg_db_role_setting/,
      );
    });

    it('leaves no transaction open when it passes', async () => {
      const db = await database();
      const ds = await connect(db.appUrl);

      await assertNoLegacyTenantDefault(ds);

      const [{ n }] = await db.admin(
        async (c) =>
          (
            await c.query<{ n: string }>(
              `SELECT count(*) AS n FROM pg_stat_activity
              WHERE datname = $1 AND state = 'idle in transaction'`,
              [db.name],
            )
          ).rows,
      );
      expect(n).toBe('0');
    });

    it('ignores defaults that belong to another database', async () => {
      const other = await database({ keepLegacyDefault: true });
      await setForAppRole(other, TENANT_1);
      const clean = await database();
      const ds = await connect(clean.appUrl);

      await expect(assertNoLegacyTenantDefault(ds)).resolves.toBeUndefined();
    });
  });

  describe('assertRuntimeRoleEnforcesRls', () => {
    it('passes for the application role and refuses a superuser', async () => {
      const db = await database();
      const app = await connect(db.appUrl);
      const superuser = await connect(db.adminUrl);

      await expect(assertRuntimeRoleEnforcesRls(app)).resolves.toBeUndefined();
      await expect(assertRuntimeRoleEnforcesRls(superuser)).rejects.toThrow(
        /runtime_role_bypasses_rls/,
      );
    });
  });
});

describe('tenantAwareDataSource (e2e)', () => {
  const originalMode = process.env.TENANCY_MODE;
  const dbs: TenantDatabase[] = [];
  const sources: DataSource[] = [];

  const database = async (
    options?: Parameters<typeof createTenantDatabase>[0],
  ): Promise<TenantDatabase> => {
    const created = await createTenantDatabase(options);
    dbs.push(created);
    return created;
  };
  const withMode = <T>(
    mode: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> => {
    if (mode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = mode;
    return fn();
  };
  const open = async (url: string): Promise<DataSource> => {
    const ds = await tenantAwareDataSource({
      type: 'postgres',
      url,
      installExtensions: false,
    });
    sources.push(ds);
    return ds;
  };
  const connectionsOf = (db: TenantDatabase, user: string): Promise<number> =>
    db.admin(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM pg_stat_activity
          WHERE datname = $1 AND usename = $2 AND pid <> pg_backend_pid()`,
        [db.name, user],
      );
      return Number(rows[0].n);
    });

  afterEach(async () => {
    if (originalMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = originalMode;
    await Promise.all(sources.splice(0).map((ds) => ds.destroy()));
    await Promise.all(dbs.splice(0).map((db) => db.drop()));
  });

  it('binds every connection to the caller tenant in enforced mode', async () => {
    const db = await database();
    const seeded = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    const ds = await withMode('enforced', () => open(db.appUrl));

    const titles = () =>
      ds
        .query<{ title: string }[]>(`SELECT title FROM tasks`)
        .then((rows) => rows.map((r) => r.title));

    await expect(titles()).resolves.toEqual([]);
    await expect(
      TenantContext.runAs({ tenantId: seeded.id }, titles),
    ).resolves.toEqual(['Task CANARY-A']);
  });

  it('refuses to start on a database that kept the legacy default, and closes its connections', async () => {
    const db = await database({ keepLegacyDefault: true });

    await expect(withMode('enforced', () => open(db.appUrl))).rejects.toThrow(
      /legacy_tenant_default_present/,
    );
    await eventually(
      async () => (await connectionsOf(db, 'mms_app')) === 0,
      'the refused data source closing its connections',
    );
  });

  it('refuses to start as a superuser, and closes its connections', async () => {
    const db = await database();

    await expect(withMode('enforced', () => open(db.adminUrl))).rejects.toThrow(
      /runtime_role_bypasses_rls/,
    );
    await eventually(
      async () =>
        (await connectionsOf(
          db,
          decodeURIComponent(adminUrlOfRun().username),
        )) === 0,
      'the refused data source closing its connections',
    );
  });

  it('leaves legacy mode alone: no binding, the legacy default is what a session sees', async () => {
    const db = await database({ keepLegacyDefault: true });
    const seeded = await seedTenant(db, 'phu-dinh', 'CANARY-A');

    const ds = await withMode(undefined, () => open(db.appUrl));

    // The legacy default still gives the first tenant to a session that sets none
    const rows = await ds.query<{ title: string }[]>(`SELECT title FROM tasks`);
    expect(seeded.id).toBe(TENANT_1);
    expect(rows.map((r) => r.title)).toEqual(['Task CANARY-A']);
  });

  // Legacy mode depends on the database default of migration 037, which pg_dump without
  // --create does not carry: a database that lost it must not boot
  it('refuses to start in legacy mode on a database that lost its default tenant, and closes its connections', async () => {
    const db = await database();

    await expect(withMode(undefined, () => open(db.appUrl))).rejects.toThrow(
      /legacy_tenant_default_missing/,
    );
    await eventually(
      async () => (await connectionsOf(db, 'mms_app')) === 0,
      'the refused data source closing its connections',
    );
  });

  it('starts in legacy mode on a database that kept its default tenant, as a superuser or as mms_app', async () => {
    const db = await database({ keepLegacyDefault: true });

    const app = await withMode(undefined, () => open(db.appUrl));
    const superuser = await withMode(undefined, () => open(db.adminUrl));

    await expect(app.query(`SELECT 1 AS ok`)).resolves.toEqual([{ ok: 1 }]);
    await expect(superuser.query(`SELECT 1 AS ok`)).resolves.toEqual([
      { ok: 1 },
    ]);
  });

  describe('the role of a legacy deployment', () => {
    const roles: string[] = [];
    const password = 'legacy_role_e2e';

    // Roles are cluster-wide: a unique name per test, dropped afterwards
    const createRole = async (
      db: TenantDatabase,
      attributes: string,
    ): Promise<string> => {
      const role = `mms_lr_${process.pid}_${Date.now()}_${roles.length}`;
      roles.push(role);
      await db.admin((c) =>
        c.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER ${attributes}`,
        ),
      );
      return role;
    };
    const urlOf = (db: TenantDatabase, role: string): string => {
      const url = new URL(db.adminUrl);
      url.username = role;
      url.password = password;
      return url.toString();
    };

    afterEach(async () => {
      // The sources of the test must be closed before their role can be dropped
      await Promise.all(sources.splice(0).map((ds) => ds.destroy()));
      const admin = adminUrlOfRun();
      const client = new Client({ connectionString: admin.toString() });
      await client.connect();
      try {
        for (const role of roles.splice(0)) {
          await client.query(`DROP ROLE IF EXISTS ${role}`);
        }
      } finally {
        await client.end();
      }
    });

    it('refuses a plain role: Row-Level Security would show it empty tables', async () => {
      const db = await database({ keepLegacyDefault: true });
      const role = await createRole(db, 'NOBYPASSRLS');

      await expect(
        withMode(undefined, () => open(urlOf(db, role))),
      ).rejects.toThrow(/legacy_role_blocked_by_rls/);
      await eventually(
        async () => (await connectionsOf(db, role)) === 0,
        'the refused data source closing its connections',
      );
    });

    it('accepts a BYPASSRLS role and a member of mms_app', async () => {
      const db = await database({ keepLegacyDefault: true });
      const bypass = await createRole(db, 'BYPASSRLS');
      const member = await createRole(db, 'NOBYPASSRLS IN ROLE mms_app');

      const first = await withMode(undefined, () => open(urlOf(db, bypass)));
      const second = await withMode(undefined, () => open(urlOf(db, member)));

      await expect(first.query(`SELECT 1 AS ok`)).resolves.toEqual([{ ok: 1 }]);
      await expect(second.query(`SELECT 1 AS ok`)).resolves.toEqual([
        { ok: 1 },
      ]);
    });
  });

  it('fails startup on an unknown TENANCY_MODE', async () => {
    const db = await database();

    await expect(withMode('enforce', () => open(db.appUrl))).rejects.toThrow(
      /Invalid TENANCY_MODE/,
    );
  });

  it('is not retried by TypeOrmModule when the configuration is what is wrong', async () => {
    // The module retries a failing factory 9 times, 3 s apart, unless toRetry says no
    const db = await database();
    const url = new URL(db.adminUrl);
    const settings: Record<string, unknown> = {
      'database.host': url.hostname,
      'database.port': Number(url.port),
      'database.username': decodeURIComponent(url.username),
      'database.password': decodeURIComponent(url.password),
      'database.database': db.name,
    };
    const config = { get: (key: string) => settings[key] } as ConfigService;
    const factory = jest.fn(tenantAwareDataSource);

    await expect(
      withMode('enforced', () =>
        Test.createTestingModule({
          imports: [
            TypeOrmModule.forRootAsync({
              useFactory: () => buildTypeOrmOptions(config),
              dataSourceFactory: factory,
            }),
          ],
        }).compile(),
      ),
    ).rejects.toBeInstanceOf(TenancyConfigError);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

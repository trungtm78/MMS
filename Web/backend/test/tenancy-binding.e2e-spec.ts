// The connection hook on a real pool: connections are reused between tenants and
// the tenant a query sees is always the tenant of the code that issued it.
import { DataSource } from 'typeorm';
import { bindTenantToConnections } from '../src/database/tenancy/bind-tenant';
import { assertNoLegacyTenantDefault } from '../src/database/tenancy/legacy-default-guard';
import { TenantContext } from '../src/database/tenancy/tenant-context';
import { tenantAwareDataSource } from '../src/database/typeorm.options';
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

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
});

describe('legacy tenant default guard (e2e)', () => {
  it('passes on an enforced database and refuses one that kept the legacy default', async () => {
    const enforced = await createTenantDatabase();
    const legacy = await createTenantDatabase({ keepLegacyDefault: true });
    const connect = (url: string) => {
      const ds = new DataSource({
        type: 'postgres',
        url,
        installExtensions: false,
      });
      return ds.initialize();
    };
    const good = await connect(enforced.appUrl);
    const bad = await connect(legacy.appUrl);
    try {
      await expect(assertNoLegacyTenantDefault(good)).resolves.toBeUndefined();
      await expect(assertNoLegacyTenantDefault(bad)).rejects.toThrow(
        /legacy_tenant_default_present/,
      );
    } finally {
      await good.destroy();
      await bad.destroy();
      await enforced.drop();
      await legacy.drop();
    }
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
  const open = async (db: TenantDatabase): Promise<DataSource> => {
    const ds = await tenantAwareDataSource({
      type: 'postgres',
      url: db.appUrl,
      installExtensions: false,
    });
    sources.push(ds);
    return ds;
  };
  const appConnections = (db: TenantDatabase): Promise<number> =>
    db.admin(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM pg_stat_activity
          WHERE datname = $1 AND usename = 'mms_app'`,
        [db.name],
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
    const ds = await withMode('enforced', () => open(db));

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

    await expect(withMode('enforced', () => open(db))).rejects.toThrow(
      /legacy_tenant_default_present/,
    );
    await expect(appConnections(db)).resolves.toBe(0);
  });

  it('leaves legacy mode alone: no binding and no guard', async () => {
    const db = await database({ keepLegacyDefault: true });
    const seeded = await seedTenant(db, 'phu-dinh', 'CANARY-A');

    const ds = await withMode(undefined, () => open(db));

    // The legacy default still gives the first tenant to a session that sets none
    const rows = await ds.query<{ title: string }[]>(`SELECT title FROM tasks`);
    expect(seeded.id).toBe('a1000000-0000-4000-8000-000000000001');
    expect(rows.map((r) => r.title)).toEqual(['Task CANARY-A']);
  });

  it('fails startup on an unknown TENANCY_MODE', async () => {
    const db = await database();

    await expect(withMode('enforce', () => open(db))).rejects.toThrow(
      /Invalid TENANCY_MODE/,
    );
  });
});

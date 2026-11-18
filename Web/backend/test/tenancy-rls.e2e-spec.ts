// Database-level proof of tenant isolation (M0): connected as the runtime role mms_app,
// with the tenant written to the session the way the application does.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand (the roles are cluster-wide).
import {
  SLICE_TABLES,
  TENANT_1,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

describe('tenant isolation in the database (e2e)', () => {
  let db: TenantDatabase;
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    db = await createTenantDatabase();
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('shows a connection with no tenant nothing, in every slice table', async () => {
    for (const table of SLICE_TABLES) {
      const count = await db.app('', async (c) => {
        const { rows } = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table}`,
        );
        return Number(rows[0].n);
      });
      expect({ table, count }).toEqual({ table, count: 0 });
    }
  });

  it('shows a tenant exactly its own rows, in every slice table', async () => {
    for (const table of SLICE_TABLES) {
      const [own, foreign] = await db.app(a.id, async (c) => {
        const mine = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table} WHERE tenant_id = $1`,
          [a.id],
        );
        const other = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table} WHERE tenant_id = $1`,
          [b.id],
        );
        return [Number(mine.rows[0].n), Number(other.rows[0].n)];
      });
      expect({ table, own, foreign }).toEqual({ table, own: 1, foreign: 0 });
    }
  });

  it('refuses an insert without a tenant', async () => {
    // Postgres evaluates the row-level security check before the NOT NULL constraint, so
    // the runtime role is stopped by the policy (42501) ...
    await expect(
      db.app('', (c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('NO-TENANT', 'x', 'area')`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    // ... and a session that bypasses row-level security (a superuser) by the constraint
    // (23502), since no tenant default applies once the legacy database default is reset
    await expect(
      db.admin((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('NO-TENANT', 'x', 'area')`,
        ),
      ),
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('refuses writing a row for another tenant, by insert or by update', async () => {
    await expect(
      db.app(a.id, (c) =>
        c.query(
          `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, 'X-B', 'x', 'area')`,
          [b.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.app(a.id, (c) =>
        c.query(`UPDATE units SET tenant_id = $1 WHERE id = $2`, [
          b.id,
          a.unitId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('cannot update or delete another tenant row', async () => {
    const [updated, deleted] = await db.app(a.id, async (c) => {
      const u = await c.query(
        `UPDATE users SET full_name = 'hijacked' WHERE id = $1`,
        [b.adminId],
      );
      const d = await c.query(`DELETE FROM tasks WHERE id = $1`, [b.taskId]);
      return [u.rowCount, d.rowCount];
    });
    expect([updated, deleted]).toEqual([0, 0]);
  });

  it('allows the same username, unit code and task code in two tenants but not twice in one', async () => {
    await db.admin(async (c) => {
      await c.query(
        `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, 'SHARED', 'x', 'area'), ($2, 'SHARED', 'x', 'area')`,
        [a.id, b.id],
      );
      await expect(
        c.query(
          `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, 'SHARED', 'y', 'area')`,
          [a.id],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('scopes the username, task code, militia code and CCCD uniqueness to the tenant', async () => {
    interface Insert {
      sql: string;
      values: string[];
    }
    const insertUser = (tenantId: string): Insert => ({
      sql: `INSERT INTO users (tenant_id, username, password_hash, full_name)
            VALUES ($1, 'shared-user', 'x', 'x')`,
      values: [tenantId],
    });
    const insertTask = (tenantId: string): Insert => ({
      sql: `INSERT INTO tasks (tenant_id, code, title, type, created_by)
            VALUES ($1, 'SHARED-TASK', 'x', 'patrol', $2)`,
      values: [tenantId, tenantId === a.id ? a.adminId : b.adminId],
    });
    const insertMember = (tenantId: string): Insert => ({
      sql: `INSERT INTO militia_profiles (tenant_id, militia_code, full_name, cccd, dob, unit_id, join_date)
            VALUES ($1, 'DQ-SHARED', 'x', '000000000001', '1998-04-04', $2, '2022-01-01')`,
      values: [tenantId, tenantId === a.id ? a.unitId : b.unitId],
    });
    await db.admin(async (c) => {
      for (const insert of [insertUser, insertTask, insertMember]) {
        await c.query(insert(a.id).sql, insert(a.id).values);
        await c.query(insert(b.id).sql, insert(b.id).values);
        await expect(
          c.query(insert(a.id).sql, insert(a.id).values),
        ).rejects.toMatchObject({ code: '23505' });
      }
    });
  });

  it('exposes the tenant list only through the narrow functions', async () => {
    const own = await db.app(a.id, async (c) =>
      (await c.query<{ id: string }>(`SELECT id FROM tenants`)).rows.map(
        (r) => r.id,
      ),
    );
    expect(own).toEqual([a.id]);
    const none = await db.app(
      '',
      async (c) =>
        (await c.query<{ id: string }>(`SELECT id FROM tenants`)).rows,
    );
    expect(none).toEqual([]);

    const found = await db.app(
      '',
      async (c) =>
        (
          await c.query<{ id: string; status: string }>(
            `SELECT id, status FROM auth_tenant_by_code($1)`,
            [' PHU-DINH '],
          )
        ).rows,
    );
    expect(found).toEqual([{ id: TENANT_1, status: 'active' }]);
    const unknown = await db.app(
      '',
      async (c) =>
        (
          await c.query<{ id: string }>(
            `SELECT id FROM auth_tenant_by_code('nope')`,
          )
        ).rows,
    );
    expect(unknown).toEqual([]);

    const maintenance = await db.app(
      '',
      async (c) =>
        (
          await c.query<{ id: string }>(
            `SELECT id FROM maintenance_tenant_ids()`,
          )
        ).rows,
    );
    expect(maintenance.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('gives the platform role no access to business tables', async () => {
    await db.platform(async (c) => {
      await expect(c.query(`SELECT 1 FROM users`)).rejects.toMatchObject({
        code: '42501',
      });
      const { rows } = await c.query(`SELECT id FROM tenants`);
      expect(rows).toHaveLength(2);
    });
  });

  it('keeps the migration history away from the runtime role', async () => {
    await expect(
      db.app(a.id, (c) => c.query(`SELECT 1 FROM schema_migrations`)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('runs the application roles without superuser or RLS bypass', async () => {
    const roles = await db.admin(
      async (c) =>
        (
          await c.query<{
            rolname: string;
            rolsuper: boolean;
            rolbypassrls: boolean;
          }>(
            `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
           WHERE rolname IN ('mms_app', 'mms_platform') ORDER BY rolname`,
          )
        ).rows,
    );
    expect(roles).toEqual([
      { rolname: 'mms_app', rolsuper: false, rolbypassrls: false },
      { rolname: 'mms_platform', rolsuper: false, rolbypassrls: false },
    ]);
  });

  it('forces RLS on every slice table', async () => {
    const rows = await db.admin(
      async (c) =>
        (
          await c.query<{
            relname: string;
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
          }>(
            `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
           WHERE relname = ANY($1::text[]) AND relkind = 'r'`,
            [SLICE_TABLES],
          )
        ).rows,
    );
    expect(rows).toHaveLength(SLICE_TABLES.length);
    rows.forEach((r) =>
      expect(r).toMatchObject({
        relrowsecurity: true,
        relforcerowsecurity: true,
      }),
    );
  });
});

describe('legacy single-tenant default (e2e)', () => {
  let db: TenantDatabase;

  beforeAll(async () => {
    db = await createTenantDatabase({ keepLegacyDefault: true });
  });
  afterAll(async () => {
    await db?.drop();
  });

  it('puts rows written without a tenant into the first tenant', async () => {
    // A superuser session (migrations, admin tools, the pre-M1 test suites) inherits the
    // database default and so keeps working unchanged
    const tenantId = await db.admin(async (c) => {
      await c.query(
        `INSERT INTO units (code, name, type) VALUES ('LEGACY', 'x', 'area')`,
      );
      return (
        await c.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM units WHERE code = 'LEGACY'`,
        )
      ).rows[0].tenant_id;
    });
    expect(tenantId).toBe(TENANT_1);
  });
});

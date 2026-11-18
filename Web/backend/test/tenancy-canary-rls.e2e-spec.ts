// Tenant isolation of EVERY tenant table (M1a), at the database level, as the runtime role
// mms_app. The canary seeder plants a row in each table of each tenant, so these proofs
// cover a table the moment its migration adds it.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import { randomUUID } from 'crypto';
import type { Client } from 'pg';
import {
  buildRow,
  globalRows,
  insertRow,
  quoteIdent,
  readTenantSchema,
  seedCanaryRows,
  type SeededRows,
  type TableShape,
} from './support/canary-seeder';
import { tenantTables } from './support/tenancy-catalog';
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(240_000);

const insertTenant = async (c: Client, code: string): Promise<string> => {
  const id = randomUUID();
  await c.query('INSERT INTO tenants (id, code, name) VALUES ($1, $2, $3)', [
    id,
    code,
    code,
  ]);
  return id;
};

describe('tenant isolation of every tenant table (e2e)', () => {
  let db: TenantDatabase;
  let a: SeededTenant;
  let b: SeededTenant;
  let tables: string[];
  let shapes: TableShape[];
  let globals: SeededRows;
  let rowsA: SeededRows;
  let rowsB: SeededRows;

  const countWhere = (table: string, where: string) =>
    `SELECT count(*) AS n FROM ${quoteIdent(table)} WHERE ${where}`;

  beforeAll(async () => {
    db = await createTenantDatabase();
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    [tables, shapes] = await db.admin(
      async (c) => [await tenantTables(c), await readTenantSchema(c)] as const,
    );
    globals = await db.admin((c) => globalRows(c, shapes));
    rowsA = await db.admin((c) =>
      seedCanaryRows(c, { tenantId: a.id, label: 'A', batch: 1 }),
    );
    rowsB = await db.admin((c) =>
      seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 1 }),
    );
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('plants a canary row in every tenant table of both tenants', () => {
    expect([...rowsA.keys()].sort()).toEqual([...tables].sort());
    expect([...rowsB.keys()].sort()).toEqual([...tables].sort());
  });

  it('shows a connection with no tenant nothing, in every tenant table', async () => {
    const seen = await db.app('', async (c) => {
      const visible: string[] = [];
      for (const table of tables) {
        const { rows } = await c.query<{ n: string }>(
          countWhere(table, 'true'),
        );
        if (Number(rows[0].n) !== 0) visible.push(`${table}: ${rows[0].n}`);
      }
      return visible;
    });
    expect(seen).toEqual([]);
  });

  it('shows each tenant its own rows and none of the other, in every tenant table', async () => {
    const wrong = await db.app(a.id, async (c) => {
      const found: string[] = [];
      for (const table of tables) {
        const all = Number(
          (await c.query<{ n: string }>(countWhere(table, 'true'))).rows[0].n,
        );
        const own = Number(
          (
            await c.query<{ n: string }>(countWhere(table, 'tenant_id = $1'), [
              a.id,
            ])
          ).rows[0].n,
        );
        if (own === 0 || all !== own)
          found.push(`${table}: ${own} own of ${all}`);
      }
      return found;
    });
    expect(wrong).toEqual([]);
  });

  it('refuses a row written for another tenant, in every tenant table', async () => {
    const wrong = await db.app(a.id, async (c) => {
      const found: string[] = [];
      for (const shape of shapes) {
        const row = buildRow(
          shape,
          { tenantId: b.id, label: 'B', batch: 30 },
          rowsB,
          globals,
        );
        await c.query('BEGIN');
        try {
          await insertRow(c, shape.name, row);
          found.push(`${shape.name}: accepted`);
        } catch (error) {
          const { code } = error as { code?: string };
          if (code !== '42501') found.push(`${shape.name}: ${code}`);
        } finally {
          await c.query('ROLLBACK');
        }
      }
      return found;
    });
    expect(wrong).toEqual([]);
  });

  it('refuses, foreign key by foreign key, a row that points at a row of another tenant', async () => {
    // Per table, two fresh tenants hold only the parents a row of that table can point at.
    // The table has no row of its own, so no unique key (task_assignments: task and
    // assignee) answers before the foreign key does
    let checked = 0;
    const wrong: string[] = [];
    for (const [index, shape] of shapes.entries()) {
      const keys = shape.foreignKeys.filter((k) => !k.global);
      if (keys.length === 0) continue;
      const [tenantA, tenantB] = await db.admin(async (c) => [
        await insertTenant(c, `fk-${index}-a`),
        await insertTenant(c, `fk-${index}-b`),
      ]);
      const parentsA = await db.admin((c) =>
        seedCanaryRows(c, {
          tenantId: tenantA,
          label: 'A',
          batch: 1,
          ancestorsOf: shape.name,
        }),
      );
      const parentsB = await db.admin((c) =>
        seedCanaryRows(c, {
          tenantId: tenantB,
          label: 'B',
          batch: 1,
          ancestorsOf: shape.name,
        }),
      );
      await db.app(tenantA, async (c) => {
        for (const fk of keys) {
          const parent = parentsB.get(fk.parent);
          if (!parent)
            throw new Error(`no parent row of tenant B in ${fk.parent}`);
          // A column shared by two keys (training_records.militia_id) breaks both
          const sharing = shape.foreignKeys
            .filter((k) => k.columns.some((col) => fk.columns.includes(col)))
            .map((k) => k.name);
          const row = buildRow(
            shape,
            { tenantId: tenantA, label: 'A', batch: 1 },
            parentsA,
            globals,
            { foreignKey: fk.name, parent },
          );
          await c.query('BEGIN');
          try {
            await insertRow(c, shape.name, row);
            wrong.push(`${shape.name}.${fk.name}: accepted a row of tenant B`);
          } catch (error) {
            const { code, constraint } = error as {
              code?: string;
              constraint?: string;
            };
            if (code !== '23503' || !sharing.includes(constraint ?? '')) {
              wrong.push(
                `${shape.name}.${fk.name}: ${code} ${constraint ?? ''} ${error instanceof Error ? error.message : ''}`,
              );
            }
          } finally {
            await c.query('ROLLBACK');
          }
          checked++;
        }
      });
    }
    expect(wrong).toEqual([]);
    expect(checked).toBe(114);
  });

  it('keeps the record-keeping triggers of migration 026 on tenant rows', async () => {
    await db.app(b.id, async (c) => {
      for (const sql of [
        `UPDATE reward_decisions SET basis = basis`,
        `DELETE FROM weapon_inventory_checks`,
        `UPDATE weapon_inventory_items SET found = found`,
        `UPDATE kpi_target_settings SET min_attendance_days = min_attendance_days`,
        `UPDATE discipline_decisions SET violation = 'changed'`,
      ]) {
        await expect(c.query(sql)).rejects.toMatchObject({ code: '23001' });
      }
    });
  });
});

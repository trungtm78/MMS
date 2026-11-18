// Schema guard (M1a). Every table of the public schema is either a listed global table or
// carries the full tenant isolation template: tenant_id, forced RLS with the exact policy,
// foreign keys scoped by tenant, unique keys inside a tenant, the indexes those need, and
// exactly the listed privileges. A new table, key, view, SECURITY DEFINER function or grant
// that would open a path around Row-Level Security fails here, before any data is at risk.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import type { Client } from 'pg';
import {
  ALL_PRIVILEGES,
  DML,
  GLOBAL_REFERENCES,
  GLOBAL_TABLES,
  GLOBAL_UNIQUE_EXCEPTIONS,
  SECURITY_DEFINER_FUNCTIONS,
  TENANT_ISOLATION_EXPRESSION,
  isGlobalTable,
  isListed,
  publicTables,
  tenantTables,
} from './support/tenancy-catalog';
import {
  TENANT_1,
  createTenantDatabase,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

interface ForeignKeyRow {
  name: string;
  table: string;
  parent: string;
  validated: boolean;
  /** pg_constraint.confdeltype: 'a' no action, 'r' restrict, 'c' cascade, 'n' set null, 'd' set default */
  onDelete: string;
  /** ON DELETE SET NULL (cols): null when the clause carries no column list */
  setNullColumns: string[] | null;
  columns: string[];
  parentColumns: string[];
}

interface IndexRow {
  table: string;
  index: string;
  unique: boolean;
  primary: boolean;
  partial: boolean;
  nullsNotDistinct: boolean;
  /** A CONCURRENTLY build that failed leaves an index that is not valid, or not ready */
  usable: boolean;
  columns: string[];
  notNull: boolean[];
}

const FOREIGN_KEYS_SQL = `
  SELECT f.conname AS name, c.relname AS "table", p.relname AS parent,
         f.convalidated AS validated, f.confdeltype AS "onDelete",
         CASE WHEN f.confdelsetcols IS NULL THEN NULL
              ELSE ARRAY(SELECT a.attname FROM unnest(f.confdelsetcols) AS k(attnum)
                           JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.attnum
                          ORDER BY a.attname)::text[] END AS "setNullColumns",
         ARRAY(SELECT a.attname FROM unnest(f.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.attnum
                ORDER BY k.ord)::text[] AS columns,
         ARRAY(SELECT a.attname FROM unnest(f.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = f.confrelid AND a.attnum = k.attnum
                ORDER BY k.ord)::text[] AS "parentColumns"
    FROM pg_constraint f
    JOIN pg_class c ON c.oid = f.conrelid
    JOIN pg_class p ON p.oid = f.confrelid
   WHERE f.contype = 'f' AND c.relnamespace = 'public'::regnamespace
     AND c.relname = ANY ($1)
   ORDER BY c.relname, f.conname`;

// Key columns only (INCLUDE columns do not make an index unique or usable as a prefix)
const INDEXES_SQL = `
  SELECT c.relname AS "table", i.relname AS "index", x.indisunique AS "unique",
         x.indisprimary AS "primary", x.indpred IS NOT NULL AS partial,
         x.indnullsnotdistinct AS "nullsNotDistinct",
         (x.indisvalid AND x.indisready) AS usable,
         ARRAY(SELECT COALESCE(a.attname, '<expression>')
                 FROM unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                 LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
                WHERE k.ord <= x.indnkeyatts ORDER BY k.ord)::text[] AS columns,
         ARRAY(SELECT COALESCE(a.attnotnull, false)
                 FROM unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                 LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
                WHERE k.ord <= x.indnkeyatts ORDER BY k.ord)::bool[] AS "notNull"
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class c ON c.oid = x.indrelid
   WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
   ORDER BY c.relname, i.relname`;

const foreignKeys = async (c: Client, tables: string[]) =>
  (await c.query<ForeignKeyRow>(FOREIGN_KEYS_SQL, [tables])).rows;
const indexes = async (c: Client, tables: string[]) =>
  (await c.query<IndexRow>(INDEXES_SQL, [tables])).rows;

/** The tenant-scoped foreign keys: those that pair tenant_id with the parent's tenant_id. */
const scopedForeignKeys = (fks: ForeignKeyRow[], tenantSet: Set<string>) =>
  fks.filter(
    (fk) =>
      tenantSet.has(fk.parent) &&
      fk.parentColumns[fk.columns.indexOf('tenant_id')] === 'tenant_id',
  );

describe('tenant schema guard (e2e)', () => {
  let db: TenantDatabase;
  let tables: string[];
  let globals: string[];

  beforeAll(async () => {
    db = await createTenantDatabase();
    [tables, globals] = await db.admin(async (c) => {
      const all = await publicTables(c);
      return [await tenantTables(c), all.filter(isGlobalTable)] as const;
    });
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('knows every global table it lists, and treats every other table as a tenant table', () => {
    expect([...globals].sort()).toEqual(Object.keys(GLOBAL_TABLES).sort());
    expect(tables.length).toBeGreaterThanOrEqual(66);
  });

  it('gives every tenant table tenant_id uuid NOT NULL DEFAULT app_tenant_id(), validated against tenants', async () => {
    const rows = await db.admin(
      async (c) =>
        (
          await c.query<{
            table: string;
            type: string | null;
            notNull: boolean | null;
            default: string | null;
            referencesTenants: boolean;
          }>(
            `SELECT c.relname AS "table", format_type(a.atttypid, a.atttypmod) AS type,
                    a.attnotnull AS "notNull", pg_get_expr(d.adbin, d.adrelid) AS "default",
                    EXISTS (SELECT 1 FROM pg_constraint f
                             WHERE f.conrelid = c.oid AND f.contype = 'f' AND f.convalidated
                               AND f.confrelid = 'tenants'::regclass
                               AND f.conkey = ARRAY[a.attnum]::int2[]) AS "referencesTenants"
               FROM pg_class c
               LEFT JOIN pg_attribute a
                 ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
               LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
              WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
              ORDER BY c.relname`,
            [tables],
          )
        ).rows,
    );
    const wrong = rows
      .filter(
        (r) =>
          !(
            r.type === 'uuid' &&
            r.notNull === true &&
            r.default === 'app_tenant_id()' &&
            r.referencesTenants
          ),
      )
      .map((r) => `${r.table}: ${JSON.stringify(r)}`);
    expect(wrong).toEqual([]);
  });

  it('forces row-level security with exactly the tenant_isolation policy on every tenant table', async () => {
    const rows = await db.admin(
      async (c) =>
        (
          await c.query<{
            table: string;
            enabled: boolean;
            forced: boolean;
            policies: unknown[];
          }>(
            `SELECT c.relname AS "table", c.relrowsecurity AS enabled,
                    c.relforcerowsecurity AS forced,
                    COALESCE(json_agg(json_build_object(
                      'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
                      'roles', ARRAY(SELECT r.rolname FROM pg_roles r
                                      WHERE r.oid = ANY (p.polroles) ORDER BY 1),
                      'using', pg_get_expr(p.polqual, p.polrelid),
                      'check', pg_get_expr(p.polwithcheck, p.polrelid)))
                      FILTER (WHERE p.oid IS NOT NULL), '[]') AS policies
               FROM pg_class c
               LEFT JOIN pg_policy p ON p.polrelid = c.oid
              WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
              GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
              ORDER BY c.relname`,
            [tables],
          )
        ).rows,
    );
    const template = [
      {
        name: 'tenant_isolation',
        command: '*',
        permissive: true,
        roles: ['mms_app'],
        using: TENANT_ISOLATION_EXPRESSION,
        check: TENANT_ISOLATION_EXPRESSION,
      },
    ];
    const wrong = rows
      .filter(
        (r) =>
          !r.enabled ||
          !r.forced ||
          JSON.stringify(r.policies) !== JSON.stringify(template),
      )
      .map((r) => `${r.table}: ${JSON.stringify(r)}`);
    expect(wrong).toEqual([]);
  });

  it('scopes every foreign key of a tenant table by tenant, and validates it', async () => {
    const fks = await db.admin((c) => foreignKeys(c, tables));
    const tenantSet = new Set(tables);
    const wrong: string[] = [];
    for (const fk of fks) {
      const label = `${fk.table}.${fk.name} -> ${fk.parent}`;
      if (!fk.validated) wrong.push(`${label}: not validated`);
      if (fk.parent === 'tenants') {
        if (fk.columns.join() !== 'tenant_id') {
          wrong.push(
            `${label}: references tenants with (${fk.columns.join(', ')})`,
          );
        }
      } else if (tenantSet.has(fk.parent)) {
        const k = fk.columns.indexOf('tenant_id');
        if (k < 0 || fk.parentColumns[k] !== 'tenant_id') {
          wrong.push(
            `${label}: (${fk.columns.join(', ')}) does not pair tenant_id with the parent's tenant_id`,
          );
        }
      } else if (
        !isListed(GLOBAL_REFERENCES, fk.name) ||
        GLOBAL_REFERENCES[fk.name] !== fk.parent
      ) {
        wrong.push(`${label}: a global parent not listed in GLOBAL_REFERENCES`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps every unique key of a tenant table inside its tenant', async () => {
    const [all, fks] = await db.admin(
      async (c) =>
        [await indexes(c, tables), await foreignKeys(c, tables)] as const,
    );
    const scoped = new Set(
      scopedForeignKeys(fks, new Set(tables)).flatMap((fk) =>
        fk.columns
          .filter((column) => column !== 'tenant_id')
          .map((column) => `${fk.table}.${column}`),
      ),
    );
    // A unique key is inside a tenant when it contains tenant_id, is the uuid primary key,
    // or contains a column that only ever holds ids of rows of the same tenant (a scoped
    // foreign key column) and cannot let NULLs collide across tenants
    const wrong = all
      .filter((u) => u.usable)
      .filter((u) => u.unique)
      .filter((u) => {
        if (u.columns.includes('tenant_id')) return false;
        if (u.primary && u.columns.join() === 'id') return false;
        if (isListed(GLOBAL_UNIQUE_EXCEPTIONS, u.index)) return false;
        return !u.columns.some(
          (column, k) =>
            scoped.has(`${u.table}.${column}`) &&
            (u.notNull[k] || !u.nullsNotDistinct),
        );
      })
      .map((u) => `${u.table}.${u.index} (${u.columns.join(', ')})`);
    expect(wrong).toEqual([]);
  });

  it('indexes every tenant-scoped foreign key, and gives every tenant table an index led by tenant_id', async () => {
    const [all, fks] = await db.admin(
      async (c) =>
        [await indexes(c, tables), await foreignKeys(c, tables)] as const,
    );
    // An index a failed CONCURRENTLY build left behind is no index: it enforces and serves nothing
    const usable = all.filter((i) => i.usable && !i.partial);
    const wrong: string[] = [];
    for (const fk of scopedForeignKeys(fks, new Set(tables))) {
      const want = [...fk.columns].sort().join();
      const covered = usable.some(
        (i) =>
          i.table === fk.table &&
          [...i.columns.slice(0, fk.columns.length)].sort().join() === want,
      );
      if (!covered) {
        wrong.push(
          `${fk.table}.${fk.name} (${fk.columns.join(', ')}) has no index`,
        );
      }
    }
    for (const table of tables) {
      if (
        !usable.some((i) => i.table === table && i.columns[0] === 'tenant_id')
      ) {
        wrong.push(`${table} has no index led by tenant_id`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('leaves no invalid or unready index in the public schema', async () => {
    // 038 builds its indexes CONCURRENTLY: a failed build leaves an INVALID index that a
    // rerun of IF NOT EXISTS would skip, so the tenant key it was meant to give is missing
    const broken = await db.admin(async (c) =>
      (
        await c.query<{ index: string }>(
          `SELECT i.relname AS "index" FROM pg_index x
             JOIN pg_class i ON i.oid = x.indexrelid
             JOIN pg_class c ON c.oid = x.indrelid
            WHERE c.relnamespace = 'public'::regnamespace
              AND NOT (x.indisvalid AND x.indisready)
            ORDER BY 1`,
        )
      ).rows.map((r) => r.index),
    );
    expect(broken).toEqual([]);
  });

  it('keeps every ON DELETE SET NULL key between tenant tables from clearing tenant_id', async () => {
    // Without a column list SET NULL clears every referencing column, tenant_id included,
    // which a NOT NULL column refuses and RLS would hide
    const fks = await db.admin((c) => foreignKeys(c, tables));
    const tenantSet = new Set(tables);
    const wrong = fks
      .filter((fk) => fk.onDelete === 'n' && tenantSet.has(fk.parent))
      .filter(
        (fk) =>
          fk.setNullColumns === null || fk.setNullColumns.includes('tenant_id'),
      )
      .map(
        (fk) =>
          `${fk.table}.${fk.name}: ON DELETE SET NULL ${
            fk.setNullColumns === null
              ? 'without a column list'
              : `(${fk.setNullColumns.join(', ')})`
          }`,
      );
    expect(wrong).toEqual([]);
  });

  it('keeps every table in the public schema', async () => {
    const outside = await db.admin(async (c) =>
      (
        await c.query<{ name: string }>(
          `SELECT n.nspname || '.' || c.relname AS name FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p') AND n.nspname <> 'public'
              AND n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_'
            ORDER BY 1`,
        )
      ).rows.map((r) => r.name),
    );
    expect(outside).toEqual([]);
  });

  it('grants the runtime role DML on tenant tables only, and each role exactly the listed privileges on global tables', async () => {
    const granted = await db.admin(async (c) =>
      (
        await c.query<{ grant: string }>(
          `SELECT c.relname || ':' || r.role || ':' || p.privilege AS "grant"
             FROM pg_class c
            CROSS JOIN (VALUES ('mms_app'), ('mms_platform')) AS r(role)
            CROSS JOIN unnest($1::text[]) AS p(privilege)
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
              AND has_table_privilege(r.role, c.oid, p.privilege)`,
          [ALL_PRIVILEGES],
        )
      ).rows.map((r) => r.grant),
    );
    const expected = [
      ...tables.flatMap((t) => DML.map((p) => `${t}:mms_app:${p}`)),
      ...Object.entries(GLOBAL_TABLES).flatMap(([t, g]) => [
        ...g.mmsApp.map((p) => `${t}:mms_app:${p}`),
        ...g.mmsPlatform.map((p) => `${t}:mms_platform:${p}`),
      ]),
    ];
    expect([...granted].sort()).toEqual([...expected].sort());
  });

  it('grants no privilege on a single column that the table does not grant as a whole', async () => {
    // has_table_privilege ignores column-level grants; has_any_column_privilege sees them
    const columnOnly = await db.admin(async (c) =>
      (
        await c.query<{ grant: string }>(
          `SELECT c.relname || ':' || r.role || ':' || p.privilege AS "grant"
             FROM pg_class c
            CROSS JOIN (VALUES ('mms_app'), ('mms_platform')) AS r(role)
            CROSS JOIN unnest($1::text[]) AS p(privilege)
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
              AND has_any_column_privilege(r.role, c.oid, p.privilege)
              AND NOT has_table_privilege(r.role, c.oid, p.privilege)
            ORDER BY 1`,
          [['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']],
        )
      ).rows.map((r) => r.grant),
    );
    expect(columnOnly).toEqual([]);
  });

  it('lets the runtime role write its own rows, but neither the tenant registry nor the role catalogue', async () => {
    await db.app(TENANT_1, async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          `INSERT INTO leave_types (code, name) VALUES ('guard_probe', 'Guard probe')`,
        );
      } finally {
        await c.query('ROLLBACK');
      }
      await expect(
        c.query(`UPDATE tenants SET name = name WHERE id = $1`, [TENANT_1]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        c.query(`INSERT INTO roles (code, name) VALUES ('guard_probe', 'x')`),
      ).rejects.toMatchObject({ code: '42501' });
    });
    await db.platform(async (c) => {
      await expect(c.query(`SELECT 1 FROM users`)).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        c.query(`SELECT id FROM auth_tenant_by_code('phu-dinh')`),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('grants nothing by default on tables created later, so a platform table never reaches the runtime role', async () => {
    const [defaults, probe] = await db.admin(async (c) => {
      const acl = (
        await c.query<{ acl: string }>(
          `SELECT d.defaclacl::text AS acl FROM pg_default_acl d`,
        )
      ).rows
        .map((r) => r.acl)
        .filter((text) => /mms_app=|mms_platform=/.test(text));
      await c.query('BEGIN');
      try {
        await c.query('CREATE TABLE platform_guard_probe (id int)');
        const roles = (
          await c.query<{ role: string }>(
            `SELECT r.role FROM (VALUES ('mms_app'), ('mms_platform')) AS r(role)
              WHERE has_table_privilege(r.role, 'platform_guard_probe',
                                        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')`,
          )
        ).rows.map((r) => r.role);
        return [acl, roles] as const;
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(defaults).toEqual([]);
    expect(probe).toEqual([]);
  });

  it('keeps the SECURITY DEFINER functions to the listed narrow ones, each with a pinned search_path', async () => {
    const rows = await db.admin(
      async (c) =>
        (
          await c.query<{ name: string; config: string[] | null }>(
            `SELECT p.proname AS name, p.proconfig AS config FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
              ORDER BY p.proname`,
          )
        ).rows,
    );
    expect(rows.map((r) => r.name)).toEqual(
      [...SECURITY_DEFINER_FUNCTIONS].sort(),
    );
    rows.forEach((r) =>
      expect({ name: r.name, config: r.config }).toEqual({
        name: r.name,
        config: ['search_path=public, pg_temp'],
      }),
    );
  });

  it('has no view that would read tenant tables as its owner', async () => {
    const views = await db.admin(async (c) =>
      (
        await c.query<{ name: string }>(
          `SELECT c.relname AS name FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
              AND NOT COALESCE('security_invoker=true' = ANY (c.reloptions), false)`,
        )
      ).rows.map((r) => r.name),
    );
    expect(views).toEqual([]);
  });

  // Code names these: ON CONFLICT ON CONSTRAINT (training-plans.service.ts), the
  // constraint.includes('email' | 'cccd') mapping (admin.service.ts, militia.service.ts) and
  // test/migrations.e2e-spec.ts (uq_conversations_direct_key)
  it('keeps the constraint and index names code relies on, scoped by tenant', async () => {
    const definitions = await db.admin(async (c) => {
      const constraints = (
        await c.query<{ name: string; definition: string }>(
          `SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
            WHERE connamespace = 'public'::regnamespace AND conname = ANY ($1)`,
          [
            [
              'uq_training_plans_unit_year_type',
              'system_settings_pkey',
              'uq_users_tenant_email',
              'uq_militia_profiles_tenant_cccd',
            ],
          ],
        )
      ).rows;
      const indexDefinitions = (
        await c.query<{ name: string; definition: string }>(
          `SELECT indexname AS name, indexdef AS definition FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = ANY ($1)`,
          [['uq_conversations_direct_key', 'uidx_militia_cccd_lookup']],
        )
      ).rows;
      return Object.fromEntries(
        [...constraints, ...indexDefinitions].map((r) => [
          r.name,
          r.definition,
        ]),
      );
    });
    expect(definitions).toEqual({
      uq_training_plans_unit_year_type:
        'UNIQUE NULLS NOT DISTINCT (tenant_id, unit_id, year, training_type)',
      system_settings_pkey: 'PRIMARY KEY (tenant_id, key)',
      uq_users_tenant_email: 'UNIQUE (tenant_id, email)',
      uq_militia_profiles_tenant_cccd: 'UNIQUE (tenant_id, cccd)',
      uq_conversations_direct_key:
        'CREATE UNIQUE INDEX uq_conversations_direct_key ON public.conversations USING btree (tenant_id, direct_key) WHERE (direct_key IS NOT NULL)',
      uidx_militia_cccd_lookup:
        'CREATE UNIQUE INDEX uidx_militia_cccd_lookup ON public.militia_profiles USING btree (tenant_id, cccd_lookup_hash) WHERE (cccd_lookup_hash IS NOT NULL)',
    });
  });
});

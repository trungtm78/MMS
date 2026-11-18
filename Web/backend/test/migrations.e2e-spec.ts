// Applies every SQL migration to throwaway databases through the real Postgres-backed
// runner. Catches migrations that fail on a fresh database, tables the backend queries
// that no migration creates, runner behaviour that only a real server exhibits (rollback,
// concurrent replicas, lock timeouts) and data loss when upgrading older schemas.
//
// Requires MIGRATION_TEST_ADMIN_URL, a connection string for a role that may
// CREATE DATABASE, e.g. postgres://mms:mms_secret@localhost:5433/postgres
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';
import { ROLE_CODES } from '../src/common/constants/roles';
import {
  migrateDatabase,
  MIGRATION_LOCK_KEY,
} from '../src/database/migrations/migrate';
import { withClient } from './support/db';

jest.setTimeout(180_000);

const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
if (!adminUrl) {
  throw new Error(
    'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:mms_secret@localhost:5433/postgres)',
  );
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const ALL_FILES = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let databaseCounter = 0;
const createdDatabases: string[] = [];
const createdDirs: string[] = [];

/** Creates an empty database and returns its connection string. */
async function createDatabase(): Promise<string> {
  const name = `mms_migtest_${Date.now()}_${databaseCounter++}`;
  await withClient(adminUrl!, (c) => c.query(`CREATE DATABASE ${name}`));
  createdDatabases.push(name);
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  return url.toString();
}

/** A migrations directory holding the real files up to and including `through`. */
function migrationsThrough(through: string): string {
  if (!ALL_FILES.includes(through)) throw new Error(`no migration ${through}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-migrations-'));
  createdDirs.push(dir);
  for (const file of ALL_FILES.filter((f) => f <= through)) {
    fs.copyFileSync(path.join(MIGRATIONS_DIR, file), path.join(dir, file));
  }
  return dir;
}

/** A migrations directory holding ad-hoc files. */
function scratchMigrations(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-migrations-'));
  createdDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), sql);
  }
  return dir;
}

async function recordedMigrations(url: string): Promise<string[]> {
  return withClient(url, async (c) => {
    const { rows } = await c.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations ORDER BY filename`,
    );
    return rows.map((r) => r.filename);
  });
}

afterAll(async () => {
  for (const dir of createdDirs)
    fs.rmSync(dir, { recursive: true, force: true });
  await withClient(adminUrl, async (c) => {
    for (const name of createdDatabases) {
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  });
});

describe('SQL migrations (e2e)', () => {
  let targetUrl: string;

  beforeAll(async () => {
    targetUrl = await createDatabase();
  });

  it('applies every migration to an empty database', async () => {
    const report = await migrateDatabase({
      connectionString: targetUrl,
      directory: MIGRATIONS_DIR,
    });

    expect(report.applied).toEqual(ALL_FILES);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const report = await migrateDatabase({
      connectionString: targetUrl,
      directory: MIGRATIONS_DIR,
    });

    expect(report.applied).toEqual([]);
  });

  // Production never runs the dev seeder, so every role code the backend
  // authorizes against must come from a migration
  it('seeds every role code the backend authorizes against', async () => {
    const codes = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{ code: string }>(
        `SELECT code FROM roles`,
      );
      return rows.map((r) => r.code);
    });

    expect(codes).toEqual(expect.arrayContaining([...ROLE_CODES]));
  });

  // Columns the backend writes that earlier migrations never created
  it('creates every column the payroll and MFA code writes', async () => {
    const columns = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{ column: string }>(
        `SELECT table_name || '.' || column_name AS column
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('payroll_items', 'payroll_periods', 'mfa_recovery_codes')`,
      );
      return rows.map((r) => r.column);
    });

    expect(columns).toEqual(
      expect.arrayContaining([
        'payroll_items.training_allowance',
        'payroll_periods.locked_by',
        'payroll_periods.locked_at',
        'mfa_recovery_codes.user_id',
        'mfa_recovery_codes.code_hash',
        'mfa_recovery_codes.used_at',
      ]),
    );
  });

  it('enforces that a locked payroll period records when it was locked', async () => {
    const validated = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{ convalidated: boolean }>(
        `SELECT convalidated FROM pg_constraint WHERE conname = 'chk_payroll_periods_locked_at'`,
      );
      return rows[0]?.convalidated;
    });

    expect(validated).toBe(true);
  });

  it('creates every table the backend queries', async () => {
    const tables = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      return rows.map((r) => r.table_name);
    });

    expect(tables).toEqual(
      expect.arrayContaining([
        'schema_migrations',
        'weapons',
        'weapon_allocations',
        'exemptions',
        'organization_units',
        'kpi_evaluations',
        'notifications',
        'notification_receipts',
        'work_reports',
        'recruitment_applications',
      ]),
    );
  });

  // An exemption decision is a legal record: deleting the profile must not erase it
  it('keeps exemption records when their militia profile is deleted', async () => {
    const onDelete = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{ confdeltype: string }>(
        `SELECT c.confdeltype
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.contype = 'f' AND c.conrelid = 'exemptions'::regclass
           AND a.attname = 'militia_id'`,
      );
      return rows.map((r) => r.confdeltype);
    });

    expect(onDelete).toEqual(['r']);
  });

  // Unindexed foreign keys make every parent delete or key update scan the child table
  it('indexes every foreign key on the tables added in 019', async () => {
    const unindexed = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{ fk: string }>(
        `SELECT c.conrelid::regclass::text || '.' || c.conname AS fk
         FROM pg_constraint c
         WHERE c.contype = 'f'
           AND c.conrelid::regclass::text = ANY ($1)
           AND NOT EXISTS (
             SELECT 1 FROM pg_index i
             WHERE i.indrelid = c.conrelid
               AND i.indpred IS NULL
               AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
               AND (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey
           )
         ORDER BY 1`,
        [
          [
            'weapons',
            'weapon_allocations',
            'exemptions',
            'organization_units',
            'kpi_evaluations',
          ],
        ],
      );
      return rows.map((r) => r.fk);
    });

    expect(unindexed).toEqual([]);
  });

  it('serves the notification inbox newest-first from one index', async () => {
    const shape = await withClient(targetUrl, async (c) => {
      const indexes = await c.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'notification_receipts'`,
      );
      const deliveredAt = await c.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'notification_receipts'
           AND column_name = 'delivered_at'`,
      );
      return {
        indexes: new Map(indexes.rows.map((r) => [r.indexname, r.indexdef])),
        deliveredAtNullable: deliveredAt.rows[0]?.is_nullable,
      };
    });

    expect(
      shape.indexes.get('idx_notification_receipts_user_delivered'),
    ).toContain('(user_id, delivered_at DESC, id DESC)');
    // Its leading user_id column is covered by the index above
    expect(shape.indexes.has('idx_notification_receipts_user')).toBe(false);
    expect(shape.deliveredAtNullable).toBe('NO');
  });

  // MFA hardening (025): single-use challenges, room for encrypted secrets and replay
  // state, and a per-role requirement that stays off until an administrator turns it on
  it('stores MFA challenges, encrypted secrets, replay state and the per-role requirement', async () => {
    const columns = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{
        key: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT table_name || '.' || column_name AS key, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('auth_challenges', 'users', 'roles')`,
      );
      return new Map(rows.map((r) => [r.key, r]));
    });

    for (const column of [
      'auth_challenges.id',
      'auth_challenges.user_id',
      'auth_challenges.purpose',
      'auth_challenges.secret_hash',
      'auth_challenges.pending_totp_secret',
      'auth_challenges.attempts',
      'auth_challenges.expires_at',
      'auth_challenges.consumed_at',
      'auth_challenges.created_at',
    ]) {
      expect(columns.has(column)).toBe(true);
    }
    expect(columns.get('users.totp_secret')?.data_type).toBe('text');
    expect(columns.get('users.totp_last_used_step')?.data_type).toBe('bigint');
    expect(columns.get('roles.mfa_required')).toEqual(
      expect.objectContaining({
        data_type: 'boolean',
        is_nullable: 'NO',
        column_default: 'false',
      }),
    );
  });

  it('refuses MFA challenges with an unknown purpose or a negative attempt count', async () => {
    await withClient(targetUrl, async (c) => {
      const user = await c.query<{ id: string }>(
        `INSERT INTO users (username, password_hash, full_name)
         VALUES ('mfa_shape_user', 'x', 'MFA shape') RETURNING id`,
      );
      const insert = (purpose: string, attempts: number) =>
        c.query(
          `INSERT INTO auth_challenges (user_id, purpose, secret_hash, attempts, expires_at)
           VALUES ($1, $2, repeat('a', 64), $3, now() + interval '5 minutes')`,
          [user.rows[0].id, purpose, attempts],
        );

      await expect(insert('verify', 0)).resolves.toBeDefined();
      await expect(insert('setup', 0)).resolves.toBeDefined();
      await expect(insert('login', 0)).rejects.toThrow(/check constraint/);
      await expect(insert('verify', -1)).rejects.toThrow(/check constraint/);
    });
  });

  it('keeps no index on the low-selectivity work report review status', async () => {
    const exists = await withClient(targetUrl, async (c) => {
      const { rows } = await c.query<{ found: string | null }>(
        `SELECT to_regclass('public.idx_work_reports_review_status')::text AS found`,
      );
      return rows[0].found !== null;
    });

    expect(exists).toBe(false);
  });
});

describe('migration runner on Postgres (e2e)', () => {
  it('rolls back a failing file completely and records nothing for it', async () => {
    const url = await createDatabase();
    const directory = scratchMigrations({
      '001_ok.sql': 'CREATE TABLE t_ok (id int);',
      '002_bad.sql':
        'CREATE TABLE t_partial (id int);\nSELECT * FROM table_that_does_not_exist;',
    });

    await expect(
      migrateDatabase({ connectionString: url, directory }),
    ).rejects.toThrow(/002_bad\.sql/);

    const tables = await withClient(url, async (c) => {
      const { rows } = await c.query<{
        ok: string | null;
        partial: string | null;
      }>(
        `SELECT to_regclass('public.t_ok')::text AS ok,
                to_regclass('public.t_partial')::text AS partial`,
      );
      return rows[0];
    });
    expect(tables).toEqual({ ok: 't_ok', partial: null });
    expect(await recordedMigrations(url)).toEqual(['001_ok.sql']);
  });

  // Codex round 2: deleting or renaming an applied migration must stop deployment
  it('refuses to migrate when an applied migration file is missing', async () => {
    const url = await createDatabase();
    const both = {
      '001_first.sql': 'CREATE TABLE t_first (id int);',
      '002_second.sql': 'CREATE TABLE t_second (id int);',
    };
    await migrateDatabase({
      connectionString: url,
      directory: scratchMigrations(both),
    });

    await expect(
      migrateDatabase({
        connectionString: url,
        directory: scratchMigrations({
          '001_first.sql': both['001_first.sql'],
          '003_third.sql': 'CREATE TABLE t_third (id int);',
        }),
      }),
    ).rejects.toThrow(/002_second\.sql/);

    expect(await recordedMigrations(url)).toEqual([
      '001_first.sql',
      '002_second.sql',
    ]);
    const third = await withClient(url, async (c) => {
      const { rows } = await c.query<{ t: string | null }>(
        `SELECT to_regclass('public.t_third')::text AS t`,
      );
      return rows[0].t;
    });
    expect(third).toBeNull();
  });

  // Several backend replicas start together and each runs the migrator
  it('lets concurrent runners apply each file exactly once', async () => {
    const url = await createDatabase();
    const options = { connectionString: url, directory: MIGRATIONS_DIR };

    const reports = await Promise.all([
      migrateDatabase(options),
      migrateDatabase(options),
    ]);

    expect(reports.map((r) => r.applied.length).sort((a, b) => a - b)).toEqual([
      0,
      ALL_FILES.length,
    ]);
    expect(await recordedMigrations(url)).toEqual(ALL_FILES);
  });

  it('gives up waiting when another migration holds the lock', async () => {
    const url = await createDatabase();
    const holder = new Client({ connectionString: url });
    await holder.connect();
    try {
      await holder.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
      const startedAt = Date.now();

      await expect(
        migrateDatabase({
          connectionString: url,
          directory: MIGRATIONS_DIR,
          advisoryLockTimeout: '1s',
        }),
      ).rejects.toThrow(/another migration/);
      expect(Date.now() - startedAt).toBeLessThan(15_000);
    } finally {
      await holder.end();
    }
  });

  it('bounds how long a file waits for a table lock', async () => {
    const url = await createDatabase();
    const create = { '001_table.sql': 'CREATE TABLE t_locked (id int);' };
    await migrateDatabase({
      connectionString: url,
      directory: scratchMigrations(create),
    });

    const holder = new Client({ connectionString: url });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('LOCK TABLE t_locked IN ACCESS SHARE MODE');
      const startedAt = Date.now();

      await expect(
        migrateDatabase({
          connectionString: url,
          directory: scratchMigrations({
            ...create,
            '002_alter.sql': 'ALTER TABLE t_locked ADD COLUMN x int;',
          }),
          lockTimeout: '1s',
        }),
      ).rejects.toThrow(/lock timeout/);
      expect(Date.now() - startedAt).toBeLessThan(15_000);
    } finally {
      await holder.query('ROLLBACK');
      await holder.end();
    }
    expect(await recordedMigrations(url)).toEqual(['001_table.sql']);
  });
});

// Before schema_migrations existed, `npm run db:migrate` ran every SQL file through psql, so
// those databases hold the schema of the files it ran and no migration history. Starting
// again at 001 fails on non-idempotent statements; a wrong baseline silently skips schema.
describe('adopting a database migrated before migration history existed (e2e)', () => {
  const LAST_SHELL_FILE = '018_recruitment_applications.sql';

  /** A database migrated file by file with plain SQL, like the old shell runner. */
  async function shellMigratedDatabase(): Promise<string> {
    const url = await createDatabase();
    await withClient(url, async (c) => {
      for (const name of ALL_FILES.filter((f) => f <= LAST_SHELL_FILE)) {
        await c.query(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
      }
    });
    return url;
  }

  const tableExists = (url: string, table: string) =>
    withClient(url, async (c) => {
      const { rows } = await c.query<{ found: string | null }>(
        `SELECT to_regclass($1)::text AS found`,
        [`public.${table}`],
      );
      return rows[0].found !== null;
    });

  const failureOf = (run: Promise<unknown>) =>
    run.then(
      () => {
        throw new Error('expected the migration to be refused');
      },
      (err: unknown) => err as Error & Record<string, unknown>,
    );

  it('refuses to migrate it without a baseline, naming the setting, and runs nothing', async () => {
    const url = await shellMigratedDatabase();

    const failure = await failureOf(
      migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR }),
    );

    expect(failure.name).toBe('MigrationBaselineRequiredError');
    expect(failure.message).toMatch(/before migration history existed/);
    expect(failure.message).toContain(
      'MIGRATION_BASELINE_THROUGH=<last applied file>',
    );
    expect(await recordedMigrations(url)).toEqual([]);
    expect(await tableExists(url, 'weapons')).toBe(false);
  });

  it('refuses a baseline past the last applied file, naming the missing objects', async () => {
    const url = await shellMigratedDatabase();

    const failure = await failureOf(
      migrateDatabase({
        connectionString: url,
        directory: MIGRATIONS_DIR,
        baselineThrough:
          '024_payroll_training_allowance_mfa_recovery_codes.sql',
      }),
    );

    expect(failure.name).toBe('MigrationBaselineSchemaError');
    expect(failure.message).toContain(
      '019_schema_contract_tables.sql: table weapons',
    );
    for (const object of [
      'table exemptions',
      'column militia_profiles.avatar_url',
      'index uq_weapon_allocations_open',
      'column notifications.entity_type',
      'index idx_notification_receipts_user_delivered',
      'column work_reports.review_status',
      'column payroll_periods.locked_at',
      'table mfa_recovery_codes',
      'column payroll_items.training_allowance',
    ]) {
      expect(failure.message).toContain(object);
    }
    // Everything 001 to 018 created is present, so only later files are named
    const files = (failure.missing as { file: string }[]).map((o) => o.file);
    expect(files.every((f) => f > LAST_SHELL_FILE)).toBe(true);
    expect(await recordedMigrations(url)).toEqual([]);
    expect(await tableExists(url, 'weapons')).toBe(false);
  });

  it('baselines through the last applied file, then applies the files after it', async () => {
    const url = await shellMigratedDatabase();

    const report = await migrateDatabase({
      connectionString: url,
      directory: MIGRATIONS_DIR,
      baselineThrough: LAST_SHELL_FILE,
    });

    expect(report.baselined).toEqual(
      ALL_FILES.filter((f) => f <= LAST_SHELL_FILE),
    );
    expect(report.applied).toEqual(
      ALL_FILES.filter((f) => f > LAST_SHELL_FILE),
    );
    expect(await recordedMigrations(url)).toEqual(ALL_FILES);
  });

  // Every real file must be followed, including those that drop or rename what earlier
  // files created; otherwise a correct baseline would be refused
  it('accepts a baseline through the latest file on a fully migrated database that lost its history', async () => {
    const url = await createDatabase();
    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });
    await withClient(url, (c) => c.query('DELETE FROM schema_migrations'));

    const report = await migrateDatabase({
      connectionString: url,
      directory: MIGRATIONS_DIR,
      baselineThrough: ALL_FILES[ALL_FILES.length - 1],
    });

    expect(report.baselined).toEqual(ALL_FILES);
    expect(report.applied).toEqual([]);
  });
});

// Databases migrated before 020/021 hold data in the older shapes; upgrading must keep it
describe('upgrading databases created before 020 and 021 (e2e)', () => {
  let url: string;
  let userId: string;

  beforeAll(async () => {
    url = await createDatabase();
    await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough('019_schema_contract_tables.sql'),
    });

    await withClient(url, async (c) => {
      const user = await c.query<{ id: string }>(
        `INSERT INTO users (username, password_hash, full_name)
         VALUES ('legacy_user', 'x', 'Legacy User') RETURNING id`,
      );
      userId = user.rows[0].id;

      // 015's per-user notifications table, as created on databases without 007's
      await c.query(`DROP TABLE notification_receipts`);
      await c.query(`DROP TABLE notifications CASCADE`);
      await c.query(`
        CREATE TABLE notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          body TEXT,
          is_read BOOLEAN DEFAULT false,
          entity_type VARCHAR(100),
          entity_id UUID,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);`);
      await c.query(
        `INSERT INTO notifications (user_id, type, title, body, is_read, created_at)
         VALUES ($1, 'task', 'Read one', 'b', true, '2026-01-02T03:00:00Z'),
                ($1, 'task', 'Unread one', 'b', false, '2026-01-03T03:00:00Z')`,
        [userId],
      );

      // 010's work reports: author in user_id, two-state status
      await c.query(
        `INSERT INTO work_reports (user_id, report_type, content, status)
         VALUES ($1, 'daily', repeat('x', 300), 'reviewed'),
                ($1, 'incident', 'short', 'pending')`,
        [userId],
      );
    });

    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });
  });

  it('moves per-user notifications into receipts, keeping who read what', async () => {
    const result = await withClient(url, async (c) => {
      const receipts = await c.query<{
        title: string;
        user_id: string;
        read: boolean;
        delivered_matches_created: boolean;
      }>(
        `SELECT n.title, r.user_id, r.read_at IS NOT NULL AS read,
                r.delivered_at = n.created_at AS delivered_matches_created
         FROM notification_receipts r
         JOIN notifications n ON n.id = r.notification_id
         ORDER BY n.title`,
      );
      const legacyColumns = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'notifications'
           AND column_name IN ('user_id', 'is_read')`,
      );
      return { receipts: receipts.rows, legacyColumns: legacyColumns.rows };
    });

    expect(result.receipts).toEqual([
      {
        title: 'Read one',
        user_id: userId,
        read: true,
        delivered_matches_created: true,
      },
      {
        title: 'Unread one',
        user_id: userId,
        read: false,
        delivered_matches_created: true,
      },
    ]);
    expect(result.legacyColumns).toEqual([]);
  });

  it('keeps work report authors and review state', async () => {
    const result = await withClient(url, async (c) => {
      const reports = await c.query<{
        report_type: string;
        created_by: string;
        review_status: string;
        title_length: number;
      }>(
        `SELECT report_type, created_by, review_status, length(title) AS title_length
         FROM work_reports ORDER BY report_type`,
      );
      const legacyColumns = await c.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'work_reports'
           AND column_name IN ('user_id', 'status')`,
      );
      return { reports: reports.rows, legacyColumns: legacyColumns.rows };
    });

    expect(result.reports).toEqual([
      {
        report_type: 'daily',
        created_by: userId,
        review_status: 'approved',
        title_length: 255,
      },
      {
        report_type: 'incident',
        created_by: userId,
        review_status: 'pending',
        title_length: 5,
      },
    ]);
    expect(result.legacyColumns).toEqual([]);
  });
});

describe('upgrading databases with duplicate direct conversations (e2e)', () => {
  let url: string;
  const ids: Record<string, string> = {};
  // The order the backend sorts ids in, and migration 031 with the "C" collation
  const keyOf = (a: string, b: string) => [ids[a], ids[b]].sort().join(':');

  beforeAll(async () => {
    url = await createDatabase();
    const before031 =
      ALL_FILES[ALL_FILES.indexOf('031_direct_conversation_key.sql') - 1];
    await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough(before031),
    });

    await withClient(url, async (c) => {
      const users = await c.query<{ id: string; username: string }>(
        `INSERT INTO users (username, password_hash, full_name)
         VALUES ('pair_a', 'x', 'A'), ('pair_b', 'x', 'B'), ('pair_c', 'x', 'C')
         RETURNING id, username`,
      );
      for (const user of users.rows) ids[user.username] = user.id;

      const conversation = async (
        name: string,
        type: string,
        createdAt: string,
        members: string[],
      ) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO conversations (type, name, created_at)
           VALUES ($1, $2, $3) RETURNING id`,
          [type, name, createdAt],
        );
        await c.query(
          `INSERT INTO conversation_participants (conversation_id, user_id)
           SELECT $1, unnest($2::uuid[])`,
          [rows[0].id, members.map((member) => ids[member])],
        );
      };
      await conversation('ab_newer', 'direct', '2026-02-01T00:00:00Z', [
        'pair_a',
        'pair_b',
      ]);
      await conversation('ab_older', 'direct', '2026-01-01T00:00:00Z', [
        'pair_b',
        'pair_a',
      ]);
      await conversation('ac', 'direct', '2026-01-05T00:00:00Z', [
        'pair_c',
        'pair_a',
      ]);
      await conversation('abc_group', 'group', '2026-01-01T00:00:00Z', [
        'pair_a',
        'pair_b',
      ]);
      await conversation('a_alone', 'direct', '2026-01-01T00:00:00Z', [
        'pair_a',
      ]);
    });

    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });
  });

  it('gives the pair key to the oldest direct conversation of each pair only', async () => {
    const rows = await withClient(url, async (c) => {
      const result = await c.query<{ name: string; direct_key: string | null }>(
        `SELECT name, direct_key FROM conversations ORDER BY name COLLATE "C"`,
      );
      return result.rows;
    });

    expect(rows).toEqual([
      { name: 'a_alone', direct_key: null },
      { name: 'ab_newer', direct_key: null },
      { name: 'ab_older', direct_key: keyOf('pair_a', 'pair_b') },
      { name: 'abc_group', direct_key: null },
      { name: 'ac', direct_key: keyOf('pair_a', 'pair_c') },
    ]);
  });

  it('refuses a second direct conversation keyed to the same pair', async () => {
    await withClient(url, async (c) => {
      await expect(
        c.query(
          `INSERT INTO conversations (type, direct_key) VALUES ('direct', $1)`,
          [keyOf('pair_a', 'pair_b')],
        ),
      ).rejects.toThrow(/uq_conversations_direct_key/);
    });
  });

  it('refuses a key on a group conversation or in another format', async () => {
    await withClient(url, async (c) => {
      await expect(
        c.query(
          `INSERT INTO conversations (type, direct_key) VALUES ('group', $1)`,
          [keyOf('pair_b', 'pair_c')],
        ),
      ).rejects.toThrow(/chk_conversations_direct_key/);
      await expect(
        c.query(
          `INSERT INTO conversations (type, direct_key) VALUES ('direct', 'not-a-pair')`,
        ),
      ).rejects.toThrow(/chk_conversations_direct_key/);
    });
  });
});

describe('default leave types (e2e)', () => {
  const leaveTypes = (url: string) =>
    withClient(url, async (c) => {
      const { rows } = await c.query<Record<string, unknown>>(
        `SELECT code, name, description, max_days_per_year, requires_document, is_paid, is_active
         FROM leave_types ORDER BY code COLLATE "C"`,
      );
      return rows;
    });
  const leaveType = (
    code: string,
    name: string,
    description: string,
    maxDaysPerYear: number | null,
    requiresDocument: boolean,
    isPaid: boolean,
  ) => ({
    code,
    name,
    description,
    max_days_per_year: maxDaysPerYear,
    requires_document: requiresDocument,
    is_paid: isPaid,
    is_active: true,
  });

  // Without a type nobody can file leave, and production never runs a seeder
  it('offers the leave kinds of the Labour Code on a fresh install', async () => {
    const url = await createDatabase();
    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });

    expect(await leaveTypes(url)).toEqual([
      leaveType(
        'annual',
        'Nghỉ phép năm',
        'Nghỉ hằng năm hưởng nguyên lương',
        12,
        false,
        true,
      ),
      leaveType(
        'bereavement',
        'Nghỉ tang',
        'Cha, mẹ, vợ hoặc chồng, con chết',
        3,
        false,
        true,
      ),
      leaveType(
        'child_marriage',
        'Nghỉ con kết hôn',
        'Con đẻ, con nuôi kết hôn',
        1,
        false,
        true,
      ),
      leaveType('marriage', 'Nghỉ kết hôn', 'Bản thân kết hôn', 3, false, true),
      leaveType(
        'maternity',
        'Nghỉ thai sản',
        'Theo chế độ thai sản, cần giấy chứng nhận của cơ sở y tế',
        null,
        true,
        true,
      ),
      leaveType(
        'sick',
        'Nghỉ ốm',
        'Cần giấy chứng nhận của cơ sở khám bệnh, chữa bệnh',
        null,
        true,
        true,
      ),
      leaveType(
        'unpaid',
        'Nghỉ không lương',
        'Theo thỏa thuận với đơn vị',
        null,
        false,
        false,
      ),
    ]);
  });

  it('leaves an existing catalogue of leave types as the operator made it', async () => {
    const url = await createDatabase();
    const before033 =
      ALL_FILES[ALL_FILES.indexOf('033_default_leave_types.sql') - 1];
    await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough(before033),
    });
    await withClient(url, (c) =>
      c.query(
        `INSERT INTO leave_types (code, name, description, max_days_per_year, is_active)
         VALUES ('PAID', 'Nghỉ phép có lương', NULL, 15, false)`,
      ),
    );

    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });

    expect(await leaveTypes(url)).toEqual([
      {
        code: 'PAID',
        name: 'Nghỉ phép có lương',
        description: null,
        max_days_per_year: 15,
        requires_document: false,
        is_paid: true,
        is_active: false,
      },
    ]);
  });
});

// Migration 034: uploads attach to tasks and militia profiles too
describe('files of tasks and militia profiles (e2e)', () => {
  let url: string;
  let ownerId: string;

  beforeAll(async () => {
    url = await createDatabase();
    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });
    ownerId = await withClient(url, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO users (username, password_hash, full_name)
         VALUES ('files_owner', 'x', 'Owner') RETURNING id`,
      );
      return rows[0].id;
    });
  });

  const insertFile = (
    category: string,
    relatedType: string | null,
    relatedId: string | null,
  ) =>
    withClient(url, (c) =>
      c.query(
        `INSERT INTO files (storage_key, original_name, mime_type, size, category, uploaded_by,
                            related_type, related_id)
         VALUES ($1, 'a.pdf', 'application/pdf', 1, $2, $3, $4, $5)`,
        [randomUUID(), category, ownerId, relatedType, relatedId],
      ),
    );

  it.each(['task', 'militia_profile'])(
    'lets an upload declared for a %s attach to one',
    async (kind) => {
      await expect(insertFile(kind, kind, randomUUID())).resolves.toMatchObject(
        { rowCount: 1 },
      );
    },
  );

  it('still refuses a purpose or a record kind nothing reads', async () => {
    await expect(insertFile('avatar', null, null)).rejects.toThrow(
      /chk_files_category/,
    );
    await expect(insertFile('general', 'avatar', randomUUID())).rejects.toThrow(
      /chk_files_related/,
    );
    await expect(insertFile('task', 'task', null)).rejects.toThrow(
      /chk_files_related/,
    );
  });
});

describe('schema guards (e2e)', () => {
  // CREATE TABLE IF NOT EXISTS silently keeps a table of a different shape
  it('refuses to adopt a pre-existing table with a different shape', async () => {
    const url = await createDatabase();
    await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough('018_recruitment_applications.sql'),
    });
    await withClient(url, (c) =>
      c.query(`CREATE TABLE exemptions (id UUID PRIMARY KEY, note TEXT)`),
    );

    // Every missing column is named at once, so the table can be fixed in one pass
    const failure = migrateDatabase({
      connectionString: url,
      directory: MIGRATIONS_DIR,
    });
    await expect(failure).rejects.toThrow(
      /exemptions has no columns created_at, documents, effective_date, expiry_date, legal_basis, militia_id, reason, status, type, updated_at;/,
    );
    expect(await recordedMigrations(url)).not.toContain(
      '019_schema_contract_tables.sql',
    );
  });

  it('refuses a pre-existing login_attempts table of another shape, naming both shapes', async () => {
    const url = await createDatabase();
    const before030 =
      ALL_FILES[ALL_FILES.indexOf('030_login_attempts.sql') - 1];
    await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough(before030),
    });
    await withClient(url, (c) =>
      c.query(
        `CREATE TABLE login_attempts (name_hash TEXT PRIMARY KEY, failed_count INTEGER NOT NULL DEFAULT 0)`,
      ),
    );

    await expect(
      migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR }),
    ).rejects.toThrow(
      /Migration 030: existing table login_attempts differs from this migration \(columns: failed_count integer NOT NULL DEFAULT 0, name_hash text NOT NULL; constraints: login_attempts_pkey PRIMARY KEY \(name_hash\)\), expected \(columns: failed_count integer NOT NULL DEFAULT 0, last_failure_at timestamp with time zone/,
    );
    expect(await recordedMigrations(url)).not.toContain(
      '030_login_attempts.sql',
    );
  });

  // Codex round 2: matching column names were enough; types, nullability, keys and
  // CHECK constraints of an adopted table were never compared
  describe('a pre-existing exemptions table with every expected column', () => {
    // The table exactly as migration 019 declares it; each case breaks one property, and
    // an empty part is left out
    const exactShape = {
      militiaId:
        'militia_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE RESTRICT',
      type: `type VARCHAR(20) NOT NULL CHECK (type IN ('exemption', 'deferral'))`,
      reason: 'reason TEXT NOT NULL',
      expiryDate: 'expiry_date DATE',
      status: `status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked'))`,
      expiryCheck:
        'CONSTRAINT chk_exemptions_expiry_after_effective CHECK (expiry_date IS NULL OR expiry_date >= effective_date)',
      extra: '',
    };
    const exemptionsTable = (overrides: Partial<typeof exactShape> = {}) => {
      const shape = { ...exactShape, ...overrides };
      const parts = [
        'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
        shape.militiaId,
        shape.type,
        shape.reason,
        'legal_basis VARCHAR(500) NOT NULL',
        'effective_date DATE NOT NULL',
        shape.expiryDate,
        shape.status,
        'documents TEXT[]',
        'created_at TIMESTAMPTZ NOT NULL DEFAULT now()',
        'updated_at TIMESTAMPTZ NOT NULL DEFAULT now()',
        shape.expiryCheck,
        shape.extra,
      ];
      return `CREATE TABLE exemptions (\n${parts.filter(Boolean).join(',\n')}\n)`;
    };
    // weapons and weapon_allocations exactly as migration 019 declares them
    const weaponTables = `
      CREATE TABLE weapons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(100) NOT NULL,
        serial_number VARCHAR(100) NOT NULL,
        acquired_at DATE NOT NULL,
        condition VARCHAR(20) NOT NULL DEFAULT 'good'
          CHECK (condition IN ('good', 'damaged', 'maintenance')),
        storage_location VARCHAR(200) NOT NULL,
        responsible_person_id UUID REFERENCES militia_profiles(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'retired', 'maintenance')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE weapon_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        weapon_id UUID NOT NULL REFERENCES weapons(id) ON DELETE RESTRICT,
        recipient_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE RESTRICT,
        issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        purpose VARCHAR(500) NOT NULL,
        returned_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_weapon_allocations_returned_after_issued
          CHECK (returned_at IS NULL OR returned_at >= issued_at)
      );`;

    async function migrateWithExemptions(ddl: string) {
      const url = await createDatabase();
      await migrateDatabase({
        connectionString: url,
        directory: migrationsThrough('018_recruitment_applications.sql'),
      });
      await withClient(url, (c) => c.query(ddl));
      return {
        url,
        run: () =>
          migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR }),
      };
    }

    it.each([
      [
        'a column of another type',
        { militiaId: 'militia_id TEXT NOT NULL' },
        /exemptions\.militia_id has type text, expected uuid/,
      ],
      [
        'a nullable column the backend requires',
        { reason: 'reason TEXT' },
        /exemptions\.reason must be NOT NULL/,
      ],
      [
        'no foreign key to the member',
        { militiaId: 'militia_id UUID NOT NULL' },
        /exemptions\.militia_id must reference militia_profiles/,
      ],
      [
        'no CHECK on a coded column',
        { status: `status VARCHAR(20) NOT NULL DEFAULT 'active'` },
        /exemptions\.status has no CHECK constraint/,
      ],
      // Review P2: nullability, CHECK meaning, foreign key targets and actions, named
      // table checks and index definitions were not compared
      [
        'a NOT NULL column that must accept NULL',
        { expiryDate: 'expiry_date DATE NOT NULL' },
        /exemptions\.expiry_date must allow NULL/,
      ],
      [
        'a CHECK allowing other values',
        {
          status: `status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired'))`,
        },
        /exemptions\.status allows \('active', 'expired'\), expected \('active', 'expired', 'revoked'\)/,
      ],
      [
        'a foreign key with another ON DELETE action',
        {
          militiaId:
            'militia_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE',
        },
        /exemptions\.militia_id must reference militia_profiles\(id\) ON DELETE RESTRICT/,
      ],
      [
        'a foreign key to another table',
        {
          militiaId:
            'militia_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT',
        },
        /exemptions\.militia_id must reference militia_profiles\(id\) ON DELETE RESTRICT/,
      ],
      [
        'the named table check missing',
        { expiryCheck: '' },
        /exemptions has no CHECK constraint chk_exemptions_expiry_after_effective/,
      ],
      [
        'the named table check defined differently',
        {
          expiryCheck:
            'CONSTRAINT chk_exemptions_expiry_after_effective CHECK (expiry_date > effective_date)',
        },
        /exemptions\.chk_exemptions_expiry_after_effective is CHECK \(\(expiry_date > effective_date\)\), expected CHECK \(\(\(expiry_date IS NULL\) OR \(expiry_date >= effective_date\)\)\)/,
      ],
      [
        'a CHECK constraint the migration does not declare',
        { reason: 'reason TEXT NOT NULL CHECK (length(reason) > 10)' },
        /exemptions has an unexpected CHECK constraint exemptions_reason_check/,
      ],
      [
        'no default where inserts rely on one',
        {
          status: `status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'expired', 'revoked'))`,
        },
        /exemptions\.status has no default/,
      ],
      [
        'an undeclared NOT NULL column inserts cannot fill',
        { extra: 'approved_by UUID NOT NULL' },
        /exemptions has undeclared NOT NULL columns without a default: approved_by/,
      ],
    ])('is refused with %s', async (_label, overrides, message) => {
      const { url, run } = await migrateWithExemptions(
        exemptionsTable(overrides),
      );

      await expect(run()).rejects.toThrow(message);
      await expect(run()).rejects.toThrow(/reconcile/);
      expect(await recordedMigrations(url)).not.toContain(
        '019_schema_contract_tables.sql',
      );
    });

    it('is refused without a primary key on id', async () => {
      const { run } = await migrateWithExemptions(
        exemptionsTable().replace('id UUID PRIMARY KEY', 'id UUID NOT NULL'),
      );

      await expect(run()).rejects.toThrow(
        /exemptions has no primary key on id/,
      );
    });

    it('reports every mismatch of the table in one message', async () => {
      const { run } = await migrateWithExemptions(
        exemptionsTable({
          expiryDate: 'expiry_date DATE NOT NULL',
          militiaId:
            'militia_id UUID NOT NULL REFERENCES militia_profiles(id) ON DELETE CASCADE',
          expiryCheck: '',
        }),
      );

      await expect(run()).rejects.toThrow(
        /exemptions\.expiry_date must allow NULL[\s\S]*exemptions\.militia_id must reference[\s\S]*exemptions has no CHECK constraint chk_exemptions_expiry_after_effective/,
      );
    });

    it('is adopted when its shape matches exactly', async () => {
      const { url, run } = await migrateWithExemptions(exemptionsTable());

      await expect(run()).resolves.toBeDefined();
      expect(await recordedMigrations(url)).toEqual(ALL_FILES);
    });

    // CREATE INDEX IF NOT EXISTS keeps any index of that name, whatever it indexes
    it('is refused when an index of the same name has another definition', async () => {
      const { url, run } = await migrateWithExemptions(`${exemptionsTable()};
        ${weaponTables}
        -- Unique over every allocation instead of open ones: a weapon could be issued only once
        CREATE UNIQUE INDEX uq_weapon_allocations_open ON weapon_allocations (weapon_id);`);

      await expect(run()).rejects.toThrow(
        /uq_weapon_allocations_open is CREATE UNIQUE INDEX uq_weapon_allocations_open ON public\.weapon_allocations USING btree \(weapon_id\), expected CREATE UNIQUE INDEX uq_weapon_allocations_open ON public\.weapon_allocations USING btree \(weapon_id\) WHERE \(returned_at IS NULL\)/,
      );
      expect(await recordedMigrations(url)).not.toContain(
        '019_schema_contract_tables.sql',
      );
    });

    it('is refused when a non-unique index of the same name has another definition', async () => {
      const { run } = await migrateWithExemptions(`${exemptionsTable()};
        CREATE INDEX idx_exemptions_status_expiry ON exemptions (status);`);

      await expect(run()).rejects.toThrow(
        /idx_exemptions_status_expiry is CREATE INDEX idx_exemptions_status_expiry ON public\.exemptions USING btree \(status\), expected CREATE INDEX idx_exemptions_status_expiry ON public\.exemptions USING btree \(status, expiry_date\)/,
      );
    });

    it('adopts every table and index when they match exactly', async () => {
      const { url, run } = await migrateWithExemptions(`${exemptionsTable()};
        ${weaponTables}
        CREATE UNIQUE INDEX uq_weapon_allocations_open
          ON weapon_allocations (weapon_id) WHERE returned_at IS NULL;`);

      await expect(run()).resolves.toBeDefined();
      expect(await recordedMigrations(url)).toEqual(ALL_FILES);
    });
  });

  it('still migrates a fresh database through every file', async () => {
    const url = await createDatabase();

    const report = await migrateDatabase({
      connectionString: url,
      directory: MIGRATIONS_DIR,
    });

    expect(report.applied).toEqual(ALL_FILES);
  });
});

// Migration 035: every way a session ends or an account changes is announced, once the
// change commits, for the realtime gateway (AuthRevocationFeed)
describe('auth revocation notifications (e2e)', () => {
  let url: string;
  let listener: Client;
  let userId: string;
  const received: Record<string, unknown>[] = [];

  beforeAll(async () => {
    url = await createDatabase();
    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });
    userId = await withClient(url, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO users (username, password_hash, full_name)
         VALUES ('revocation_user', 'x', 'Revocation') RETURNING id`,
      );
      return rows[0].id;
    });
    listener = new Client({ connectionString: url });
    await listener.connect();
    listener.on('notification', (message) => {
      if (message.channel === 'mms_auth_revocation') {
        received.push(JSON.parse(message.payload ?? '{}') as never);
      }
    });
    await listener.query('LISTEN mms_auth_revocation');
  });

  afterAll(async () => {
    await listener?.end();
  });

  beforeEach(() => {
    received.splice(0);
  });

  const openSession = () =>
    withClient(url, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
         VALUES ($1, 'h', now() + interval '1 day') RETURNING id`,
        [userId],
      );
      return rows[0].id;
    });

  // A notification is delivered after its transaction commits; a marker sent afterwards on
  // its own transaction arrives after everything sent before it
  const settled = async () => {
    await withClient(url, (c) =>
      c.query(`SELECT pg_notify('mms_auth_revocation', '{"kind":"marker"}')`),
    );
    const deadline = Date.now() + 10_000;
    while (!received.some((event) => event.kind === 'marker')) {
      if (Date.now() > deadline) throw new Error('no marker notification');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return received.filter((event) => event.kind !== 'marker');
  };

  it('announces a revoked session once, and not one revoked again', async () => {
    const sid = await openSession();

    await withClient(url, (c) =>
      c.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sid]),
    );
    await withClient(url, (c) =>
      c.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sid]),
    );

    await expect(settled()).resolves.toEqual([
      { kind: 'session', userId, sessionId: sid },
    ]);
  });

  it('does not announce a rotation, which continues the session', async () => {
    const old = await openSession();
    const next = await openSession();

    await withClient(url, (c) =>
      c.query(
        `UPDATE sessions SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [old, next],
      ),
    );

    await expect(settled()).resolves.toEqual([]);
  });

  it('announces an open session that is deleted', async () => {
    const sid = await openSession();

    await withClient(url, (c) =>
      c.query(`DELETE FROM sessions WHERE id = $1`, [sid]),
    );

    await expect(settled()).resolves.toEqual([
      { kind: 'session', userId, sessionId: sid },
    ]);
  });

  it("announces a change of the account's version or status", async () => {
    await withClient(url, (c) =>
      c.query(
        `UPDATE users SET auth_version = auth_version + 1 WHERE id = $1`,
        [userId],
      ),
    );
    await withClient(url, (c) =>
      c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [userId]),
    );
    await withClient(url, (c) =>
      c.query(`UPDATE users SET status = 'active' WHERE id = $1`, [userId]),
    );
    // Other columns are not announced
    await withClient(url, (c) =>
      c.query(`UPDATE users SET full_name = 'Renamed' WHERE id = $1`, [userId]),
    );

    const events = await settled();
    const version = await withClient(url, async (c) => {
      const { rows } = await c.query<{ v: string }>(
        `SELECT auth_version AS v FROM users WHERE id = $1`,
        [userId],
      );
      return Number(rows[0].v);
    });
    expect(events).toEqual([
      { kind: 'account', userId, version, active: true },
      { kind: 'account', userId, version, active: false },
      { kind: 'account', userId, version, active: true },
    ]);
  });

  it('announces nothing for a change that is rolled back', async () => {
    const sid = await openSession();

    await withClient(url, async (c) => {
      await c.query('BEGIN');
      await c.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [
        sid,
      ]);
      await c.query(
        `UPDATE users SET auth_version = auth_version + 1 WHERE id = $1`,
        [userId],
      );
      await c.query('ROLLBACK');
    });

    await expect(settled()).resolves.toEqual([]);
  });
});

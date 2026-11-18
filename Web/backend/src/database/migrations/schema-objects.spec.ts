// Which tables, columns and indexes a run of migration files leaves behind, read from the
// SQL alone. A baseline records files as applied without running them, so the runner
// first checks that these objects exist; whatever the parser cannot follow is left out
// rather than guessed, so a correct baseline is never refused.
import * as fs from 'fs';
import * as path from 'path';
import type { MigrationFile } from './migration-runner';
import { describeSchemaObject, expectedSchemaObjects } from './schema-objects';

const files = (...sqls: string[]): MigrationFile[] =>
  sqls.map((sql, i) => ({
    name: `${String(i + 1).padStart(3, '0')}_file.sql`,
    sql,
  }));

/** The objects left by one migration file per argument, described and sorted. */
const objects = (...sqls: string[]): string[] =>
  expectedSchemaObjects(files(...sqls))
    .map(describeSchemaObject)
    .sort();

describe('expectedSchemaObjects', () => {
  it('reads created tables, added columns and named indexes, with or without IF NOT EXISTS', () => {
    expect(
      objects(`
        CREATE TABLE users (id uuid PRIMARY KEY, email text);
        CREATE TABLE IF NOT EXISTS roles (id uuid);
        CREATE INDEX idx_users_email ON users(email);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_id ON roles (id) WHERE id IS NOT NULL;
        CREATE INDEX CONCURRENTLY idx_roles_c ON ONLY roles USING btree (id);
        CREATE UNLOGGED TABLE scratch (id int);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;`),
    ).toEqual([
      'column users.phone',
      'index idx_roles_c',
      'index idx_users_email',
      'index uq_roles_id',
      'table roles',
      'table scratch',
      'table users',
    ]);
  });

  it('folds unquoted identifiers to lower case and keeps quoted ones exactly', () => {
    expect(
      objects(`
        CREATE TABLE Users (id int);
        CREATE TABLE "AuditLog" (id int);
        CREATE TABLE "say ""hi""" (id int);
        ALTER TABLE "AuditLog" ADD COLUMN "Actor" text;
        CREATE INDEX "IDX_Audit" ON "AuditLog" ("Actor");`),
    ).toEqual([
      'column AuditLog.Actor',
      'index IDX_Audit',
      'table AuditLog',
      'table say "hi"',
      'table users',
    ]);
  });

  it('truncates identifiers to 63 bytes, as PostgreSQL does', () => {
    const long = `idx_${'x'.repeat(70)}`;

    expect(objects(`CREATE INDEX ${long} ON t (a);`)).toEqual([
      `index ${long.slice(0, 63)}`,
    ]);
  });

  it('reads every column of a multi-action ALTER TABLE and skips constraints', () => {
    expect(
      objects(`
        ALTER TABLE ONLY militia_profiles
          ADD COLUMN IF NOT EXISTS occupation VARCHAR(200),
          ADD health_status VARCHAR(20) CHECK (health_status IN ('good', 'poor')),
          ADD CONSTRAINT chk_x CHECK (a IN (1, 2)),
          ADD CHECK (b > 0),
          ADD PRIMARY KEY (id),
          ADD UNIQUE (c, d),
          ADD FOREIGN KEY (e) REFERENCES t(id),
          ALTER COLUMN f SET NOT NULL,
          ADD COLUMN "check" boolean;`),
    ).toEqual([
      'column militia_profiles.check',
      'column militia_profiles.health_status',
      'column militia_profiles.occupation',
    ]);
  });

  it('resolves public-qualified names and skips other schemas and temporary tables', () => {
    expect(
      objects(`
        CREATE TABLE public.a (id int);
        CREATE TABLE audit.b (id int);
        CREATE TEMP TABLE c (id int);
        CREATE GLOBAL TEMPORARY TABLE d (id int);
        CREATE INDEX idx_a ON public.a (id);
        CREATE INDEX idx_b ON audit.b (id);
        ALTER TABLE public.a ADD COLUMN x int;
        ALTER TABLE audit.b ADD COLUMN y int;`),
    ).toEqual(['column a.x', 'index idx_a', 'table a']);
  });

  it('skips what it cannot determine: unnamed indexes and ALTER TABLE IF EXISTS', () => {
    expect(
      objects(`
        CREATE INDEX ON users (email);
        ALTER TABLE IF EXISTS devices ADD COLUMN push_token text;`),
    ).toEqual([]);
  });

  it('ignores statements inside comments', () => {
    expect(
      objects(`
        -- CREATE TABLE commented (id int);
        /* CREATE TABLE block (id int); /* nested; CREATE TABLE nested (id int); */
           still inside the outer comment; CREATE TABLE still_comment (id int); */
        CREATE TABLE real_one (id int); -- CREATE TABLE trailing (id int);
        CREATE /* inline */ INDEX idx_real ON real_one (id);`),
    ).toEqual(['index idx_real', 'table real_one']);
  });

  it('ignores statement text inside string literals', () => {
    expect(
      objects(`
        INSERT INTO settings (key, value) VALUES ('x', 'a; CREATE TABLE fake_one (id int)');
        INSERT INTO settings (key, value)
          VALUES ('it''s', E'escaped \\' quote; CREATE TABLE fake_two (id int)');
        COMMENT ON TABLE t IS 'CREATE INDEX fake_idx ON t (id)';
        CREATE TABLE after_strings (id int);`),
    ).toEqual(['table after_strings']);
  });

  it('skips creations inside DO blocks and function bodies, which may not run', () => {
    expect(
      objects(`
        DO $$
        BEGIN
          IF to_regclass('public.weapons') IS NOT NULL THEN
            ALTER TABLE weapons ADD COLUMN IF NOT EXISTS status text;
            CREATE INDEX IF NOT EXISTS idx_weapons_status ON weapons(status);
          END IF;
        END $$;
        DO LANGUAGE plpgsql $body$ BEGIN CREATE TABLE conditional (id int); END $body$;
        CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $fn$
        BEGIN CREATE TABLE in_function (id int); END $fn$;
        CREATE TABLE outside (id int);`),
    ).toEqual(['table outside']);
  });

  it('forgets objects that later statements drop, with the indexes on dropped columns', () => {
    expect(
      objects(
        `CREATE TABLE a (id int, x int);
         CREATE INDEX idx_a_x ON a (x);
         CREATE INDEX idx_a_id ON a (id);
         ALTER TABLE a ADD COLUMN y int;
         ALTER TABLE a ADD COLUMN z int;
         CREATE INDEX idx_a_partial ON a (id) WHERE z > 0;
         CREATE TABLE b (id int);
         CREATE INDEX idx_b ON b (id);
         ALTER TABLE b ADD COLUMN w int;`,
        `DROP INDEX IF EXISTS idx_a_id;
         ALTER TABLE a DROP COLUMN y, DROP COLUMN IF EXISTS z;
         DROP TABLE IF EXISTS b CASCADE;`,
      ),
    ).toEqual(['index idx_a_x', 'table a']);
  });

  it('expects an object again once it is re-created, from the file that re-created it', () => {
    const result = expectedSchemaObjects(
      files(
        'CREATE INDEX idx_t ON t (a);',
        'DROP INDEX idx_t; CREATE INDEX idx_t ON t (a, b);',
      ),
    );

    expect(result).toEqual([
      { kind: 'index', table: 't', name: 'idx_t', file: '002_file.sql' },
    ]);
  });

  it('attributes an object to the file that first created it', () => {
    expect(
      expectedSchemaObjects(
        files(
          'CREATE TABLE IF NOT EXISTS notifications (id uuid);',
          'CREATE TABLE IF NOT EXISTS notifications (id uuid, user_id uuid);',
          'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id uuid;',
        ),
      ),
    ).toEqual([
      {
        kind: 'table',
        table: 'notifications',
        name: 'notifications',
        file: '001_file.sql',
      },
      {
        kind: 'column',
        table: 'notifications',
        name: 'entity_id',
        file: '003_file.sql',
      },
    ]);
  });

  it('forgets objects that a DO block may drop or rename', () => {
    expect(
      objects(
        `CREATE TABLE work_reports (id int, status text, user_id int);
         CREATE INDEX idx_work_reports_status ON work_reports (status);
         CREATE INDEX idx_work_reports_user ON work_reports (user_id);
         ALTER TABLE work_reports ADD COLUMN legacy text;
         CREATE TABLE old_name (id int);
         CREATE INDEX idx_other ON other (id);`,
        `DO $$
         BEGIN
           IF EXISTS (SELECT 1 FROM information_schema.columns WHERE column_name = 'status') THEN
             UPDATE work_reports SET status = 'x';
             ALTER TABLE work_reports DROP COLUMN status;
           END IF;
           IF true THEN ALTER TABLE work_reports RENAME COLUMN legacy TO modern; END IF;
           ALTER TABLE old_name RENAME TO new_name;
           DROP INDEX IF EXISTS idx_other;
         END $$;`,
      ),
    ).toEqual(['index idx_work_reports_user', 'table work_reports']);
  });

  it('follows renames outside DO blocks', () => {
    const created = `CREATE TABLE a (id int);
      ALTER TABLE a ADD COLUMN x int;
      CREATE INDEX idx_a_x ON a (x);`;
    const renamed = `ALTER TABLE a RENAME COLUMN x TO y;
      ALTER TABLE a RENAME TO b;
      ALTER INDEX idx_a_x RENAME TO idx_b_y;`;

    expect(objects(created, renamed)).toEqual([
      'column b.y',
      'index idx_b_y',
      'table b',
    ]);
    // The index still depends on the renamed column
    expect(objects(created, renamed, 'ALTER TABLE b DROP COLUMN y;')).toEqual([
      'table b',
    ]);
  });

  it('forgets everything created before a drop whose effects it cannot follow', () => {
    expect(
      objects(
        'CREATE TABLE a (id int); CREATE INDEX idx_a ON a (id);',
        'DROP TYPE mood CASCADE; CREATE TABLE b (id int);',
      ),
    ).toEqual(['table b']);
    expect(
      objects(
        'CREATE TABLE a (id int);',
        `DO $$ BEGIN EXECUTE format('DROP TABLE %I', 'a'); END $$;
         CREATE TABLE c (id int);`,
      ),
    ).toEqual(['table c']);
    expect(
      objects(
        'CREATE TABLE a (id int);',
        'DO LANGUAGE plv8 \'plv8.execute("DROP TABLE a")\'; CREATE TABLE d (id int);',
      ),
    ).toEqual(['table d']);
  });

  it('does not mistake a trigger calling a function for dynamic SQL', () => {
    expect(
      objects(
        'CREATE TABLE a (id int);',
        `DO $$
         BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 't') THEN
             CREATE CONSTRAINT TRIGGER t AFTER INSERT ON a
               DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION f();
           END IF;
         END $$;`,
      ),
    ).toEqual(['table a']);
  });
});

describe('expectedSchemaObjects on the real migrations', () => {
  const directory = path.join(__dirname, '..', '..', '..', 'migrations');
  const through = (last: string): MigrationFile[] =>
    fs
      .readdirSync(directory)
      .filter((name) => name.endsWith('.sql') && name <= last)
      .sort()
      .map((name) => ({
        name,
        sql: fs.readFileSync(path.join(directory, name), 'utf8'),
      }));

  it('follows 001 to 024, including what 020 and 021 drop', () => {
    const described = expectedSchemaObjects(
      through('024_payroll_training_allowance_mfa_recovery_codes.sql'),
    ).map(describeSchemaObject);

    expect(described).toEqual(
      expect.arrayContaining([
        'table users',
        'index idx_users_username',
        'column users.totp_secret',
        'column militia_profiles.judicial_clearance_status',
        'index uidx_militia_cccd_lookup',
        'table weapons',
        'index uq_weapon_allocations_open',
        'column militia_profiles.avatar_url',
        'column notifications.entity_type',
        'index idx_notification_receipts_user_delivered',
        'column work_reports.review_status',
        'column payroll_periods.locked_at',
        'table mfa_recovery_codes',
        'column payroll_items.training_allowance',
        'index idx_mfa_recovery_codes_unused',
      ]),
    );
    for (const gone of [
      // 020 drops it
      'index idx_notification_receipts_user',
      // 021's DO block drops the column it indexes
      'index idx_work_reports_status',
      // Only created inside DO blocks (015, 017)
      'index idx_notifications_user_read',
      'column weapons.status',
    ]) {
      expect(described).not.toContain(gone);
    }
  });
});

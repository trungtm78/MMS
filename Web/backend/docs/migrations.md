# Database migrations

The schema is owned by the SQL files in `Web/backend/migrations/`. The migrator applies
the pending ones in filename order and records each in `schema_migrations`.

- `node dist/database/migrations/migrate.cli.js`, or `npm run db:migrate:prod`, runs it
  from a build. `npm run db:migrate` runs it from source.
- The Docker image runs it before starting the server. Set `RUN_MIGRATIONS=false` when a
  separate release step migrates instead.

## Guarantees

- **One transaction per file, unless the file says otherwise.** A file runs in one
  transaction together with its `schema_migrations` row, so a failure leaves nothing half
  applied. The error names the file. The exception is a file marked non-transactional
  (see below), which is recorded only after its last statement succeeded.
- **History is immutable.** The migrator stores each file's SHA-256 checksum and refuses
  to run when an applied file was edited (`MigrationChecksumError`). It also refuses when
  an applied file was deleted or renamed (`MigrationMissingError`). To change the schema,
  add a new file.
- **One migrator at a time.** A Postgres advisory lock serialises migrators, so replicas
  starting together apply each file exactly once. The others poll for the lock
  (`pg_try_advisory_lock`, so a waiting migrator holds no snapshot) for at most
  `MIGRATION_LOCK_WAIT`; see "The advisory lock and the waits" below.
- **No blocked tables.** A statement waits at most `MIGRATION_LOCK_TIMEOUT` for a table
  lock, so a migration never queues every query on a busy table behind it. The online
  statements of a non-transactional file (index builds, `VALIDATE CONSTRAINT`) never block
  a writer and use the longer `MIGRATION_ONLINE_LOCK_TIMEOUT` instead.
- **No guessing on an existing database.** A database without migration history that
  already contains application tables is refused; see below.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `RUN_MIGRATIONS` | `true` | Docker image only: migrate before starting the server. |
| `MIGRATIONS_DIR` | `./migrations` | Directory holding the SQL files. |
| `MIGRATION_LOCK_TIMEOUT` | `10s` | Longest one statement waits for a table lock. In a non-transactional file it applies to every statement except the online ones below. |
| `MIGRATION_ONLINE_LOCK_TIMEOUT` | `30min` | Longest an online statement of a non-transactional file (`CREATE INDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY`, `VALIDATE CONSTRAINT`) waits for a lock or for older transactions. `0s` waits for ever. |
| `MIGRATION_LOCK_WAIT` | `10min` | Longest to wait for another running migrator. `0s` means try once and fail at once if another migrator holds the lock. |
| `MIGRATION_THROUGH` | unset | Apply pending files up to and including this exact file name and leave the later ones pending. The CLI flag `--through=` does the same and takes precedence. |
| `MIGRATION_BASELINE_THROUGH` | unset | One start only: adopt a database migrated before migration history existed. The CLI flag `--baseline-through=` does the same and takes precedence. |

Durations are a number and a unit: `ms`, `s` or `min` (`500ms`, `10s`, `30min`).

The connection comes from `DATABASE_URL`. Without it, the migrator uses `DB_HOST`,
`DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME`, with the same defaults as the
application.

### The advisory lock and the waits

A migrator takes one Postgres advisory lock for its whole run. A second migrator does not
block inside the server: it polls `pg_try_advisory_lock` until it gets the lock or
`MIGRATION_LOCK_WAIT` passes, and then fails. `MIGRATION_LOCK_WAIT=0s` is the strict
form: try once and fail at once when the lock is taken.

`MIGRATION_LOCK_WAIT` (10 min by default) is **shorter** than the online bound
(`MIGRATION_ONLINE_LOCK_TIMEOUT`, 30 min), and a single online file can run for longer than
either. A replica that boots while another migrator is still running a long online file
therefore gives up and fails to start. That is why a release that contains a long online
file (038) runs it as its own `--through` step ahead of the window, instead of leaving it
to the migration at boot (see "Rollout of the tenant isolation" below). Set
`RUN_MIGRATIONS=false` on the instances and migrate in a release step when that is not
enough.

`MIGRATION_THROUGH` (or `--through=`) is for that preparation step only. Left set at a
normal boot, the migrator applies the files up to it, prints the pending ones and a warning
(`WARNING: the schema is not complete ...`), and **exits 0**: the instance starts on a
schema that lacks the later files. Remove it after the step.

## Non-transactional migrations

`CREATE INDEX CONCURRENTLY` cannot run in a transaction, and an online `VALIDATE
CONSTRAINT` should not hold its locks longer than its own scan. A file whose leading comment
lines contain the exact line

    -- mms:migration no-transaction

is run statement by statement on the migration session: each statement commits on its own,
the advisory lock stays held, and each waits at most `MIGRATION_LOCK_TIMEOUT` for a lock,
except the online statements, which wait at most `MIGRATION_ONLINE_LOCK_TIMEOUT` (an index
build waits for older transactions, and cancelling it would leave an INVALID index). The
file is recorded in `schema_migrations` only after its last statement succeeded.

A failure leaves the statements before it applied and the file unrecorded: the next start
runs the **whole file again**. So every statement must be safe to run twice. The runner
reads the file after removing the comments and **refuses, before running any file, a marked
file with any statement outside this allowlist**:

| Statement | Why it can run twice |
| --- | --- |
| `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS <name> ON ...` | skipped when the index exists |
| `DROP INDEX CONCURRENTLY IF EXISTS <name>` | skipped when it is gone |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` | skipped when the column exists |
| `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT ...` | sets the same default again |
| `ALTER TABLE ... VALIDATE CONSTRAINT <name>` | a no-op once valid |
| `ANALYZE` | harmless |
| `COMMENT ON ...` | sets the same comment again |

Everything else is refused, among it `BEGIN`/`COMMIT`/`ROLLBACK` and any other
transaction control, a non-concurrent index statement, an `ALTER TABLE` with several
actions, `DO` blocks, and `INSERT`/`UPDATE`/`DELETE`. A check that must fail the release
(a `DO` block raising an exception) therefore lives in an ordinary transactional file, as
`041_tenant_assert.sql` does.

An interrupted concurrent build leaves an INVALID index that `IF NOT EXISTS` would skip for
ever. Before running a marked file the runner drops (`CONCURRENTLY`) every INVALID index the
file builds, and after the file it checks that each of them is valid before recording the
file. Checksums work as for any file.

`--through=<file>` (or `MIGRATION_THROUGH`) stops after that file, reporting the rest as
pending. It is how a release runs its online preparation ahead of its drained window.

## Upgrading a database migrated before migration history existed

Earlier releases migrated with a shell loop: `npm run db:migrate` ran
`psql -f` on every file in `migrations/`. That left the schema but no
`schema_migrations` rows. Starting from 001 again would fail on non-idempotent
statements such as `CREATE INDEX`, so the migrator refuses to run anything:

```
The database has no migration history but already contains application tables (alerts,
attendance_records, audit_logs, ca_dqtv_assignments, conversation_participants and 40 more):
it looks like a database migrated before migration history existed. Nothing was run. Set
MIGRATION_BASELINE_THROUGH=<last applied file> (or --baseline-through=<last applied file>)
to the exact name of the last migration file already applied to this database, start once,
then remove the setting. See docs/migrations.md
```

An empty database is not affected: it migrates from 001 as usual.

### Procedure

1. **Stop the backend** so that nothing writes while you prepare. For example:
   `docker compose -f docker-compose.prod.yml stop backend`.
2. **Back up the database** and keep the dump until the upgrade is verified. Use
   `--create`: without it the dump loses database-level settings, which from migration 037
   on include the setting legacy mode needs (see "Backups and restores" below), and a
   custom-format archive made with `--create` is restored with `pg_restore --create`:
   ```sh
   docker compose -f docker-compose.prod.yml exec postgres \
     pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --create -f /tmp/before-baseline.dump
   docker compose -f docker-compose.prod.yml cp postgres:/tmp/before-baseline.dump .
   ```
3. **Find the last file the shell runner applied.** This is the highest-numbered file in
   the `migrations/` directory of the release that last ran `npm run db:migrate`.
   - The loop ran psql without `ON_ERROR_STOP`, so a failing statement did not stop it.
     Check that run's output for `ERROR:` lines.
   - A file with a failed statement is not fully applied: fix the schema by hand, or pick
     the file before it.
4. **Set the baseline and start one instance once.** In `.env.docker`, set for example
   `MIGRATION_BASELINE_THROUGH=018_recruitment_applications.sql`, using the file from
   step 3. The name must match a file exactly. Then start a single instance, for example
   `docker compose -f docker-compose.prod.yml run --rm backend node dist/database/migrations/migrate.cli.js`.
   The migrator then:
   - checks that the database has no migration history;
   - checks that every table, column (`ALTER TABLE ... ADD COLUMN`) and named index those
     files create exists;
   - records the files as applied, all or nothing, without running them;
   - applies the files after the baseline.
5. **Remove `MIGRATION_BASELINE_THROUGH`**, then start the backend normally. A baseline
   only works on a database without history. Left in place, it stops every later start
   with `Cannot baseline through ...: the database already has migration history`.

### When the baseline is refused

If the database lacks objects that the named files create, nothing is recorded. The error
lists every missing object, grouped by the file that creates it:

```
Cannot baseline through 024_payroll_training_allowance_mfa_recovery_codes.sql: the database
lacks 30 objects that the migrations up to it create, so they were not all applied. Missing
objects by file: 019_schema_contract_tables.sql: table weapons, table weapon_allocations,
index uq_weapon_allocations_open, ...; 020_notifications_receipts.sql: column
notifications.entity_type, ...; ... Nothing was recorded. Set MIGRATION_BASELINE_THROUGH
to the last migration file this database has completely; the first file with missing
objects is 019_schema_contract_tables.sql
```

Set the baseline to a file before the first file named, or create the missing objects,
then start again. On a database with no application tables at all, the error says so
instead: remove the setting and let it migrate from 001.

The check reads the SQL files. It follows drops and renames, including those inside `DO`
blocks, so objects a later file removes are not demanded. It skips what it cannot
determine from the text: statements inside `DO` blocks and functions that create objects,
unnamed indexes, `ALTER TABLE IF EXISTS`, and everything before a drop whose effects it
cannot follow (dynamic SQL, `DROP ... CASCADE` of other object kinds). It checks that
objects exist, not their column types or constraints. That is why step 3 still matters.

## Deploying releases that migrate

The advisory lock serialises migrators; it does not make versions compatible. While a
release migrates, and until every instance runs the new code, old instances keep querying
the new schema.

- **Additive releases** only add tables, nullable columns, columns with defaults, or
  indexes. Old code keeps working, so instances may be replaced one at a time. Let only
  one instance migrate at a time; the lock guarantees this when they start together.
- **Releases with incompatible changes** drop or rename a table or column, change a type,
  or add a constraint old code violates. Deploy them drained, with no mixed versions:
  1. Drain traffic and stop every instance of the old version:
     `docker compose -f docker-compose.prod.yml stop backend`.
  2. Back up the database.
  3. Migrate with exactly one instance, either a release step
     (`docker compose -f docker-compose.prod.yml run --rm backend node dist/database/migrations/migrate.cli.js`)
     or a single instance starting with `RUN_MIGRATIONS` unset.
  4. Start the new version on every instance. When step 3 was a release step, set
     `RUN_MIGRATIONS=false` on the instances.

  Release notes must say which kind a release is.

## Multi-tenancy migrations (036 and 037, M0)

Migrations 036 and 037 start the multi-tenant work (M0, see `tenancy.md`). They are the
first migrations that need a privileged migrator, and 037 is an incompatible release.
Milestone M1 continues with **038 and later** (the design spec's `036b/037/038` names are
superseded).

- **`036_tenants.sql`**: the `tenants` table with the first tenant
  (`a1000000-0000-4000-8000-000000000001`, code `phu-dinh`); `app_tenant_id()`, which
  reads the `app.tenant_id` session setting; the cluster-wide roles `mms_app` and
  `mms_platform` (created `NOLOGIN NOSUPERUSER NOBYPASSRLS`, and tolerated if they exist);
  grants (`mms_app` reads and writes the application tables but never
  `schema_migrations`); and two `SECURITY DEFINER` functions, `auth_tenant_by_code(text)`
  for sign-in and `maintenance_tenant_ids()` for background jobs.
- **`037_tenant_slice_rls.sql`**: `tenant_id uuid NOT NULL REFERENCES tenants(id)` on
  `users`, `units`, `militia_profiles`, `tasks`, `task_assignments`, `files`,
  `notifications`, `notification_receipts` and `audit_logs`. Every existing row becomes the
  first tenant's (the column is added with that constant, then its default becomes
  `app_tenant_id()`). Each table gets `ENABLE` and `FORCE ROW LEVEL SECURITY` and a
  `tenant_isolation` policy. The natural keys become unique per tenant:
  `(tenant_id, username)`, `(tenant_id, email)`, `(tenant_id, code)` on units and tasks,
  `(tenant_id, militia_code)`, `(tenant_id, cccd)` and the CCCD lookup index.

### The legacy database default

At its end 037 runs `ALTER DATABASE <db> SET app.tenant_id = '<first tenant>'`. Sessions
that never write a tenant (the migrator, admin tools, and the application itself in
`TENANCY_MODE=legacy`) therefore inherit the first tenant and see all their old data, as
before. The setting reaches **new** sessions only: after migrating, restart the
application so its pool reconnects. M1 removes the default with
`ALTER DATABASE <db> RESET app.tenant_id`, only after every replica runs
`TENANCY_MODE=enforced`; `enforced` refuses to start while the default exists, and
`legacy` refuses to start once it is gone (`legacy_tenant_default_missing`).

### Backups and restores

A database-level setting is not part of a plain `pg_dump`, and legacy mode depends on this
one: after a restore without it, every insert into the nine tenant tables fails
(`null value in column "tenant_id"`), the fire-and-forget audit inserts fail with only a
warning (audit data is lost), and the application now refuses to boot. So:

- Back up with `pg_dump --create` (plain SQL: replay with `psql -d postgres -f dump.sql`;
  custom format: `pg_dump -Fc --create`, restored with `pg_restore --create -d postgres`).
  Or, after restoring a dump taken without it, repeat
  `ALTER DATABASE <db> SET app.tenant_id = 'a1000000-0000-4000-8000-000000000001'`.
- **Restore the roles first** when restoring onto another cluster:
  `pg_dumpall --roles-only` on the source, replayed on the target. Roles are cluster-wide
  and not part of any database dump; without `mms_app` and `mms_platform`,
  `CREATE POLICY ... TO mms_app` and the grants in the dump fail.
- A database cloned with `CREATE DATABASE ... TEMPLATE` does not copy the setting either:
  repeat the `ALTER DATABASE` on the clone.

### Requirements and release kind

- **Run the migrator as a superuser or a BYPASSRLS role.** 036 creates cluster roles and
  037 changes a database-level setting; FORCE ROW LEVEL SECURITY would also lock a plain
  table-owner role out of the tables. In the Docker image set `DATABASE_URL` to the owner
  when the application runs as `DB_USER=mms_app` (see `tenancy.md`).
- **The legacy application role must be a superuser, a BYPASSRLS role, or `mms_app` (or a
  member of it).** The policies are `TO mms_app` and FORCE applies them to the table
  owner, so any other plain role sees empty tables under the legacy default; the
  application refuses to boot with one (`legacy_role_blocked_by_rls`). The sample
  environment's `DB_USER=mms` is a superuser and keeps working.
- **037 is an incompatible release.** It drops the single-column unique constraints that
  earlier code names in `ON CONFLICT (username)` and `ON CONFLICT (code)`. Old instances
  fail on those statements once 037 is applied, so deploy a release that contains it
  drained, as described above under "Releases with incompatible changes".
- 037 is not an online change. Adding the columns, the foreign keys to `tenants`, the
  `tenant_id` indexes and the per-tenant unique constraints scans and locks each of the
  nine tables, in one transaction (see the comment at the top of the file); how long that
  blocks `users` and `audit_logs` has not been measured on production-sized data, so
  rehearse it on a copy. M1 touches ~60 more tables and builds online
  (`CREATE INDEX CONCURRENTLY` first).
- After 037, give `mms_app` a login (`ALTER ROLE mms_app LOGIN PASSWORD '...'`) only when
  you run `TENANCY_MODE=enforced`; a legacy deployment keeps its current database user as
  long as that user is a superuser, a BYPASSRLS role or `mms_app` (see above).

## Multi-tenancy migrations 038 to 041 (M1a)

They extend the isolation of the M0 slice to every tenant table (66 tables; the 6 global
ones are `schema_migrations`, `tenants`, `roles`, `permissions`, `role_permissions` and
`login_attempts`, see `tenancy.md`). The sequence is:

| File | Kind | Does |
| --- | --- | --- |
| `036_tenants.sql` | transactional | the `tenants` registry, `app_tenant_id()`, the roles `mms_app` and `mms_platform`, the grants (M0) |
| `037_tenant_slice_rls.sql` | transactional, **incompatible** | `tenant_id`, RLS and per-tenant keys on nine tables, and the legacy database default (M0) |
| `038_tenant_columns_online.sql` | non-transactional, **online** | `tenant_id` on the remaining 57 tables and every index the cutover needs |
| `039_tenant_isolation_cutover.sql` | transactional, short, **incompatible** | keys, foreign keys `NOT VALID`, RLS and privileges, in one window |
| `040_tenant_validate_online.sql` | non-transactional, **online** | `VALIDATE CONSTRAINT` of the 171 keys 039 added `NOT VALID` |
| `041_tenant_assert.sql` | transactional | catalog assertions only; changes nothing |

- **`038_tenant_columns_online.sql`**: `tenant_id` on the 57 remaining tables, added with
  the first tenant as a constant default (kept in the catalog: no rewrite, no UPDATE, so the
  record-keeping triggers of 026 never fire), then defaulting to `app_tenant_id()`; every
  index the cutover needs, built `CONCURRENTLY`: 24 parent keys `(tenant_id, id)`, 15
  per-tenant natural keys, 113 composite foreign-key indexes and 14 tenant list indexes. It
  changes no behaviour and can run while the old version serves.
- **`039_tenant_isolation_cutover.sql`**: attaches the per-tenant unique keys
  (`ADD CONSTRAINT ... USING INDEX`, no scan), rewrites the 114 foreign keys between tenant
  tables as composite `(tenant_id, ...)` keys `NOT VALID` with the same names and delete
  rules (`ON DELETE SET NULL (<col>)` for the nullable ones), enables and forces RLS with the
  `tenant_isolation` policy on the 57 tables, adds their `tenant_id` foreign keys `NOT
  VALID`, removes the default privileges of 036 (every later migration grants its tables
  explicitly; the schema guard test checks it), makes `roles`, `permissions` and
  `role_permissions` read-only for `mms_app`, and adds `tenantId` to the revocation
  announcements of 035. It asserts the catalog at its end: all or nothing.
- **`040_tenant_validate_online.sql`**: nothing but `ALTER TABLE ... VALIDATE CONSTRAINT`,
  one statement per key (57 `tenant_id` keys and 114 composite keys), each in its own
  transaction: `SHARE UPDATE EXCLUSIVE` on the child and `ROW SHARE` on the parent, so reads
  and writes go on while each one scans. Re-running a validated key is a no-op.
- **`041_tenant_assert.sql`**: one `DO` block that fails the migration unless the catalog
  says: 66 tenant tables, each with RLS enabled and forced and the `tenant_isolation`
  policy, each with one validated `tenant_id` key to `tenants`; no foreign key of the
  schema left `NOT VALID`; exactly 114 foreign keys between tenant tables, each composite
  (`tenant_id` paired with the parent's `tenant_id`); no invalid or unready index. A failed
  assertion leaves 041 unrecorded, and the next start asserts again.

### Rollout of the tenant isolation

**039 is an incompatible release**: the conflict targets of `system_settings`, `incidents`
and `conversations` change, so old code that names the old targets fails once 039 is
applied. Deploy it drained, with no old instance running, as described under "Releases
with incompatible changes". The recipe:

1. **Any time before the window**, with the old version still serving: run the migrator as a
   release step with `--through=038_tenant_columns_online.sql`. It builds its indexes
   without blocking writers and can take long on large tables; it is safe to interrupt and
   repeat (the runner drops the INVALID index an interrupted build leaves). Do not leave it
   to the migration at boot: `MIGRATION_LOCK_WAIT` is shorter than the online bound, so a
   replica that boots meanwhile would fail.
2. **Drain and stop the old version.** Back up with `pg_dump --create` (see "Backups and
   restores").
3. **Inside the window**: run the migrator with
   `--through=039_tenant_isolation_cutover.sql`. 039 is one short transaction.
4. **Start the new version.** Migrating at start applies 040 online and then 041, or run the
   migrator as a step first and start the instances with `RUN_MIGRATIONS=false`. Traffic is
   served while 040 validates. Unset `MIGRATION_THROUGH` first: left set it stops before
   040, warns and exits 0.
5. **Check**: the migrator reports `0 pending`, and 041 is in `schema_migrations`.

```sh
node dist/database/migrations/migrate.cli.js --through=038_tenant_columns_online.sql    # step 1
node dist/database/migrations/migrate.cli.js --through=039_tenant_isolation_cutover.sql # step 3
node dist/database/migrations/migrate.cli.js                                             # step 4
```

On a database at 037, a plain run applies all four files in order; the steps above only
split that run around the drained window. A second run is a no-op.

Things to know about the result:

- **A guard written into an old migration cannot be re-run on a post-039 database.** 029,
  for example, re-checks that its tables' foreign keys are single-column keys, which 039 made
  composite. The runner never runs an applied file twice, and the baseline path only records
  files, so nothing in normal operation does it. Do not run `psql -f` of an old file against
  a migrated database.
- **Backups must use `pg_dump --create`** (the legacy database default of 037 is
  database-level, and the cutover leaves it in place): see "Backups and restores". The
  advice there about restoring the roles first applies as before.
- The legacy database default (`app.tenant_id`) is untouched: a legacy deployment keeps
  writing and reading the first tenant on all 66 tables. A `mms_app` or member of it sees
  exactly that tenant, as it did on nine tables in M0.
- After 039, a migration that creates a table must grant it explicitly to the roles that need
  it: the default privileges of 036 are gone. The schema guard fails a table that forgot.
- **Lock windows.** The windows measured on a synthetic production-sized database are in
  "Rehearsal" below. (TO BE WRITTEN IN TASK 23: this section does not exist yet.)

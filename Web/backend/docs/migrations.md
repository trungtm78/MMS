# Database migrations

The schema is owned by the SQL files in `Web/backend/migrations/`. The migrator applies
the pending ones in filename order and records each in `schema_migrations`.

- `node dist/database/migrations/migrate.cli.js`, or `npm run db:migrate:prod`, runs it
  from a build. `npm run db:migrate` runs it from source.
- The Docker image runs it before starting the server. Set `RUN_MIGRATIONS=false` when a
  separate release step migrates instead.

## Guarantees

- **One transaction per file.** A file runs in one transaction together with its
  `schema_migrations` row, so a failure leaves nothing half applied. The error names the
  file.
- **History is immutable.** The migrator stores each file's SHA-256 checksum and refuses
  to run when an applied file was edited (`MigrationChecksumError`). It also refuses when
  an applied file was deleted or renamed (`MigrationMissingError`). To change the schema,
  add a new file.
- **One migrator at a time.** A Postgres advisory lock serialises migrators, so replicas
  starting together apply each file exactly once. The others wait at most
  `MIGRATION_LOCK_WAIT`.
- **No blocked tables.** A statement waits at most `MIGRATION_LOCK_TIMEOUT` for a table
  lock, so a migration never queues every query on a busy table behind it.
- **No guessing on an existing database.** A database without migration history that
  already contains application tables is refused; see below.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `RUN_MIGRATIONS` | `true` | Docker image only: migrate before starting the server. |
| `MIGRATIONS_DIR` | `./migrations` | Directory holding the SQL files. |
| `MIGRATION_LOCK_TIMEOUT` | `10s` | Longest one statement waits for a table lock. |
| `MIGRATION_LOCK_WAIT` | `10min` | Longest to wait for another running migrator. |
| `MIGRATION_BASELINE_THROUGH` | unset | One start only: adopt a database migrated before migration history existed. The CLI flag `--baseline-through=` does the same and takes precedence. |

The connection comes from `DATABASE_URL`. Without it, the migrator uses `DB_HOST`,
`DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME`, with the same defaults as the
application.

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
2. **Back up the database** and keep the dump until the upgrade is verified:
   ```sh
   docker compose -f docker-compose.prod.yml exec postgres \
     pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f /tmp/before-baseline.dump
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

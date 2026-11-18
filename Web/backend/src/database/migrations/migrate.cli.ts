// Applies pending SQL migrations from ./migrations (or MIGRATIONS_DIR).
//
//   node dist/database/migrations/migrate.cli.js
//   node dist/database/migrations/migrate.cli.js --baseline-through=018_recruitment_applications.sql
//
// Connection: DATABASE_URL, or DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME with the
// application's defaults.
// MIGRATION_LOCK_TIMEOUT (default 10s): longest one statement waits for a table lock.
// MIGRATION_LOCK_WAIT (default 10min): longest to wait for another running migrator.
// A database without migration history that already has application tables is refused:
// it was migrated before schema_migrations existed. --baseline-through (or
// MIGRATION_BASELINE_THROUGH) adopts it by recording the already-applied files without
// running them again. It must name a migration file exactly, only works while
// schema_migrations is empty, and is refused unless every table, column and index those
// files create exists. Remove it after the first start. See docs/migrations.md.
import { migrateDatabase } from './migrate';
import {
  connectionStringFromEnv,
  migrationOptionsFromEnv,
} from './migration-config';

async function main(): Promise<void> {
  const report = await migrateDatabase({
    connectionString: connectionStringFromEnv(process.env),
    ...migrationOptionsFromEnv(process.env, process.argv, process.cwd()),
  });
  for (const name of report.baselined) console.log(`baselined ${name}`);
  for (const name of report.applied) console.log(`applied   ${name}`);
  console.log(
    `migrations: ${report.applied.length} applied, ${report.skipped.length} already applied, ${report.baselined.length} baselined`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

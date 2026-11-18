import * as path from 'path';
import { databaseConfig } from '../../config/configuration';
import type { MigrateOptions } from './migrate';

export type MigrationCliOptions = Pick<
  MigrateOptions,
  | 'directory'
  | 'baselineThrough'
  | 'through'
  | 'lockTimeout'
  | 'advisoryLockTimeout'
>;

/** DATABASE_URL, else the DB_* variables with the application's own defaults. */
export function connectionStringFromEnv(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const db = databaseConfig(env);
  const url = new URL('postgres://localhost');
  url.hostname = db.host;
  url.port = String(db.port);
  url.username = encodeURIComponent(db.username);
  url.password = encodeURIComponent(db.password);
  url.pathname = `/${encodeURIComponent(db.database)}`;
  return url.toString();
}

function argValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

export function migrationOptionsFromEnv(
  env: NodeJS.ProcessEnv,
  argv: string[],
  cwd: string,
): MigrationCliOptions {
  const options: MigrationCliOptions = {
    directory: env.MIGRATIONS_DIR ?? path.resolve(cwd, 'migrations'),
  };
  const baselineThrough =
    argValue(argv, 'baseline-through') ?? env.MIGRATION_BASELINE_THROUGH;
  if (baselineThrough) options.baselineThrough = baselineThrough;
  const through = argValue(argv, 'through') ?? env.MIGRATION_THROUGH;
  if (through) options.through = through;
  if (env.MIGRATION_LOCK_TIMEOUT)
    options.lockTimeout = env.MIGRATION_LOCK_TIMEOUT;
  if (env.MIGRATION_LOCK_WAIT) {
    options.advisoryLockTimeout = env.MIGRATION_LOCK_WAIT;
  }
  return options;
}

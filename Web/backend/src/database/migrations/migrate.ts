import * as fs from 'fs';
import * as path from 'path';
import { Client, type ClientBase } from 'pg';
import {
  runMigrations,
  type MigrationFile,
  type MigrationReport,
  type RunOptions,
} from './migration-runner';
import {
  isLockDuration,
  PostgresMigrationStore,
  type PostgresMigrationStoreOptions,
} from './postgres-migration-store';

export interface MigrateWithClientOptions
  extends RunOptions, PostgresMigrationStoreOptions {
  /**
   * Longest to wait for another migrator to finish, e.g. '10min'. Replicas starting
   * together queue behind the first one; a stuck migrator must not hang them forever.
   */
  advisoryLockTimeout?: string;
}

export interface MigrateOptions extends MigrateWithClientOptions {
  connectionString: string;
  directory: string;
}

// Arbitrary constant key: only one migrator may run at a time per database,
// e.g. when several backend replicas start together.
export const MIGRATION_LOCK_KEY = 72_2020_0001;

const LOCK_NOT_AVAILABLE = '55P03';

export class MigrationLockTimeoutError extends Error {
  constructor(readonly waited: string) {
    super(
      `Timed out after ${waited} waiting for another migration to finish; retry once it completes`,
    );
    this.name = 'MigrationLockTimeoutError';
  }
}

export function readMigrationFiles(directory: string): MigrationFile[] {
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => ({
      name,
      sql: fs.readFileSync(path.join(directory, name), 'utf8'),
    }));
}

export async function migrateWithClient(
  client: Pick<ClientBase, 'query'>,
  files: MigrationFile[],
  options: MigrateWithClientOptions = {},
): Promise<MigrationReport> {
  const wait = options.advisoryLockTimeout ?? '10min';
  // Interpolated into SET, which takes no bind parameters
  if (!isLockDuration(wait)) {
    throw new Error(
      `Invalid migration lock wait ${JSON.stringify(wait)}: use a duration such as '10min'`,
    );
  }
  // Validates the statement lock timeout before anything touches the database
  const store = new PostgresMigrationStore(client, {
    lockTimeout: options.lockTimeout,
  });

  // lock_timeout also bounds waiting for an advisory lock
  await client.query(`SET lock_timeout = '${wait}'`);
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  } catch (err) {
    if ((err as { code?: string }).code === LOCK_NOT_AVAILABLE) {
      throw new MigrationLockTimeoutError(wait);
    }
    throw err;
  }

  try {
    await client.query('RESET lock_timeout');
    return await runMigrations(store, files, {
      baselineThrough: options.baselineThrough,
      through: options.through,
    });
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } catch {
      // Ending the session releases the lock; report the migration's own outcome
    }
  }
}

export async function migrateDatabase(
  options: MigrateOptions,
): Promise<MigrationReport> {
  const files = readMigrationFiles(options.directory);
  const client = new Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    return await migrateWithClient(client, files, options);
  } finally {
    await client.end().catch(() => undefined);
  }
}

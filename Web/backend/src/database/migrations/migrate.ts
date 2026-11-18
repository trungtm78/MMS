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
  /** How often to ask whether the migration lock is free, in milliseconds. Default 250. */
  advisoryLockPollMs?: number;
}

export interface MigrateOptions extends MigrateWithClientOptions {
  connectionString: string;
  directory: string;
}

// Arbitrary constant key: only one migrator may run at a time per database,
// e.g. when several backend replicas start together.
export const MIGRATION_LOCK_KEY = 72_2020_0001;

const DEFAULT_POLL_MS = 250;

const UNIT_MS = { ms: 1, s: 1000, min: 60_000 } as const;

/** Milliseconds in a duration that isLockDuration accepted, such as '10min'. */
function durationMs(duration: string): number {
  const unit = duration.endsWith('ms')
    ? 'ms'
    : duration.endsWith('min')
      ? 'min'
      : 's';
  return Number.parseInt(duration, 10) * UNIT_MS[unit];
}

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

/**
 * Takes the migration lock by asking for it again and again, never by blocking on it. A
 * session blocked in pg_advisory_lock holds a snapshot from its statement; the migrator that
 * owns the lock may be building an index CONCURRENTLY, which waits for every older snapshot:
 * each would wait for the other, and Postgres cancels the build, leaving an INVALID index.
 */
async function acquireMigrationLock(
  client: Pick<ClientBase, 'query'>,
  wait: string,
  pollMs: number,
): Promise<void> {
  const deadline = Date.now() + durationMs(wait);
  for (;;) {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [MIGRATION_LOCK_KEY],
    );
    if (rows[0]?.locked) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new MigrationLockTimeoutError(wait);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(pollMs, remaining)),
    );
  }
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
    onlineLockTimeout: options.onlineLockTimeout,
  });

  await acquireMigrationLock(
    client,
    wait,
    options.advisoryLockPollMs ?? DEFAULT_POLL_MS,
  );
  try {
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

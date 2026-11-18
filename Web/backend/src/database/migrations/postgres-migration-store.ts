import type { ClientBase } from 'pg';
import {
  indexesBuiltBy,
  isOnlineStatement,
  type BaselineEntry,
  type MigrationFile,
  type MigrationStore,
  type SchemaInventory,
} from './migration-runner';

export interface PostgresMigrationStoreOptions {
  /**
   * Longest a migration statement may wait for a table lock, e.g. '10s'. Without a
   * bound, an ALTER waiting behind a long query makes every later query on that table
   * queue behind the ALTER.
   */
  lockTimeout?: string;
  /**
   * Longest an online statement of a non-transactional file waits, e.g. '30min': CREATE
   * INDEX CONCURRENTLY and DROP INDEX CONCURRENTLY, which wait for every older transaction
   * to end, and VALIDATE CONSTRAINT. They never block a writer, so waiting is harmless and
   * the short lockTimeout would only cancel a build behind a long transaction. '0s' waits
   * for ever; the default is generous but finite so that a stuck session cannot hang a
   * deployment unseen.
   */
  onlineLockTimeout?: string;
}

const DURATION = /^\d+(ms|s|min)$/;

/** A Postgres duration safe to interpolate into SET, such as '10s' or '10min'. */
export function isLockDuration(value: string): boolean {
  return DURATION.test(value);
}

// Records applied migration files in schema_migrations. Each file runs in its own
// transaction together with its bookkeeping row, so a failure leaves no half-applied file.
export class PostgresMigrationStore implements MigrationStore {
  private readonly lockTimeout: string;
  private readonly onlineLockTimeout: string;

  constructor(
    private readonly client: Pick<ClientBase, 'query'>,
    options: PostgresMigrationStoreOptions = {},
  ) {
    this.lockTimeout = options.lockTimeout ?? '10s';
    this.onlineLockTimeout = options.onlineLockTimeout ?? '30min';
    // Interpolated into SET, which takes no bind parameters
    if (!isLockDuration(this.lockTimeout)) {
      throw new Error(
        `Invalid migration lock timeout ${JSON.stringify(this.lockTimeout)}: use a duration such as '10s'`,
      );
    }
    if (!isLockDuration(this.onlineLockTimeout)) {
      throw new Error(
        `Invalid migration online lock timeout ${JSON.stringify(this.onlineLockTimeout)}: use a duration such as '30min'`,
      );
    }
  }

  async ensureTable(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        checksum   CHAR(64)    NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
  }

  async appliedChecksums(): Promise<Map<string, string>> {
    const { rows } = await this.client.query<{
      filename: string;
      checksum: string;
    }>(`SELECT filename, checksum FROM schema_migrations`);
    return new Map(rows.map((r) => [r.filename, r.checksum]));
  }

  async applyInTransaction(
    file: MigrationFile,
    checksum: string,
  ): Promise<void> {
    await this.inTransaction(async () => {
      await this.client.query(`SET LOCAL lock_timeout = '${this.lockTimeout}'`);
      // No bind parameters: the simple query protocol allows multi-statement files
      await this.client.query(file.sql);
      await this.record(file.name, checksum);
    });
  }

  async applyWithoutTransaction(
    file: MigrationFile,
    checksum: string,
    statements: string[],
  ): Promise<void> {
    // Session-wide: there is no transaction for SET LOCAL to belong to. A statement that
    // locks a table against writers keeps the short bound; an online one (an index build
    // waits for every older transaction) gets the long one, because waiting blocks nobody
    // and a cancelled build leaves an INVALID index behind.
    let bound: string | undefined;
    const boundTo = async (timeout: string): Promise<void> => {
      if (timeout === bound) return;
      await this.client.query(`SET lock_timeout = '${timeout}'`);
      bound = timeout;
    };
    try {
      const built = indexesBuiltBy(statements);
      await this.dropInvalidIndexes(built, () =>
        boundTo(this.onlineLockTimeout),
      );
      for (const statement of statements) {
        await boundTo(
          isOnlineStatement(statement)
            ? this.onlineLockTimeout
            : this.lockTimeout,
        );
        await this.client.query(statement);
      }
      await this.verifyIndexes(built);
      await boundTo(this.lockTimeout);
      await this.record(file.name, checksum);
    } finally {
      await this.resetLockTimeout();
    }
  }

  async baseline(entries: BaselineEntry[]): Promise<void> {
    await this.inTransaction(async () => {
      for (const entry of entries) {
        await this.record(entry.file.name, entry.checksum);
      }
    });
  }

  async inspectSchema(): Promise<SchemaInventory> {
    // Application tables in public: not this store's bookkeeping table, and not tables an
    // extension owns (such as PostGIS's spatial_ref_sys), which the migrations never create
    const tables = await this.client.query<{
      table_name: string;
      column_name: string | null;
    }>(`
      SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute a
        ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relname <> 'schema_migrations'
        AND NOT EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
        )
      ORDER BY c.relname, a.attnum`);
    const indexes = await this.client.query<{ index_name: string }>(`
      SELECT c.relname AS index_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('i', 'I')
      ORDER BY c.relname`);

    const columns: SchemaInventory['columns'] = [];
    for (const row of tables.rows) {
      if (row.column_name !== null) {
        columns.push({ table: row.table_name, column: row.column_name });
      }
    }
    return {
      tables: [...new Set(tables.rows.map((row) => row.table_name))],
      columns,
      indexes: indexes.rows.map((row) => row.index_name),
    };
  }

  // IF NOT EXISTS would skip an INVALID index for ever: drop it, without blocking writers.
  // Only indexes of this file's own names, in the schema its tables live in.
  private async dropInvalidIndexes(
    names: string[],
    beforeDrop: () => Promise<void>,
  ): Promise<void> {
    if (names.length === 0) return;
    const { rows } = await this.client.query<{ name: string }>(
      `SELECT c.relname AS name FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
        WHERE c.relnamespace = 'public'::regnamespace AND NOT x.indisvalid
          AND c.relname = ANY ($1)`,
      [names],
    );
    if (rows.length > 0) await beforeDrop();
    for (const { name } of rows) {
      await this.client.query(
        `DROP INDEX CONCURRENTLY IF EXISTS public."${name.replace(/"/g, '""')}"`,
      );
    }
  }

  // A build that was cancelled, or that a failed run left INVALID, must not be recorded as
  // done: IF NOT EXISTS would skip it for ever on the next start
  private async verifyIndexes(names: string[]): Promise<void> {
    if (names.length === 0) return;
    const { rows } = await this.client.query<{ name: string }>(
      `SELECT c.relname AS name FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
        WHERE c.relnamespace = 'public'::regnamespace AND x.indisvalid
          AND c.relname = ANY ($1)`,
      [names],
    );
    const valid = new Set(rows.map((row) => row.name));
    const missing = [...new Set(names)].filter((name) => !valid.has(name));
    if (missing.length > 0) {
      throw new Error(
        `The index ${missing.join(', ')} is missing or INVALID after its statement ran; the file is not recorded`,
      );
    }
  }

  private async resetLockTimeout(): Promise<void> {
    try {
      await this.client.query('RESET lock_timeout');
    } catch (error) {
      // The statement's own error is the one to report, but a session left with a
      // migration timeout would be worth knowing about
      console.warn(
        `Could not reset lock_timeout after a non-transactional migration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async inTransaction(work: () => Promise<void>): Promise<void> {
    await this.client.query('BEGIN');
    try {
      await work();
      await this.client.query('COMMIT');
    } catch (err) {
      try {
        await this.client.query('ROLLBACK');
      } catch {
        // The connection is already broken; the original error is the one to report
      }
      throw err;
    }
  }

  private async record(filename: string, checksum: string): Promise<void> {
    await this.client.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
      [filename, checksum],
    );
  }
}

import { createHash } from 'crypto';
import {
  describeSchemaObject,
  expectedSchemaObjects,
  type ExpectedSchemaObject,
} from './schema-objects';

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface BaselineEntry {
  file: MigrationFile;
  checksum: string;
}

/** The application's tables, columns and indexes as the database has them. */
export interface SchemaInventory {
  /** Application tables: the store's own history table and extension tables are left out */
  tables: string[];
  columns: { table: string; column: string }[];
  indexes: string[];
}

// Persistence behind the runner. The Postgres store records applied files in
// schema_migrations; unit tests use an in-memory store.
export interface MigrationStore {
  ensureTable(): Promise<void>;
  appliedChecksums(): Promise<Map<string, string>>;
  applyInTransaction(file: MigrationFile, checksum: string): Promise<void>;
  /** Records every entry as applied, all or nothing, without running the SQL. */
  baseline(entries: BaselineEntry[]): Promise<void>;
  /**
   * The application schema. Tells an empty database from one migrated before migration
   * history existed, and shows whether a baseline's objects really exist.
   */
  inspectSchema(): Promise<SchemaInventory>;
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  baselined: string[];
}

export interface RunOptions {
  /**
   * Exact file name: records every file up to and including it as applied without running
   * them. Only for adopting a database migrated before schema_migrations existed; refused
   * unless every table, column and index those files create exists.
   */
  baselineThrough?: string;
}

export class MigrationChecksumError extends Error {
  constructor(readonly fileName: string) {
    super(
      `Migration ${fileName} was edited after it was applied; add a new migration instead of changing it`,
    );
    this.name = 'MigrationChecksumError';
  }
}

// Applied migrations are history: deleting or renaming one makes fresh installations
// diverge from existing ones without anyone noticing
export class MigrationMissingError extends Error {
  constructor(readonly fileNames: string[]) {
    super(
      `Applied migrations are missing from the migrations directory: ${fileNames.join(', ')}. Restore them; an applied migration is never deleted or renamed`,
    );
    this.name = 'MigrationMissingError';
  }
}

export class MigrationFailedError extends Error {
  constructor(
    readonly fileName: string,
    readonly reason: unknown,
  ) {
    super(
      `Migration ${fileName} failed: ${reason instanceof Error ? reason.message : String(reason)}`,
    );
    this.name = 'MigrationFailedError';
  }
}

export class MigrationBaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationBaselineError';
  }
}

const SHOWN_TABLES = 5;

// Without history the runner would start again at the first file, which fails on
// non-idempotent statements or re-runs data changes. Which files ran is not guessed.
export class MigrationBaselineRequiredError extends MigrationBaselineError {
  constructor(readonly tables: string[]) {
    const shown = tables.slice(0, SHOWN_TABLES).join(', ');
    const more =
      tables.length > SHOWN_TABLES
        ? ` and ${tables.length - SHOWN_TABLES} more`
        : '';
    super(
      `The database has no migration history but already contains application tables (${shown}${more}): it looks like a database migrated before migration history existed. Nothing was run. Set MIGRATION_BASELINE_THROUGH=<last applied file> (or --baseline-through=<last applied file>) to the exact name of the last migration file already applied to this database, start once, then remove the setting. See docs/migrations.md`,
    );
    this.name = 'MigrationBaselineRequiredError';
  }
}

// A baseline marks files applied without running them: a name past what really ran would
// silently skip that schema
export class MigrationBaselineSchemaError extends MigrationBaselineError {
  constructor(
    readonly baselineThrough: string,
    readonly missing: ExpectedSchemaObject[],
    databaseIsEmpty: boolean,
  ) {
    super(
      databaseIsEmpty
        ? `Cannot baseline through ${baselineThrough}: the database has no application tables, so no migration has been applied to it. Nothing was recorded; remove MIGRATION_BASELINE_THROUGH to migrate it from the first file`
        : baselineSchemaMessage(baselineThrough, missing),
    );
    this.name = 'MigrationBaselineSchemaError';
  }
}

function baselineSchemaMessage(
  through: string,
  missing: ExpectedSchemaObject[],
): string {
  const byFile = new Map<string, string[]>();
  for (const object of missing) {
    const described = byFile.get(object.file) ?? [];
    described.push(describeSchemaObject(object));
    byFile.set(object.file, described);
  }
  const groups = [...byFile]
    .map(([file, objects]) => `${file}: ${objects.join(', ')}`)
    .join('; ');
  const count = missing.length === 1 ? '1 object' : `${missing.length} objects`;
  return `Cannot baseline through ${through}: the database lacks ${count} that the migrations up to it create, so they were not all applied. Missing objects by file: ${groups}. Nothing was recorded. Set MIGRATION_BASELINE_THROUGH to the last migration file this database has completely; the first file with missing objects is ${missing[0].file}`;
}

/** SHA-256 of the SQL with line endings normalised, so Windows and Linux checkouts agree. */
export function checksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function runMigrations(
  store: MigrationStore,
  files: MigrationFile[],
  options: RunOptions = {},
): Promise<MigrationReport> {
  await store.ensureTable();
  const applied = await store.appliedChecksums();
  const ordered = files
    .map((file) => ({ file, checksum: checksum(file.sql) }))
    .sort((a, b) => byName(a.file.name, b.file.name));

  // Validate the recorded history before touching the schema
  for (const { file, checksum: sum } of ordered) {
    const recorded = applied.get(file.name);
    if (recorded !== undefined && recorded !== sum) {
      throw new MigrationChecksumError(file.name);
    }
  }
  const onDisk = new Set(ordered.map(({ file }) => file.name));
  const missing = [...applied.keys()]
    .filter((name) => !onDisk.has(name))
    .sort();
  if (missing.length > 0) {
    throw new MigrationMissingError(missing);
  }

  const report: MigrationReport = { applied: [], skipped: [], baselined: [] };

  // A baseline marks files applied without running them, so a mistake silently
  // skips schema: the name must be exact, the database must have no history yet and
  // everything those files create must exist
  const baselined = new Set<string>();
  if (options.baselineThrough !== undefined) {
    const through = options.baselineThrough;
    if (!ordered.some(({ file }) => file.name === through)) {
      throw new MigrationBaselineError(
        `Baseline ${JSON.stringify(through)} is not the exact name of a migration file`,
      );
    }
    if (applied.size > 0) {
      throw new MigrationBaselineError(
        `Cannot baseline through ${through}: the database already has migration history. Remove MIGRATION_BASELINE_THROUGH; a baseline is only for the first start`,
      );
    }
    const entries = ordered.filter(({ file }) => file.name <= through);
    await verifyBaselineSchema(
      store,
      through,
      entries.map(({ file }) => file),
    );
    try {
      await store.baseline(entries);
    } catch (err) {
      throw new MigrationBaselineError(
        `Recording the baseline through ${through} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    for (const { file } of entries) {
      baselined.add(file.name);
      report.baselined.push(file.name);
    }
  } else if (applied.size === 0) {
    const { tables } = await store.inspectSchema();
    if (tables.length > 0) {
      throw new MigrationBaselineRequiredError([...tables].sort(byName));
    }
  }

  for (const { file, checksum: sum } of ordered) {
    if (applied.has(file.name)) {
      report.skipped.push(file.name);
    } else if (!baselined.has(file.name)) {
      try {
        await store.applyInTransaction(file, sum);
      } catch (err) {
        throw new MigrationFailedError(file.name, err);
      }
      report.applied.push(file.name);
    }
  }
  return report;
}

async function verifyBaselineSchema(
  store: MigrationStore,
  through: string,
  files: MigrationFile[],
): Promise<void> {
  const expected = expectedSchemaObjects(files);
  const inventory = await store.inspectSchema();
  const tables = new Set(inventory.tables);
  const columns = new Set(
    inventory.columns.map(({ table, column }) =>
      JSON.stringify([table, column]),
    ),
  );
  const indexes = new Set(inventory.indexes);

  const missing = expected
    .filter((object) => {
      switch (object.kind) {
        case 'table':
          return !tables.has(object.name);
        case 'column':
          return !columns.has(JSON.stringify([object.table, object.name]));
        case 'index':
          return !indexes.has(object.name);
      }
    })
    .sort((a, b) => byName(a.file, b.file));
  if (missing.length > 0) {
    throw new MigrationBaselineSchemaError(
      through,
      missing,
      inventory.tables.length === 0,
    );
  }
}

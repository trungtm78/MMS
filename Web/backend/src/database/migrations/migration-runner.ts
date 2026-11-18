import { createHash } from 'crypto';
import {
  describeSchemaObject,
  expectedSchemaObjects,
  type ExpectedSchemaObject,
} from './schema-objects';
import {
  splitSqlStatements,
  tokenizeSql,
  type SqlToken,
} from './sql-statements';

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
  /**
   * Runs the statements one by one, each committing on its own (CREATE INDEX CONCURRENTLY
   * cannot run in a transaction), and records the file only after the last one succeeded.
   */
  applyWithoutTransaction(
    file: MigrationFile,
    checksum: string,
    statements: string[],
  ): Promise<void>;
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
  /** Files after `through`, left for a later run */
  pending: string[];
}

export interface RunOptions {
  /**
   * Exact file name: records every file up to and including it as applied without running
   * them. Only for adopting a database migrated before schema_migrations existed; refused
   * unless every table, column and index those files create exists.
   */
  baselineThrough?: string;
  /**
   * Exact file name: applies the pending files up to and including it and leaves the later
   * ones pending. Runs the online preparation (038) ahead of the drained window (039).
   */
  through?: string;
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

export class MigrationThroughError extends Error {
  constructor(readonly through: string) {
    super(
      `Through ${JSON.stringify(through)} is not the exact name of a migration file; nothing was run`,
    );
    this.name = 'MigrationThroughError';
  }
}

export class MigrationInvalidError extends Error {
  constructor(
    readonly fileName: string,
    readonly problems: string[],
  ) {
    super(
      `Migration ${fileName} cannot run outside a transaction: ${problems.join('; ')}. Nothing was run`,
    );
    this.name = 'MigrationInvalidError';
  }
}

/**
 * The header line that makes the runner execute a file statement by statement, outside a
 * transaction (CREATE INDEX CONCURRENTLY, online VALIDATE CONSTRAINT). See docs/migrations.md.
 */
export const NO_TRANSACTION_MARKER = '-- mms:migration no-transaction';

const MARKER_LINE = /^--\s*mms:migration\s+no-transaction\s*$/;

/** True when the leading comment lines of the file contain the marker line. */
export function isNonTransactional(sql: string): boolean {
  for (const line of sql.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (text === '') continue;
    if (!text.startsWith('--')) return false;
    if (MARKER_LINE.test(text)) return true;
  }
  return false;
}

const lowerAscii = (text: string): string =>
  text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

// Postgres keeps at most 63 bytes of a name and cuts it between characters
const NAME_BYTES = 63;
function clipName(name: string): string {
  const bytes = Buffer.from(name, 'utf8');
  if (bytes.length <= NAME_BYTES) return name;
  let end = NAME_BYTES;
  while (end > 0 && (bytes[end] & 0b1100_0000) === 0b1000_0000) end--;
  return bytes.subarray(0, end).toString('utf8');
}

/** The name Postgres stores for an identifier as written: folded, unquoted, clipped. */
const foldName = (token: SqlToken): string =>
  clipName(token.kind === 'identifier' ? token.text : lowerAscii(token.text));

const isName = (token: SqlToken | undefined): token is SqlToken =>
  token !== undefined &&
  (token.kind === 'identifier' ||
    (token.kind === 'word' && /^[A-Za-z_\u0080-￿]/.test(token.text)));

const isPunct = (token: SqlToken | undefined, text: string): boolean =>
  token?.kind === 'punct' && token.text === text;

/** True when the tokens from `at` on start with these keywords, in order. */
const hasWords = (
  tokens: SqlToken[],
  at: number,
  ...words: string[]
): boolean =>
  words.every(
    (word, k) =>
      tokens[at + k]?.kind === 'word' &&
      tokens[at + k].text.toLowerCase() === word,
  );

/** The index after a name or schema.name starting at `at`, or -1. */
function afterQualifiedName(tokens: SqlToken[], at: number): number {
  if (!isName(tokens[at])) return -1;
  if (!isPunct(tokens[at + 1], '.')) return at + 1;
  return isName(tokens[at + 2]) ? at + 3 : -1;
}

const hasTopLevelComma = (tokens: SqlToken[]): boolean => {
  let depth = 0;
  for (const token of tokens) {
    if (isPunct(token, '(')) depth++;
    else if (isPunct(token, ')')) depth = Math.max(0, depth - 1);
    else if (depth === 0 && isPunct(token, ',')) return true;
  }
  return false;
};

interface StatementKind {
  /** Why the statement could not run again, when it could not */
  problem?: string;
  /** Waits only for other transactions and never blocks a writer: bounded generously */
  online: boolean;
  /** The index a CREATE INDEX CONCURRENTLY builds */
  builds?: string;
}

const ALLOWED_HEADS =
  'CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS, DROP INDEX CONCURRENTLY IF EXISTS, ALTER TABLE ... ADD COLUMN IF NOT EXISTS, ALTER TABLE ... ALTER COLUMN ... SET DEFAULT, ALTER TABLE ... VALIDATE CONSTRAINT, ANALYZE and COMMENT ON';

const TRANSACTION_CONTROL = new Set([
  'begin',
  'commit',
  'rollback',
  'end',
  'abort',
  'savepoint',
  'release',
  'start',
]);

const refused = (problem: string): StatementKind => ({
  problem,
  online: false,
});

function alterTableKind(tokens: SqlToken[]): StatementKind {
  let at = 2;
  if (hasWords(tokens, at, 'if', 'exists')) at += 2;
  if (hasWords(tokens, at, 'only')) at++;
  at = afterQualifiedName(tokens, at);
  if (at !== -1 && isPunct(tokens[at], '*')) at++;
  if (at === -1) {
    return refused(
      'must be ALTER TABLE <table> followed by one allowed action',
    );
  }
  if (hasTopLevelComma(tokens)) {
    return refused(
      'must hold one ALTER TABLE action, so that it can run again',
    );
  }
  if (hasWords(tokens, at, 'validate', 'constraint')) {
    return isName(tokens[at + 2]) && at + 3 === tokens.length
      ? { online: true }
      : refused('must be ALTER TABLE ... VALIDATE CONSTRAINT <name>');
  }
  const afterColumn = hasWords(tokens, at + 1, 'column') ? at + 2 : at + 1;
  if (
    hasWords(tokens, at, 'add') &&
    hasWords(tokens, afterColumn, 'if', 'not', 'exists') &&
    isName(tokens[afterColumn + 3])
  ) {
    return { online: false };
  }
  if (
    hasWords(tokens, at, 'alter') &&
    isName(tokens[afterColumn]) &&
    hasWords(tokens, afterColumn + 1, 'set', 'default')
  ) {
    return { online: false };
  }
  return refused(
    'must be ALTER TABLE ... ADD COLUMN IF NOT EXISTS, ALTER COLUMN ... SET DEFAULT or VALIDATE CONSTRAINT',
  );
}

function classify(statement: string): StatementKind {
  const tokens = tokenizeSql(statement);
  const first = tokens[0]?.kind === 'word' ? tokens[0].text.toLowerCase() : '';
  const second = tokens[1]?.kind === 'word' ? tokens[1].text.toLowerCase() : '';

  if (
    TRANSACTION_CONTROL.has(first) ||
    (first === 'prepare' && second === 'transaction')
  ) {
    return refused('controls a transaction');
  }
  if (first === 'create' && (second === 'index' || second === 'unique')) {
    const at = second === 'unique' ? 2 : 1;
    const name = at + 5;
    if (
      hasWords(tokens, at, 'index', 'concurrently', 'if', 'not', 'exists') &&
      isName(tokens[name]) &&
      hasWords(tokens, name + 1, 'on')
    ) {
      return { online: true, builds: foldName(tokens[name]) };
    }
    return refused(
      'must be CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS <name> ON ...',
    );
  }
  if (first === 'drop' && second === 'index') {
    const end = hasWords(tokens, 2, 'concurrently', 'if', 'exists')
      ? afterQualifiedName(tokens, 5)
      : -1;
    return end === tokens.length
      ? { online: true }
      : refused('must be DROP INDEX CONCURRENTLY IF EXISTS <name>');
  }
  if (first === 'alter' && second === 'table') return alterTableKind(tokens);
  if (first === 'analyze' || first === 'analyse') return { online: false };
  if (first === 'comment' && second === 'on') return { online: false };
  return refused(
    `is not allowed here; only ${ALLOWED_HEADS} can run again safely`,
  );
}

/**
 * The statements of a non-transactional file. A failed run is repeated from the first
 * statement, so each one must be safe to run again. This is an allowlist, read after the
 * comments are removed: whatever it does not recognise is refused, before anything runs.
 */
export function nonTransactionalStatements(file: MigrationFile): string[] {
  let statements: string[];
  try {
    statements = splitSqlStatements(file.sql);
  } catch (error) {
    throw new MigrationInvalidError(file.name, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  const problems: string[] = [];
  statements.forEach((statement, k) => {
    const { problem } = classify(statement);
    if (problem === undefined) return;
    const [first] = tokenizeSql(statement);
    const text = statement
      .slice(first.start, first.start + 60)
      .replace(/\s+/g, ' ');
    problems.push(`statement ${k + 1} (${text}) ${problem}`);
  });
  if (statements.length === 0) problems.push('it has no statement');
  if (problems.length > 0) throw new MigrationInvalidError(file.name, problems);
  return statements;
}

/** The indexes the statements build CONCURRENTLY; an interrupted build leaves one INVALID. */
export function indexesBuiltBy(statements: string[]): string[] {
  return statements.flatMap((statement) => {
    const { builds } = classify(statement);
    return builds === undefined ? [] : [builds];
  });
}

/**
 * True for the statements that only wait for other transactions and never block a writer:
 * index builds and drops, and VALIDATE CONSTRAINT. The others take locks that do.
 */
export function isOnlineStatement(statement: string): boolean {
  return classify(statement).online;
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

  if (
    options.through !== undefined &&
    !ordered.some(({ file }) => file.name === options.through)
  ) {
    throw new MigrationThroughError(options.through);
  }

  const report: MigrationReport = {
    applied: [],
    skipped: [],
    baselined: [],
    pending: [],
  };

  // A baseline marks files applied without running them, so a mistake silently
  // skips schema: the name must be exact, the database must have no history yet and
  // everything those files create must exist
  const baselined = new Set<string>();
  const isPending = (name: string) =>
    !applied.has(name) &&
    !baselined.has(name) &&
    (options.through === undefined || name <= options.through);
  // Every file this run will apply is checked before the first one runs, and before a
  // baseline is recorded: "nothing was run" must hold for the whole run
  const statementsOf = new Map<string, string[]>();
  const checkPendingFiles = () => {
    for (const { file } of ordered) {
      if (isPending(file.name) && isNonTransactional(file.sql)) {
        statementsOf.set(file.name, nonTransactionalStatements(file));
      }
    }
  };
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
    for (const { file } of entries) baselined.add(file.name);
    checkPendingFiles();
    try {
      await store.baseline(entries);
    } catch (err) {
      throw new MigrationBaselineError(
        `Recording the baseline through ${through} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    for (const { file } of entries) report.baselined.push(file.name);
  } else {
    if (applied.size === 0) {
      const { tables } = await store.inspectSchema();
      if (tables.length > 0) {
        throw new MigrationBaselineRequiredError([...tables].sort(byName));
      }
    }
    checkPendingFiles();
  }

  for (const { file, checksum: sum } of ordered) {
    if (applied.has(file.name)) {
      report.skipped.push(file.name);
    } else if (baselined.has(file.name)) {
      continue;
    } else if (!isPending(file.name)) {
      report.pending.push(file.name);
    } else {
      const statements = statementsOf.get(file.name);
      try {
        if (statements) {
          await store.applyWithoutTransaction(file, sum, statements);
        } else {
          await store.applyInTransaction(file, sum);
        }
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

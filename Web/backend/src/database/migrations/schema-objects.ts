// Tables, columns and indexes a run of migration files leaves in the database, read from
// the SQL text. A baseline records files as applied without running them, so the runner
// first checks that these objects exist: naming a file past what was really applied is
// refused instead of silently skipping its schema.
//
// Only what the SQL determines is expected:
// - CREATE TABLE, ALTER TABLE ... ADD [COLUMN] and named CREATE [UNIQUE] INDEX at the top
//   level of a file create objects. The same statements inside DO blocks are conditional,
//   and function bodies may never run, so they are skipped.
// - Drops and renames are followed wherever they appear, DO blocks included, so an object
//   a later file removes is not demanded. Dropping a column forgets the indexes that use it.
// - A removal whose effects cannot be followed (DROP ... CASCADE of another kind of object,
//   dynamic SQL, a DO block in another language) forgets everything expected so far.
// Forgetting only means not checking: a correct baseline is never refused.
//
// Objects are assumed to live in the public schema, as every migration creates them.
import type { MigrationFile } from './migration-runner';

export type SchemaObjectKind = 'table' | 'column' | 'index';

export interface ExpectedSchemaObject {
  kind: SchemaObjectKind;
  /** The table itself, the column's table, or the table the index was declared on */
  table: string;
  /** The table, column or index name */
  name: string;
  /** The migration file that created it */
  file: string;
}

export function describeSchemaObject(object: ExpectedSchemaObject): string {
  return object.kind === 'column'
    ? `column ${object.table}.${object.name}`
    : `${object.kind} ${object.name}`;
}

/** The objects the files leave behind when applied in the given order. */
export function expectedSchemaObjects(
  files: MigrationFile[],
): ExpectedSchemaObject[] {
  const model = new SchemaModel();
  for (const file of files) {
    for (const statement of split(tokenize(file.sql), ';')) {
      applyStatement(statement, model, file.name, false);
    }
  }
  return model.objects();
}

// ── Lexer ──────────────────────────────────────────────────────────────────────

interface Token {
  /** word: unquoted identifier or keyword; quoted: "identifier"; string: any literal */
  kind: 'word' | 'quoted' | 'string' | 'other';
  /** Words folded to lower case, identifiers and literal contents unescaped */
  text: string;
  /** False when the exact value is unknown (U&"..." Unicode escapes) */
  exact: boolean;
}

/** PostgreSQL's NAMEDATALEN - 1: longer identifiers are truncated. */
const MAX_IDENTIFIER_BYTES = 63;
const WORD_START = /[A-Za-z_\u0080-\uffff]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-\uffff]/;
const DOLLAR_QUOTE =
  /\$(?:[A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/y;
const STRING_PREFIXES = ['b', 'e', 'n', 'x'];

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const push = (kind: Token['kind'], text: string, exact = true) =>
    tokens.push({ kind, text, exact });
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (sql.startsWith('/*', i)) {
      i = skipBlockComment(sql, i);
    } else if (ch === "'" || ch === '"') {
      const [text, end] = readQuoted(sql, i, false);
      if (ch === "'") push('string', text);
      else push('quoted', truncateIdentifier(text));
      i = end;
    } else if (ch === '$' && matchDollarQuote(sql, i)) {
      const tag = matchDollarQuote(sql, i)!;
      const close = sql.indexOf(tag, i + tag.length);
      const end = close === -1 ? sql.length : close;
      push('string', sql.slice(i + tag.length, end));
      i = close === -1 ? sql.length : close + tag.length;
    } else if (WORD_START.test(ch)) {
      let end = i + 1;
      while (end < sql.length && WORD_PART.test(sql[end])) end++;
      const word = foldCase(sql.slice(i, end));
      if (sql[end] === "'" && STRING_PREFIXES.includes(word)) {
        // E'...' honours backslash escapes; B'', N'' and X'' quote like plain strings
        const [text, after] = readQuoted(sql, end, word === 'e');
        push('string', text);
        i = after;
      } else if (
        word === 'u' &&
        sql[end] === '&' &&
        /['"]/.test(sql[end + 1])
      ) {
        const [text, after] = readQuoted(sql, end + 1, false);
        push(sql[end + 1] === "'" ? 'string' : 'quoted', text, false);
        i = after;
      } else {
        push('word', truncateIdentifier(word));
        i = end;
      }
    } else if (/[0-9]/.test(ch)) {
      let end = i + 1;
      while (end < sql.length && /[0-9A-Za-z_.]/.test(sql[end])) end++;
      push('other', sql.slice(i, end));
      i = end;
    } else {
      push('other', ch);
      i++;
    }
  }
  return tokens;
}

function matchDollarQuote(sql: string, at: number): string | undefined {
  DOLLAR_QUOTE.lastIndex = at;
  return DOLLAR_QUOTE.exec(sql)?.[0];
}

/** Block comments nest in PostgreSQL. Returns the index after the comment. */
function skipBlockComment(sql: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql.startsWith('/*', i)) {
      depth++;
      i += 2;
    } else if (sql.startsWith('*/', i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return sql.length;
}

/** Reads a literal or identifier quoted by the character at `start`; doubling escapes it. */
function readQuoted(
  sql: string,
  start: number,
  backslashEscapes: boolean,
): [string, number] {
  const quote = sql[start];
  let text = '';
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (backslashEscapes && ch === '\\') {
      text += sql[i + 1] ?? '';
      i += 2;
    } else if (ch === quote && sql[i + 1] === quote) {
      text += quote;
      i += 2;
    } else if (ch === quote) {
      return [text, i + 1];
    } else {
      text += ch;
      i++;
    }
  }
  return [text, sql.length];
}

/** PostgreSQL folds only ASCII letters of unquoted identifiers. */
function foldCase(word: string): string {
  return word.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function truncateIdentifier(name: string): string {
  const bytes = Buffer.from(name, 'utf8');
  if (bytes.length <= MAX_IDENTIFIER_BYTES) return name;
  let end = MAX_IDENTIFIER_BYTES;
  // Never cut a multi-byte character in half
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8');
}

/** Splits tokens at a separator outside parentheses. */
function split(tokens: Token[], separator: string): Token[][] {
  const parts: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === 'other') {
      if (token.text === '(') depth++;
      if (token.text === ')') depth = Math.max(0, depth - 1);
      if (token.text === separator && depth === 0) {
        if (current.length > 0) parts.push(current);
        current = [];
        continue;
      }
    }
    current.push(token);
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

// ── Statements ─────────────────────────────────────────────────────────────────

class Cursor {
  index = 0;

  constructor(private readonly tokens: Token[]) {}

  get done(): boolean {
    return this.index >= this.tokens.length;
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  isWord(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === 'word' && token.text === word;
  }

  isOther(text: string): boolean {
    const token = this.peek();
    return token?.kind === 'other' && token.text === text;
  }

  /** Consumes the words when they come next, in this order. */
  accept(...words: string[]): boolean {
    if (!words.every((word, offset) => this.isWord(word, offset))) return false;
    this.index += words.length;
    return true;
  }

  next(): Token | undefined {
    return this.tokens[this.index++];
  }

  rest(): Token[] {
    return this.tokens.slice(this.index);
  }
}

interface Name {
  name: string;
  inPublic: boolean;
}

const isIdentifierToken = (token: Token | undefined): token is Token =>
  token?.kind === 'word' || token?.kind === 'quoted';

/** An identifier's exact name, or undefined when the token is not one or is inexact. */
function identifier(token: Token | undefined): string | undefined {
  return isIdentifierToken(token) && token.exact ? token.text : undefined;
}

/** A possibly schema-qualified name, or undefined when it cannot be read exactly. */
function readName(c: Cursor): Name | undefined {
  if (!isIdentifierToken(c.peek())) return undefined;
  const parts = [identifier(c.next())];
  while (c.isOther('.') && isIdentifierToken(c.peek(1))) {
    c.next();
    parts.push(identifier(c.next()));
  }
  const name = parts[parts.length - 1];
  if (parts.some((part) => part === undefined) || name === undefined) {
    return undefined;
  }
  return {
    name,
    inPublic: parts.length === 1 || parts[parts.length - 2] === 'public',
  };
}

function readNames(c: Cursor): (Name | undefined)[] {
  const names = [readName(c)];
  while (c.isOther(',')) {
    c.next();
    names.push(readName(c));
  }
  return names;
}

const CONSTRAINT_STARTS = [
  'constraint',
  'primary',
  'unique',
  'check',
  'foreign',
  'exclude',
];

/**
 * Applies one statement. `conditional` marks statements inside a DO block: whether they run
 * is unknown, so they create nothing and their renames are not followed.
 */
function applyStatement(
  tokens: Token[],
  model: SchemaModel,
  file: string,
  conditional: boolean,
): void {
  const c = new Cursor(tokens);
  if (c.accept('create')) {
    if (!conditional) create(c, model, file);
  } else if (c.accept('alter', 'table')) {
    alterTable(c, model, file, conditional);
  } else if (c.accept('alter', 'index')) {
    alterIndex(c, model, conditional);
  } else if (c.accept('drop')) {
    drop(c, model);
  } else if (c.accept('do')) {
    doBlock(c, model, file);
  }
  // Other statements (INSERT, UPDATE, COMMENT, CREATE FUNCTION, ...) leave tables, columns
  // and indexes alone
}

function create(c: Cursor, model: SchemaModel, file: string): void {
  c.accept('or', 'replace');
  const start = c.index;
  if (!c.accept('global')) c.accept('local');
  const temporary = c.accept('temp') || c.accept('temporary');
  c.accept('unlogged');
  if (c.accept('table')) {
    c.accept('if', 'not', 'exists');
    const table = readName(c);
    if (!temporary && table?.inPublic) model.createTable(table.name, file);
    return;
  }

  c.index = start;
  c.accept('unique');
  if (!c.accept('index')) return;
  c.accept('concurrently');
  c.accept('if', 'not', 'exists');
  // Without a name PostgreSQL chooses one
  if (c.isWord('on')) return;
  const index = identifier(c.next());
  if (!c.accept('on')) return;
  c.accept('only');
  const table = readName(c);
  if (index !== undefined && table?.inPublic) {
    const uses = new Set(
      c
        .rest()
        .filter(isIdentifierToken)
        .map((t) => t.text),
    );
    model.createIndex(index, table.name, uses, file);
  }
}

function alterTable(
  c: Cursor,
  model: SchemaModel,
  file: string,
  conditional: boolean,
): void {
  // Without the table, nothing can be followed
  const ifExists = c.accept('if', 'exists');
  c.accept('only');
  const table = readName(c);
  if (table === undefined) return model.forgetAll();
  if (!table.inPublic) return;
  if (c.isOther('*')) c.next();
  // A column added to a table that may not exist may not exist either
  const certain = !conditional && !ifExists;

  for (const action of split(c.rest(), ',')) {
    const a = new Cursor(action);
    if (a.accept('add')) {
      if (CONSTRAINT_STARTS.some((word) => a.isWord(word))) {
        constraintUsingIndex(action, model);
        continue;
      }
      a.accept('column');
      a.accept('if', 'not', 'exists');
      const column = identifier(a.next());
      if (column !== undefined && certain) {
        model.addColumn(table.name, column, file);
      }
    } else if (a.accept('drop')) {
      if (a.isWord('constraint')) continue;
      a.accept('column');
      a.accept('if', 'exists');
      const column = identifier(a.next());
      if (column === undefined) model.forgetAll();
      else model.dropColumn(table.name, column);
    } else if (a.accept('rename')) {
      if (a.accept('to')) {
        model.renameTable(table.name, identifier(a.next()), certain);
      } else if (!a.isWord('constraint')) {
        a.accept('column');
        const from = identifier(a.next());
        const to = a.accept('to') ? identifier(a.next()) : undefined;
        if (from === undefined) model.forgetAll();
        else model.renameColumn(table.name, from, to, certain);
      }
    } else if (a.accept('set', 'schema')) {
      model.dropTable(table.name);
    }
  }
}

/** ADD CONSTRAINT ... USING INDEX turns an index into the constraint's, renaming it. */
function constraintUsingIndex(action: Token[], model: SchemaModel): void {
  const a = new Cursor(action);
  while (!a.done) {
    if (a.accept('using', 'index')) {
      if (a.isWord('tablespace')) return;
      const index = identifier(a.next());
      if (index === undefined) model.forgetAll();
      else model.dropIndex(index);
      return;
    }
    a.next();
  }
}

function alterIndex(c: Cursor, model: SchemaModel, conditional: boolean): void {
  const ifExists = c.accept('if', 'exists');
  const index = readName(c);
  if (index === undefined) return model.forgetAll();
  if (!index.inPublic) return;
  if (c.accept('rename', 'to')) {
    model.renameIndex(
      index.name,
      identifier(c.next()),
      !conditional && !ifExists,
    );
  } else if (c.accept('set', 'schema')) {
    model.dropIndex(index.name);
  }
}

function drop(c: Cursor, model: SchemaModel): void {
  const isTable = c.accept('table');
  const isIndex = !isTable && c.accept('index');
  if (isTable || isIndex) {
    c.accept('concurrently');
    c.accept('if', 'exists');
    for (const name of readNames(c)) {
      if (name === undefined) model.forgetAll();
      else if (name.inPublic && isTable) model.dropTable(name.name);
      else if (name.inPublic) model.dropIndex(name.name);
    }
    return;
  }
  // Dropping another kind of object with CASCADE, or everything a role owns, also drops
  // the columns and indexes that depend on it, which the SQL does not show
  const cascades = c
    .rest()
    .some((token) => token.kind === 'word' && token.text === 'cascade');
  if (cascades || c.isWord('owned')) model.forgetAll();
}

function doBlock(c: Cursor, model: SchemaModel, file: string): void {
  let language = 'plpgsql';
  let body: Token | undefined;
  while (!c.done) {
    if (c.accept('language')) {
      const name = c.next();
      language =
        name?.kind === 'string' ? foldCase(name.text) : (name?.text ?? '');
    } else {
      const token = c.next();
      if (token?.kind !== 'string' || body !== undefined) {
        return model.forgetAll();
      }
      body = token;
    }
  }
  if (body === undefined || !body.exact || language !== 'plpgsql') {
    return model.forgetAll();
  }

  const tokens = tokenize(body.text);
  // EXECUTE runs SQL built at run time; EXECUTE FUNCTION only names a trigger's function
  const dynamic = tokens.some(
    (token, k) =>
      token.kind === 'word' &&
      token.text === 'execute' &&
      !['function', 'procedure'].some(
        (word) => tokens[k + 1]?.kind === 'word' && tokens[k + 1].text === word,
      ),
  );
  if (dynamic) return model.forgetAll();

  for (const fragment of split(tokens, ';')) {
    // PL/pgSQL control flow (BEGIN, IF ... THEN, LOOP) precedes the SQL statement
    const start = firstStatementKeyword(fragment);
    if (start >= 0) applyStatement(fragment.slice(start), model, file, true);
  }
}

function firstStatementKeyword(tokens: Token[]): number {
  let depth = 0;
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k];
    if (token.kind === 'other' && token.text === '(') depth++;
    if (token.kind === 'other' && token.text === ')') depth--;
    if (
      depth === 0 &&
      token.kind === 'word' &&
      ['create', 'alter', 'drop'].includes(token.text)
    ) {
      return k;
    }
  }
  return -1;
}

// ── Model ──────────────────────────────────────────────────────────────────────

interface Entry {
  object: ExpectedSchemaObject;
  /** For an index: every identifier in its definition, so dropping a column can drop it */
  uses?: Set<string>;
}

function keyOf(object: ExpectedSchemaObject): string {
  return object.kind === 'column'
    ? JSON.stringify(['column', object.table, object.name])
    : JSON.stringify([object.kind, object.name]);
}

class SchemaModel {
  private readonly entries = new Map<string, Entry>();

  objects(): ExpectedSchemaObject[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.object }));
  }

  createTable(name: string, file: string): void {
    this.add({ object: { kind: 'table', table: name, name, file } });
  }

  addColumn(table: string, name: string, file: string): void {
    this.add({ object: { kind: 'column', table, name, file } });
  }

  createIndex(
    name: string,
    table: string,
    uses: Set<string>,
    file: string,
  ): void {
    this.add({ object: { kind: 'index', table, name, file }, uses });
  }

  /** Drops the table with its columns and indexes. */
  dropTable(name: string): void {
    this.forgetWhere((entry) => entry.object.table === name);
  }

  /** Drops the column and, as PostgreSQL does, every index that uses it. */
  dropColumn(table: string, column: string): void {
    this.entries.delete(
      keyOf({ kind: 'column', table, name: column, file: '' }),
    );
    this.forgetWhere(
      (entry) =>
        entry.object.kind === 'index' &&
        entry.object.table === table &&
        entry.uses!.has(column),
    );
  }

  dropIndex(name: string): void {
    this.entries.delete(keyOf({ kind: 'index', table: '', name, file: '' }));
  }

  renameTable(from: string, to: string | undefined, certain: boolean): void {
    for (const [key, entry] of [...this.entries]) {
      if (entry.object.table !== from) continue;
      this.entries.delete(key);
      if (!certain || to === undefined) continue;
      const object = {
        ...entry.object,
        table: to,
        name: entry.object.kind === 'table' ? to : entry.object.name,
      };
      this.entries.set(keyOf(object), { object, uses: entry.uses });
    }
  }

  renameColumn(
    table: string,
    from: string,
    to: string | undefined,
    certain: boolean,
  ): void {
    const key = keyOf({ kind: 'column', table, name: from, file: '' });
    const column = this.entries.get(key);
    this.entries.delete(key);
    if (column !== undefined && certain && to !== undefined) {
      const object = { ...column.object, name: to };
      this.entries.set(keyOf(object), { object });
    }
    for (const [indexKey, entry] of [...this.entries]) {
      if (
        entry.object.kind !== 'index' ||
        entry.object.table !== table ||
        !entry.uses!.has(from)
      ) {
        continue;
      }
      // The index keeps using the column under its new name, whether or not it ran
      if (to === undefined) this.entries.delete(indexKey);
      else entry.uses!.add(to);
    }
  }

  renameIndex(from: string, to: string | undefined, certain: boolean): void {
    const key = keyOf({ kind: 'index', table: '', name: from, file: '' });
    const index = this.entries.get(key);
    this.entries.delete(key);
    if (index !== undefined && certain && to !== undefined) {
      const object = { ...index.object, name: to };
      this.entries.set(keyOf(object), { object, uses: index.uses });
    }
  }

  forgetAll(): void {
    this.entries.clear();
  }

  /** Keeps the first creator: a later IF NOT EXISTS finds the object already there. */
  private add(entry: Entry): void {
    const key = keyOf(entry.object);
    if (!this.entries.has(key)) this.entries.set(key, entry);
  }

  private forgetWhere(predicate: (entry: Entry) => boolean): void {
    for (const [key, entry] of [...this.entries]) {
      if (predicate(entry)) this.entries.delete(key);
    }
  }
}

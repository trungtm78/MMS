// Splits a migration file into its top-level statements, for the files the runner executes
// one statement at a time (non-transactional migrations, see migration-runner.ts). A
// semicolon splits only outside string literals ('...', E'...'), quoted identifiers
// ("..."), dollar-quoted bodies ($$...$$, $tag$...$tag$) and comments (--, nested /* */).
// Each statement keeps the comments that lead it; empty and comment-only ones are dropped.

export class SqlSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlSplitError';
  }
}

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;
const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;
// A dollar-quote tag is an identifier: 63 bytes at most, plus the two dollar signs
const LONGEST_TAG = 65;

function skipBlockComment(sql: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql[i] === '/' && sql[i + 1] === '*') {
      depth++;
      i += 2;
    } else if (sql[i] === '*' && sql[i + 1] === '/') {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  throw new SqlSplitError(`Unterminated block comment at offset ${start}`);
}

function skipQuoted(
  sql: string,
  start: number,
  quote: "'" | '"',
  backslashEscapes: boolean,
): number {
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (backslashEscapes && ch === '\\') {
      i += 2;
    } else if (ch === quote) {
      if (sql[i + 1] !== quote) return i + 1;
      i += 2;
    } else {
      i++;
    }
  }
  throw new SqlSplitError(
    `Unterminated ${quote === "'" ? 'string' : 'quoted identifier'} at offset ${start}`,
  );
}

// E'...' accepts backslash escapes; the E must not end an identifier (WHERE'x' is not one)
function isEscapeString(sql: string, quoteAt: number): boolean {
  const prefix = sql[quoteAt - 1];
  return (
    (prefix === 'E' || prefix === 'e') &&
    (quoteAt < 2 || !IDENTIFIER_CHAR.test(sql[quoteAt - 2]))
  );
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let hasCode = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === '/' && next === '*') {
      i = skipBlockComment(sql, i);
    } else if (ch === "'") {
      hasCode = true;
      i = skipQuoted(sql, i, "'", isEscapeString(sql, i));
    } else if (ch === '"') {
      hasCode = true;
      i = skipQuoted(sql, i, '"', false);
    } else if (ch === '$' && (i === 0 || !IDENTIFIER_CHAR.test(sql[i - 1]))) {
      hasCode = true;
      const tag = DOLLAR_TAG.exec(sql.slice(i, i + LONGEST_TAG))?.[0];
      if (tag === undefined) {
        i++;
      } else {
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) {
          throw new SqlSplitError(
            `Unterminated dollar-quoted string ${tag} at offset ${i}`,
          );
        }
        i = end + tag.length;
      }
    } else if (ch === ';') {
      if (hasCode) statements.push(sql.slice(start, i).trim());
      start = i + 1;
      hasCode = false;
      i++;
    } else {
      if (!/\s/.test(ch)) hasCode = true;
      i++;
    }
  }
  if (hasCode) statements.push(sql.slice(start).trim());
  return statements;
}

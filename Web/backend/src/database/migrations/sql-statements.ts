// Splits a migration file into its top-level statements, for the files the runner executes
// one statement at a time (non-transactional migrations, see migration-runner.ts). A
// semicolon splits only outside string literals ('...', E'...'), quoted identifiers
// ("..."), dollar-quoted bodies ($$...$$, $tag$...$tag$) and comments (--, nested /* */).
// Each statement keeps the comments that lead it; empty and comment-only ones are dropped.
// Not supported, and refused with an error rather than split wrongly: a semicolon inside
// parentheses (CREATE RULE ... DO ALSO (a; b)) and BEGIN ATOMIC function bodies.
// tokenizeSql reads the same lexical structure for callers that must look at the keywords of
// a statement without being fooled by comments.

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

export type SqlTokenKind = 'word' | 'identifier' | 'string' | 'punct';

export interface SqlToken {
  kind: SqlTokenKind;
  /**
   * word: as written (keywords, names, numbers); identifier: the unquoted name of a "quoted
   * identifier"; string: the literal as written, quotes included; punct: one character
   */
  text: string;
  start: number;
  end: number;
}

// Bytes of a multi-byte character are identifier characters too, so a name such as
// ix_đơn is one word
const WORD_CHAR = /[A-Za-z0-9_$\u0080-￿]/;

/**
 * The tokens of the SQL with comments and whitespace removed, read with the same lexer the
 * splitter uses: a comment, a nested comment or a line break between two words changes
 * nothing, and a quoted word is never mistaken for a keyword.
 */
export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const push = (kind: SqlTokenKind, text: string, start: number, end: number) =>
    tokens.push({ kind, text, start, end });
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
      const end = skipQuoted(sql, i, "'", isEscapeString(sql, i));
      push('string', sql.slice(i, end), i, end);
      i = end;
    } else if (ch === '"') {
      const end = skipQuoted(sql, i, '"', false);
      push('identifier', sql.slice(i + 1, end - 1).replace(/""/g, '"'), i, end);
      i = end;
    } else if (ch === '$') {
      const tag = DOLLAR_TAG.exec(sql.slice(i, i + LONGEST_TAG))?.[0];
      if (tag === undefined) {
        push('punct', ch, i, i + 1);
        i++;
      } else {
        const close = sql.indexOf(tag, i + tag.length);
        if (close === -1) {
          throw new SqlSplitError(
            `Unterminated dollar-quoted string ${tag} at offset ${i}`,
          );
        }
        const end = close + tag.length;
        push('string', sql.slice(i, end), i, end);
        i = end;
      }
    } else if (WORD_CHAR.test(ch)) {
      let end = i + 1;
      while (end < sql.length && WORD_CHAR.test(sql[end])) end++;
      push('word', sql.slice(i, end), i, end);
      i = end;
    } else {
      if (!/\s/.test(ch)) push('punct', ch, i, i + 1);
      i++;
    }
  }
  return tokens;
}

const isWord = (token: SqlToken | undefined, keyword: string): boolean =>
  token?.kind === 'word' && token.text.toLowerCase() === keyword;

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let hasCode = false;
  let depth = 0;
  const tokens = tokenizeSql(sql);
  tokens.forEach((token, k) => {
    if (token.kind === 'punct' && token.text === ';') {
      if (depth > 0) {
        throw new SqlSplitError(
          `Semicolon inside parentheses at offset ${token.start}: a parenthesised statement list (CREATE RULE ... DO ALSO (a; b)) is not supported, and the parentheses must balance`,
        );
      }
      if (hasCode) statements.push(sql.slice(start, token.start).trim());
      start = token.end;
      hasCode = false;
      return;
    }
    hasCode = true;
    if (token.kind === 'punct' && token.text === '(') depth++;
    if (token.kind === 'punct' && token.text === ')' && depth > 0) depth--;
    if (isWord(token, 'begin') && isWord(tokens[k + 1], 'atomic')) {
      throw new SqlSplitError(
        `BEGIN ATOMIC at offset ${token.start}: a function body of statements is not supported; use a dollar-quoted body`,
      );
    }
  });
  if (hasCode) statements.push(sql.slice(start).trim());
  return statements;
}

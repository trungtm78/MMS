import * as fs from 'fs';
import * as path from 'path';
import { thrownBy } from '../../../test/support/thrown-by';
import {
  SqlSplitError,
  splitSqlStatements,
  tokenizeSql,
} from './sql-statements';

describe('splitSqlStatements', () => {
  it('splits on top-level semicolons and drops empty and comment-only statements', () => {
    expect(
      splitSqlStatements('SELECT 1;\n\n;  SELECT 2 ;\n-- trailing comment ;\n'),
    ).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps the comments that lead a statement with it', () => {
    expect(splitSqlStatements('-- header\n-- more\nSELECT 1;')).toEqual([
      '-- header\n-- more\nSELECT 1',
    ]);
  });

  it('does not split inside literals, identifiers, dollar quotes or comments', () => {
    const sql = [
      `SELECT 'a;b'`,
      `SELECT E'it\\'s; x'`,
      `SELECT "we;ird" FROM t`,
      `DO $$ BEGIN PERFORM 1; END $$`,
      `DO $body$ SELECT $$;$$ $body$`,
      `/* c ; /* nested ; */ */ SELECT 2`,
      `SELECT 'it''s; fine'`,
    ];
    expect(splitSqlStatements(sql.join(';\n') + ';')).toEqual(sql);
  });

  it('reads a $1 or an identifier containing $ as code, not as a dollar quote', () => {
    expect(splitSqlStatements('SELECT a$b$c FROM t; SELECT $1;')).toEqual([
      'SELECT a$b$c FROM t',
      'SELECT $1',
    ]);
  });

  it.each([
    ["SELECT 'open", 'string'],
    ['SELECT "open', 'quoted identifier'],
    ['DO $x$ BEGIN', 'dollar-quoted string $x$'],
    ['/* open /* nested */', 'block comment'],
  ])('refuses an unterminated construct: %s', (sql, what) => {
    expect(thrownBy(() => splitSqlStatements(sql))).toMatchObject({
      name: 'SqlSplitError',
      message: expect.stringContaining(`Unterminated ${what}`) as unknown,
    });
    expect(thrownBy(() => splitSqlStatements(sql))).toBeInstanceOf(
      SqlSplitError,
    );
  });

  // A semicolon inside parentheses would split CREATE RULE ... DO ALSO (a; b) in two: a
  // half statement must never run, so the file is refused instead
  it('refuses a semicolon inside parentheses, naming the construct', () => {
    const sql = 'CREATE RULE r AS ON INSERT TO t DO ALSO (SELECT 1; SELECT 2);';
    expect(thrownBy(() => splitSqlStatements(sql))).toMatchObject({
      name: 'SqlSplitError',
      message: expect.stringContaining(
        'Semicolon inside parentheses',
      ) as unknown,
    });
  });

  it('allows semicolons inside parenthesised literals and comments', () => {
    const sql = `SELECT (';'), ("a;b") /* (; */; SELECT (1);`;
    expect(splitSqlStatements(sql)).toEqual([
      `SELECT (';'), ("a;b") /* (; */`,
      'SELECT (1)',
    ]);
  });

  it('refuses BEGIN ATOMIC bodies, whatever separates the words', () => {
    const sql =
      'CREATE FUNCTION f() RETURNS int LANGUAGE sql BEGIN /* x */ ATOMIC SELECT 1; END;';
    expect(thrownBy(() => splitSqlStatements(sql))).toMatchObject({
      name: 'SqlSplitError',
      message: expect.stringContaining('BEGIN ATOMIC') as unknown,
    });
  });

  it('does not mistake a plain BEGIN or a quoted atomic for BEGIN ATOMIC', () => {
    expect(splitSqlStatements('BEGIN; SELECT "atomic"; COMMIT;')).toEqual([
      'BEGIN',
      'SELECT "atomic"',
      'COMMIT',
    ]);
  });

  it('splits every migration file of the repository', () => {
    const directory = path.join(__dirname, '..', '..', '..', 'migrations');
    const counts = Object.fromEntries(
      fs
        .readdirSync(directory)
        .filter((name) => name.endsWith('.sql'))
        .map((name) => [
          name,
          splitSqlStatements(
            fs.readFileSync(path.join(directory, name), 'utf8'),
          ).length,
        ]),
    );
    expect(counts['036_tenants.sql']).toBe(18);
    expect(counts['037_tenant_slice_rls.sql']).toBe(8);
    expect(counts['038_tenant_columns_online.sql']).toBe(280);
    Object.entries(counts).forEach(([name, count]) =>
      expect({ name, nonEmpty: count > 0 }).toEqual({ name, nonEmpty: true }),
    );
  });
});

describe('tokenizeSql', () => {
  it('drops comments and whitespace, and keeps what the statement says', () => {
    expect(
      tokenizeSql(
        `/* a /* b */ c */ CREATE -- x
 INDEX "Odd""Name" ON t (a, 'it''s;') $$;$$`,
      ).map(({ kind, text }) => [kind, text]),
    ).toEqual([
      ['word', 'CREATE'],
      ['word', 'INDEX'],
      ['identifier', 'Odd"Name'],
      ['word', 'ON'],
      ['word', 't'],
      ['punct', '('],
      ['word', 'a'],
      ['punct', ','],
      ['string', "'it''s;'"],
      ['punct', ')'],
      ['string', '$$;$$'],
    ]);
  });

  it('reads an identifier with non-ASCII letters as one word', () => {
    expect(tokenizeSql('ix_đơn ON').map((t) => t.text)).toEqual([
      'ix_đơn',
      'ON',
    ]);
  });

  it('refuses what the splitter refuses', () => {
    expect(thrownBy(() => tokenizeSql("SELECT 'open"))).toBeInstanceOf(
      SqlSplitError,
    );
  });
});

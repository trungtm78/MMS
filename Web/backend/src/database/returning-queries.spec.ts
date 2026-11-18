// Regression guard: TypeORM's postgres driver returns [rows, rowCount] from query() for
// UPDATE and DELETE, so reading `rows.length` / `rows[0]` from an UPDATE ... RETURNING
// silently breaks (404s never fire, responses become arrays). Such statements must go
// through queryRows() or run as a SELECT over a CTE.
import * as fs from 'fs';
import * as path from 'path';
import { directReturningQueryLines } from '../../test/support/returning-queries';

const SRC_ROOT = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [full]
      : [];
  });
}

describe('UPDATE/DELETE ... RETURNING queries', () => {
  it('never read RETURNING rows straight from query()', () => {
    const offenders = sourceFiles(SRC_ROOT).flatMap((file) =>
      directReturningQueryLines(fs.readFileSync(file, 'utf8')).map(
        (line) =>
          `${path.relative(SRC_ROOT, file).replace(/\\/g, '/')}:${line}`,
      ),
    );

    expect(offenders).toEqual([]);
  });
});

// The guard above only protects anything if its detector actually finds offenders
describe('directReturningQueryLines', () => {
  it('flags an UPDATE ... RETURNING read from query()', () => {
    const source =
      'const rows = await this.ds.query(\n  `UPDATE t SET a = 1 WHERE id = $1 RETURNING id`,\n  [id],\n);';

    expect(directReturningQueryLines(source)).toEqual([1]);
  });

  it('flags a typed DELETE ... RETURNING and reports its line', () => {
    const source =
      'a();\nb();\nawait mgr.query<{ id: string }[]>(`DELETE FROM t WHERE id = $1 RETURNING id`, [id]);';

    expect(directReturningQueryLines(source)).toEqual([3]);
  });

  it('accepts statements run through queryRows()', () => {
    const source =
      'await queryRows(this.ds, `UPDATE t SET a = 1 RETURNING id`, []);';

    expect(directReturningQueryLines(source)).toEqual([]);
  });

  it('accepts a SELECT over a CTE and UPDATEs without RETURNING', () => {
    const source = [
      'await this.ds.query(`WITH u AS (UPDATE t SET a = 1 RETURNING id) SELECT id FROM u`);',
      'await this.ds.query(`UPDATE t SET a = 1 WHERE id = $1`, [id]);',
    ].join('\n');

    expect(directReturningQueryLines(source)).toEqual([]);
  });
});

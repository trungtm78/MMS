// SQL the Postgres-backed store sends around each migration; the real database
// behaviour is covered by test/migrations.e2e-spec.ts.
import { PostgresMigrationStore } from './postgres-migration-store';

function fakeClient(
  failOn: (sql: string) => Error | undefined = () => undefined,
) {
  const statements: string[] = [];
  return {
    statements,
    query: jest.fn((sql: string) => {
      const statement = sql.trim();
      statements.push(statement);
      const error = failOn(statement);
      return error ? Promise.reject(error) : Promise.resolve({ rows: [] });
    }),
  };
}

const file = { name: '001_a.sql', sql: 'CREATE TABLE a (id int);' };
const last = (items: string[]) => items[items.length - 1];

describe('PostgresMigrationStore', () => {
  // Without a bound, an ALTER waiting behind a long query queues every later query on the table
  it('bounds how long a migration waits for table locks', async () => {
    const client = fakeClient();

    await new PostgresMigrationStore(client as never).applyInTransaction(
      file,
      'x'.repeat(64),
    );

    expect(client.statements[0]).toBe('BEGIN');
    expect(client.statements[1]).toBe("SET LOCAL lock_timeout = '10s'");
    expect(client.statements).toContain(file.sql);
    expect(last(client.statements)).toBe('COMMIT');
  });

  it('accepts a custom lock timeout', async () => {
    const client = fakeClient();

    await new PostgresMigrationStore(client as never, {
      lockTimeout: '2s',
    }).applyInTransaction(file, 'x'.repeat(64));

    expect(client.statements[1]).toBe("SET LOCAL lock_timeout = '2s'");
  });

  it('rejects a lock timeout that is not a plain duration', () => {
    expect(
      () =>
        new PostgresMigrationStore(fakeClient() as never, {
          lockTimeout: "1s'; DROP TABLE a; --",
        }),
    ).toThrow(/lock timeout/);
  });

  it('reports the migration error even when ROLLBACK also fails', async () => {
    const original = new Error('relation "b" does not exist');
    const client = fakeClient((sql) =>
      sql === file.sql
        ? original
        : sql === 'ROLLBACK'
          ? new Error('connection terminated')
          : undefined,
    );

    await expect(
      new PostgresMigrationStore(client as never).applyInTransaction(
        file,
        'x'.repeat(64),
      ),
    ).rejects.toBe(original);
  });

  it('records a baseline inside one transaction', async () => {
    const client = fakeClient();

    await new PostgresMigrationStore(client as never).baseline([
      { file, checksum: 'a'.repeat(64) },
      { file: { name: '002_b.sql', sql: '' }, checksum: 'b'.repeat(64) },
    ]);

    expect(client.statements[0]).toBe('BEGIN');
    expect(
      client.statements.filter((s) =>
        s.startsWith('INSERT INTO schema_migrations'),
      ),
    ).toHaveLength(2);
    expect(last(client.statements)).toBe('COMMIT');
  });

  // The runner compares this with what baselined files create, and refuses to run from
  // 001 on a database that already has application tables
  it('inspects application tables, columns and indexes through the catalogs', async () => {
    const statements: string[] = [];
    const client = {
      query: jest.fn((sql: string) => {
        statements.push(sql);
        if (sql.includes('pg_attribute')) {
          return Promise.resolve({
            rows: [
              { table_name: 'roles', column_name: null },
              { table_name: 'users', column_name: 'id' },
              { table_name: 'users', column_name: 'email' },
            ],
          });
        }
        return Promise.resolve({ rows: [{ index_name: 'idx_users_email' }] });
      }),
    };

    const inventory = await new PostgresMigrationStore(
      client as never,
    ).inspectSchema();

    expect(inventory).toEqual({
      tables: ['roles', 'users'],
      columns: [
        { table: 'users', column: 'id' },
        { table: 'users', column: 'email' },
      ],
      indexes: ['idx_users_email'],
    });
    const tablesQuery = statements.find((s) => s.includes('pg_attribute'));
    // Its own bookkeeping table and tables owned by extensions are not application schema
    expect(tablesQuery).toContain("<> 'schema_migrations'");
    expect(tablesQuery).toContain("deptype = 'e'");
  });

  it('rolls a failed baseline back', async () => {
    const client = fakeClient((sql) =>
      sql.startsWith('INSERT INTO schema_migrations')
        ? new Error('duplicate key value')
        : undefined,
    );

    await expect(
      new PostgresMigrationStore(client as never).baseline([
        { file, checksum: 'a'.repeat(64) },
      ]),
    ).rejects.toThrow('duplicate key value');
    expect(last(client.statements)).toBe('ROLLBACK');
  });
});

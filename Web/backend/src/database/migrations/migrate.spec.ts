// migrateWithClient: serialises migrators with a Postgres advisory lock, bounds how long
// a runner waits for it, and never lets cleanup errors hide what actually failed.
import type { ClientBase } from 'pg';
import { migrateWithClient, MigrationLockTimeoutError } from './migrate';
import { MigrationFailedError, type MigrationFile } from './migration-runner';

type Handler = (sql: string) => unknown;

function fakeClient(handler: Handler = () => undefined) {
  const statements: string[] = [];
  const query = jest.fn((sql: string) => {
    const statement = sql.trim();
    statements.push(statement);
    try {
      return Promise.resolve(handler(statement) ?? { rows: [] });
    } catch (err) {
      return Promise.reject(err as Error);
    }
  });
  return {
    client: { query } as unknown as Pick<ClientBase, 'query'>,
    query,
    statements,
  };
}

const files: MigrationFile[] = [
  { name: '001_a.sql', sql: 'CREATE TABLE a (id int);' },
];

const lockTimeoutError = () =>
  Object.assign(new Error('canceling statement due to lock timeout'), {
    code: '55P03',
  });

describe('migrateWithClient', () => {
  it('waits for the migration lock with a bounded timeout, then clears it', async () => {
    const { client, statements } = fakeClient();

    await migrateWithClient(client, files);

    expect(statements.slice(0, 3)).toEqual([
      "SET lock_timeout = '10min'",
      'SELECT pg_advisory_lock($1)',
      'RESET lock_timeout',
    ]);
    expect(statements[statements.length - 1]).toBe(
      'SELECT pg_advisory_unlock($1)',
    );
  });

  it('uses the configured lock wait and statement lock timeout', async () => {
    const { client, statements } = fakeClient();

    await migrateWithClient(client, files, {
      advisoryLockTimeout: '30s',
      lockTimeout: '2s',
    });

    expect(statements[0]).toBe("SET lock_timeout = '30s'");
    expect(statements).toContain("SET LOCAL lock_timeout = '2s'");
  });

  it('rejects an invalid lock wait before touching the database', async () => {
    const { client, query } = fakeClient();

    await expect(
      migrateWithClient(client, files, {
        advisoryLockTimeout: "1s'; DROP TABLE users; --",
      }),
    ).rejects.toThrow(/lock wait/);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports another running migration when the lock wait times out', async () => {
    const { client, statements } = fakeClient((sql) => {
      if (sql === 'SELECT pg_advisory_lock($1)') throw lockTimeoutError();
    });

    const run = migrateWithClient(client, files);

    await expect(run).rejects.toBeInstanceOf(MigrationLockTimeoutError);
    await expect(run).rejects.toThrow(/another migration/);
    expect(statements).not.toContain('SELECT pg_advisory_unlock($1)');
  });

  it('keeps the migration error when unlocking also fails', async () => {
    const { client } = fakeClient((sql) => {
      if (sql.startsWith('CREATE TABLE a')) throw new Error('syntax error');
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        throw new Error('connection terminated');
      }
    });

    const run = migrateWithClient(client, files);

    await expect(run).rejects.toBeInstanceOf(MigrationFailedError);
    await expect(run).rejects.toThrow(/001_a\.sql/);
  });

  // Ending the session releases a session-level advisory lock anyway
  it('returns the report when only unlocking fails', async () => {
    const { client } = fakeClient((sql) => {
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        throw new Error('connection terminated');
      }
    });

    const report = await migrateWithClient(client, files);

    expect(report.applied).toEqual(['001_a.sql']);
  });
});

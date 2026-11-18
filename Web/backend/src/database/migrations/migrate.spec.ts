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
      return Promise.resolve(
        handler(statement) ??
          (statement === TRY_LOCK ? lockRow(true) : { rows: [] }),
      );
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

const TRY_LOCK = 'SELECT pg_try_advisory_lock($1) AS locked';
const lockRow = (locked: boolean) => ({ rows: [{ locked }] });

describe('migrateWithClient', () => {
  it('takes the migration lock without ever blocking on it, then releases it', async () => {
    const { client, statements } = fakeClient();

    await migrateWithClient(client, files);

    expect(statements[0]).toBe(TRY_LOCK);
    // A blocking wait holds a snapshot, which an index build in the migrator that owns the
    // lock would wait for for ever: the two would deadlock
    expect(statements).not.toContain('SELECT pg_advisory_lock($1)');
    expect(statements[statements.length - 1]).toBe(
      'SELECT pg_advisory_unlock($1)',
    );
  });

  describe('while another migrator holds the lock', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('polls for it until it is free, at the configured interval', async () => {
      let attempts = 0;
      const { client, statements } = fakeClient((sql) =>
        sql === TRY_LOCK ? lockRow(++attempts >= 3) : undefined,
      );

      const run = migrateWithClient(client, files, {
        advisoryLockTimeout: '30s',
        advisoryLockPollMs: 100,
      });
      await jest.advanceTimersByTimeAsync(0);
      expect(statements.filter((s) => s === TRY_LOCK)).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(99);
      expect(statements.filter((s) => s === TRY_LOCK)).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(statements.filter((s) => s === TRY_LOCK)).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(100);

      await expect(run).resolves.toMatchObject({ applied: ['001_a.sql'] });
      expect(statements.filter((s) => s === TRY_LOCK)).toHaveLength(3);
    });

    it('reports another running migration when the lock wait times out', async () => {
      const { client, statements } = fakeClient((sql) =>
        sql === TRY_LOCK ? lockRow(false) : undefined,
      );

      const run = migrateWithClient(client, files, {
        advisoryLockTimeout: '1s',
        advisoryLockPollMs: 250,
      });
      const outcome = Promise.all([
        expect(run).rejects.toBeInstanceOf(MigrationLockTimeoutError),
        expect(run).rejects.toThrow(/another migration/),
      ]);
      await jest.advanceTimersByTimeAsync(5_000);
      await outcome;

      expect(statements).not.toContain('SELECT pg_advisory_unlock($1)');
      expect(statements.filter((s) => s === TRY_LOCK)).toHaveLength(5);
    });
  });

  it('uses the configured statement lock timeout', async () => {
    const { client, statements } = fakeClient();

    await migrateWithClient(client, files, { lockTimeout: '2s' });

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

  it('passes the online lock timeout to the store', async () => {
    const { client, statements } = fakeClient();
    const marked: MigrationFile[] = [
      {
        name: '002_online.sql',
        sql: '-- mms:migration no-transaction\nANALYZE a;\nALTER TABLE a VALIDATE CONSTRAINT c;',
      },
    ];

    await migrateWithClient(client, marked, {
      lockTimeout: '2s',
      onlineLockTimeout: '45min',
    });

    expect(statements).toContain("SET lock_timeout = '2s'");
    expect(statements).toContain("SET lock_timeout = '45min'");
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

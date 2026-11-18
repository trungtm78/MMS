// BR-AUTH-02: failed sign-ins are counted in Postgres, so every backend replica shares one
// count and a burst of concurrent guesses on one name cannot get past the limit
import { ForbiddenException, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_LOCK_MINUTES,
  LOGIN_PENDING_STALE_MINUTES,
  LoginAttemptsService,
} from './login-attempts.service';

const KEY = Buffer.alloc(32, 7);
const hashOf = (name: string, key: Buffer = KEY) =>
  createHmac('sha256', key).update(name).digest('hex');

interface CounterRow {
  failed_count: number;
  pending_count: number;
  locked: boolean;
  failures_expired: boolean;
  pending_stale: boolean;
}

type Call = [string, unknown[] | undefined];

function setup(row: Partial<CounterRow> = {}, key: Buffer = KEY) {
  const counter: CounterRow = {
    failed_count: 0,
    pending_count: 0,
    locked: false,
    failures_expired: false,
    pending_stale: false,
    ...row,
  };
  const manager = {
    query: jest.fn<Promise<unknown[]>, [string, unknown[]?]>((sql) =>
      Promise.resolve(/FOR UPDATE/.test(sql) ? [counter] : []),
    ),
  };
  const dataSource = {
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn((work: (mgr: typeof manager) => unknown) =>
      work(manager),
    ),
  };
  const service = new LoginAttemptsService(dataSource as never, key);
  return { service, manager, dataSource };
}

const calls = (mock: jest.Mock, pattern: RegExp) =>
  (mock.mock.calls as Call[]).filter(([sql]) => pattern.test(sql));

describe('LoginAttemptsService', () => {
  describe('begin', () => {
    it('keys the counter by a keyed hash of the name however it is typed, never the name itself', async () => {
      const { service, manager } = setup();

      await service.begin('  CapHuong ');

      const params = (manager.query.mock.calls as Call[]).flatMap(
        ([, p]) => p ?? [],
      );
      expect(params).toContain(hashOf('caphuong'));
      expect(
        params.some((p) => typeof p === 'string' && /caphuong/i.test(p)),
      ).toBe(false);
      expect(service.nameHash('CAPHUONG')).toBe(hashOf('caphuong'));

      // Another server key gives unrelated hashes
      const other = setup({}, Buffer.alloc(32, 8));
      expect(other.service.nameHash('caphuong')).not.toBe(hashOf('caphuong'));
    });

    it('takes a slot for the attempt under the counter row lock', async () => {
      const { service, manager, dataSource } = setup({ failed_count: 2 });

      await service.begin('caphuong');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const steps = (manager.query.mock.calls as Call[]).map(([sql]) =>
        /INSERT INTO login_attempts/.test(sql)
          ? 'insert'
          : /FOR UPDATE/.test(sql)
            ? 'lock'
            : /UPDATE login_attempts/.test(sql)
              ? 'update'
              : sql,
      );
      expect(steps).toEqual(['insert', 'lock', 'update']);
      const [[insertSql, insertParams]] = calls(
        manager.query,
        /INSERT INTO login_attempts/,
      );
      expect(insertSql).toMatch(/ON CONFLICT \(name_hash\) DO NOTHING/);
      expect(insertParams).toEqual([hashOf('caphuong')]);
      const [[, lockParams]] = calls(manager.query, /FOR UPDATE/);
      expect(lockParams).toEqual([
        hashOf('caphuong'),
        LOGIN_LOCK_MINUTES,
        LOGIN_PENDING_STALE_MINUTES,
      ]);
      const [[, updateParams]] = calls(manager.query, /UPDATE login_attempts/);
      expect(updateParams).toEqual([hashOf('caphuong'), 2, 1]);
    });

    it('refuses a locked name without counting the attempt', async () => {
      const { service, manager } = setup({ failed_count: 5, locked: true });

      await expect(service.begin('caphuong')).rejects.toThrow(
        new ForbiddenException('account_locked'),
      );
      expect(calls(manager.query, /UPDATE login_attempts/)).toHaveLength(0);
    });

    it('refuses once failures plus attempts still being checked reach the limit', async () => {
      const { service, manager } = setup({ failed_count: 3, pending_count: 2 });

      await expect(service.begin('caphuong')).rejects.toThrow(
        new ForbiddenException('account_locked'),
      );
      expect(calls(manager.query, /UPDATE login_attempts/)).toHaveLength(0);
    });

    it('lets the last attempt below the limit through', async () => {
      const { service, manager } = setup({ failed_count: 3, pending_count: 1 });

      await expect(service.begin('caphuong')).resolves.toBeDefined();
      const [[, params]] = calls(manager.query, /UPDATE login_attempts/);
      expect(params).toEqual([hashOf('caphuong'), 3, 2]);
    });

    it('starts counting again once the failures are older than the window or the lock ended', async () => {
      const { service, manager } = setup({
        failed_count: 5,
        failures_expired: true,
      });

      await service.begin('caphuong');

      const [[, params]] = calls(manager.query, /UPDATE login_attempts/);
      expect(params).toEqual([hashOf('caphuong'), 0, 1]);
    });

    it('forgets attempts that a stopped instance never settled', async () => {
      const { service, manager } = setup({
        failed_count: 1,
        pending_count: 4,
        pending_stale: true,
      });

      await service.begin('caphuong');

      const [[, params]] = calls(manager.query, /UPDATE login_attempts/);
      expect(params).toEqual([hashOf('caphuong'), 1, 1]);
    });
  });

  describe('settling an attempt', () => {
    it('counts a failure and locks at the limit in one atomic statement', async () => {
      const { service, dataSource } = setup();
      const attempt = await service.begin('CapHuong');

      await attempt.failed();

      const [[sql, params]] = calls(dataSource.query, /login_attempts/);
      expect(sql).toMatch(/ON CONFLICT \(name_hash\) DO UPDATE/);
      expect(sql).toMatch(/failed_count \+ 1 >= \$2/);
      expect(sql).toMatch(/pending_count - 1/);
      expect(params).toEqual([
        hashOf('caphuong'),
        LOGIN_FAILURE_LIMIT,
        LOGIN_LOCK_MINUTES,
      ]);
    });

    it('frees the slot without counting when the password was right', async () => {
      const { service, dataSource } = setup();
      const attempt = await service.begin('caphuong');

      await attempt.passed();

      const [[sql, params]] = calls(dataSource.query, /login_attempts/);
      expect(sql).toMatch(
        /SET pending_count = GREATEST\(pending_count - 1, 0\)/,
      );
      expect(sql).not.toMatch(/failed_count/);
      expect(params).toEqual([hashOf('caphuong')]);
    });

    it('settles each attempt once', async () => {
      const { service, dataSource } = setup();
      const attempt = await service.begin('caphuong');

      await attempt.failed();
      await attempt.passed();
      await attempt.release();

      expect(calls(dataSource.query, /login_attempts/)).toHaveLength(1);
    });

    it('frees the slot of an attempt an unexpected error left unsettled, without counting it', async () => {
      const { service, dataSource } = setup();
      const attempt = await service.begin('caphuong');

      await attempt.release();

      const settled = calls(dataSource.query, /login_attempts/);
      expect(settled).toHaveLength(1);
      expect(settled[0][0]).toMatch(/GREATEST\(pending_count - 1, 0\)/);
    });

    it('does not let a failed release replace the error being handled', async () => {
      const { service, dataSource } = setup();
      const attempt = await service.begin('caphuong');
      dataSource.query.mockRejectedValueOnce(new Error('connection lost'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(attempt.release()).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('connection lost'),
      );
      warn.mockRestore();
    });
  });

  it('clears failures and the lock once a sign-in completes, keeping attempts still being checked', async () => {
    const { service, dataSource } = setup();

    await service.clear(' CapHuong');

    const [[sql, params]] = calls(dataSource.query, /login_attempts/);
    expect(sql).toMatch(
      /SET failed_count = 0, last_failure_at = NULL, locked_until = NULL/,
    );
    expect(sql).not.toMatch(/pending_count/);
    expect(params).toEqual([hashOf('caphuong')]);
  });

  it('purges counters that no longer hold anyone back', async () => {
    const { service, dataSource } = setup();
    dataSource.query.mockResolvedValueOnce([
      [{ name_hash: 'a' }, { name_hash: 'b' }],
      2,
    ]);

    await expect(service.purgeExpired()).resolves.toBe(2);

    const [[sql, params]] = calls(
      dataSource.query,
      /DELETE FROM login_attempts/,
    );
    expect(sql).toMatch(/RETURNING/);
    expect(params).toEqual([LOGIN_LOCK_MINUTES, LOGIN_PENDING_STALE_MINUTES]);
  });

  describe('scheduled purge', () => {
    afterEach(() => jest.restoreAllMocks());

    it('logs how many counters it purged', async () => {
      const { service, dataSource } = setup();
      dataSource.query.mockResolvedValueOnce([[{ name_hash: 'a' }], 1]);
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.purgeOnSchedule();

      expect(log).toHaveBeenCalledWith('Purged 1 expired sign-in counters');
    });

    it('stays quiet when nothing expired', async () => {
      const { service, dataSource } = setup();
      dataSource.query.mockResolvedValueOnce([[], 0]);
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      await service.purgeOnSchedule();

      expect(log).not.toHaveBeenCalled();
    });

    it('reports a failed purge to the log instead of failing the scheduler', async () => {
      const { service, dataSource } = setup();
      dataSource.query.mockRejectedValueOnce(new Error('db down'));
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(service.purgeOnSchedule()).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        'Purging expired sign-in counters failed: db down',
        expect.stringContaining('db down'),
      );
    });
  });
});

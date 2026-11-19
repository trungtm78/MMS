import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  DEFAULT_TENANT_JOB_TIMEOUT_MS,
  readTenantJobTimeoutMs,
  TenantJobRunner,
} from './tenant-job-runner';
import { TenancyConfigError } from './tenancy-mode';
import { TenantContext } from './tenant-context';

const T1 = randomUUID();
const T2 = randomUUID();
const T3 = randomUUID();

const runnerFor = (ids: string[]) =>
  new TenantJobRunner({
    query: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
  } as unknown as DataSource);

describe('TenantJobRunner', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('runs the job once per tenant, each under that tenant scope', async () => {
    const seen: Array<[string, string | undefined]> = [];
    await runnerFor([T1, T2]).forEachTenant(async (tenantId) => {
      await new Promise((resolve) => setImmediate(resolve));
      seen.push([tenantId, TenantContext.current()?.tenantId]);
    });
    expect(seen).toEqual([
      [T1, T1],
      [T2, T2],
    ]);
  });

  it('keeps going when a tenant fails and reports it', async () => {
    const ran: string[] = [];
    const outcomes = await runnerFor([T1, T2, T3]).forEachTenant((tenantId) => {
      if (tenantId === T2) return Promise.reject(new Error('boom'));
      ran.push(tenantId);
      return Promise.resolve();
    });
    expect(ran).toEqual([T1, T3]);
    expect(outcomes).toEqual([
      { tenantId: T1, ok: true },
      { tenantId: T2, ok: false, error: 'boom' },
      { tenantId: T3, ok: true },
    ]);
  });

  it('logs the failing tenant with the stack of the error', async () => {
    const failure = new Error('boom');
    await runnerFor([T1, T2]).forEachTenant((tenantId) =>
      tenantId === T2 ? Promise.reject(failure) : Promise.resolve(),
    );
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      `Job failed for tenant ${T2}: boom`,
      failure.stack,
    );
  });

  it('reports a job that rejects with something other than an Error', async () => {
    const outcomes = await runnerFor([T1]).forEachTenant(() =>
      Promise.reject('plain failure' as unknown as Error),
    );
    expect(outcomes).toEqual([
      { tenantId: T1, ok: false, error: 'plain failure' },
    ]);
    expect(logError).toHaveBeenCalledWith(
      `Job failed for tenant ${T1}: plain failure`,
      undefined,
    );
  });

  it('enumerates tenants with no scope, through the narrow function', async () => {
    const query = jest.fn().mockImplementation(() => {
      expect(TenantContext.current()).toBeUndefined();
      return Promise.resolve([]);
    });
    await new TenantJobRunner({ query } as unknown as DataSource).forEachTenant(
      () => Promise.resolve(),
    );
    expect(query).toHaveBeenCalledWith(
      'SELECT id FROM maintenance_tenant_ids()',
    );
  });
});

describe('TenantJobRunner.run', () => {
  const previousMode = process.env.TENANCY_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
  });

  it('runs the job once, unscoped, in legacy mode, without listing tenants', async () => {
    delete process.env.TENANCY_MODE;
    const query = jest.fn();
    const runner = new TenantJobRunner({ query } as unknown as DataSource);
    const seen: (string | null | undefined)[] = [];

    const outcomes = await runner.run('job', (tenantId) => {
      seen.push(tenantId, TenantContext.current()?.tenantId);
      return Promise.resolve();
    });

    expect(seen).toEqual([null, undefined]);
    expect(query).not.toHaveBeenCalled();
    expect(outcomes).toEqual([{ tenantId: null, ok: true }]);
  });

  it('reports a legacy failure as the outcome of the one run', async () => {
    delete process.env.TENANCY_MODE;
    const runner = new TenantJobRunner({
      query: jest.fn(),
    } as unknown as DataSource);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      await expect(
        runner.run('job', () => Promise.reject(new Error('boom'))),
      ).resolves.toEqual([{ tenantId: null, ok: false, error: 'boom' }]);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('boom'),
        expect.anything(),
      );
    } finally {
      error.mockRestore();
    }
  });

  it('runs the job once per tenant, each under its scope, in enforced mode', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const query = jest.fn().mockResolvedValue([{ id: T1 }, { id: T2 }]);
    const runner = new TenantJobRunner({ query } as unknown as DataSource);
    const seen: string[] = [];

    const outcomes = await runner.run('job', (tenantId) => {
      seen.push(`${tenantId}:${TenantContext.current()?.tenantId}`);
      return Promise.resolve();
    });

    expect(seen).toEqual([`${T1}:${T1}`, `${T2}:${T2}`]);
    expect(outcomes).toEqual([
      { tenantId: T1, ok: true },
      { tenantId: T2, ok: true },
    ]);
  });
});

describe('TenantJobRunner.run, a tenant listing that fails', () => {
  const previousMode = process.env.TENANCY_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
  });

  it('resolves, logs under the job name and reports a failed outcome', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const failure = new Error('maintenance_tenant_ids() does not exist');
    const runner = new TenantJobRunner({
      query: jest.fn().mockRejectedValue(failure),
    } as unknown as DataSource);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      await expect(
        runner.run('Svc.job', () => Promise.resolve()),
      ).resolves.toEqual([
        { tenantId: null, ok: false, error: failure.message },
      ]);
      expect(error).toHaveBeenCalledWith(
        `Svc.job: could not list the tenants: ${failure.message}`,
        failure.stack,
      );
    } finally {
      error.mockRestore();
    }
  });
});

describe('readTenantJobTimeoutMs', () => {
  it('defaults to ten minutes when unset or empty', () => {
    expect(readTenantJobTimeoutMs({})).toBe(DEFAULT_TENANT_JOB_TIMEOUT_MS);
    expect(readTenantJobTimeoutMs({ TENANT_JOB_TIMEOUT_MS: ' ' })).toBe(
      600_000,
    );
  });

  it('reads a positive whole number of milliseconds', () => {
    expect(readTenantJobTimeoutMs({ TENANT_JOB_TIMEOUT_MS: '1500' })).toBe(
      1500,
    );
  });

  it.each(['0', '-5', '1.5', 'abc', '10s', '1e3'])('rejects %p', (value) => {
    expect(() =>
      readTenantJobTimeoutMs({ TENANT_JOB_TIMEOUT_MS: value }),
    ).toThrow(TenancyConfigError);
  });
});

describe('TenantJobRunner, a job that does not settle', () => {
  const previous = {
    mode: process.env.TENANCY_MODE,
    timeout: process.env.TENANT_JOB_TIMEOUT_MS,
  };
  let logError: jest.SpyInstance;
  let logWarn: jest.SpyInstance;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  const runnerFor = (ids: string[]) => {
    process.env.TENANT_JOB_TIMEOUT_MS = '1000';
    return new TenantJobRunner({
      query: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
    } as unknown as DataSource);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    logWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    jest.useRealTimers();
    logError.mockRestore();
    logWarn.mockRestore();
    for (const [key, value] of [
      ['TENANCY_MODE', previous.mode],
      ['TENANT_JOB_TIMEOUT_MS', previous.timeout],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // Lets pending promise callbacks and unhandled-rejection notices run
  const flush = () => jest.advanceTimersByTimeAsync(0).then(() => undefined);

  it('moves on to the next tenant and logs the one that timed out', async () => {
    const ran: string[] = [];
    const pending = runnerFor([T1, T2]).forEachTenant((tenantId) => {
      ran.push(tenantId);
      return tenantId === T1
        ? new Promise<void>(() => undefined)
        : Promise.resolve();
    });

    await jest.advanceTimersByTimeAsync(1000);
    const outcomes = await pending;

    expect(ran).toEqual([T1, T2]);
    expect(outcomes).toEqual([
      { tenantId: T1, ok: false, error: 'timed out after 1000 ms' },
      { tenantId: T2, ok: true },
    ]);
    expect(logError).toHaveBeenCalledWith(`Job timed out for tenant ${T1}`);
  });

  it('swallows the late rejection of an abandoned job and reports it under its own tenant', async () => {
    let rejectLate: (error: Error) => void = () => undefined;
    const pending = runnerFor([T1, T2]).forEachTenant((tenantId) =>
      tenantId === T1
        ? new Promise<void>((_, reject) => {
            rejectLate = reject;
          })
        : Promise.resolve(),
    );
    await jest.advanceTimersByTimeAsync(1000);
    await pending;

    rejectLate(new Error('late boom'));
    await flush();
    await flush();

    expect(unhandled).toEqual([]);
    expect(logWarn).toHaveBeenCalledWith(
      expect.stringContaining(`tenant ${T1} has since failed: late boom`),
    );
    expect(logWarn).not.toHaveBeenCalledWith(expect.stringContaining(T2));
  });

  it('does not touch a job that settles in time', async () => {
    const pending = runnerFor([T1, T2]).forEachTenant(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    await jest.advanceTimersByTimeAsync(900);
    await jest.advanceTimersByTimeAsync(900);

    await expect(pending).resolves.toEqual([
      { tenantId: T1, ok: true },
      { tenantId: T2, ok: true },
    ]);
    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('times out a hung job in legacy mode too', async () => {
    delete process.env.TENANCY_MODE;
    const pending = runnerFor([]).run(
      'Svc.job',
      () => new Promise<void>(() => undefined),
    );

    await jest.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual([
      { tenantId: null, ok: false, error: 'timed out after 1000 ms' },
    ]);
    expect(logError).toHaveBeenCalledWith(
      'Svc.job: Job timed out (legacy mode)',
    );
  });

  it('names the job in the timeout log of a tenant', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const pending = runnerFor([T1]).run(
      'Svc.job',
      () => new Promise<void>(() => undefined),
    );

    await jest.advanceTimersByTimeAsync(1000);
    await pending;

    expect(logError).toHaveBeenCalledWith(
      `Svc.job: Job timed out for tenant ${T1}`,
    );
  });
});

import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { TenantJobRunner } from './tenant-job-runner';
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

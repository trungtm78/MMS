import { randomUUID } from 'crypto';
import type { DataSource } from 'typeorm';
import { thrownBy } from '../../../test/support/thrown-by';
import { bindTenantToConnections } from './bind-tenant';
import { TenantContext } from './tenant-context';

const A = randomUUID();
const B = randomUUID();

type Call = { text: string; values?: unknown[] };

class FakeClient {
  calls: Call[] = [];
  failSetConfig = false;
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values });
    if (this.failSetConfig && text.includes('set_config')) {
      return Promise.reject(new Error('connection lost'));
    }
    return Promise.resolve({ rows: [] });
  }
  setConfigValues = () =>
    this.calls
      .filter((c) => c.text.includes('set_config'))
      .map((c) => (c.values as string[])[0]);
}

function fakeDataSource(client: FakeClient, released: unknown[]) {
  const driver = {
    isReplicated: false,
    obtainMasterConnection: () =>
      Promise.resolve([
        client,
        (error?: unknown) => released.push(error ?? 'ok'),
      ]),
  };
  return { driver, dataSource: { driver } as unknown as DataSource };
}

type Checkout = [FakeClient, (error?: unknown) => void];
const checkout = (ds: { driver: { obtainMasterConnection: () => unknown } }) =>
  ds.driver.obtainMasterConnection() as Promise<Checkout>;

// The function currently installed as `client.query`, compared by identity
const queryOf = (client: FakeClient): unknown => Reflect.get(client, 'query');

describe('bindTenantToConnections', () => {
  it('writes an empty tenant when there is no scope, so nothing is visible', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    await checkout({ driver });
    expect(client.setConfigValues()).toEqual(['']);
  });

  it('writes the tenant of the current scope at checkout', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    await TenantContext.runAs({ tenantId: A }, () => checkout({ driver }));
    expect(client.setConfigValues()).toEqual([A]);
    expect(client.calls[0].text).toContain("set_config('app.tenant_id'");
  });

  it('overwrites the tenant on every checkout of a reused connection', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    const [, releaseA] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    releaseA();
    await TenantContext.runAs({ tenantId: B }, () => checkout({ driver }));
    expect(client.setConfigValues()).toEqual([A, B]);
  });

  it('passes queries through under the scope the connection was taken in', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    await TenantContext.runAs({ tenantId: A }, async () => {
      const [pg] = await checkout({ driver });
      await pg.query('SELECT 1', []);
    });
    expect(client.calls.map((c) => c.text)).toContain('SELECT 1');
  });

  it('refuses a query under another scope than the one the connection was taken in', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    const [pg] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    // A transaction opened for A that code later reuses while running as B
    const error = thrownBy(() =>
      TenantContext.runAs({ tenantId: B }, () => pg.query('SELECT 1')),
    );
    expect(error).toMatchObject({ code: 'tenant_scope_mismatch' });
    expect(client.calls.map((c) => c.text)).not.toContain('SELECT 1');
  });

  it('refuses a query that lost its scope on a connection bound to a tenant', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    const [pg] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    expect(thrownBy(() => pg.query('SELECT 1'))).toMatchObject({
      code: 'tenant_scope_mismatch',
    });
    expect(client.calls.map((c) => c.text)).not.toContain('SELECT 1');
  });

  it('destroys the connection when the scope cannot be written', async () => {
    const client = new FakeClient();
    client.failSetConfig = true;
    const released: unknown[] = [];
    const { driver, dataSource } = fakeDataSource(client, released);
    bindTenantToConnections(dataSource);
    await expect(checkout({ driver })).rejects.toThrow('connection lost');
    expect(released).toHaveLength(1);
    expect(released[0]).toBeInstanceOf(Error);
  });

  it('hands back a connection that met no scope mismatch without an error', async () => {
    const client = new FakeClient();
    const released: unknown[] = [];
    const { driver, dataSource } = fakeDataSource(client, released);
    bindTenantToConnections(dataSource);
    const [pg, release] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    await TenantContext.runAs({ tenantId: A }, () => pg.query('SELECT 1'));
    release();
    expect(released).toEqual(['ok']);
  });

  // A transaction opened under one scope whose COMMIT or ROLLBACK runs under another is
  // refused, so it stays open; TypeORM swallows the failed rollback and releases without an
  // error. Going back to the pool idle in transaction would let the next tenant write inside
  // it and lose those writes at the next rollback.
  it('destroys, not recycles, a connection whose query was refused for its scope', async () => {
    const client = new FakeClient();
    const released: unknown[] = [];
    const { driver, dataSource } = fakeDataSource(client, released);
    bindTenantToConnections(dataSource);
    const [pg, release] = await checkout({ driver });
    // The request had no scope when it took the connection and adopted a tenant later
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: A });
      expect(thrownBy(() => pg.query('COMMIT'))).toMatchObject({
        code: 'tenant_scope_mismatch',
      });
    });
    release();
    expect(released).toHaveLength(1);
    expect(released[0]).toBeInstanceOf(Error);
    expect(released[0]).toMatchObject({ message: 'tenant_scope_mismatch' });
  });

  it('keeps a given release error when the connection is also poisoned', async () => {
    const client = new FakeClient();
    const released: unknown[] = [];
    const { driver, dataSource } = fakeDataSource(client, released);
    bindTenantToConnections(dataSource);
    const [pg, release] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    expect(thrownBy(() => pg.query('SELECT 1'))).toMatchObject({
      code: 'tenant_scope_mismatch',
    });
    const reason = new Error('the transaction failed');
    release(reason);
    expect(released).toEqual([reason]);
  });

  it('releases once: a stale second release neither reaches the pool nor wipes a new owner binding', async () => {
    const client = new FakeClient();
    const released: unknown[] = [];
    const { driver, dataSource } = fakeDataSource(client, released);
    bindTenantToConnections(dataSource);
    const [, firstRelease] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    firstRelease();
    // The connection now belongs to tenant B
    const [pg] = await TenantContext.runAs({ tenantId: B }, () =>
      checkout({ driver }),
    );

    firstRelease();

    expect(released).toEqual(['ok']);
    expect(
      thrownBy(() =>
        TenantContext.runAs({ tenantId: A }, () => pg.query('SELECT 4')),
      ),
    ).toMatchObject({ code: 'tenant_scope_mismatch' });
  });

  it('forgets the binding on release', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    const [pg, release] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    release();
    await expect(Promise.resolve(pg.query('SELECT 2'))).resolves.toBeDefined();
  });

  it('wraps a connection once however often it is checked out', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    let wrapped: unknown;
    for (const tenantId of [undefined, A, B]) {
      const useConnection = async () => {
        const [pg, release] = await checkout({ driver });
        // The first checkout instruments the client; later ones must reuse that wrapper
        wrapped ??= queryOf(pg);
        expect(queryOf(pg)).toBe(wrapped);
        await pg.query('SELECT 3');
        release();
      };
      await (tenantId
        ? TenantContext.runAs({ tenantId }, useConnection)
        : useConnection());
    }
    expect(client.calls.filter((c) => c.text === 'SELECT 3')).toHaveLength(3);
  });

  it('refuses replicated drivers, whose slave checkouts it cannot bind', () => {
    const client = new FakeClient();
    const { driver } = fakeDataSource(client, []);
    expect(() =>
      bindTenantToConnections({
        driver: { ...driver, isReplicated: true },
      } as unknown as DataSource),
    ).toThrow(/replication/);
  });
});

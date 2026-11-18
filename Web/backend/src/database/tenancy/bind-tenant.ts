import type { DataSource } from 'typeorm';
import type { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { TenantContext, TenantScopeError, scopeKey } from './tenant-context';

// Every query TypeORM runs (DataSource.query, repositories, transactions, query runners)
// goes through a pg client obtained from PostgresDriver.obtainMasterConnection. Hooking
// that one place binds the tenant of the caller to the Postgres session before the
// connection is used, and pins it to the client until it is released.
//
// pg returns a pooled client, so the tenant is written on EVERY checkout, including
// "no tenant" as an empty string: nothing is ever inherited from the previous user of the
// connection. The write happens outside any transaction (before BEGIN), so a rollback
// cannot undo it. Do not run this behind a transaction-pooling proxy such as PgBouncer in
// transaction mode: session state would not survive between statements.

type QueryFn = (...args: unknown[]) => unknown;

interface PgClient {
  query: QueryFn;
  [BOUND]?: string;
  [RAW]?: QueryFn;
}

type Release = (error?: unknown) => void;
type Checkout = [PgClient, Release];

const BOUND = Symbol('mms.tenant.boundScope');
const RAW = Symbol('mms.tenant.rawQuery');

function instrument(client: PgClient): QueryFn {
  const existing = client[RAW];
  if (existing) return existing;
  const raw = client.query.bind(client) as QueryFn;
  client[RAW] = raw;
  client.query = (...args: unknown[]) => {
    const bound = client[BOUND];
    if (bound !== undefined && bound !== scopeKey(TenantContext.current())) {
      throw new TenantScopeError(
        'tenant_scope_mismatch',
        'A query ran under another tenant scope than the connection it uses was taken in',
      );
    }
    return raw(...args);
  };
  return raw;
}

export function bindTenantToConnections(dataSource: DataSource): void {
  const driver = dataSource.driver as PostgresDriver;
  if (driver.isReplicated) {
    throw new Error(
      'Tenant binding does not support database replication: replica checkouts are not bound',
    );
  }
  const obtain = driver.obtainMasterConnection.bind(
    driver,
  ) as () => Promise<Checkout>;

  driver.obtainMasterConnection = (async () => {
    const scope = TenantContext.current();
    const [client, release] = await obtain();
    try {
      const raw = instrument(client);
      await raw(`SELECT set_config('app.tenant_id', $1, false)`, [
        scope?.tenantId ?? '',
      ]);
    } catch (error) {
      // A client in an unknown state must never go back to the pool
      release(error);
      throw error;
    }
    client[BOUND] = scopeKey(scope);
    const releaseBound: Release = (error) => {
      client[BOUND] = undefined;
      release(error);
    };
    return [client, releaseBound];
  }) as typeof driver.obtainMasterConnection;
}

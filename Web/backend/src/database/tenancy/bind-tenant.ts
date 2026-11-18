import type { DataSource } from 'typeorm';
import type { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { TenantContext, TenantScopeError, scopeKey } from './tenant-context';

// Every query TypeORM runs (DataSource.query, repositories, transactions, query runners)
// goes through a pg client obtained from PostgresDriver.obtainMasterConnection. Hooking
// that one place binds the tenant of the caller to the Postgres session before the
// connection is used, and pins it to the client until it is released.
//
// pg returns a pooled client, so the tenant is written on EVERY checkout, including
// "no tenant" as an empty string: nothing is inherited from the previous user of a
// connection checked out through this hook (a client reached any other way, such as a second
// pool, sees whatever the database default is). The write happens before BEGIN, so a
// rollback of the transaction that follows cannot undo it; that holds only while clients
// come back to the pool outside a transaction, which is why a client that met a scope
// mismatch is destroyed instead of returned (see POISONED). Do not run this behind a
// transaction-pooling proxy such as PgBouncer in transaction mode: session state would not
// survive between statements.

type QueryFn = (...args: unknown[]) => unknown;

interface PgClient {
  query: QueryFn;
  [BOUND]?: string;
  [RAW]?: QueryFn;
  [POISONED]?: true;
}

type Release = (error?: unknown) => void;
type Checkout = [PgClient, Release];

const BOUND = Symbol('mms.tenant.boundScope');
const RAW = Symbol('mms.tenant.rawQuery');
// Set when a query was refused for its scope. A transaction begun under one scope whose
// COMMIT or ROLLBACK then runs under another stays open (TypeORM swallows the failed
// rollback and releases without an error); handing that client back to the pool would let
// the next tenant write inside someone else's transaction and lose it at the next rollback.
const POISONED = Symbol('mms.tenant.poisoned');

function instrument(client: PgClient): QueryFn {
  const existing = client[RAW];
  if (existing) return existing;
  const raw = client.query.bind(client) as QueryFn;
  client[RAW] = raw;
  client.query = (...args: unknown[]) => {
    const bound = client[BOUND];
    if (bound !== undefined && bound !== scopeKey(TenantContext.current())) {
      client[POISONED] = true;
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
    // Once only: after the first release the client may belong to another tenant, and a
    // stale second release must neither reach the pool nor wipe that owner's binding
    let released = false;
    const releaseBound: Release = (error) => {
      if (released) return;
      released = true;
      client[BOUND] = undefined;
      // An error makes pg-pool destroy the client, which ends any transaction left open
      release(
        client[POISONED]
          ? (error ?? new Error('tenant_scope_mismatch'))
          : error,
      );
    };
    return [client, releaseBound];
  }) as typeof driver.obtainMasterConnection;
}

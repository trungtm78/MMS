# Multi-tenant M0 — Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, on a 9-table slice with two tenants, that Postgres RLS plus an AsyncLocalStorage tenant scope isolates tenant data across the HTTP guard chain, transactions, query runners, Socket.IO handlers, cron jobs, file storage and exports — before M1 spreads the same pattern over all ~70 tables.

**Architecture:** A `TenantContext` (AsyncLocalStorage) carries the tenant of the current request/socket event/job. A wrapper around TypeORM's `PostgresDriver.obtainMasterConnection` writes it into the Postgres session (`app.tenant_id`) on every connection checkout and pins that scope to the checked-out client, so a query issued under a different scope throws `tenant_scope_mismatch`. Tables get `tenant_id uuid NOT NULL DEFAULT app_tenant_id()` and a FORCE-d RLS policy; the app connects as the non-superuser `mms_app`. A `TENANCY_MODE` switch (`legacy` default, `enforced`) keeps today's single-tenant behaviour and every existing test unchanged until M1 flips it.

**Tech Stack:** NestJS 11, TypeORM 0.3.28 (pinned behaviour), pg 8.20, PostgreSQL 16, Socket.IO 4.8, jest 30 + ts-jest, supertest, socket.io-client, exceljs. Backend root: `C:\MMS\Web\backend` (all paths below are relative to it).

## Global Constraints

- English identifiers, comments and commit messages; Vietnamese only in user-facing strings. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- TDD: every behaviour gets a failing test first. No `eslint-disable`, `ts-ignore`, `any`, empty `catch`, fixed sleeps, skipped tests.
- Applied migrations 001–035 are never edited (checksum-locked). New files: `migrations/036_tenants.sql`, `migrations/037_tenant_slice_rls.sql`. (The spec's `036b/037/038` become `038+` in M1.)
- Fixed first-tenant UUID: `a1000000-0000-4000-8000-000000000001`, code `phu-dinh`.
- RLS predicate everywhere: `tenant_id = app_tenant_id()` in both `USING` and `WITH CHECK`; `app_tenant_id()` is `NULLIF(current_setting('app.tenant_id', true), '')::uuid`.
- Runtime DB role `mms_app` is `NOSUPERUSER NOBYPASSRLS`. `mms_platform` has no privilege on business tables.
- `TENANCY_MODE` is `legacy` unless set to `enforced`; any other value fails startup. In `legacy` mode nothing in this plan may change behaviour (all 12 existing e2e suites and the unit suite must stay green untouched, except the room-name constants listed in Task 8).
- e2e suites that use the `mms_app` / `mms_platform` roles must run with `--runInBand` (roles are cluster-global).
- Verify gate for every task: `npx tsc --noEmit`, `npx eslint <touched files>`, the task's tests, then the full `npx jest` before the final task.
- Environment for e2e: `MIGRATION_TEST_ADMIN_URL=postgres://mms:<password>@localhost:5440/postgres`, `TEST_REDIS_URL=redis://localhost:6379` (containers `mms-postgres-1`, `mms-redis-1`).

## NOT in M0 (deferred to M1 unless stated)

MFA / recovery / password-reset flows under `enforced` (challenge tokens do not carry `tid`; an MFA account cannot complete sign-in in `enforced` mode); per-tenant login-lockout keys (counters stay keyed by username); the other ~60 tables; composite FKs; online (`CONCURRENTLY`) index builds; role rename `system_admin → tenant_admin`; platform admin API, licensing, branding, mail (M2–M3); client apps (M1/M4).

## File Structure

| File | Responsibility |
|---|---|
| `src/database/tenancy/tenancy-mode.ts` (new) | Parse `TENANCY_MODE`; `isTenancyEnforced()` |
| `src/database/tenancy/tenant-context.ts` (new) | AsyncLocalStorage scope: `start`, `runAs`, `adopt`, `current`, `requireTenantId`, `scopeKey`, `TenantScopeMismatchError` |
| `src/database/tenancy/bind-tenant.ts` (new) | Wrap `obtainMasterConnection`: set `app.tenant_id`, pin scope to client, throw on mismatch |
| `src/database/tenancy/tenant-scope.middleware.ts` (new) | Start a scope store per HTTP request (after body parsing) |
| `src/database/tenancy/tenant-job-runner.ts` (new) | Run a job once per tenant under that tenant's scope |
| `src/database/tenancy/tenancy.module.ts` (new) | Global module exporting the job runner |
| `src/notifications/rooms.ts` (new) | Tenant-namespaced Socket.IO room names |
| `src/notifications/ws-tenant-scope.interceptor.ts` (new) | Run each socket event handler under the socket's tenant |
| `migrations/036_tenants.sql`, `037_tenant_slice_rls.sql` (new) | Tenants, roles, context function, slice RLS |
| `test/support/tenancy.ts` (new) | Enforced-mode e2e database, two-tenant seeding, helpers |
| `test/tenancy-rls.e2e-spec.ts`, `test/tenancy-binding.e2e-spec.ts`, `test/tenancy-slice.e2e-spec.ts` (new) | Database, hook and end-to-end proofs |
| `src/app.module.ts`, `src/database/typeorm.options.ts`, `src/database/seeder.service.ts` (modify) | Wire the hook, middleware, seeder scope |
| `src/auth/{auth.service,auth.controller}.ts`, `src/auth/dto/*`, `src/common/guards/jwt-auth.guard.ts` (modify) | Tenant code at login, `tid` claim, guard adopts scope |
| `src/notifications/notifications.gateway.ts`, `src/gps/{gps-rooms,gps.service}.ts`, `src/sos/sos.service.ts`, `src/scheduler/compliance-alerts.service.ts` (modify) | Tenant-aware sockets |
| `src/files/{files.service,upload.interceptor,content-checking-storage}.ts` (modify) | Per-tenant storage directory, tenant job for purge |
| `src/tasks/tasks.service.ts` (modify) | `ON CONFLICT (tenant_id, code)` |

---

### Task 1: Tenancy mode and tenant context

**Files:**
- Create: `src/database/tenancy/tenancy-mode.ts`, `src/database/tenancy/tenancy-mode.spec.ts`
- Create: `src/database/tenancy/tenant-context.ts`, `src/database/tenancy/tenant-context.spec.ts`

**Interfaces:**
- Produces: `tenancyMode(env?)`, `isTenancyEnforced(env?)`; `TenantScope { readonly tenantId: string }`; `TenantContext.{start, runAs, adopt, current, requireTenantId}`; `scopeKey(scope?)`; `TenantScopeError` with `code`.

- [ ] **Step 1: Write the failing tests**

`src/database/tenancy/tenancy-mode.spec.ts`:

```ts
import { isTenancyEnforced, tenancyMode } from './tenancy-mode';

describe('tenancyMode', () => {
  it('defaults to legacy', () => {
    expect(tenancyMode({})).toBe('legacy');
    expect(isTenancyEnforced({})).toBe(false);
  });

  it('reads enforced regardless of case and spaces', () => {
    expect(tenancyMode({ TENANCY_MODE: ' Enforced ' })).toBe('enforced');
    expect(isTenancyEnforced({ TENANCY_MODE: 'enforced' })).toBe(true);
  });

  it('refuses any other value so a typo cannot silently disable isolation', () => {
    expect(() => tenancyMode({ TENANCY_MODE: 'enforce' })).toThrow(
      /Invalid TENANCY_MODE "enforce"/,
    );
  });
});
```

`src/database/tenancy/tenant-context.spec.ts`:

```ts
import { randomUUID } from 'crypto';
import { TenantContext, TenantScopeError, scopeKey } from './tenant-context';

const A = randomUUID();
const B = randomUUID();

describe('TenantContext', () => {
  it('has no scope outside a store', () => {
    expect(TenantContext.current()).toBeUndefined();
    expect(scopeKey(undefined)).toBe('none');
  });

  it('runAs scopes everything reached from the callback, across awaits', async () => {
    const seen = await TenantContext.runAs({ tenantId: A }, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return TenantContext.current();
    });
    expect(seen).toEqual({ tenantId: A });
    expect(TenantContext.current()).toBeUndefined();
  });

  it('keeps interleaved scopes apart', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        TenantContext.runAs({ tenantId: i % 2 ? A : B }, async () => {
          await new Promise((resolve) => setImmediate(resolve));
          return TenantContext.requireTenantId();
        }),
      ),
    );
    results.forEach((id, i) => expect(id).toBe(i % 2 ? A : B));
  });

  it('adopt sets the scope of the store for code running after it', async () => {
    await TenantContext.start(async () => {
      expect(TenantContext.current()).toBeUndefined();
      TenantContext.adopt({ tenantId: A });
      await new Promise((resolve) => setImmediate(resolve));
      expect(TenantContext.requireTenantId()).toBe(A);
    });
  });

  it('adopt is idempotent for the same tenant and refuses another one', () => {
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: A });
      expect(() => TenantContext.adopt({ tenantId: A })).not.toThrow();
      expect(() => TenantContext.adopt({ tenantId: B })).toThrow(
        expect.objectContaining({ code: 'scope_already_set' }),
      );
    });
  });

  it('adopt needs a store', () => {
    expect(() => TenantContext.adopt({ tenantId: A })).toThrow(
      expect.objectContaining({ code: 'no_scope_store' }),
    );
  });

  it('refuses a tenant id that is not a UUID', () => {
    expect(() => TenantContext.runAs({ tenantId: "x'; --" }, () => 1)).toThrow(
      TenantScopeError,
    );
  });

  it('requireTenantId throws without a scope', () => {
    TenantContext.start(() => {
      expect(() => TenantContext.requireTenantId()).toThrow(
        expect.objectContaining({ code: 'no_tenant_scope' }),
      );
    });
  });

  it('scopeKey distinguishes tenants', () => {
    expect(scopeKey({ tenantId: A })).toBe(`tenant:${A}`);
    expect(scopeKey({ tenantId: A })).not.toBe(scopeKey({ tenantId: B }));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/database/tenancy`
Expected: FAIL, "Cannot find module './tenancy-mode'" and "'./tenant-context'".

- [ ] **Step 3: Implement**

`src/database/tenancy/tenancy-mode.ts`:

```ts
export type TenancyMode = 'legacy' | 'enforced';

/**
 * TENANCY_MODE: `legacy` keeps the single-tenant behaviour (no tenant scope is written to
 * the connection); `enforced` binds every connection to the tenant of the request. A typo
 * must not silently turn isolation off, so anything else fails.
 */
export function tenancyMode(
  env: NodeJS.ProcessEnv = process.env,
): TenancyMode {
  const raw = (env.TENANCY_MODE ?? 'legacy').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'enforced') return raw;
  throw new Error(
    `Invalid TENANCY_MODE ${JSON.stringify(env.TENANCY_MODE)}: use 'legacy' or 'enforced'`,
  );
}

export const isTenancyEnforced = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => tenancyMode(env) === 'enforced';
```

`src/database/tenancy/tenant-context.ts`:

```ts
import { AsyncLocalStorage } from 'async_hooks';
import { isUUID } from 'class-validator';

export interface TenantScope {
  readonly tenantId: string;
}

type ScopeErrorCode =
  | 'no_scope_store'
  | 'scope_already_set'
  | 'no_tenant_scope'
  | 'invalid_tenant_id'
  | 'tenant_scope_mismatch';

export class TenantScopeError extends Error {
  constructor(
    readonly code: ScopeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

interface Store {
  scope?: TenantScope;
}

const storage = new AsyncLocalStorage<Store>();

const assertScope = (scope: TenantScope): void => {
  if (!isUUID(scope.tenantId)) {
    throw new TenantScopeError(
      'invalid_tenant_id',
      'A tenant scope needs a UUID tenant id',
    );
  }
};

/** Comparable identity of a scope; `none` is the absence of one. */
export const scopeKey = (scope: TenantScope | undefined): string =>
  scope ? `tenant:${scope.tenantId}` : 'none';

export const TenantContext = {
  /** Starts a store with no scope yet (one per HTTP request); `adopt` fills it in. */
  start<T>(fn: () => T): T {
    return storage.run({}, fn);
  },

  /** Runs `fn` under `scope`: a socket event, a background job, a sign-in. */
  runAs<T>(scope: TenantScope, fn: () => T): T {
    assertScope(scope);
    return storage.run({ scope }, fn);
  },

  /**
   * Sets the scope of the current store, once. Everything that runs after it in the same
   * request (later guards, interceptors, handlers) sees it, because the store is shared.
   */
  adopt(scope: TenantScope): void {
    assertScope(scope);
    const store = storage.getStore();
    if (!store) {
      throw new TenantScopeError(
        'no_scope_store',
        'No tenant scope store: the request did not pass TenantScopeMiddleware',
      );
    }
    if (store.scope && store.scope.tenantId !== scope.tenantId) {
      throw new TenantScopeError(
        'scope_already_set',
        'The request already runs under another tenant',
      );
    }
    store.scope = scope;
  },

  current(): TenantScope | undefined {
    return storage.getStore()?.scope;
  },

  requireTenantId(): string {
    const scope = storage.getStore()?.scope;
    if (!scope) {
      throw new TenantScopeError('no_tenant_scope', 'No tenant scope');
    }
    return scope.tenantId;
  },
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/database/tenancy`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/database/tenancy
git commit -m "feat(tenancy): tenancy mode switch and AsyncLocalStorage tenant context

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Connection binding hook

**Files:**
- Create: `src/database/tenancy/bind-tenant.ts`, `src/database/tenancy/bind-tenant.spec.ts`

**Interfaces:**
- Consumes: `TenantContext.current`, `scopeKey`, `TenantScopeError` (Task 1).
- Produces: `bindTenantToConnections(dataSource: DataSource): void`.

- [ ] **Step 1: Write the failing test**

`src/database/tenancy/bind-tenant.spec.ts`:

```ts
import { randomUUID } from 'crypto';
import type { DataSource } from 'typeorm';
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
    await expect(
      TenantContext.runAs({ tenantId: B }, () => Promise.resolve(pg.query('SELECT 1'))),
    ).rejects.toMatchObject({ code: 'tenant_scope_mismatch' });
    expect(client.calls.map((c) => c.text)).not.toContain('SELECT 1');
  });

  it('refuses a query that lost its scope on a connection bound to a tenant', async () => {
    const client = new FakeClient();
    const { driver, dataSource } = fakeDataSource(client, []);
    bindTenantToConnections(dataSource);
    const [pg] = await TenantContext.runAs({ tenantId: A }, () =>
      checkout({ driver }),
    );
    expect(() => pg.query('SELECT 1')).toThrow(
      expect.objectContaining({ code: 'tenant_scope_mismatch' }),
    );
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
    for (let i = 0; i < 3; i++) {
      const [pg, release] = await checkout({ driver });
      await pg.query('SELECT 3');
      release();
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/database/tenancy/bind-tenant`
Expected: FAIL, "Cannot find module './bind-tenant'".

- [ ] **Step 3: Implement**

`src/database/tenancy/bind-tenant.ts`:

```ts
import type { DataSource } from 'typeorm';
import type { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import {
  TenantContext,
  TenantScopeError,
  scopeKey,
} from './tenant-context';

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/database/tenancy` then `npx tsc --noEmit`
Expected: PASS; tsc exit 0. If tsc rejects the `PostgresDriver` deep import path, use `import type { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver.js'`'s equivalent that compiles in this repo (check `node_modules/typeorm/driver/postgres/PostgresDriver.d.ts` exists) — the runtime import is type-only and erased.

- [ ] **Step 5: Commit**

```bash
git add src/database/tenancy
git commit -m "feat(tenancy): bind the tenant to every checked-out connection

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migrations 036 and 037, roles and RLS (database-level proof)

**Files:**
- Create: `migrations/036_tenants.sql`, `migrations/037_tenant_slice_rls.sql`
- Create: `test/support/tenancy.ts`
- Create: `test/tenancy-rls.e2e-spec.ts`
- (the enforced-suite environment module `test/support/enforced-env.ts` is created in Task 5)

**Interfaces:**
- Produces (SQL): table `tenants`; functions `app_tenant_id()`, `auth_tenant_by_code(text)`, `maintenance_tenant_ids()`; roles `mms_app`, `mms_platform`; `tenant_id` + RLS on `users, units, militia_profiles, tasks, task_assignments, files, notifications, notification_receipts, audit_logs`.
- Produces (test helpers): `createTenantDatabase(opts?)`, `TENANT_1`, `slice tables list`, `seedTenantData`.

- [ ] **Step 1: Write the test helper and the failing database test**

`test/support/tenancy.ts`:

```ts
import * as path from 'path';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { migrateDatabase } from '../../src/database/migrations/migrate';

export const TENANT_1 = 'a1000000-0000-4000-8000-000000000001';
export const SLICE_TABLES = [
  'users',
  'units',
  'militia_profiles',
  'tasks',
  'task_assignments',
  'files',
  'notifications',
  'notification_receipts',
  'audit_logs',
] as const;

export const APP_PASSWORD = 'mms_app_e2e';
export const PLATFORM_PASSWORD = 'mms_platform_e2e';

const adminUrl = (): string => {
  const url = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!url) {
    throw new Error(
      'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:mms_secret@localhost:5440/postgres)',
    );
  }
  return url;
};

const urlFor = (base: string, db: string, user?: string, password?: string) => {
  const url = new URL(base);
  url.pathname = `/${db}`;
  if (user) {
    url.username = user;
    url.password = password ?? '';
  }
  return url.toString();
};

export async function withClient<T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// ALTER ROLE races when two workers set the same cluster-wide role
async function alterRole(client: Client, role: string, password: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await client.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
    }
  }
}

export interface TenantDatabase {
  name: string;
  adminUrl: string;
  appUrl: string;
  platformUrl: string;
  admin<T>(fn: (client: Client) => Promise<T>): Promise<T>;
  /** Connected as mms_app with the tenant written to the session ('' = no tenant). */
  app<T>(tenantId: string, fn: (client: Client) => Promise<T>): Promise<T>;
  platform<T>(fn: (client: Client) => Promise<T>): Promise<T>;
  drop(): Promise<void>;
}

/**
 * A freshly migrated database. By default the legacy single-tenant default of migration
 * 037 is reset, which is how an enforced deployment runs; pass keepLegacyDefault to test it.
 */
export async function createTenantDatabase(
  options: { keepLegacyDefault?: boolean; name?: string } = {},
): Promise<TenantDatabase> {
  // A suite that boots AppModule passes the name app-env.ts already put in the environment
  const name =
    options.name ??
    `mms_tn_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const base = adminUrl();
  await withClient(base, (c) => c.query(`CREATE DATABASE ${name}`));
  const dbAdminUrl = urlFor(base, name);
  await migrateDatabase({
    connectionString: dbAdminUrl,
    directory: path.join(__dirname, '..', '..', 'migrations'),
  });
  await withClient(base, async (c) => {
    await alterRole(c, 'mms_app', APP_PASSWORD);
    await alterRole(c, 'mms_platform', PLATFORM_PASSWORD);
    if (!options.keepLegacyDefault) {
      await c.query(`ALTER DATABASE ${name} RESET app.tenant_id`);
    }
  });
  const appUrl = urlFor(base, name, 'mms_app', APP_PASSWORD);
  const platformUrl = urlFor(base, name, 'mms_platform', PLATFORM_PASSWORD);
  return {
    name,
    adminUrl: dbAdminUrl,
    appUrl,
    platformUrl,
    admin: (fn) => withClient(dbAdminUrl, fn),
    app: (tenantId, fn) =>
      withClient(appUrl, async (c) => {
        await c.query(`SELECT set_config('app.tenant_id', $1, false)`, [
          tenantId,
        ]);
        return fn(c);
      }),
    platform: (fn) => withClient(platformUrl, fn),
    drop: () =>
      withClient(base, (c) =>
        c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
      ).then(() => undefined),
  };
}

export interface SeededTenant {
  id: string;
  code: string;
  unitId: string;
  unitCode: string;
  adminId: string;
  adminUsername: string;
  memberId: string;
  taskId: string;
  fileId: string;
  notificationId: string;
}

export const ADMIN_PASSWORD = 'Tenant@12345';

/** Inserts a tenant and one row in every slice table. `canary` marks every text value. */
export async function seedTenant(
  db: TenantDatabase,
  code: string,
  canary: string,
): Promise<SeededTenant> {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 4);
  return db.admin(async (c) => {
    const id = code === 'phu-dinh' ? TENANT_1 : randomUUID();
    await c.query(
      `INSERT INTO tenants (id, code, name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, code, `Tenant ${canary}`],
    );
    const one = async <T>(sql: string, values: unknown[]): Promise<T> =>
      (await c.query<{ id: T }>(sql, values)).rows[0].id;

    const unitCode = `KV-${code}`.toUpperCase().slice(0, 40);
    const unitId = await one<string>(
      `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, $2, $3, 'area') RETURNING id`,
      [id, unitCode, `Unit ${canary}`],
    );
    const adminUsername = `admin-${code}`;
    const adminId = await one<string>(
      `INSERT INTO users (tenant_id, username, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [id, adminUsername, hash, `Admin ${canary}`],
    );
    await c.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.code = 'system_admin'`,
      [adminId],
    );
    const memberId = await one<string>(
      `INSERT INTO militia_profiles (tenant_id, militia_code, full_name, cccd, dob, unit_id, join_date)
       VALUES ($1, $2, $3, $4, '1998-04-04', $5, '2022-01-01') RETURNING id`,
      [
        id,
        `DQ-${code}`.toUpperCase(),
        `Member ${canary}`,
        String(Math.floor(Math.random() * 1e12)).padStart(12, '0'),
        unitId,
      ],
    );
    const taskId = await one<string>(
      `INSERT INTO tasks (tenant_id, code, title, type, created_by, unit_id)
       VALUES ($1, $2, $3, 'patrol', $4, $5) RETURNING id`,
      [id, `TASK-${code}`.toUpperCase(), `Task ${canary}`, adminId, unitId],
    );
    await c.query(
      `INSERT INTO task_assignments (tenant_id, task_id, assignee_id, assigned_by)
       VALUES ($1, $2, $3, $3)`,
      [id, taskId, adminId],
    );
    const fileId = await one<string>(
      `INSERT INTO files (tenant_id, storage_key, original_name, mime_type, size, uploaded_by)
       VALUES ($1, $2, $3, 'text/plain', 4, $4) RETURNING id`,
      [id, randomUUID(), `file-${canary}.txt`, adminId],
    );
    const notificationId = await one<string>(
      `INSERT INTO notifications (tenant_id, type, title, body, sender_id)
       VALUES ($1, 'system', $2, $3, $4) RETURNING id`,
      [id, `Notice ${canary}`, `Body ${canary}`, adminId],
    );
    await c.query(
      `INSERT INTO notification_receipts (tenant_id, notification_id, user_id)
       VALUES ($1, $2, $3)`,
      [id, notificationId, adminId],
    );
    await c.query(
      `INSERT INTO audit_logs (tenant_id, actor_id, action, entity_type)
       VALUES ($1, $2, $3, 'tasks')`,
      [id, adminId, `seed ${canary}`],
    );
    return {
      id,
      code,
      unitId,
      unitCode,
      adminId,
      adminUsername,
      memberId,
      taskId,
      fileId,
      notificationId,
    };
  });
}
```

`test/tenancy-rls.e2e-spec.ts`:

```ts
// Database-level proof of tenant isolation (M0): connected as the runtime role mms_app,
// with the tenant written to the session the way the application does.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand (the roles are cluster-wide).
import {
  SLICE_TABLES,
  TENANT_1,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

describe('tenant isolation in the database (e2e)', () => {
  let db: TenantDatabase;
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    db = await createTenantDatabase();
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('shows a connection with no tenant nothing, in every slice table', async () => {
    for (const table of SLICE_TABLES) {
      const count = await db.app('', async (c) => {
        const { rows } = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table}`,
        );
        return Number(rows[0].n);
      });
      expect({ table, count }).toEqual({ table, count: 0 });
    }
  });

  it('shows a tenant exactly its own rows, in every slice table', async () => {
    for (const table of SLICE_TABLES) {
      const [own, foreign] = await db.app(a.id, async (c) => {
        const mine = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table} WHERE tenant_id = $1`,
          [a.id],
        );
        const other = await c.query<{ n: string }>(
          `SELECT count(*) AS n FROM ${table} WHERE tenant_id = $1`,
          [b.id],
        );
        return [Number(mine.rows[0].n), Number(other.rows[0].n)];
      });
      expect({ table, own, foreign }).toEqual({ table, own: 1, foreign: 0 });
    }
  });

  it('refuses an insert without a tenant', async () => {
    await expect(
      db.app('', (c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('NO-TENANT', 'x', 'area')`,
        ),
      ),
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('refuses writing a row for another tenant, by insert or by update', async () => {
    await expect(
      db.app(a.id, (c) =>
        c.query(
          `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, 'X-B', 'x', 'area')`,
          [b.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.app(a.id, (c) =>
        c.query(`UPDATE units SET tenant_id = $1 WHERE id = $2`, [
          b.id,
          a.unitId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('cannot update or delete another tenant row', async () => {
    const [updated, deleted] = await db.app(a.id, async (c) => {
      const u = await c.query(
        `UPDATE users SET full_name = 'hijacked' WHERE id = $1`,
        [b.adminId],
      );
      const d = await c.query(`DELETE FROM tasks WHERE id = $1`, [b.taskId]);
      return [u.rowCount, d.rowCount];
    });
    expect([updated, deleted]).toEqual([0, 0]);
  });

  it('allows the same username, unit code and task code in two tenants but not twice in one', async () => {
    await db.admin(async (c) => {
      await c.query(
        `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, 'SHARED', 'x', 'area'), ($2, 'SHARED', 'x', 'area')`,
        [a.id, b.id],
      );
      await expect(
        c.query(
          `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, 'SHARED', 'y', 'area')`,
          [a.id],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('exposes the tenant list only through the narrow functions', async () => {
    const own = await db.app(a.id, async (c) =>
      (await c.query<{ id: string }>(`SELECT id FROM tenants`)).rows.map(
        (r) => r.id,
      ),
    );
    expect(own).toEqual([a.id]);
    const none = await db.app('', async (c) =>
      (await c.query(`SELECT id FROM tenants`)).rows,
    );
    expect(none).toEqual([]);

    const found = await db.app('', async (c) =>
      (
        await c.query<{ id: string; status: string }>(
          `SELECT id, status FROM auth_tenant_by_code($1)`,
          [' PHU-DINH '],
        )
      ).rows,
    );
    expect(found).toEqual([{ id: TENANT_1, status: 'active' }]);
    const unknown = await db.app('', async (c) =>
      (await c.query(`SELECT id FROM auth_tenant_by_code('nope')`)).rows,
    );
    expect(unknown).toEqual([]);

    const maintenance = await db.app('', async (c) =>
      (await c.query<{ id: string }>(`SELECT id FROM maintenance_tenant_ids()`))
        .rows,
    );
    expect(maintenance.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('gives the platform role no access to business tables', async () => {
    await db.platform(async (c) => {
      await expect(c.query(`SELECT 1 FROM users`)).rejects.toMatchObject({
        code: '42501',
      });
      const { rows } = await c.query(`SELECT id FROM tenants`);
      expect(rows).toHaveLength(2);
    });
  });

  it('keeps the migration history away from the runtime role', async () => {
    await expect(
      db.app(a.id, (c) => c.query(`SELECT 1 FROM schema_migrations`)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('runs the application roles without superuser or RLS bypass', async () => {
    const roles = await db.admin(async (c) =>
      (
        await c.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
          `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
           WHERE rolname IN ('mms_app', 'mms_platform') ORDER BY rolname`,
        )
      ).rows,
    );
    expect(roles).toEqual([
      { rolname: 'mms_app', rolsuper: false, rolbypassrls: false },
      { rolname: 'mms_platform', rolsuper: false, rolbypassrls: false },
    ]);
  });

  it('forces RLS on every slice table', async () => {
    const rows = await db.admin(async (c) =>
      (
        await c.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
           WHERE relname = ANY($1::text[]) AND relkind = 'r'`,
          [SLICE_TABLES],
        )
      ).rows,
    );
    expect(rows).toHaveLength(SLICE_TABLES.length);
    rows.forEach((r) =>
      expect(r).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true }),
    );
  });
});

describe('legacy single-tenant default (e2e)', () => {
  let db: TenantDatabase;

  beforeAll(async () => {
    db = await createTenantDatabase({ keepLegacyDefault: true });
  });
  afterAll(async () => {
    await db?.drop();
  });

  it('puts rows written without a tenant into the first tenant', async () => {
    // A superuser session (migrations, admin tools, the pre-M1 test suites) inherits the
    // database default and so keeps working unchanged
    const tenantId = await db.admin(async (c) => {
      await c.query(
        `INSERT INTO units (code, name, type) VALUES ('LEGACY', 'x', 'area')`,
      );
      return (
        await c.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM units WHERE code = 'LEGACY'`,
        )
      ).rows[0].tenant_id;
    });
    expect(tenantId).toBe(TENANT_1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-rls`
Expected: FAIL — `relation "tenants" does not exist` / role `mms_app` missing (migrations not written yet).

- [ ] **Step 3: Write the migrations**

`migrations/036_tenants.sql`:

```sql
-- Migration 036: tenants, tenant context function, database roles (multi-tenancy M0)
-- The first tenant owns every pre-existing row (see 037).

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('provisioning', 'pending_activation', 'active', 'suspended',
                          'read_only', 'offboarding', 'archived')),
    parent_tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_tenants_code CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
);
CREATE UNIQUE INDEX uq_tenants_code ON tenants (lower(code));

INSERT INTO tenants (id, code, name)
VALUES ('a1000000-0000-4000-8000-000000000001', 'phu-dinh', 'Phường Phú Định');

-- The tenant of the current database session; empty or unset means "no tenant"
CREATE FUNCTION app_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Roles are cluster-wide: tolerate them existing, and two migrators racing to create them
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['mms_app', 'mms_platform'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            BEGIN
                EXECUTE format(
                    'CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', r);
            EXCEPTION WHEN duplicate_object OR unique_violation THEN
                NULL;
            END;
        END IF;
    END LOOP;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO mms_app, mms_platform', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO mms_app, mms_platform;

-- The runtime role reads and writes the application tables, never the migration history
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mms_app;
REVOKE ALL ON schema_migrations FROM mms_app;
REVOKE INSERT, UPDATE, DELETE ON tenants FROM mms_app;

-- The platform role manages tenants and nothing else
GRANT SELECT, INSERT, UPDATE ON tenants TO mms_platform;

-- tenants is not FORCE-d: the SECURITY DEFINER functions below run as its owner and read
-- all rows, while the runtime role sees only its own tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_own_row ON tenants FOR SELECT TO mms_app
    USING (id = app_tenant_id());
CREATE POLICY tenants_platform ON tenants FOR ALL TO mms_platform
    USING (true) WITH CHECK (true);

-- Sign-in resolves the tenant code before any tenant is known
CREATE FUNCTION auth_tenant_by_code(p_code text)
    RETURNS TABLE (id uuid, status text)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT t.id, t.status::text FROM tenants t WHERE lower(t.code) = lower(btrim(p_code)) $$;

-- Background jobs enumerate the tenants to run for
CREATE FUNCTION maintenance_tenant_ids()
    RETURNS TABLE (id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT t.id FROM tenants t WHERE t.status <> 'archived' ORDER BY t.code $$;

REVOKE ALL ON FUNCTION auth_tenant_by_code(text), maintenance_tenant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_tenant_by_code(text), maintenance_tenant_ids() TO mms_app;
```

`migrations/037_tenant_slice_rls.sql`:

```sql
-- Migration 037: tenant_id and row-level security on the M0 slice.
-- Every existing row belongs to the first tenant. The column is added with that constant
-- (a metadata-only change) and then defaults to the tenant of the session.

DO $$
DECLARE
    t text;
    first_tenant constant uuid := 'a1000000-0000-4000-8000-000000000001';
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'units', 'militia_profiles', 'tasks', 'task_assignments',
                             'files', 'notifications', 'notification_receipts', 'audit_logs'] LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id)',
            t, first_tenant);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT app_tenant_id()', t);
        EXECUTE format('CREATE INDEX idx_%s_tenant ON %I (tenant_id)', t, t);
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL TO mms_app
                 USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
    END LOOP;
END $$;

-- Natural keys are unique per tenant
ALTER TABLE users
    DROP CONSTRAINT users_username_key,
    DROP CONSTRAINT users_email_key,
    ADD CONSTRAINT uq_users_tenant_username UNIQUE (tenant_id, username),
    ADD CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email);
ALTER TABLE units
    DROP CONSTRAINT units_code_key,
    ADD CONSTRAINT uq_units_tenant_code UNIQUE (tenant_id, code);
ALTER TABLE militia_profiles
    DROP CONSTRAINT militia_profiles_militia_code_key,
    DROP CONSTRAINT militia_profiles_cccd_key,
    ADD CONSTRAINT uq_militia_profiles_tenant_code UNIQUE (tenant_id, militia_code),
    ADD CONSTRAINT uq_militia_profiles_tenant_cccd UNIQUE (tenant_id, cccd);
DROP INDEX uidx_militia_cccd_lookup;
CREATE UNIQUE INDEX uidx_militia_cccd_lookup
    ON militia_profiles (tenant_id, cccd_lookup_hash) WHERE cccd_lookup_hash IS NOT NULL;
ALTER TABLE tasks
    DROP CONSTRAINT tasks_code_key,
    ADD CONSTRAINT uq_tasks_tenant_code UNIQUE (tenant_id, code);

-- Legacy single-tenant mode (TENANCY_MODE=legacy, the default until M1): sessions that
-- never write a tenant, such as migrations, admin tools and the application itself in
-- legacy mode, inherit the first tenant. M1 removes this with
--   ALTER DATABASE <db> RESET app.tenant_id
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET app.tenant_id = %L', current_database(),
                   'a1000000-0000-4000-8000-000000000001');
END $$;
```

- [ ] **Step 4: Run to verify the database proof passes**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-rls`
Expected: PASS (12 tests). If `ALTER DATABASE ... SET` fails inside the migration transaction on your Postgres, move that statement to the end of the runner's per-file transaction is not possible — instead keep it here and report the exact error; do not drop the statement.
Also run: `npx jest --config ./test/jest-e2e.json --runInBand test/migrations.e2e-spec.ts` — Expected: PASS (the schema checks still hold for 001–035 and 036/037 apply on a fresh database).

- [ ] **Step 5: Commit**

```bash
git add migrations/036_tenants.sql migrations/037_tenant_slice_rls.sql test/support/tenancy.ts test/tenancy-rls.e2e-spec.ts
git commit -m "feat(tenancy): tenants, roles and RLS on the nine-table slice

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the hook, request scope and seeder; prove it on a real pool

**Files:**
- Create: `src/database/tenancy/tenant-scope.middleware.ts`, `src/database/tenancy/tenant-scope.middleware.spec.ts`
- Create: `src/database/tenancy/tenant-job-runner.ts`, `src/database/tenancy/tenant-job-runner.spec.ts`, `src/database/tenancy/tenancy.module.ts`
- Modify: `src/app.module.ts`, `src/database/typeorm.options.ts`, `src/database/seeder.service.ts`, `src/database/seeder.service.spec.ts`
- Create: `src/database/tenancy/boot-guards.ts`, `src/database/tenancy/boot-guards.spec.ts`
- Create: `test/tenancy-binding.e2e-spec.ts`

**Interfaces:**
- Produces (also): `assertNoLegacyTenantDefault(dataSource: Pick<DataSource, 'query'>): Promise<void>` — throws `Error('legacy_tenant_default_present: …')` when the database or a role carries an `app.tenant_id` default.
- Consumes: `bindTenantToConnections`, `TenantContext`, `isTenancyEnforced` (Tasks 1–2); SQL `maintenance_tenant_ids()`, `auth_tenant_by_code()` (Task 3).
- Produces: `TenantScopeMiddleware`, `TenantJobRunner.forEachTenant(job: (tenantId: string) => Promise<void>): Promise<TenantJobOutcome[]>`, `TenancyModule` (global).

- [ ] **Step 1: Write the failing tests**

`src/database/tenancy/tenant-scope.middleware.spec.ts`:

```ts
import { TenantScopeMiddleware } from './tenant-scope.middleware';
import { TenantContext } from './tenant-context';

describe('TenantScopeMiddleware', () => {
  it('starts a store so a later guard can adopt a tenant', async () => {
    const middleware = new TenantScopeMiddleware();
    await new Promise<void>((resolve, reject) =>
      middleware.use({} as never, {} as never, () => {
        try {
          expect(TenantContext.current()).toBeUndefined();
          TenantContext.adopt({ tenantId: '11111111-1111-4111-8111-111111111111' });
          resolve();
        } catch (error) {
          reject(error as Error);
        }
      }),
    );
  });

  it('gives each request its own store', async () => {
    const middleware = new TenantScopeMiddleware();
    const adopt = (tenantId: string) =>
      new Promise<void>((resolve, reject) =>
        middleware.use({} as never, {} as never, () => {
          try {
            TenantContext.adopt({ tenantId });
            resolve();
          } catch (error) {
            reject(error as Error);
          }
        }),
      );
    await adopt('11111111-1111-4111-8111-111111111111');
    await expect(adopt('22222222-2222-4222-8222-222222222222')).resolves.toBeUndefined();
  });
});
```

`src/database/tenancy/tenant-job-runner.spec.ts`:

```ts
import { randomUUID } from 'crypto';
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

  it('enumerates tenants with no scope, through the narrow function', async () => {
    const query = jest.fn().mockImplementation(() => {
      expect(TenantContext.current()).toBeUndefined();
      return Promise.resolve([]);
    });
    await new TenantJobRunner({ query } as unknown as DataSource).forEachTenant(
      () => Promise.resolve(),
    );
    expect(query).toHaveBeenCalledWith('SELECT id FROM maintenance_tenant_ids()');
  });
});
```

`test/tenancy-binding.e2e-spec.ts` (real pool, real Postgres, pool of 2 so connections are reused across tenants):

```ts
// The connection hook on a real pool: connections are reused between tenants and
// the tenant a query sees is always the tenant of the code that issued it.
import { DataSource } from 'typeorm';
import { bindTenantToConnections } from '../src/database/tenancy/bind-tenant';
import { TenantContext } from '../src/database/tenancy/tenant-context';
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

describe('tenant binding on a real pool (e2e)', () => {
  let db: TenantDatabase;
  let ds: DataSource;
  let a: SeededTenant;
  let b: SeededTenant;

  beforeAll(async () => {
    db = await createTenantDatabase();
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    ds = new DataSource({
      type: 'postgres',
      url: db.appUrl,
      synchronize: false,
      installExtensions: false,
      extra: { min: 1, max: 2 },
    });
    bindTenantToConnections(ds);
    await ds.initialize();
  });

  afterAll(async () => {
    await ds?.destroy();
    await db?.drop();
  });

  const titles = (): Promise<string[]> =>
    ds
      .query<{ title: string }[]>(`SELECT title FROM tasks ORDER BY title`)
      .then((rows) => rows.map((r) => r.title));

  it('shows nothing without a scope', async () => {
    await expect(titles()).resolves.toEqual([]);
  });

  it('keeps 200 interleaved calls apart on a two-connection pool', async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        TenantContext.runAs({ tenantId: i % 2 ? a.id : b.id }, async () => ({
          wanted: i % 2 ? 'Task CANARY-A' : 'Task CANARY-B',
          got: await titles(),
        })),
      ),
    );
    results.forEach(({ wanted, got }) => expect(got).toEqual([wanted]));
  });

  it('applies the scope to transactions and to repositories alike', async () => {
    const viaTransaction = await TenantContext.runAs({ tenantId: a.id }, () =>
      ds.transaction(async (mgr) => {
        const first = await mgr.query<{ title: string }[]>(`SELECT title FROM tasks`);
        await new Promise((resolve) => setImmediate(resolve));
        const second = await mgr.query<{ title: string }[]>(`SELECT title FROM tasks`);
        return [first, second].map((rows) => rows.map((r) => r.title));
      }),
    );
    expect(viaTransaction).toEqual([['Task CANARY-A'], ['Task CANARY-A']]);
  });

  it('refuses a transaction that changes tenant half way', async () => {
    await expect(
      TenantContext.runAs({ tenantId: a.id }, () =>
        ds.transaction(async (mgr) => {
          await mgr.query(`SELECT 1`);
          // The inner scope does not move the transaction's connection to tenant B
          await TenantContext.runAs({ tenantId: b.id }, () =>
            mgr.query(`SELECT title FROM tasks`),
          );
        }),
      ),
    ).rejects.toMatchObject({ code: 'tenant_scope_mismatch' });
  });

  it('refuses a manually created query runner used under another scope', async () => {
    const runner = ds.createQueryRunner();
    try {
      await TenantContext.runAs({ tenantId: a.id }, () => runner.query(`SELECT 1`));
      await expect(
        TenantContext.runAs({ tenantId: b.id }, () => runner.query(`SELECT 1`)),
      ).rejects.toMatchObject({ code: 'tenant_scope_mismatch' });
    } finally {
      await runner.release();
    }
  });

  it('does not let a rolled-back transaction leak its tenant to the next user of the connection', async () => {
    await expect(
      TenantContext.runAs({ tenantId: a.id }, () =>
        ds.transaction(async (mgr) => {
          await mgr.query(`SELECT 1`);
          throw new Error('rollback');
        }),
      ),
    ).rejects.toThrow('rollback');
    await expect(titles()).resolves.toEqual([]);
  });
});
```

Enforced mode must not start on a database that still carries the legacy single-tenant default of migration 037 (`ALTER DATABASE … SET app.tenant_id`): a request without a scope would then read and write the first tenant instead of seeing nothing (fail-open). `src/database/tenancy/boot-guards.spec.ts`:

```ts
import { assertNoLegacyTenantDefault } from './boot-guards';

describe('assertNoLegacyTenantDefault', () => {
  it('accepts a database with no app.tenant_id default', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(assertNoLegacyTenantDefault({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a database default and says how to remove it', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ setting: 'app.tenant_id=a1000000-0000-4000-8000-000000000001' }]);
    await expect(assertNoLegacyTenantDefault({ query })).rejects.toThrow(
      /legacy_tenant_default_present.*RESET app\.tenant_id/,
    );
  });
});
```
and, appended to `test/tenancy-binding.e2e-spec.ts` (import `tenantAwareDataSource` and `assertNoLegacyTenantDefault`; the default is on only for a database made with `keepLegacyDefault: true`):

```ts
describe('legacy tenant default guard (e2e)', () => {
  it('passes on an enforced database and refuses one that kept the legacy default', async () => {
    const enforced = await createTenantDatabase();
    const legacy = await createTenantDatabase({ keepLegacyDefault: true });
    const connect = (url: string) => {
      const ds = new DataSource({ type: 'postgres', url, installExtensions: false });
      return ds.initialize();
    };
    const good = await connect(enforced.appUrl);
    const bad = await connect(legacy.appUrl);
    try {
      await expect(assertNoLegacyTenantDefault(good)).resolves.toBeUndefined();
      await expect(assertNoLegacyTenantDefault(bad)).rejects.toThrow(
        /legacy_tenant_default_present/,
      );
    } finally {
      await good.destroy();
      await bad.destroy();
      await enforced.drop();
      await legacy.drop();
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/database/tenancy` and `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-binding`
Expected: FAIL (middleware and job runner modules do not exist; binding e2e fails only if Task 2/3 is incomplete — it should already pass once they exist; the new unit specs are the RED ones).

- [ ] **Step 3: Implement**

`src/database/tenancy/tenant-scope.middleware.ts`:

```ts
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant-context';

// Registered as Nest module middleware, which runs AFTER body parsing: the body parser
// resumes the request from a stream event, where an earlier AsyncLocalStorage context
// would be lost. Everything after this point (guards, interceptors, handlers) shares the
// store; JwtAuthGuard or the sign-in adopts the tenant into it.
@Injectable()
export class TenantScopeMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    TenantContext.start(() => next());
  }
}
```

`src/database/tenancy/tenant-job-runner.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from './tenant-context';

export type TenantJobOutcome =
  | { tenantId: string; ok: true }
  | { tenantId: string; ok: false; error: string };

// Scheduled jobs have no request: they run once per tenant, each under that tenant's
// scope, so Row-Level Security answers for them exactly as it does for a request. A tenant
// that fails does not stop the others.
@Injectable()
export class TenantJobRunner {
  private readonly logger = new Logger(TenantJobRunner.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async forEachTenant(
    job: (tenantId: string) => Promise<void>,
  ): Promise<TenantJobOutcome[]> {
    // No scope here: the function is SECURITY DEFINER and answers the tenant ids only
    const rows = await this.dataSource.query<{ id: string }[]>(
      'SELECT id FROM maintenance_tenant_ids()',
    );
    const outcomes: TenantJobOutcome[] = [];
    for (const { id: tenantId } of rows) {
      try {
        await TenantContext.runAs({ tenantId }, () => job(tenantId));
        outcomes.push({ tenantId, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Job failed for tenant ${tenantId}: ${message}`);
        outcomes.push({ tenantId, ok: false, error: message });
      }
    }
    return outcomes;
  }
}
```

`src/database/tenancy/tenancy.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { TenantJobRunner } from './tenant-job-runner';

@Global()
@Module({ providers: [TenantJobRunner], exports: [TenantJobRunner] })
export class TenancyModule {}
```

`src/database/typeorm.options.ts` — add `installExtensions: false` (the schema, including extensions, is owned by the migrations; the runtime role cannot create extensions) and export the data source factory:

```ts
import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
// Registers the DATE parser before the first connection
import './pg-types';
import { bindTenantToConnections } from './tenancy/bind-tenant';
import { isTenancyEnforced } from './tenancy/tenancy-mode';

export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get('database.host'),
    port: config.get('database.port'),
    username: config.get('database.username'),
    password: config.get('database.password'),
    database: config.get('database.database'),
    autoLoadEntities: true,
    synchronize: false,
    // Extensions come with the migrations; the runtime role is not allowed to create them
    installExtensions: false,
    logging: process.env.NODE_ENV === 'development',
    extra: { min: 2, max: 20, idleTimeoutMillis: 30000 },
  };
}

// In enforced mode every connection is bound to the tenant of the code using it
export async function tenantAwareDataSource(
  options?: DataSourceOptions,
): Promise<DataSource> {
  const dataSource = new DataSource(options as DataSourceOptions);
  if (isTenancyEnforced()) bindTenantToConnections(dataSource);
  return dataSource.initialize();
}
```

`src/app.module.ts` — three edits:

```ts
// imports
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { buildTypeOrmOptions, tenantAwareDataSource } from './database/typeorm.options';
import { TenancyModule } from './database/tenancy/tenancy.module';
import { TenantScopeMiddleware } from './database/tenancy/tenant-scope.middleware';

// TypeOrmModule.forRootAsync({...}) gains the factory:
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: buildTypeOrmOptions,
      dataSourceFactory: tenantAwareDataSource,
      inject: [ConfigService],
    }),
    TenancyModule,

// the class
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantScopeMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
```

`src/database/seeder.service.ts` — the demo accounts belong to the first tenant, and the arbiter of `ON CONFLICT` is now `(tenant_id, username)`:

```ts
import { TenantContext } from './tenancy/tenant-context';
import { isTenancyEnforced } from './tenancy/tenancy-mode';

// FIRST_TENANT_ID is the tenant migration 036 creates for the pre-existing data
const FIRST_TENANT_ID = 'a1000000-0000-4000-8000-000000000001';

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'production') return;
    try {
      if (isTenancyEnforced()) {
        await TenantContext.runAs({ tenantId: FIRST_TENANT_ID }, () => this.seedUsers());
      } else {
        await this.seedUsers();
      }
      this.logger.log('Database seeding complete');
    } ...
```
and in both inserts: `ON CONFLICT (tenant_id, username) DO NOTHING`.

Update `src/database/seeder.service.spec.ts` for the new conflict target (the spec asserts the SQL text; adjust the expected `ON CONFLICT (username)` to `ON CONFLICT (tenant_id, username)`). Add one test: under `TENANCY_MODE=enforced` the inserts run with `TenantContext.current()?.tenantId === 'a1000000-0000-4000-8000-000000000001'` (capture it inside the mocked `dataSource.query`).

`src/database/tenancy/boot-guards.ts`:

```ts
import type { DataSource } from 'typeorm';

// The legacy single-tenant default (migration 037) makes every session that writes no
// tenant inherit the first tenant. Enforced mode relies on "no tenant sees nothing", so it
// refuses to run while any database-wide or role setting of app.tenant_id exists.
export async function assertNoLegacyTenantDefault(
  dataSource: Pick<DataSource, 'query'>,
): Promise<void> {
  const rows = await dataSource.query<{ setting: string }[]>(
    `SELECT c AS setting
       FROM pg_db_role_setting s
       CROSS JOIN LATERAL unnest(s.setconfig) AS c
      WHERE (s.setdatabase = 0
             OR s.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database()))
        AND c LIKE 'app.tenant_id=%'`,
  );
  if (rows.length > 0) {
    throw new Error(
      `legacy_tenant_default_present: the database sets a default tenant (${rows[0].setting}), ` +
        `so a request without a tenant would see that tenant. Remove it with ` +
        `ALTER DATABASE <db> RESET app.tenant_id (and ALTER ROLE ... RESET app.tenant_id) before running TENANCY_MODE=enforced`,
    );
  }
}
```
and in `tenantAwareDataSource` (typeorm.options.ts), after `initialize()`, in enforced mode run the guard and destroy the data source when it fails:

```ts
export async function tenantAwareDataSource(options?: DataSourceOptions): Promise<DataSource> {
  const dataSource = new DataSource(options as DataSourceOptions);
  const enforced = isTenancyEnforced();
  if (enforced) bindTenantToConnections(dataSource);
  await dataSource.initialize();
  if (enforced) {
    try {
      await assertNoLegacyTenantDefault(dataSource);
    } catch (error) {
      await dataSource.destroy();
      throw error;
    }
  }
  return dataSource;
}
```
(`isTenancyEnforced()` here is also the boot-time call that makes a bad `TENANCY_MODE` value fail startup.)

- [ ] **Step 4: Run to verify**

Run: `npx jest src/database` — Expected: PASS.
Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-binding test/app.e2e-spec.ts` — Expected: PASS (6 + 2 tests). `app.e2e-spec` boots AppModule in legacy mode with the middleware registered: this proves `{*splat}` routes work and nothing regressed.

- [ ] **Step 5: Commit**

```bash
git add src/database src/app.module.ts test/tenancy-binding.e2e-spec.ts
git commit -m "feat(tenancy): bind connections in enforced mode, request scope middleware and job runner

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tenant at sign-in, `tid` claim, guard scope

**Files:**
- Modify: `src/auth/dto/login.dto.ts` (or wherever `LoginDto` lives: `grep -rn "class LoginDto" src/auth`), `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/common/guards/jwt-auth.guard.ts`
- Test: `src/auth/auth.service.spec.ts`, `src/common/guards/jwt-auth.guard.spec.ts`, `src/auth/auth.controller.spec.ts`, `test/tenancy-slice.e2e-spec.ts` (created here, extended in later tasks)

**Interfaces:**
- Consumes: `TenantContext`, `isTenancyEnforced`; SQL `auth_tenant_by_code`.
- Produces: `JwtPayload.tid?: string`; `AuthService.resolveLoginTenant(tenantCode?: string, password?: string): Promise<string | null>`; refresh and access tokens carry `tid` in enforced mode; `LoginDto.tenantCode?: string`.

- [ ] **Step 1: Write the failing tests**

`src/common/guards/jwt-auth.guard.spec.ts` — add (use the existing test's factory for the guard; names below match what that file already builds — adapt the construction helper that file already has):

```ts
describe('JwtAuthGuard under TENANCY_MODE=enforced', () => {
  const TID = '11111111-1111-4111-8111-111111111111';
  const previous = process.env.TENANCY_MODE;
  beforeEach(() => (process.env.TENANCY_MODE = 'enforced'));
  afterEach(() => {
    if (previous === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previous;
  });

  it('adopts the tenant of the token before it checks the session', async () => {
    let scopeDuringCheck: string | undefined;
    const { guard, context } = buildGuard({
      payload: { sub: USER, sid: SID, ver: 1, typ: 'access', tid: TID },
      isAccessValid: () => {
        scopeDuringCheck = TenantContext.current()?.tenantId;
        return Promise.resolve(true);
      },
    });
    await TenantContext.start(() => guard.canActivate(context));
    expect(scopeDuringCheck).toBe(TID);
  });

  it('refuses a token without a tenant', async () => {
    const { guard, context } = buildGuard({
      payload: { sub: USER, sid: SID, ver: 1, typ: 'access' },
    });
    await expect(TenantContext.start(() => guard.canActivate(context))).rejects.toThrow(
      'invalid_token',
    );
  });
});

describe('JwtAuthGuard under TENANCY_MODE=legacy', () => {
  it('ignores tid and needs no scope store', async () => {
    const { guard, context } = buildGuard({
      payload: { sub: USER, sid: SID, ver: 1, typ: 'access' },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
```
(`buildGuard`, `USER`, `SID` are the helpers the existing spec already defines for a guard with a mocked `JwtService`/`AuthStateService`; if its helper has another shape, add the `tid`-carrying payload through that helper — the assertions above are the contract.)

`src/auth/auth.service.spec.ts` — add cases (existing file mocks `dataSource.query`; follow its pattern):
1. enforced + no `tenantCode` → `resolveLoginTenant(undefined)` rejects `BadRequestException('tenant_code_required')`.
2. enforced + unknown code → resolves after a bcrypt comparison and rejects `UnauthorizedException('invalid_credentials')` (assert `dataSource.query` was called with `'SELECT id, status FROM auth_tenant_by_code($1)'`).
3. enforced + status `suspended` → same `invalid_credentials`.
4. enforced + active → returns the id and `TenantContext.current()?.tenantId` equals it inside a `TenantContext.start`.
5. legacy → returns `null`, never queries.
6. `issueTokens` in enforced mode signs an access token and a refresh token that both contain `tid` equal to the adopted tenant (decode with the test's `JwtService`).
7. `refreshTokens` in enforced mode adopts `tid` from the verified refresh token before any query; a refresh token without `tid` → `UnauthorizedException('invalid_refresh_token')`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/common/guards src/auth/auth.service src/auth/auth.controller`
Expected: FAIL (no `tid` handling, no `resolveLoginTenant`).

- [ ] **Step 3: Implement**

`LoginDto` — add:

```ts
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantCode?: string;
```

`JwtPayload` (in `auth.service.ts`) — add `tid?: string; // the tenant the session belongs to (enforced mode)`.

`AuthService`:

```ts
  /**
   * The tenant a sign-in is for. Legacy mode has none. Enforced mode takes the code the
   * user typed: an unknown or inactive tenant looks exactly like a wrong password (same
   * answer, same work), so codes cannot be probed. The tenant is adopted into the request
   * scope, so every later query of the sign-in runs under it.
   */
  async resolveLoginTenant(
    tenantCode: string | undefined,
    password: string,
  ): Promise<string | null> {
    if (!isTenancyEnforced()) return null;
    const code = (tenantCode ?? '').trim();
    if (!code) throw new BadRequestException('tenant_code_required');
    const [tenant] = await this.dataSource.query<{ id: string; status: string }[]>(
      'SELECT id, status FROM auth_tenant_by_code($1)',
      [code],
    );
    if (!tenant || tenant.status !== 'active') {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException('invalid_credentials');
    }
    TenantContext.adopt({ tenantId: tenant.id });
    return tenant.id;
  }
```
`openSession` — after building `payload`: `if (isTenancyEnforced()) payload.tid = TenantContext.requireTenantId();` and the refresh token payload `{ sub, type: 'refresh', sid, ...(isTenancyEnforced() ? { tid: TenantContext.requireTenantId() } : {}) }` (build the refresh token after reading the tid so both carry it).
`refreshTokens` — widen the verified payload type with `tid?: string`; after the existing `type/sid` check:

```ts
    if (isTenancyEnforced()) {
      if (!isUUID(payload.tid)) {
        throw new UnauthorizedException('invalid_refresh_token');
      }
      TenantContext.adopt({ tenantId: payload.tid });
    }
```
`AuthController.login`:

```ts
    await this.authService.resolveLoginTenant(dto.tenantCode, dto.password);
    const user = await this.authService.validateUser(dto.username, dto.password);
```
`JwtAuthGuard.canActivate` — after the `typ` check and before `isAccessValid`:

```ts
    if (isTenancyEnforced()) {
      if (!isUUID(payload.tid)) throw new UnauthorizedException('invalid_token');
      TenantContext.adopt({ tenantId: payload.tid });
    }
```
(add imports: `isUUID` from `class-validator`, `TenantContext`, `isTenancyEnforced`, `BadRequestException`).

- [ ] **Step 4: Prove sign-in end to end (start the slice suite)**

The backend reads its configuration when `AppModule` is imported, so the environment of an enforced suite must be set by a module imported before it. Create `test/support/enforced-env.ts`:

```ts
// Environment of an e2e suite that runs the backend as the runtime role mms_app with
// TENANCY_MODE=enforced. Import it before AppModule, like app-env.ts (which it builds on).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import './app-env';
import { APP_PASSWORD } from './tenancy';

export const E2E_UPLOAD_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), 'mms-uploads-'),
);

Object.assign(process.env, {
  TENANCY_MODE: 'enforced',
  DB_USER: 'mms_app',
  DB_PASSWORD: APP_PASSWORD,
  UPLOAD_DIR: E2E_UPLOAD_DIR,
});
```

Then create `test/tenancy-slice.e2e-spec.ts` with the scaffold below (it is extended by Tasks 6–9):

```ts
// Two tenants on the running backend as the runtime role mms_app (TENANCY_MODE=enforced).
// Requires MIGRATION_TEST_ADMIN_URL, TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import { E2E_UPLOAD_DIR } from './support/enforced-env';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import {
  ADMIN_PASSWORD,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(240_000);

describe('tenant slice (e2e)', () => {
  let db: TenantDatabase;
  let app: INestApplication;
  let baseUrl: string;
  let a: SeededTenant;
  let b: SeededTenant;
  const tokens: Record<string, string> = {};

  const api = () => request(app.getHttpServer() as Server);
  const url = (route: string) => `/${E2E_API_PREFIX}${route}`;
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  const login = (tenantCode: string | undefined, username: string, password = ADMIN_PASSWORD) =>
    api().post(url('/auth/login')).send({ tenantCode, username, password });

  beforeAll(async () => {
    // The database the backend will connect to (as mms_app) is the one app-env.ts names
    db = await createTenantDatabase({ name: E2E_DB_NAME });
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;

    tokens.a = (await login('phu-dinh', a.adminUsername).expect(200)).body.tokens.accessToken;
    tokens.b = (await login('tenant-b', b.adminUsername).expect(200)).body.tokens.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  describe('sign-in', () => {
    it('signs a user in only through the tenant they belong to', async () => {
      await login('tenant-b', a.adminUsername).expect(401);
      await login('phu-dinh', b.adminUsername).expect(401);
    });

    it('answers an unknown tenant like a wrong password', async () => {
      const wrongPassword = await login('phu-dinh', a.adminUsername, 'Wrong@12345').expect(401);
      const unknownTenant = await login('no-such-tenant', a.adminUsername).expect(401);
      expect(unknownTenant.body).toEqual(wrongPassword.body);
    });

    it('asks for the tenant code when none is given', async () => {
      const res = await login(undefined, a.adminUsername).expect(400);
      expect(JSON.stringify(res.body)).toContain('tenant_code_required');
    });

    it('issues access and refresh tokens that name the tenant', async () => {
      const res = await login('phu-dinh', a.adminUsername).expect(200);
      const claims = JSON.parse(
        Buffer.from(res.body.tokens.accessToken.split('.')[1], 'base64url').toString(),
      ) as { tid: string };
      expect(claims.tid).toBe(a.id);
    });

    it('refreshes a session inside its own tenant', async () => {
      const res = await login('phu-dinh', a.adminUsername).expect(200);
      await api()
        .post(url('/auth/refresh'))
        .send({ refreshToken: res.body.tokens.refreshToken })
        .expect(200);
    });

    it('opens the session of the token, and only of the token tenant', async () => {
      const mine = await api().get(url('/auth/me')).set(auth('a')).expect(200);
      expect((mine.body as { username: string }).username).toBe(a.adminUsername);
    });
  });
});
```

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice`
Expected: PASS (6 tests). Failures here mean an unscoped query on the sign-in path — find it with the error (`tenant_scope_mismatch` or an empty result) and scope it; do not loosen RLS.

- [ ] **Step 5: Commit**

```bash
git add src/auth src/common/guards test/tenancy-slice.e2e-spec.ts
git commit -m "feat(tenancy): tenant code at sign-in, tid claim, guard adopts the tenant

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: HTTP slice proof — routes, canary, differential, export, audit

**Files:**
- Modify: `src/tasks/tasks.service.ts:180` (conflict target), `src/tasks/tasks.service.spec.ts` (assert the new SQL text)
- Modify: `test/support/tenancy.ts` (`seedTenant` creates a member account), `test/tenancy-slice.e2e-spec.ts`

**Interfaces:**
- Consumes: sign-in and tokens from Task 5; `seedTenant`, `TenantDatabase` from Task 3.
- Produces: the `GET_ROUTES` canary/differential harness reused by Tasks 7–9.

- [ ] **Step 1: Write the failing tests**

Extend `seedTenant` in `test/support/tenancy.ts` so a task can be created through the API (assignment needs a member with an account). Add `memberUserId: string` to `SeededTenant`. In the function, after the admin user and before the militia profile insert:

```ts
    const memberUserId = await one<string>(
      `INSERT INTO users (tenant_id, username, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [id, `member-${code}`, hash, `Member user ${canary}`],
    );
    await c.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.code = 'dqtv'`,
      [memberUserId],
    );
```
Add `user_id` to the militia insert (`... unit_id, join_date, user_id) VALUES (..., $6)` with `memberUserId` as `$6`) and return `memberUserId`.

Append to `test/tenancy-slice.e2e-spec.ts` (inside the top-level `describe`; add `import * as ExcelJS from 'exceljs';` at the top). Shared harness:

```ts
  // Every GET route the slice serves to a tenant admin
  const GET_ROUTES = [
    '/tasks',
    '/militia',
    '/users/search?q=a',
    '/units/search?q=u',
    '/notifications',
    '/audit',
  ];

  // Keys a route may return that differ between two identical calls; add one here, with
  // a comment, only when a route really returns a clock value
  const VOLATILE_KEYS = new Set<string>([]);
  const stable = (value: unknown): unknown =>
    JSON.parse(
      JSON.stringify(value, (key, v: unknown) =>
        VOLATILE_KEYS.has(key) ? null : v,
      ),
    );

  const snapshot = async (who: string) =>
    Promise.all(
      GET_ROUTES.map(async (route) => {
        const res = await api().get(url(route)).set(auth(who));
        return { route, status: res.status, body: stable(res.body) };
      }),
    );

  const binary = (
    res: request.Response,
    cb: (error: Error | null, body: Buffer) => void,
  ) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  const cellTexts = async (body: Buffer): Promise<string> => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    const texts: string[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        row.eachCell((cell) => texts.push(String(cell.value ?? ''))),
      ),
    );
    return texts.join('\n');
  };
```

Tests:

```ts
  describe('HTTP guard chain', () => {
    it('serves every list route with the caller tenant data only', async () => {
      const results = await snapshot('a');
      for (const { route, status, body } of results) {
        expect({ route, status }).toEqual({ route, status: 200 });
        expect(JSON.stringify(body)).not.toContain('CANARY-B');
      }
      const tasks = results.find((r) => r.route === '/tasks');
      expect(JSON.stringify(tasks?.body)).toContain('CANARY-A');
    });

    it('answers 404 for a record of another tenant, by id', async () => {
      await api().get(url(`/tasks/${b.taskId}`)).set(auth('a')).expect(404);
      await api().get(url(`/militia/${b.memberId}`)).set(auth('a')).expect(404);
      await api().get(url(`/files/${b.fileId}`)).set(auth('a')).expect(404);
      await api().get(url(`/tasks/${a.taskId}`)).set(auth('a')).expect(200);
    });

    it('does not let a tenant point its own record at another tenant', async () => {
      const res = await api()
        .post(url('/tasks'))
        .set(auth('a'))
        .send({ title: 'Cross tenant', assigneeMilitiaId: b.memberId })
        .expect(404);
      expect(JSON.stringify(res.body)).toContain('militia_not_found');
    });

    it('leaves the answers of one tenant unchanged when another tenant changes (differential)', async () => {
      const before = await snapshot('a');
      await db.admin((c) =>
        c.query(
          `INSERT INTO tasks (tenant_id, code, title, type, created_by)
           VALUES ($1, 'TASK-B-EXTRA', 'Task CANARY-B extra', 'patrol', $2)`,
          [b.id, b.adminId],
        ),
      );
      await api()
        .post(url('/tasks'))
        .set(auth('b'))
        .send({ title: 'CANARY-B created', assigneeMilitiaId: b.memberId })
        .expect(201);
      const after = await snapshot('a');
      expect(after).toEqual(before);
    });

    it('writes a created record and its audit row under the caller tenant', async () => {
      const created = await api()
        .post(url('/tasks'))
        .set(auth('a'))
        .send({ title: 'Audited task', assigneeMilitiaId: a.memberId })
        .expect(201);
      const id = (created.body as { id: string }).id;
      const rows = await db.admin(async (c) => ({
        task: (
          await c.query(`SELECT tenant_id FROM tasks WHERE id = $1`, [id])
        ).rows,
        audit: (
          await c.query(
            `SELECT tenant_id FROM audit_logs WHERE actor_id = $1 AND action = 'POST:tasks'`,
            [a.adminId],
          )
        ).rows,
      }));
      expect(rows.task).toEqual([{ tenant_id: a.id }]);
      expect(rows.audit.length).toBeGreaterThan(0);
      rows.audit.forEach((r) => expect(r).toEqual({ tenant_id: a.id }));
    });

    it('lets two tenants hold the same task code', async () => {
      await db.admin((c) =>
        c.query(
          `INSERT INTO tasks (tenant_id, code, title, type, created_by)
           VALUES ($1, 'TASK-SHARED', 'x', 'patrol', $2), ($3, 'TASK-SHARED', 'y', 'patrol', $4)`,
          [a.id, a.adminId, b.id, b.adminId],
        ),
      );
    });
  });

  describe('exports', () => {
    it('contains only the rows of the caller tenant', async () => {
      const res = await api()
        .get(url('/militia/export?format=xlsx'))
        .set(auth('a'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      const text = await cellTexts(res.body as Buffer);
      expect(text).toContain('Member CANARY-A');
      expect(text).not.toContain('CANARY-B');
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice`
Expected: FAIL at `POST /tasks` (`there is no unique or exclusion constraint matching the ON CONFLICT specification` — the arbiter is now `(tenant_id, code)`). Several other new tests may already pass: RLS answers for them, which is the point of the slice.

- [ ] **Step 3: Implement**

`src/tasks/tasks.service.ts:180` — change the conflict target:

```ts
             ON CONFLICT (tenant_id, code) DO NOTHING
```
`src/tasks/tasks.service.spec.ts` — wherever the spec asserts the insert SQL contains `ON CONFLICT (code)`, change it to `ON CONFLICT (tenant_id, code)`.

Then run the suite and fix, one at a time, whatever else surfaces. Expected causes and their root-cause fixes (never loosen a policy):
- A query that reads a slice table **before** the guard adopted the tenant: move the adoption earlier, not the query.
- A fire-and-forget write that outlives the request (the audit insert) failing with `tenant_scope_mismatch` or a NOT NULL violation: it must run under the request scope. Capture `const scope = TenantContext.current()` synchronously in `AuditInterceptor.intercept` and wrap the insert in `scope ? TenantContext.runAs(scope, () => insert) : insert`.
- A route in `GET_ROUTES` that a tenant admin cannot call: replace it with a route that returns 200 for `system_admin` (keep at least five routes).
- `POST /tasks` rejecting the body: add the fields its DTO requires (`grep -n "class CreateTaskDto" -r src/tasks`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice` and `npx jest src/tasks src/common/interceptors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tasks src/common test/support/tenancy.ts test/tenancy-slice.e2e-spec.ts
git commit -m "test(tenancy): canary, id and differential isolation proof on the HTTP slice

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: File storage per tenant, and the purge job per tenant

**Files:**
- Modify: `src/files/files.service.ts`, `src/files/upload.interceptor.ts`, `src/files/content-checking-storage.ts`
- Test: `src/files/files.service.spec.ts`, `src/files/content-checking-storage.spec.ts`, `test/tenancy-slice.e2e-spec.ts`

**Interfaces:**
- Consumes: `TenantContext`, `isTenancyEnforced`, `TenantJobRunner` (Tasks 1, 4).
- Produces: `FilesService.tenantUploadDir(): string`; `FilesService.contentPath(storageKey: string, tenantId?: string): string`; `ContentCheckingStorage` takes `(req: Request) => string`.

- [ ] **Step 1: Write the failing tests**

`src/files/files.service.spec.ts` — add (the spec builds `FilesService` with a config mock; add a `TenantJobRunner` mock `{ forEachTenant: jest.fn() }` as the new last constructor argument wherever it is built):

```ts
describe('upload directory per tenant', () => {
  const TID = '11111111-1111-4111-8111-111111111111';
  const enforce = () => (process.env.TENANCY_MODE = 'enforced');
  afterEach(() => delete process.env.TENANCY_MODE);

  it('keeps one flat directory in legacy mode', () => {
    const service = buildService({ UPLOAD_DIR: '/data/uploads' });
    expect(service.tenantUploadDir()).toBe('/data/uploads');
    expect(service.contentPath('abc')).toBe(join('/data/uploads', 'abc'));
  });

  it('keeps each tenant in its own directory in enforced mode', () => {
    enforce();
    const service = buildService({ UPLOAD_DIR: '/data/uploads' });
    TenantContext.runAs({ tenantId: TID }, () => {
      expect(service.tenantUploadDir()).toBe(join('/data/uploads', TID));
      expect(service.contentPath('abc')).toBe(join('/data/uploads', TID, 'abc'));
    });
  });

  it('refuses to name a directory without a tenant in enforced mode', () => {
    enforce();
    expect(() => buildService({ UPLOAD_DIR: '/d' }).tenantUploadDir()).toThrow(
      expect.objectContaining({ code: 'no_tenant_scope' }),
    );
  });

  it('purges once per tenant in enforced mode', async () => {
    enforce();
    const forEachTenant = jest.fn().mockResolvedValue([]);
    const service = buildService({ UPLOAD_DIR: '/d' }, { forEachTenant });
    await service.purgeAbandonedUploadsOnSchedule();
    expect(forEachTenant).toHaveBeenCalledTimes(1);
  });
});
```
(`buildService(config, runner?)` is a local helper constructing `new FilesService(...)` with whatever the spec already passes for the other constructor arguments plus `runner ?? { forEachTenant: jest.fn() }`.)

`src/files/content-checking-storage.spec.ts` — add one test: a storage built with `new ContentCheckingStorage((req) => (req as unknown as { dir: string }).dir)` writes the upload under the directory the request names (the existing tests pass `() => dir`, which stays valid).

Append to `test/tenancy-slice.e2e-spec.ts`. Add `import * as fs from 'fs'; import * as path from 'path';` and `import { FilesService } from '../src/files/files.service';`, declare `const uploadDir = E2E_UPLOAD_DIR;` (already created and exported to `UPLOAD_DIR` by `enforced-env.ts`) and in `afterAll` add `fs.rmSync(uploadDir, { recursive: true, force: true })`:

```ts
  describe('files', () => {
    const upload = (who: string, text: string) =>
      api()
        .post(url('/files/upload'))
        .set(auth(who))
        .attach('file', Buffer.from(text), {
          filename: 'note.txt',
          contentType: 'text/plain',
        })
        .expect(201);

    it('stores each tenant upload in the directory of its tenant', async () => {
      const fa = (await upload('a', 'canary A')).body as { id: string };
      const fb = (await upload('b', 'canary B')).body as { id: string };
      const keys = await db.admin(
        async (c) =>
          (
            await c.query<{ id: string; tenant_id: string; storage_key: string }>(
              `SELECT id, tenant_id, storage_key FROM files WHERE id = ANY($1::uuid[])`,
              [[fa.id, fb.id]],
            )
          ).rows,
      );
      for (const row of keys) {
        expect(
          fs.existsSync(path.join(uploadDir, row.tenant_id, row.storage_key)),
        ).toBe(true);
        expect(fs.existsSync(path.join(uploadDir, row.storage_key))).toBe(false);
      }
      expect(new Set(keys.map((r) => r.tenant_id))).toEqual(
        new Set([a.id, b.id]),
      );
    });

    it('serves a file to its own tenant and hides it from another', async () => {
      const fa = (await upload('a', 'for A only')).body as { id: string };
      const own = await api()
        .get(url(`/files/${fa.id}`))
        .set(auth('a'))
        .expect(200);
      expect(own.text).toBe('for A only');
      await api().get(url(`/files/${fa.id}`)).set(auth('b')).expect(404);
    });

    it('purges abandoned uploads of every tenant with their content', async () => {
      const fa = (await upload('a', 'abandoned A')).body as { id: string };
      const fb = (await upload('b', 'abandoned B')).body as { id: string };
      const rows = await db.admin(async (c) => {
        await c.query(
          `UPDATE files SET created_at = now() - interval '48 hours' WHERE id = ANY($1::uuid[])`,
          [[fa.id, fb.id]],
        );
        return (
          await c.query<{ tenant_id: string; storage_key: string }>(
            `SELECT tenant_id, storage_key FROM files WHERE id = ANY($1::uuid[])`,
            [[fa.id, fb.id]],
          )
        ).rows;
      });
      await app.get(FilesService).purgeAbandonedUploadsOnSchedule();
      const left = await db.admin(
        async (c) =>
          (
            await c.query(`SELECT id FROM files WHERE id = ANY($1::uuid[])`, [
              [fa.id, fb.id],
            ])
          ).rows,
      );
      expect(left).toEqual([]);
      rows.forEach((row) =>
        expect(
          fs.existsSync(path.join(uploadDir, row.tenant_id, row.storage_key)),
        ).toBe(false),
      );
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/files` and `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice -t files`
Expected: FAIL (`tenantUploadDir is not a function`; uploads land in the flat directory).

- [ ] **Step 3: Implement**

`src/files/files.service.ts` — inject the runner, add the path helpers and use them everywhere a content path was built:

```ts
import { TenantContext } from '../database/tenancy/tenant-context';
import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';

  // constructor gains, last: private readonly tenantJobs: TenantJobRunner

  /** Directory new uploads go to: one per tenant in enforced mode, so no path is shared. */
  tenantUploadDir(): string {
    return isTenancyEnforced()
      ? join(this.uploadDir(), TenantContext.requireTenantId())
      : this.uploadDir();
  }

  /** Where the content of a stored file lives; the tenant defaults to the current scope. */
  contentPath(storageKey: string, tenantId?: string): string {
    return isTenancyEnforced()
      ? join(
          this.uploadDir(),
          tenantId ?? TenantContext.requireTenantId(),
          storageKey,
        )
      : join(this.uploadDir(), storageKey);
  }
```
- `openForDownload`: `const path = this.contentPath(row.storageKey);` (the SELECT runs under the request scope, so Row-Level Security already hid other tenants' rows).
- `removeContent`: `await fsp.unlink(this.contentPath(storageKey));`
- the scheduled wrapper:

```ts
  @Cron(CronExpression.EVERY_HOUR)
  async purgeAbandonedUploadsOnSchedule(): Promise<void> {
    try {
      const purged = isTenancyEnforced()
        ? await this.purgeEveryTenant()
        : await this.purgeAbandonedUploads();
      if (purged > 0) this.logger.log(`Purged ${purged} abandoned uploads`);
    } catch (error) {
      this.logger.error(
        `Purging abandoned uploads failed: ${errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async purgeEveryTenant(): Promise<number> {
    let purged = 0;
    await this.tenantJobs.forEachTenant(async () => {
      purged += await this.purgeAbandonedUploads();
    });
    return purged;
  }
```

`src/files/content-checking-storage.ts` — the directory is chosen per request:

```ts
export class ContentCheckingStorage implements StorageEngine {
  constructor(private readonly directory: (req: Request) => string) {}

  _handleFile(req: Request, file: Express.Multer.File, callback: ...): void {
    this.store(req, file).then(
      (info) => callback(null, info),
      (error: unknown) => callback(error),
    );
  }

  private async store(req: Request, file: Express.Multer.File): Promise<StoredFileInfo> {
    const directory = this.directory(req);
    // ... rest unchanged
```
`src/files/upload.interceptor.ts` — resolve the directory when the request enters the interceptor (the request context is intact there; multer's stream callbacks are not guaranteed to keep it) and let the storage read it from the request:

```ts
interface UploadRequest {
  uploadDirectory?: string;
  file?: { path?: string };
}

  constructor(private readonly files: FilesService) {
    const options: MulterConfig = {
      storage: new ContentCheckingStorage(
        (req) =>
          (req as unknown as UploadRequest).uploadDirectory ?? files.uploadDir(),
      ),
      // ... the rest of the options unchanged
    };
    ...
  }

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    request.uploadDirectory = this.files.tenantUploadDir();
    // ... the rest of the method unchanged
```
`FilesModule` needs no import: `TenancyModule` is global.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/files` and `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice`
Expected: PASS. Also `npx jest --config ./test/jest-e2e.json --runInBand test/client-gaps-t20.e2e-spec.ts` — Expected: PASS (legacy mode keeps the flat directory; the abandoned-upload case is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/files test/tenancy-slice.e2e-spec.ts
git commit -m "feat(tenancy): per-tenant upload directories and tenant-scoped purge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sockets — tenant rooms, handshake and handler scope, no global broadcast

**Files:**
- Create: `src/notifications/rooms.ts`, `src/notifications/rooms.spec.ts`
- Create: `src/notifications/ws-tenant-scope.interceptor.ts`, `src/notifications/ws-tenant-scope.interceptor.spec.ts`
- Modify: `src/notifications/notifications.gateway.ts`, `src/gps/gps-rooms.ts`, `src/gps/gps.service.ts`, `src/sos/sos.service.ts`
- Modify specs that name rooms: `src/notifications/notifications.gateway.spec.ts`, `src/gps/*.spec.ts`, `src/sos/sos.service.spec.ts`, `test/socket-adapter-redis.e2e-spec.ts`
- Test: `test/tenancy-slice.e2e-spec.ts`

**Interfaces:**
- Consumes: `TenantContext`, `isTenancyEnforced` (Task 1).
- Produces: `rooms.{user, unit, gpsWard, gpsUnit, conversation, tenant}(tid: string | undefined, …)`; `NotificationsGateway.emitToTenant(event, data)` (replaces `broadcast`); `gpsRoomOf(user, tid)`; `gpsWardRoom(tid)`; `gpsUnitRoom(tid, unitCode)`; `WsTenantScopeInterceptor`.

- [ ] **Step 1: Write the failing tests**

`src/notifications/rooms.spec.ts`:

```ts
import { rooms } from './rooms';

const TID = '11111111-1111-4111-8111-111111111111';

describe('rooms', () => {
  it('namespaces every room by tenant', () => {
    expect(rooms.user(TID, 'u1')).toBe(`t:${TID}:user:u1`);
    expect(rooms.unit(TID, 'KP1')).toBe(`t:${TID}:unit:KP1`);
    expect(rooms.gpsWard(TID)).toBe(`t:${TID}:gps:ward`);
    expect(rooms.gpsUnit(TID, 'KP1')).toBe(`t:${TID}:gps:unit:KP1`);
    expect(rooms.conversation(TID, 'c1')).toBe(`t:${TID}:conv_c1`);
    expect(rooms.tenant(TID)).toBe(`t:${TID}`);
  });

  it('never shares a room between tenants that use the same unit code', () => {
    const other = '22222222-2222-4222-8222-222222222222';
    expect(rooms.unit(TID, 'KP1')).not.toBe(rooms.unit(other, 'KP1'));
  });

  it('uses one namespace for the single-tenant legacy mode', () => {
    expect(rooms.unit(undefined, 'KP1')).toBe('t:legacy:unit:KP1');
    expect(rooms.tenant(undefined)).toBe('t:legacy');
  });
});
```

`src/notifications/ws-tenant-scope.interceptor.spec.ts`:

```ts
import { lastValueFrom, of } from 'rxjs';
import { WsTenantScopeInterceptor } from './ws-tenant-scope.interceptor';
import { TenantContext } from '../database/tenancy/tenant-context';

const TID = '11111111-1111-4111-8111-111111111111';
const contextOf = (user: unknown) =>
  ({
    switchToWs: () => ({ getClient: () => ({ data: { user } }) }),
  }) as never;

describe('WsTenantScopeInterceptor', () => {
  afterEach(() => delete process.env.TENANCY_MODE);

  it('runs the handler under the tenant of the socket in enforced mode', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const seen = await lastValueFrom(
      new WsTenantScopeInterceptor().intercept(contextOf({ tid: TID }), {
        handle: () => of(TenantContext.current()?.tenantId),
      }),
    );
    expect(seen).toBe(TID);
  });

  it('refuses a socket without a tenant in enforced mode', () => {
    process.env.TENANCY_MODE = 'enforced';
    expect(() =>
      new WsTenantScopeInterceptor().intercept(contextOf({}), {
        handle: () => of(1),
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_tenant_id' }));
  });

  it('leaves the handler alone in legacy mode', async () => {
    const seen = await lastValueFrom(
      new WsTenantScopeInterceptor().intercept(contextOf({}), {
        handle: () => of(TenantContext.current()),
      }),
    );
    expect(seen).toBeUndefined();
  });
});
```

`src/notifications/notifications.gateway.spec.ts` — replace every literal room name (`user:${…}`, `unit:${…}`, `conv_${…}`, `gps:…`) with the matching `rooms.*(undefined, …)` call (the legacy namespace), and add: in enforced mode the handshake verifies the session under the token's tenant (`authState.isAccessValid` is called while `TenantContext.current()?.tenantId === claims.tid`) and refuses a token without `tid` with `invalid_token`; `closeInvalid` calls `authState.validAccess` once per tenant, each time under that tenant's scope; `emitToTenant` emits to `rooms.tenant(current tenant)`; `broadcast` no longer exists.

`src/gps/*.spec.ts`, `src/sos/sos.service.spec.ts` — update room expectations to the `rooms.*` helpers and the new signatures: `gpsRoomOf(user, tid)` returns `rooms.gpsWard(tid)` / `rooms.gpsUnit(tid, unit)`; SOS without a reporter unit calls `emitToTenant('sos:new', payload)`; resolving calls `emitToTenant('sos:resolved', …)`.

Append to `test/tenancy-slice.e2e-spec.ts` (imports: `io as connectClient, type Socket as ClientSocket` from `socket.io-client`; `NotificationsGateway` from `../src/notifications/notifications.gateway`; `TenantContext` from `../src/database/tenancy/tenant-context`). Both tenants get a unit with the SAME code and each admin is placed in it, so the unit rooms would collide without tenant namespaces:

```ts
  describe('sockets', () => {
    const clients: ClientSocket[] = [];
    afterEach(() => clients.splice(0).forEach((c) => c.disconnect()));

    const open = (who: string) =>
      new Promise<ClientSocket>((resolve, reject) => {
        const client = connectClient(baseUrl, {
          path: '/socket.io/',
          auth: { token: tokens[who] },
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
        });
        clients.push(client);
        client.once('connect', () => resolve(client));
        client.once('connect_error', reject);
      });

    const received = (client: ClientSocket, event: string) => {
      const events: unknown[] = [];
      client.on(event, (payload: unknown) => events.push(payload));
      return events;
    };

    // An acknowledged request is answered after anything already written to the socket
    const drained = (client: ClientSocket) =>
      client
        .timeout(10_000)
        .emitWithAck('chat:join', '00000000-0000-4000-8000-000000000000');

    beforeAll(async () => {
      await db.admin(async (c) => {
        for (const t of [a, b]) {
          const { rows } = await c.query<{ id: string }>(
            `INSERT INTO units (tenant_id, code, name, type) VALUES ($1, 'KP-SHARED', 'Shared', 'area') RETURNING id`,
            [t.id],
          );
          await c.query(
            `INSERT INTO user_unit_scopes (user_id, unit_id, scope_type) VALUES ($1, $2, 'unit')`,
            [t.adminId, rows[0].id],
          );
        }
      });
      // The unit scope is a claim: sign in again so the tokens carry it
      tokens.a = (
        await login('phu-dinh', a.adminUsername).expect(200)
      ).body.tokens.accessToken;
      tokens.b = (
        await login('tenant-b', b.adminUsername).expect(200)
      ).body.tokens.accessToken;
    });

    it('delivers a unit event only to the sockets of the same tenant', async () => {
      const [sa, sb] = await Promise.all([open('a'), open('b')]);
      const gotA = received(sa, 'probe');
      const gotB = received(sb, 'probe');
      TenantContext.runAs({ tenantId: a.id }, () =>
        app
          .get(NotificationsGateway)
          .emitToUnit('KP-SHARED', 'probe', { for: 'A' }),
      );
      await Promise.all([drained(sa), drained(sb)]);
      expect(gotA).toEqual([{ for: 'A' }]);
      expect(gotB).toEqual([]);
    });

    it('delivers a tenant-wide event only inside the tenant', async () => {
      const [sa, sb] = await Promise.all([open('a'), open('b')]);
      const gotA = received(sa, 'probe');
      const gotB = received(sb, 'probe');
      TenantContext.runAs({ tenantId: b.id }, () =>
        app.get(NotificationsGateway).emitToTenant('probe', { for: 'B' }),
      );
      await Promise.all([drained(sa), drained(sb)]);
      expect(gotA).toEqual([]);
      expect(gotB).toEqual([{ for: 'B' }]);
    });

    it('runs a socket event under the tenant of the socket', async () => {
      // The handler checks the session in the users table; with no tenant scope that read
      // would return nothing and the socket would be told it is unauthenticated
      const sa = await open('a');
      const ended = received(sa, 'session_expired');
      const ack = await drained(sa);
      expect(ack).not.toEqual({ error: 'unauthenticated' });
      expect(ended).toEqual([]);
      expect(sa.connected).toBe(true);
    });

    it('refuses a handshake whose token is not valid', async () => {
      const sa = connectClient(baseUrl, {
        path: '/socket.io/',
        auth: { token: 'not-a-token' },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      clients.push(sa);
      await expect(
        new Promise((resolve, reject) => {
          sa.once('connect', resolve);
          sa.once('connect_error', (error: Error) => reject(error));
        }),
      ).rejects.toThrow('invalid_token');
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/notifications src/gps src/sos` and `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice -t sockets`
Expected: FAIL (no `rooms` module, no interceptor, `emitToTenant` missing; unit events cross tenants).

- [ ] **Step 3: Implement**

`src/notifications/rooms.ts`:

```ts
// Socket.IO rooms are namespaced by tenant: unit codes and conversation ids repeat across
// tenants, and a room name shared by two tenants would deliver one tenant's events to the
// other. The legacy single-tenant mode uses one fixed namespace.
const ns = (tid: string | undefined): string => `t:${tid ?? 'legacy'}`;

export const rooms = {
  user: (tid: string | undefined, userId: string) =>
    `${ns(tid)}:user:${userId}`,
  unit: (tid: string | undefined, unitCode: string) =>
    `${ns(tid)}:unit:${unitCode}`,
  gpsWard: (tid: string | undefined) => `${ns(tid)}:gps:ward`,
  gpsUnit: (tid: string | undefined, unitCode: string) =>
    `${ns(tid)}:gps:unit:${unitCode}`,
  conversation: (tid: string | undefined, id: string) =>
    `${ns(tid)}:conv_${id}`,
  tenant: (tid: string | undefined) => ns(tid),
} as const;
```

`src/notifications/ws-tenant-scope.interceptor.ts`:

```ts
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Socket } from 'socket.io';
import { TenantContext } from '../database/tenancy/tenant-context';
import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';

// A socket event has no HTTP request: run its handler under the tenant the handshake
// authenticated, so every query it makes is answered by Row-Level Security for that tenant.
@Injectable()
export class WsTenantScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isTenancyEnforced()) return next.handle();
    const client = context.switchToWs().getClient<Socket>();
    const tenantId =
      (client.data as { user?: { tid?: string } }).user?.tid ?? '';
    // runAs validates the id, so a socket without a tenant never reaches the handler
    return TenantContext.runAs({ tenantId }, () => next.handle());
  }
}
```

`src/notifications/notifications.gateway.ts`:
1. Decorate the gateway class with `@UseInterceptors(WsTenantScopeInterceptor)` (import `UseInterceptors` from `@nestjs/common`).
2. Add `tid?: string` to `SocketUser`. Add two private helpers:

```ts
  // Enforced mode checks a session under its own tenant; legacy mode has none
  private inTenant<T>(
    tid: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    return isTenancyEnforced()
      ? TenantContext.runAs({ tenantId: tid ?? '' }, fn)
      : fn();
  }

  private currentTid(): string | undefined {
    return TenantContext.current()?.tenantId;
  }
```
3. `authenticate`: after the `typ` check add `if (isTenancyEnforced() && !isUUID(claims.tid)) return 'invalid_token';` (import `isUUID` from `class-validator`) and call `await this.inTenant(claims.tid, () => this.authState.isAccessValid(claims))`.
4. `sessionOf`: `await this.inTenant(user.tid, () => this.authState.isAccessValid(user))`.
5. `handleConnection`: join `rooms.tenant(user.tid)`, `rooms.user(user.tid, user.sub)`, `rooms.unit(user.tid, user.unitScope)` (when set) and `gpsRoomOf({ role, roles, unitScope }, user.tid)`.
6. `closeRevoked`: the announcement names no tenant yet (M1 adds it to the payload), so select the user's sockets among all sockets of this replica:

```ts
    const sockets = (await this.server.local.fetchSockets()).filter(
      (client) => userOf(client)?.sub === event.userId,
    );
```
7. `closeInvalid`: group `held` by `user.tid` and validate each group under its tenant:

```ts
    const byTenant = new Map<string | undefined, typeof held>();
    for (const entry of held) {
      const group = byTenant.get(entry.user.tid) ?? [];
      group.push(entry);
      byTenant.set(entry.user.tid, group);
    }
    for (const [tid, group] of byTenant) {
      const valid = await this.inTenant(tid, () =>
        this.authState.validAccess(group.map(({ user }) => user)),
      );
      group.forEach(({ client }, index) => {
        if (!valid[index]) this.endSession(client, 'session_revoked');
      });
    }
```
8. Emitters take the tenant from the current scope: `emitToUnit(unitCode, …)` → `this.server.to(rooms.unit(this.currentTid(), unitCode))`; `emitToUser`, `emitToConversation` likewise. **Remove `broadcast`** and add:

```ts
  // To every socket of the current tenant (replaces the old system-wide broadcast)
  emitToTenant(event: string, data: unknown) {
    this.server.to(rooms.tenant(this.currentTid())).emit(event, data);
  }
```
9. Chat handlers: `client.join/leave(rooms.conversation(user.tid, conversationId))`, and the typing and read emits use the same helper with the socket's `tid`.

`src/gps/gps-rooms.ts` — room names come from `rooms`; the old constants are replaced:

```ts
import { rooms } from '../notifications/rooms';

export const gpsWardRoom = (tid: string | undefined) => rooms.gpsWard(tid);
export const gpsUnitRoom = (tid: string | undefined, unitCode: string) =>
  rooms.gpsUnit(tid, unitCode);

export function gpsRoomOf(
  user: ScopedActor,
  tid: string | undefined,
): string | null {
  const unit = unitGrantOf(user, GPS_STAFF_ROLE_SET);
  if (unit === undefined) return null;
  return unit === null ? gpsWardRoom(tid) : gpsUnitRoom(tid, unit);
}
```
`src/gps/gps.service.ts` `publish`: `const tid = TenantContext.current()?.tenantId;` and the rooms `[gpsWardRoom(tid), gpsUnitRoom(tid, row.unitCode), ...caOfficers.map((id) => rooms.user(tid, id))]`.
`src/sos/sos.service.ts`: both `this.notifications.broadcast(...)` become `this.notifications.emitToTenant(...)`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/notifications src/gps src/sos src/scheduler`, then `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice test/gps-live.e2e-spec.ts test/realtime-session.e2e-spec.ts test/socket-adapter-redis.e2e-spec.ts test/incidents-tasks-scope.e2e-spec.ts`
Expected: PASS. The pre-existing socket suites run in legacy mode with the new `t:legacy:` names; update only their room-name literals (`test/socket-adapter-redis.e2e-spec.ts` names a room).

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(tenancy): tenant-namespaced socket rooms, handler scope, no global broadcast

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Scheduled jobs per tenant

**Files:**
- Modify: `src/scheduler/compliance-alerts.service.ts`, `src/scheduler/compliance-alerts.service.spec.ts`
- Test: `test/tenancy-slice.e2e-spec.ts`

**Interfaces:**
- Consumes: `TenantJobRunner.forEachTenant` (Task 4), `NotificationsGateway.emitToTenant` (Task 8).
- Produces: `ComplianceAlertsService.runCheck(): Promise<void>` (the check for the tenant in scope).

- [ ] **Step 1: Write the failing tests**

`src/scheduler/compliance-alerts.service.spec.ts` — add a `TenantJobRunner` provider (`const mockJobs = { forEachTenant: jest.fn() }`, `{ provide: TenantJobRunner, useValue: mockJobs }`) and give the gateway mock `emitToTenant: jest.fn()`. Tests:

```ts
  describe('tenancy', () => {
    afterEach(() => delete process.env.TENANCY_MODE);

    it('checks once per tenant in enforced mode', async () => {
      process.env.TENANCY_MODE = 'enforced';
      mockJobs.forEachTenant.mockImplementation(
        (job: (id: string) => Promise<void>) => job('t'),
      );
      await service.checkComplianceAlerts();
      expect(mockJobs.forEachTenant).toHaveBeenCalledTimes(1);
    });

    it('checks directly in legacy mode', async () => {
      await service.checkComplianceAlerts();
      expect(mockJobs.forEachTenant).not.toHaveBeenCalled();
    });

    describe('in December', () => {
      useUtcServerClock(new Date('2026-12-20T03:00:00Z'));

      it('announces an alert to the tenant it was computed for', async () => {
        mockDataSource.query
          .mockResolvedValueOnce([
            { militiaId: 'm', militiaName: 'n', unitCode: 'KP1', totalDays: '3' },
          ])
          .mockResolvedValueOnce([]);
        await service.runCheck();
        expect(mockGateway.emitToTenant).toHaveBeenCalledWith(
          'compliance_alert',
          expect.objectContaining({ atRiskCount: 1 }),
        );
      });
    });
  });
```

Slice e2e, appended to `test/tenancy-slice.e2e-spec.ts` (import `ComplianceAlertsService` from `../src/scheduler/compliance-alerts.service`). Both tenants already have an active militia profile without training records, so both are at risk once the clock is near the end of the year:

```ts
  describe('scheduled jobs', () => {
    it('writes the compliance audit row of each tenant under that tenant', async () => {
      jest.useFakeTimers({
        now: new Date('2026-12-20T03:00:00Z'),
        doNotFake: ['setImmediate', 'setTimeout', 'nextTick'],
      });
      try {
        await app.get(ComplianceAlertsService).checkComplianceAlerts();
      } finally {
        jest.useRealTimers();
      }
      const rows = await db.admin(
        async (c) =>
          (
            await c.query<{ tenant_id: string }>(
              `SELECT tenant_id FROM audit_logs WHERE action = 'COMPLIANCE_ALERT'`,
            )
          ).rows,
      );
      expect(new Set(rows.map((r) => r.tenant_id))).toEqual(
        new Set([a.id, b.id]),
      );
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/scheduler` and `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice -t "scheduled jobs"`
Expected: FAIL (the job writes its audit row with no tenant: NOT NULL violation, logged and swallowed, no rows).

- [ ] **Step 3: Implement**

`src/scheduler/compliance-alerts.service.ts` — split the body so the cron entry decides how often to run it:

```ts
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';
import { isTenancyEnforced } from '../database/tenancy/tenancy-mode';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly tenantJobs: TenantJobRunner,
  ) {}

  @Cron('0 8 * * *') // 8am daily
  async checkComplianceAlerts(): Promise<void> {
    if (!isTenancyEnforced()) return this.runCheck();
    await this.tenantJobs.forEachTenant(() => this.runCheck());
  }

  /** The check for the tenant in scope (the whole ward in legacy mode). */
  async runCheck(): Promise<void> {
    this.logger.log('Running compliance alerts check...');
    // ... the existing body of checkComplianceAlerts, unchanged except the emit below
  }
```
and replace `this.notificationsGateway.server?.emit('compliance_alert', summary);` with `this.notificationsGateway.emitToTenant('compliance_alert', summary);`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/scheduler` and `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler test/tenancy-slice.e2e-spec.ts
git commit -m "feat(tenancy): run the compliance check once per tenant

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: M0 gate — legacy regression, full verification, documentation

**Files:**
- Modify: `.env.example`, `.env.docker.example`, `Web/backend/docs/migrations.md`, `docs/superpowers/specs/2026-11-18-multi-tenant-design.md`, `PROGRESS.md`
- Create: `Web/backend/docs/tenancy.md`

- [ ] **Step 1: Run the whole legacy regression (nothing may change)**

```bash
cd C:/MMS/Web/backend
npx tsc --noEmit && npx eslint "{src,test}/**/*.ts" && npx jest --silent
export MIGRATION_TEST_ADMIN_URL=postgres://mms:<password>@localhost:5440/postgres TEST_REDIS_URL=redis://localhost:6379
npx jest --config ./test/jest-e2e.json --runInBand
npx nest build
```
Expected: tsc 0; eslint 0 errors and 0 warnings; the unit suite passes; **all 12 pre-existing e2e suites pass in legacy mode** plus the three tenancy suites (`tenancy-rls`, `tenancy-binding`, `tenancy-slice`); build exit 0. A pre-existing suite that fails is a regression of the legacy path — fix the cause, never the test.

- [ ] **Step 2: Isolation gate review (the M1 go/no-go)**

Confirm each M0 exit criterion with the evidence of the run and write the table into `PROGRESS.md`:

| Criterion | Evidence |
|---|---|
| No scope ⇒ zero rows in all 9 tables | `tenancy-rls` test 1 |
| Cross-tenant write refused (insert, update-to-other-tenant) | `tenancy-rls` test 4 |
| Interleaved tenants never mix on a shared pool; transaction and query runner scope-pinned | `tenancy-binding` |
| Guard chain adopts the tenant before the session check; unknown tenant indistinguishable from a wrong password | `tenancy-slice` sign-in |
| Canary absent from every list route and the xlsx export; id sweep 404; differential equal | `tenancy-slice` HTTP + exports |
| Files on disk per tenant; purge runs per tenant | `tenancy-slice` files |
| Rooms namespaced; handler runs under the socket tenant; no global broadcast | `tenancy-slice` sockets |
| Cron writes per tenant | `tenancy-slice` jobs |
| Audit rows carry the tenant | `tenancy-slice` HTTP |
| Legacy mode untouched | Step 1 |
| Enforced boot refuses a database that kept the legacy tenant default | `tenancy-binding` guard test |
| **Not closed in M0 (recorded, M1 gate):** cross-tenant REFERENCES — single-column foreign keys are checked as the table owner and bypass RLS, so a tenant can point a row at another tenant's row id and that tenant's deletes can cascade or be blocked. Closed in M1 by composite `(tenant_id, id)` foreign keys | `tenancy-rls` has no test for it by design; add the reproduction as a failing test first thing in M1 |

If any row is not green, M0 is not done and M1 does not start.

- [ ] **Step 3: Documentation**

- `Web/backend/docs/tenancy.md`: how the scope flows (middleware → guard `adopt` → hook → RLS), the two modes, the roles and how to provision them (`ALTER ROLE mms_app LOGIN PASSWORD …`, `DB_USER=mms_app`, `MIGRATION_DATABASE_URL` stays the owner), why `installExtensions: false`, the PgBouncer warning, and the M1 reset `ALTER DATABASE <db> RESET app.tenant_id`.
- `.env.example` / `.env.docker.example`: document `TENANCY_MODE=legacy|enforced` (default `legacy`).
- `Web/backend/docs/migrations.md`: 036/037 and the legacy database default.
- Design spec: record the M0 deviations — migrations are `036`/`037` (M1 uses `038+`); `DbScope` has a single tenant kind (jobs use the same scope as requests); the revocation feed carrying the tenant is M1.
- `PROGRESS.md`: the M0 result, the gate table from Step 2, and the NOT-in-M0 list as the M1 queue.

- [ ] **Step 4: Commit**

```bash
git add Web/backend/docs .env.example .env.docker.example docs PROGRESS.md
git commit -m "docs(tenancy): M0 gate result, tenancy guide and environment notes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (M0 scope of the design spec):** tenancy core with immutable runner scope (Tasks 1–2) · roles `mms_app`/`mms_platform` and the narrow SECURITY DEFINER functions (Task 3) · RLS, `tenant_id` and per-tenant uniques on the slice (Task 3) · hook wiring, middleware before handlers, seeder, job runner (Task 4) · guard adopts the scope before later guards, login by tenant code, unknown tenant indistinguishable (Task 5) · canary, id and differential isolation proof, audit regression, export (Task 6) · file paths and purge (Task 7) · socket handshake, handler and room isolation, broadcast removed (Task 8) · cron per tenant (Task 9) · full regression and gate (Task 10). Spec items left for later milestones are listed under "NOT in M0".

**Placeholder scan:** none. Steps that adapt existing specs name the exact helper or assertion to change (`buildGuard`, `buildService`, room-name literals) because those specs' construction helpers are not reproduced here; each states the contract the assertion must hold.

**Type consistency:** `TenantContext.{start,runAs,adopt,current,requireTenantId}` and `scopeKey` are defined in Task 1 and used with those names throughout; `bindTenantToConnections` (Task 2) is the only name used in Task 4; `TenantJobRunner.forEachTenant(job)` returns `TenantJobOutcome[]` (Task 4) and Tasks 7 and 9 ignore or consume only that shape; `rooms.*(tid, …)` (Task 8) matches `gpsRoomOf(user, tid)`, `gpsWardRoom(tid)`, `gpsUnitRoom(tid, code)`; `FilesService.tenantUploadDir()` and `contentPath()` (Task 7) are the only path helpers used.

**Known risk to watch during execution:** `app.tenant_id` is a custom GUC; any connection path that bypasses TypeORM's `obtainMasterConnection` (a second `pg.Pool`, the LISTEN client) sees the database default instead of a written scope. The LISTEN client reads no tables; add any new pool to the hook before it touches slice tables.

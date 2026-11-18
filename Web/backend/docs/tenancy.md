# Multi-tenancy (M0 vertical slice)

MMS is moving from one ward to many. Tenants share one database; PostgreSQL Row-Level
Security (RLS) keeps their rows apart. Milestone M0 proves that boundary on nine
representative tables, with two tenants, over every channel (HTTP, transactions, sockets,
cron jobs, files, exports). The design is in
`docs/superpowers/specs/2026-11-18-multi-tenant-design.md`; the evidence behind the M0
gate is in `PROGRESS.md`.

**Read this first: M0 is not a production switch.** Only these tables are tenant-isolated:
`users`, `units`, `militia_profiles`, `tasks`, `task_assignments`, `files`,
`notifications`, `notification_receipts`, `audit_logs`. The other ~60 tables have no
`tenant_id` yet (M1). Production keeps running in `legacy` mode until M1 lands.

## The two modes

`TENANCY_MODE` is read at startup. The default is `legacy`; any other value than `legacy`
or `enforced` fails startup with a `TenancyConfigError`.

| | `legacy` (default) | `enforced` |
| --- | --- | --- |
| Use it for | Every real deployment until M1 | The tenancy e2e suites, and the M1 rollout |
| Tenant on the connection | Never written. The database default (`app.tenant_id` = the first tenant, set by migration 037) applies to every session | Written on **every** connection checkout from the request scope; "no scope" is written as the empty string and sees nothing |
| Sign-in | `{username, password}` as before; a stray `tenantCode` is ignored | `POST /auth/login {tenantCode, username, password}`; tokens carry `tid`; a token without `tid` is refused |
| Database user | Any, as today (`DB_USER=mms` in the sample env files) | Must be `mms_app` (`NOSUPERUSER NOBYPASSRLS`); a superuser or BYPASSRLS role is refused at boot |
| Socket rooms | `t:legacy:...` | `t:<tenantId>:...` |
| Uploads | Flat: `<UPLOAD_DIR>/<key>` | `<UPLOAD_DIR>/<tenantId>/<key>` |
| Scheduled jobs | Run once, unscoped | Run once per tenant, each under that tenant's scope |

Legacy mode changes no behaviour except the socket room names (see "Rolling deploy").

## How the tenant scope flows

```
 HTTP request
     |
     v
 TenantScopeMiddleware        TenantContext.start(): an empty AsyncLocalStorage store for
     |                        this request. Registered as Nest module middleware so it runs
     |                        after body parsing (an earlier store would be lost there).
     v
 JwtAuthGuard                 verifies the token, reads its `tid`, TenantContext.adopt({tenantId})
     |                        BEFORE the session check, so every later guard, interceptor and
     |                        handler runs in the same scope. Sign-in adopts the tenant it
     |                        resolved from the tenant code, before the password is checked.
     v
 guards, handler, services    repository, transaction, query runner, dataSource.query: all alike
     |
     v
 bindTenantToConnections      wraps PostgresDriver.obtainMasterConnection. On every pooled
     |                        checkout: SELECT set_config('app.tenant_id', <tid or ''>, false),
     |                        outside any transaction, and the client is pinned to that scope.
     |                        A query made under a different scope than the one the client was
     |                        taken in throws `tenant_scope_mismatch` (so runAs inside an open
     |                        transaction, or a query runner reused across scopes, fails loudly).
     v
 PostgreSQL RLS               tenant_id = app_tenant_id()  in USING and WITH CHECK, ENABLE + FORCE
```

Other ways into a scope, all through `TenantContext`:

- **Sockets.** The handshake verifies the token and adopts its `tid`; every
  `@SubscribeMessage` handler runs through `WsTenantScopeInterceptor`, which wraps the
  handler in `TenantContext.runAs({ tenantId: client.data.user.tid })`.
- **Scheduled jobs.** `TenantJobRunner.forEachTenant(job)` lists the tenants through the
  `maintenance_tenant_ids()` SECURITY DEFINER function and runs `job(tenantId)` under
  `runAs` for each. One failing tenant is logged and does not stop the others; the result
  is a `TenantJobOutcome[]`. **Callers must branch on `isTenancyEnforced()`**: in legacy
  mode the runner would run the job once per tenant on an unscoped session, so call the
  job once directly instead (see `FilesService` purge and `ComplianceAlertsService`).
- **The seeder** runs as the first tenant (`a1000000-0000-4000-8000-000000000001`, code
  `phu-dinh`).

The scope has a single kind, a tenant id. Jobs use the same scope as requests.

`TenantScopeError` (no scope, scope mismatch) is not mapped to an HTTP status yet and
surfaces as 500; it signals a programming error, not a client mistake (M1 queue in
`PROGRESS.md`). TypeORM wraps the error thrown inside a query as a `QueryFailedError` and
copies `code` onto it, so match on `code` (for example `tenant_scope_mismatch`), never
with `instanceof TenantScopeError`.

## Database roles and provisioning

Migration 036 creates two cluster-wide roles, both `NOLOGIN NOSUPERUSER NOBYPASSRLS`:

| Role | Purpose | Business tables |
| --- | --- | --- |
| `mms_app` | The application at runtime | `SELECT/INSERT/UPDATE/DELETE`, subject to RLS; no access to `schema_migrations`; read-only on `tenants` (its own row) |
| `mms_platform` | Reserved for the M2 platform API | None. It manages `tenants` and nothing else |

Roles are cluster-wide, not per database. Two databases on one server share them, and the
tests that set their passwords must run serially.

**Provision `mms_app` once per cluster, as a superuser, after the migrations ran:**

```sql
ALTER ROLE mms_app LOGIN PASSWORD '<a generated secret>';
```

Then point the application at it and leave the migrator on the owner:

```sh
# application (read by src/config/configuration.ts)
DB_USER=mms_app
DB_PASSWORD=<the secret above>
TENANCY_MODE=enforced

# migrator: the owner. DATABASE_URL wins over DB_* for the migration CLI and is ignored by
# the application, so the same container environment can carry both.
DATABASE_URL=postgres://mms:<owner password>@<host>:5432/<db>
```

The migrator reads `DATABASE_URL`, or `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/
`DB_NAME` when it is unset (see `migrations.md`). There is no separate
`MIGRATION_DATABASE_URL` variable; the design spec uses that name for the same idea.
The Docker image migrates before it starts the server with the same environment, so with
`DB_USER=mms_app` you **must** set `DATABASE_URL` to the owner, or set
`RUN_MIGRATIONS=false` and migrate in a release step.

**The migrator must be a superuser or a BYPASSRLS role.** Migration 037 runs
`ALTER DATABASE <db> SET app.tenant_id = ...` and enables `FORCE ROW LEVEL SECURITY` on
the slice tables. FORCE applies RLS to the table owner too: a plain owner role is locked
out of its own tables, and the database-level setting needs more than table ownership.
M0 supports only the superuser migrator the project already uses (the bootstrap
`POSTGRES_USER` of the Docker images is one).

`mms_platform` stays `NOLOGIN` in M0; nothing connects as it.

## Boot guards (enforced mode only)

`tenantAwareDataSource` (`src/database/typeorm.options.ts`) runs these once, after the pool
is up, and destroys the pool and refuses to start on a failure. All failures are
`TenancyConfigError`, which `toRetry` excludes, so the TypeORM module does not retry nine
times, 3 s apart, before giving up.

| Guard (`src/database/tenancy/boot-guards.ts`) | Refuses when | Fix |
| --- | --- | --- |
| `assertNoLegacyTenantDefault` | Any database-wide or role setting `app.tenant_id=...` exists for this database. A session without a scope would then see the first tenant instead of nothing | `ALTER DATABASE <db> RESET app.tenant_id` (and `ALTER ROLE ... RESET app.tenant_id`) |
| `assertRuntimeRoleEnforcesRls` | `current_user` is a superuser or has BYPASSRLS, or cannot be checked | Connect as `mms_app` |
| `tenancyMode()` | `TENANCY_MODE` is neither `legacy` nor `enforced` | Fix the value; a typo must not silently turn isolation off |

Consequence: **`DB_USER=mms`, as in `.env.example` and `.env.docker.example`, is refused
under `enforced`** because `mms` is a superuser in the sample databases. Set
`DB_USER=mms_app` and `DB_PASSWORD` together with `TENANCY_MODE=enforced`.

A database that was migrated to 037 keeps the legacy default until you remove it, so
enforced mode will not start on it. That is intended. **The M1 cutover step is
`ALTER DATABASE <db> RESET app.tenant_id`**, and only after every replica runs
`enforced`: a legacy replica on a non-bypass role would see no rows afterwards.

## Why `installExtensions: false`

On connect, TypeORM's PostgreSQL driver runs `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
(and the other extensions its entity metadata asks for) unless `installExtensions` is
`false`. `mms_app` is not allowed to create extensions, so that statement would fail on
the first connection. The extensions the schema needs (`unaccent`, `uuid-ossp`) are
created by migration 001, run by the owner, so the application has nothing left to
install. `typeorm.options.ts` sets `installExtensions: false` in every mode; the migrations,
not the runtime, own the schema and its extensions.

## Operational warnings

- **PgBouncer in transaction-pooling mode is not supported.** The scope is a session
  setting (`set_config(..., false)`) written when a connection is checked out. A
  transaction pooler hands the next statement another server connection, with another
  session's tenant. Connect directly, or use session pooling.
- **No replication in the TypeORM options.** `bindTenantToConnections` refuses a replicated
  data source (read replicas would not be bound).
- **Every new connection path must go through the hook.** `app.tenant_id` is a custom
  setting; a second `pg.Pool`, or any client that bypasses `obtainMasterConnection`, sees
  whatever the database default is. The LISTEN client of the revocation feed reads no
  tables, which is why it is safe. Add any new pool to the hook before it touches a
  tenant table.
- **Existing upload files are not moved.** Enforced mode reads and writes
  `<UPLOAD_DIR>/<tenantId>/<storageKey>`; files already on disk in the flat layout are not
  found (the download answers 404 and the abandoned-upload purge cannot remove them). A
  move script is an M1 item. `files.storage_key` stays globally unique.
- **Rolling deploy and room names.** Socket room names changed in this release:
  `user:<id>` became `t:legacy:user:<id>` in legacy mode and `t:<tenantId>:user:<id>` in
  enforced mode (same for `unit:`, `gps:`, `conv_`, and the new tenant-wide `t:<id>`).
  Through the Redis adapter, an old replica and a new replica do not receive each other's
  room events while both run. The effect is transient; drain old replicas, or accept a
  short gap in live updates.
- **Everyone signs in again at the enforced cutover.** Tokens issued before it carry no
  `tid` and are refused; clients fall back to the sign-in screen.
- **Known M0 gaps** (planned for M1, listed in `PROGRESS.md`): MFA, recovery and
  password-reset flows under `enforced` (their challenge tokens carry no `tid`), per-tenant
  lockout keys, cross-tenant references (single-column foreign keys are checked as the
  table owner and bypass RLS), and suspended tenants keeping their existing sessions.

## Extending the slice (M1 and later)

- A new tenant table needs `tenant_id uuid NOT NULL DEFAULT app_tenant_id()` referencing
  `tenants(id)`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and the `tenant_isolation`
  policy (`FOR ALL TO mms_app USING (tenant_id = app_tenant_id()) WITH CHECK
  (tenant_id = app_tenant_id())`) exactly as migration 037 does, plus natural keys unique
  per tenant: `(tenant_id, code)`, not `code`. Add it to `SLICE_TABLES` in
  `test/support/tenancy.ts`, so the "no scope shows nothing" and "RLS forced" proofs
  cover it.
- `ON CONFLICT` targets must name the per-tenant unique constraint
  (`ON CONFLICT (tenant_id, code)`).
- Scheduled work goes through `TenantJobRunner.forEachTenant`, branching on
  `isTenancyEnforced()`.
- Socket rooms come only from `src/notifications/rooms.ts`. There is no global
  broadcast; use `emitToTenant`.
- File paths come only from `FilesService.tenantUploadDir()` and `contentPath()`.

## Running the e2e suites

The e2e suites need the Postgres and Redis containers (`mms-postgres-1` on port 5440,
`mms-redis-1` on 6379) and an admin URL that can create databases and roles:

```sh
cd Web/backend
export MIGRATION_TEST_ADMIN_URL=postgres://mms:<password>@localhost:5440/postgres
export TEST_REDIS_URL=redis://localhost:6379
```

- **`--runInBand` is mandatory.** `mms_app` and `mms_platform` are cluster-wide roles whose
  passwords the suites set; two Jest workers would race on them. Each suite creates its
  own database and drops it afterwards.
- **Run one file per Jest process** for the gate:

  ```sh
  for f in test/*.e2e-spec.ts; do
    npx jest --config ./test/jest-e2e.json --runInBand "$f" || break
  done
  ```

  Running the whole directory in one process can fail `app.e2e-spec`, intermittently: its
  Terminus health check allows 300 MB of `memory_heap`, and once enough suites have loaded
  into the same process the check answers 503 (it did in the first full runs of earlier M0
  tasks and passed in the final one). That is a test-harness artefact (the heap grows with
  the number of suites), not a product defect; the suite passes alone or first.
- The enforced-mode suites (`tenancy-binding`, `tenancy-slice`) import
  `test/support/enforced-env.ts`, which sets `TENANCY_MODE=enforced`, `DB_USER=mms_app`,
  its test password and a temporary `UPLOAD_DIR`; `test/support/tenancy.ts` creates the
  database (resetting the legacy default, as enforced mode requires), the two seeded
  tenants and the helpers. The other suites run in legacy mode, untouched.
- Unit tests need no database: `npx jest`.

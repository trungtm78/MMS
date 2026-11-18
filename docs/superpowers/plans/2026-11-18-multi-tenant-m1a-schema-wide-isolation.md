# Multi-tenant M1a — Schema-wide Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the tenant isolation that M0 proved on nine tables to all 66 tenant tables, close cross-tenant references with composite foreign keys, and prove the result by running every pre-existing e2e suite in `TENANCY_MODE=enforced` as `mms_app`, plus a route-discovery canary and differential sweep of every route.

**Architecture:** Three migrations follow the online pattern of spec decision D16. `038` runs outside a transaction: it adds `tenant_id` to the 57 remaining tables and builds every new unique and foreign-key index `CONCURRENTLY`. `039` is one short transaction: it attaches the per-tenant unique keys, rewrites the 114 foreign keys between tenant tables as composite `(tenant_id, …)` keys `NOT VALID`, enables RLS, and revokes the default privileges. `040` runs outside a transaction and validates every foreign key online. The migration runner gains a documented non-transactional mode and a `--through` stop. Failing guards come first: a catalog schema guard, a cross-tenant reference reproduction, a catalog-driven canary seeder with whole-schema RLS proofs, and a route-discovery sweep skeleton. They turn green when the migrations land. The existing e2e suites then run in both modes through a central harness switch (`E2E_TENANCY=enforced`), and every defect that run exposes is fixed at its root.

**Tech Stack:** NestJS 11, TypeORM 0.3.28, pg 8.20, PostgreSQL 16 (composite FKs, `ON DELETE SET NULL (col)`, `UNIQUE NULLS NOT DISTINCT`, `ADD CONSTRAINT … USING INDEX`, verified on 16.15), Socket.IO 4.8, jest 30 + ts-jest, supertest, socket.io-client, exceljs, class-validator 0.15. Backend root: `C:\MMS\Web\backend`. Unless a path says otherwise, it is relative to that root.

## Global Constraints

- English identifiers, comments and commit messages; Vietnamese only in user-facing strings. Commit trailer exactly: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by name (never `git add -A`); never push.
- TDD: every behaviour gets a failing test first, and you run it and watch it fail for the stated reason before you implement. No `eslint-disable`, `ts-ignore`, `any`, empty `catch`, fixed sleeps or skipped tests. Lint is binding: `npx eslint "{src,test}/**/*.ts"` must report 0 errors and 0 warnings. Assert errors with `thrownBy(...)` + `toMatchObject` for synchronous code and `await expect(p).rejects.toMatchObject(...)` for promises; never `toThrow(expect.objectContaining(...))`.
- Applied migrations 001–037 are never edited (checksum-locked). New files: `migrations/038_tenant_columns_online.sql`, `migrations/039_tenant_isolation_cutover.sql`, `migrations/040_tenant_validate_online.sql`.
- First tenant: `a1000000-0000-4000-8000-000000000001`, code `phu-dinh`. From Task 11 on, code imports it from `src/database/tenancy/first-tenant.ts`. SQL repeats the literal, and a unit test keeps the two equal.
- RLS template, everywhere: `CREATE POLICY tenant_isolation ON <t> FOR ALL TO mms_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())`, with `ENABLE` and `FORCE ROW LEVEL SECURITY`. The column is `tenant_id uuid NOT NULL DEFAULT app_tenant_id()` with a validated FK to `tenants(id)`.
- Never loosen a policy, never weaken, skip or delete a test assertion to make a run pass. A fixture or harness may be adapted only through the helpers named in Task 13, and each adaptation is recorded.
- The legacy database default (`ALTER DATABASE … SET app.tenant_id`) stays. `TENANCY_MODE` keeps defaulting to `legacy`. Both change in M1b, not here.
- Run e2e suites **one file per Jest process** with `--runInBand`, because a single-process run trips the Terminus heap check in `app.e2e-spec`. Environment, set once per shell:

  ```bash
  cd /c/MMS/Web/backend
  PW=$(docker inspect mms-postgres-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_PASSWORD=//p')
  export MIGRATION_TEST_ADMIN_URL="postgres://mms:${PW}@localhost:5440/postgres" TEST_REDIS_URL=redis://localhost:6379
  ```

- Verify gate for every task: `npx tsc --noEmit`, `npx eslint <touched files>`, the task's tests, and the unit specs of every touched module. The full unit suite and every e2e suite in both modes run in Task 24.
- Do not touch the `mms_db` database. Use throwaway databases only: the e2e helpers create and drop their own.

## Decisions taken by this plan

### Table classification (66 tenant tables, 6 global)

This classification comes from the real schema (migrations 001–037; 72 tables, 127 foreign keys). Global tables are listed with the reason and the privileges each application role may hold. Every other table is a tenant table. The schema guard (Task 1) enforces this, so a new table fails CI until its migration either isolates it or adds it to `GLOBAL_TABLES` on purpose.

| Table(s) | Class | Unique keys after 039 | Reason |
|---|---|---|---|
| `schema_migrations` | global (no app privilege) | — | migrator only |
| `tenants` | global (`mms_app` SELECT own row; `mms_platform` S/I/U) | `lower(code)` | the registry itself |
| `roles`, `permissions`, `role_permissions` | global, **read-only** for `mms_app` (039 revokes I/U/D) | as today | catalogue seeded by migrations, identical for every tenant. No code writes them (grep: no `INSERT/UPDATE/DELETE` on `roles` in `src`). A tenant must not redefine a role for all tenants |
| `login_attempts` | global (`mms_app` DML) | `name_hash` | written before any tenant is known. Per-tenant HMAC keys are M1b |
| `kpi_criteria` | tenant | `(tenant_id, code)` | spec D19 provisions default KPI criteria **per tenant**: a local policy |
| `payroll_rules` | tenant | `(tenant_id, rule_code)` | allowance rules and their effective dates are decided by each locality |
| `outbox_events` | tenant (RLS) | — | unused today. `aggregate_id` points at tenant rows, so it fails closed. If M2 adopts it as `mail_outbox` (spec: "cân nhắc"), M2 must move it to `GLOBAL_TABLES` explicitly, and the guard forces that decision |
| `alerts` | tenant | — | targets users and roles of one tenant |
| `organization_units` | tenant | — | ward structure; `commander_id` → `militia_profiles` |
| `user_roles`, `user_unit_scopes` | tenant | PKs keep their FK columns | the rows describe a tenant's user. `user_roles.role_id → roles` stays a single-column FK to the global catalogue (`GLOBAL_REFERENCES`) |
| `sessions`, `devices`, `device_tokens` | tenant | `(tenant_id, fingerprint)`, `(tenant_id, push_token)` | a session belongs to the user's tenant. M0 already adopts `tid` before every session lookup. A device that changes tenant (D18) re-registers inside the new tenant instead of colliding with a row it cannot see |
| `auth_challenges`, `mfa_temp_tokens`, `mfa_recovery_codes`, `recovery_codes`, `user_password_history`, `notification_preferences` | tenant | — | per-user data. Pre-auth access goes through the tenant carried in the token (Task 14) |
| `system_settings` | tenant | PK `(tenant_id, key)`, name `system_settings_pkey` kept | per-tenant settings (D19, S6) |
| `conversations` | tenant | partial `(tenant_id, direct_key)`, **index name `uq_conversations_direct_key` kept** (`test/migrations.e2e-spec.ts:806` names it) | the pair key only needs to be unique within a tenant |
| `files` | tenant | `storage_key` **stays globally unique** (`GLOBAL_UNIQUE_EXCEPTIONS`) | a server-made UUID that names the file on disk. One key maps to one file in every directory layout, including the M1c move. The existence oracle is negligible |
| `incidents`, `leave_requests` | tenant | `(tenant_id, code)` | record codes are per tenant (`record-code.ts`) |
| `leave_types` | tenant | `(tenant_id, code)` | catalogue provisioned per tenant (D19) |
| `kpi_periods`, `payroll_periods` | tenant | `(tenant_id, year, month)` | |
| `police_profiles` | tenant | `(tenant_id, badge_no)`, `(tenant_id, cccd)` | |
| `weapons` | tenant | partial `(tenant_id, serial_number)` | |
| `training_plans` | tenant | `UNIQUE NULLS NOT DISTINCT (tenant_id, unit_id, year, training_type)`, **name `uq_training_plans_unit_year_type` kept** (`training-plans.service.ts:308` `ON CONFLICT ON CONSTRAINT`) | `unit_id` is nullable, so without `tenant_id` two tenants' ward-level plans would collide |
| all other tables (`attendance_records` … `work_reports`) | tenant | existing uniques already contain a NOT NULL tenant-scoped FK column | |

### Parent keys, foreign keys and indexes (inventory from the catalog)

- **114 foreign keys between tenant tables** (113 single-column, plus the 2-column `fk_training_records_session_attendance`) become `(tenant_id, …)` keys with the same name and delete rule (43 CASCADE, 38 RESTRICT, 7 NO ACTION). The 26 nullable `SET NULL` keys become `ON DELETE SET NULL (<col>)`, so they never clear `tenant_id`. No FK has an `ON UPDATE` action or is deferrable; 039 asserts this.
- **24 parent tables** get `UNIQUE (tenant_id, id)`, named `uq_<table>_tenant_row`. `training_session_attendance` gets `(tenant_id, session_id, militia_id)`.
- **113 FK indexes** `ix_<child>_tenant_<cols>` on `(tenant_id, <fk cols>)`, one per composite FK. The 114th FK is covered by its parent key. The existing check `test/migrations.e2e-spec.ts:204` ("indexes every foreign key on the tables added in 019") requires an index whose leading columns are exactly the FK columns. Under RLS every query carries `tenant_id = app_tenant_id()`, so these are the right indexes. The single-column indexes they supersede are dropped in M1b, after the enforced flip removes legacy mode, which queries without a tenant predicate.
- **14 list indexes** `(tenant_id, created_at DESC)` (`gps_points`: `captured_at`). `alerts` and `outbox_events` get one because they would otherwise have no index that leads with `tenant_id`.
- **Privileges:** 039 revokes the `ALTER DEFAULT PRIVILEGES … GRANT … TO mms_app` of 036. That grant would hand the runtime role every future table, including the `platform_*` tables of M2. From 039 on, a migration grants each new table explicitly. The guard checks every table against an explicit privilege list, and checks that a table created after 039 grants nothing.

### How both modes keep working after 039

- **Legacy** (`TENANCY_MODE=legacy`, the database default `app.tenant_id = <first tenant>` present). Every session that writes no tenant inherits the first tenant, so new rows get it through `DEFAULT app_tenant_id()`. Every existing row got it as the constant default of 038. All rows belong to one tenant, so every composite FK matches. A superuser or `BYPASSRLS` application role skips RLS. `mms_app` or a member of it sees exactly the first tenant's rows on all 66 tables, as it did on nine in M0. The boot guards of M0 (`legacy_tenant_default_missing`, `legacy_role_blocked_by_rls`) are unchanged.
- **Enforced** (the default reset; the application runs as `mms_app`). The hook writes the request scope on every checkout. All 66 tables answer only for that tenant, and composite FKs refuse references to another tenant's rows (`23503`).
- 039 is an **incompatible release**, like 037: it changes `ON CONFLICT` targets. Deploy it drained (`docs/migrations.md`). 038 can run online beforehand with `--through=038_tenant_columns_online.sql` (Task 6).

## NOT in M1a

- **M1b (auth hardening and the cutover):** challenge `tid` for the activation and password-reset flows (spec 2A/4A, built with `account_tokens` in M2 and M1b). The MFA sign-in challenges are **moved into M1a** (Task 14, see below). Also in M1b: per-tenant login-lockout keys `HMAC(tenantCode‖NUL‖username)` with `TRUNCATE login_attempts`; tenant status re-checked on live sessions (guard and refresh); `/meta/client-compat` and the client-version header; the role rename `system_admin → tenant_admin` (its own commit, about 146 files); the AuditInterceptor prefix bug with redaction, plus the audit settle step for the slice differential; flipping the default `TENANCY_MODE` to `enforced`; `ALTER DATABASE … RESET app.tenant_id` as the cutover step; wiring `mms_app` into the compose files and env examples; dropping the single-column FK indexes superseded by Task 8; measuring the unknown-tenant sign-in timing.
- **M1c (clients and files):** the tenant-code input and storage in web, PoliceApp and MilitianApp; the flat-file move script into `<UPLOAD_DIR>/<tenantId>/<key>` and its read-fallback decision; the UploadInterceptor unit spec.
- **M2+:** the `mms_tenant_state` trigger (D21), the platform DataSource and a dedicated `SECURITY DEFINER` owner, `provision_tenant`, licensing, branding and mail.

**Moved from M1b into M1a, because M1a's own gate needs it:** MFA sign-in challenge tokens carry the tenant (Task 14). `test/api-contract.e2e-spec.ts:946-1080` enrols a TOTP and signs in through `/auth/mfa/verify` and `/auth/mfa/login`. Under `enforced` those calls run with no tenant scope (the challenge row is behind RLS, and `signInUser` calls `requireTenantId()`), so "every pre-existing suite green in enforced mode" cannot hold without it.

## M1 queue disposition (PROGRESS.md "M1 queue / tech debt from M0")

| Queue item | M1a? | Where / why |
|---|---|---|
| Start-of-M1 test (1): cross-tenant reference reproduction | IN | Task 2 (RED), green in Task 10 |
| Start-of-M1 test (2): DiscoveryService sweep, unmapped parameter fails | IN | Task 4 (skeleton, RED), Task 21 (sweep), Task 22 (differential) |
| Start-of-M1 test (3): schema guard incl. no `mms_app` privilege on future platform tables | IN | Task 1 (RED), green in Task 10 |
| Measure 037/038-style lock windows on a production-sized copy | IN (synthetic volume) | Task 23. Rehearsal on a real production copy is M5 (spec) |
| 1 Clients send no `tenantCode` | DEFERRED M1c | client work. M1a adds the server fallback `LEGACY_DEFAULT_TENANT_CODE` (Task 12, spec D17) |
| 2 `ALTER DATABASE RESET` as cutover | DEFERRED M1b | the cutover itself |
| 3 Env examples/compose `DB_USER=mms` | DEFERRED M1b | belongs with turning enforced on. M1a documents `LEGACY_DEFAULT_TENANT_CODE` only |
| 4 Flat-file move script | DEFERRED M1c | |
| 5 Unknown-tenant timing | DEFERRED M1b | auth hardening |
| 6 MFA/recovery/reset carry `tid` | **MFA sign-in IN (Task 14)**; activation/reset DEFERRED M1b/M2 | reason above; activation and reset do not exist yet |
| 7 Per-tenant lockout keys | DEFERRED M1b | |
| 8 Suspended tenants keep sessions | DEFERRED M1b | |
| 9 Revocation announcement carries `tid` | IN | SQL in Task 9 (039), consumer in Task 17 |
| 10 `TenantScopeError` HTTP mapping | IN | Task 15 |
| 11 Chat tables without tenant/RLS | IN | Tasks 8–10 |
| 12 `/notifications` total by `user_id` | IN | composite FKs make a cross-tenant receipt impossible (Task 3 FK proof); the route is in the sweep (Task 21) |
| 13 AuditInterceptor prefix bug | DEFERRED M1b | its own task with redaction |
| 14 gps-retention per tenant; login-attempts purge unscoped | IN | Task 16; `login_attempts` is global (Task 1) |
| 15 `files.storage_key` global | IN (decision) | `GLOBAL_UNIQUE_EXCEPTIONS`, Task 1 |
| 16 Role rename | DEFERRED M1b | |
| 16 `CONCURRENTLY` builds, the ~60 tables | IN | Tasks 5–10 |
| 16 Lint rule banning `server.emit(` | IN | Task 17 |
| 16 Platform API, licensing, branding, mail | DEFERRED M2/M3 | |
| 17 Heap check / one file per process | IN | Task 13 `scripts/run-e2e.mjs` runs one file per process. The product threshold is unchanged: it is correct for a server |
| 18 Role hygiene (`NOLOGIN`, random passwords, swallowed errors) | IN | Task 13 |
| 19 Rolling deploy and room names | no action | M1a changes no room name (documented in `tenancy.md`) |
| Triage T1: lower-case tenant ids; adopt-refusal, invalid-UUID, empty `TENANCY_MODE` tests | IN | Task 11 |
| Triage T2: `bindTenantToConnections` guards and test gaps | DEFERRED M1b | nothing in M1a touches `bind-tenant.ts`; these are test gaps on code already proven |
| Triage T3: role e2e gaps | IN | Task 1 (privilege matrix + behavioural checks) |
| Triage T3: pin `constraint.includes('email'\|'cccd')` | IN | Task 1 (`code-named constraints` test) |
| Triage T3: single first-tenant constant; `isTenancyEnforced()` once at boot | IN | Task 11 |
| Triage T3: non-superuser migrator | DEFERRED M2 | needs the dedicated function owner |
| Triage T4: mode-aware `TenantJobRunner` | IN | Task 16 |
| Triage T4: hard-coded `mms` in tenancy-binding; duplicated `eventually` | IN | Task 13 |
| Triage T4: `warn.mockRestore` placement in `typeorm.options.spec` | IN | Task 11 |
| Triage T5: `resolveLoginTenant` public, `requireTenantCode` twice, bcrypt-order test, `mockImplementation` leak | IN | Task 12 |
| Triage T5: known-tenant probe uses a nonexistent username | DEFERRED M1b | timing work |
| Triage T6: `auditRowsOf` first-row; shared-code test via API | DEFERRED M1b | the first needs the audit settle step of item 13. The second cannot force the generator's random suffix through the API; per-tenant code uniqueness is proven at DB level in Task 9 |
| Triage T7: UploadInterceptor spec | DEFERRED M1c | |
| Triage T7: `purgeEveryTenant` discards outcomes | IN | Task 16 |
| Triage T8: `handleConnection` non-UUID `tid`; GPS emit bypasses `currentTid`; interceptor `defer()` case; `closeRevoked` scan | IN | Task 17 |
| Triage T8: interceptor refusal ack | DEFERRED (unreachable, cosmetic) | |
| Triage T9: `runCheck` swallows errors; date-dependent unit test; identical payloads in e2e; `emitToTenant` null guard | IN | Tasks 16–17 |

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `test/support/tenancy-catalog.ts` (new) | `GLOBAL_TABLES` with reasons and allowed privileges, `GLOBAL_UNIQUE_EXCEPTIONS`, `GLOBAL_REFERENCES`, `SECURITY_DEFINER_FUNCTIONS`, `publicTables()`, `tenantTables()` | 1 |
| `test/tenancy-schema-guard.e2e-spec.ts` (new) | Catalog guard: columns, RLS, policy, FKs, uniques, indexes, privileges, default ACLs, DEFINER functions, views, code-named constraints | 1 |
| `test/tenancy-references.e2e-spec.ts` (new) | The cross-tenant reference reproduction on the M0 slice | 2 |
| `test/support/canary-seeder.ts` (new) | Catalog-driven seeding of every tenant table (`readTenantSchema`, `buildRow`, `seedCanaryRows`, `insertRow`) | 3 |
| `test/tenancy-canary-rls.e2e-spec.ts` (new) | Whole-schema proofs: no scope ⇒ nothing, own rows only, cross-tenant write refused, every FK refuses another tenant, 026 triggers intact | 3 |
| `test/support/route-sweep.ts` (new) | Route discovery, `PATH_PARAMS`, `FIELD_TABLES`, `CODE_FIELDS`, id-field extraction (Task 4); body synthesis, request, canary scan (Task 21); normalisation (Task 22) | 4, 21, 22 |
| `test/tenancy-route-sweep.e2e-spec.ts` (new) | Coverage of every route parameter (Task 4); cross-tenant sweep (Task 21) | 4, 21 |
| `src/database/migrations/sql-statements.ts` (new) | `splitSqlStatements(sql)`, `SqlSplitError` | 5 |
| `src/database/migrations/migration-runner.ts`, `postgres-migration-store.ts`, `migrate.ts`, `migration-config.ts`, `migrate.cli.ts` (modify) | no-transaction marker, `applyWithoutTransaction`, invalid-index cleanup, `through` / `pending` | 6 |
| `migrations/038_tenant_columns_online.sql` (new) | Online preparation | 8 |
| `migrations/039_tenant_isolation_cutover.sql` (new) | Cutover window | 9 |
| `migrations/040_tenant_validate_online.sql` (new) | Online validation + assertion | 10 |
| `src/admin/admin.controller.ts`, `src/sos/sos.service.ts`, `src/chat/chat.service.ts`, `src/common/codes/record-code.ts` + specs (modify) | Conflict targets per tenant | 9 |
| `src/database/tenancy/first-tenant.ts` (new) | `FIRST_TENANT_ID`, `FIRST_TENANT_CODE` | 11 |
| `src/database/tenancy/tenancy-mode.ts` (modify) | `readTenancySettings`, `freezeTenancySettings`, `tenancySettings`, `LEGACY_DEFAULT_TENANT_CODE` | 11, 12 |
| `src/database/tenancy/tenant-context.ts` (modify) | lower-cased tenant ids; `TENANT_SCOPE_ERROR_CODES` | 11, 15 |
| `src/database/tenancy/boot-guards.ts`, `src/database/typeorm.options.ts` (modify) | constant; freeze at boot; `assertLegacyDefaultTenantCode` | 11, 12 |
| `src/auth/auth.service.ts` (modify) | fallback tenant code, single resolution | 12 |
| `test/support/e2e-tenancy.ts` (new), `test/support/db.ts`, `test/support/app-env.ts`, `test/support/tenancy.ts`, `test/support/enforced-env.ts`, `test/support/e2e-roles.global-teardown.ts` (new), `test/jest-e2e.json`, `scripts/run-e2e.mjs` (new), `package.json` | The two-mode e2e harness, role hygiene | 13 |
| `src/auth/mfa/mfa-challenge.service.ts`, `src/auth/mfa/mfa.service.ts` (modify) | Challenge tokens carry the tenant | 14 |
| `src/common/filters/http-exception.filter.ts` (modify) | `TenantScopeError` → `500 tenant_scope_error` with `details.reason` | 15 |
| `src/database/tenancy/tenant-job-runner.ts`, `src/files/files.service.ts`, `src/scheduler/{compliance-alerts,gps-retention}.service.ts` (modify) | `run(job)` mode-aware; jobs per tenant with attributed failures | 16 |
| `src/auth/auth-revocation-feed.ts`, `src/notifications/{recent-revocations,notifications.gateway,ws-tenant-scope.interceptor}.ts`, `src/gps/gps.service.ts`, `eslint.config.mjs` (modify) | Revocation by tenant room, socket hardening, lint rule | 17 |
| `test/tenancy-differential.e2e-spec.ts` (new) | Differential over every GET route | 22 |
| `test/rehearsal/tenant-migration-rehearsal.ts` (new) | Lock-window measurement on synthetic volume | 23 |
| `docs/migrations.md`, `docs/tenancy.md`, `.env.example`, `.env.docker.example`, `PROGRESS.md`, design spec (modify) | Documentation and the gate | 10, 12, 24 |

## Ordering and dependencies

```
Phase A  failing guards     1 → 2 → 3 → 4          (all RED; 4 depends on 3's seeder)
Phase B  runner             5 → 6 → 7
Phase C  migrations         8 → 9 → 10             (needs B; 10 turns A green except the sweep)
Phase D  runtime carry-over 11 → 12 → 13 → 14 → 15 → 16 → 17
                            (13 needs 11's constant and 12's fallback; 14 is verified through 13's harness)
Phase E  enforced bug hunt  18 → 19 → 20           (needs C and D)
Phase F  isolation sweep    21 → 22                (needs E: the sweep must not drown in defects E fixes)
Phase G  gate               23 → 24
```

Each task ends with its tests green and a commit. RED-at-commit is allowed only for the Phase A guard files, which are committed failing on purpose. Their commit messages say so, and Task 10 records the switch to green.

---
## Phase A — the failing guards (the M1 gate, written first)

### Task 1: Schema guard over every table (RED until 038–040)

**Files:**
- Create: `test/support/tenancy-catalog.ts`
- Create: `test/tenancy-schema-guard.e2e-spec.ts`

**Interfaces:**
- Consumes: `createTenantDatabase()`, `TENANT_1`, `TenantDatabase.{admin,app,platform,drop}` from `test/support/tenancy.ts` (M0).
- Produces: `GLOBAL_TABLES: Record<string, GlobalTable>`, `GlobalTable { reason; mmsApp: Privilege[]; mmsPlatform: Privilege[] }`, `Privilege`, `DML`, `ALL_PRIVILEGES`, `GLOBAL_UNIQUE_EXCEPTIONS`, `GLOBAL_REFERENCES`, `SECURITY_DEFINER_FUNCTIONS`, `TENANT_ISOLATION_EXPRESSION`, `isListed(record, key)`, `isGlobalTable(name)`, `publicTables(c): Promise<string[]>`, `tenantTables(c): Promise<string[]>`. Tasks 3, 4, 21 and 22 use these.

- [ ] **Step 1: Write the catalog module**

`test/support/tenancy-catalog.ts`:

```ts
// What the schema guard and the catalog-driven isolation proofs know about the schema.
// Every table of the public schema is either listed here as GLOBAL (shared by every tenant,
// with the privileges each application role may hold on it and why) or it is a tenant
// table and must carry the full isolation template of migrations 037/039. A new table
// therefore fails the guard until its migration isolates it or lists it here on purpose.
import type { Client } from 'pg';

export type Privilege = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface GlobalTable {
  readonly reason: string;
  readonly mmsApp: readonly Privilege[];
  readonly mmsPlatform: readonly Privilege[];
}

export const DML: readonly Privilege[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

/** Every privilege a table can carry: the guard checks all of them, not only DML. */
export const ALL_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
] as const;

export const GLOBAL_TABLES: Readonly<Record<string, GlobalTable>> = {
  schema_migrations: {
    reason: 'migration history: the migrator alone reads and writes it',
    mmsApp: [],
    mmsPlatform: [],
  },
  tenants: {
    reason:
      'the tenant registry: the runtime reads its own row (policy tenants_own_row), the platform manages it',
    mmsApp: ['SELECT'],
    mmsPlatform: ['SELECT', 'INSERT', 'UPDATE'],
  },
  roles: {
    reason:
      'role catalogue seeded by migration 023, the same for every tenant: read-only at runtime',
    mmsApp: ['SELECT'],
    mmsPlatform: [],
  },
  permissions: {
    reason: 'permission catalogue, the same for every tenant: read-only at runtime',
    mmsApp: ['SELECT'],
    mmsPlatform: [],
  },
  role_permissions: {
    reason: 'role-permission catalogue, the same for every tenant: read-only at runtime',
    mmsApp: ['SELECT'],
    mmsPlatform: [],
  },
  login_attempts: {
    reason:
      'sign-in lockout counters, written before any tenant is known (keys become per tenant in M1b)',
    mmsApp: DML,
    mmsPlatform: [],
  },
};

/** Unique indexes of tenant tables that are global on purpose, and why. */
export const GLOBAL_UNIQUE_EXCEPTIONS: Readonly<Record<string, string>> = {
  uq_files_storage_key:
    'storage keys are server-made UUIDs naming a file on disk: one key, one file, in every directory layout',
};

/** Foreign keys from a tenant table to a global table (besides tenant_id -> tenants). */
export const GLOBAL_REFERENCES: Readonly<Record<string, string>> = {
  user_roles_role_id_fkey: 'roles',
};

/** SECURITY DEFINER functions run as their owner, around RLS: each one is a narrow door (D15). */
export const SECURITY_DEFINER_FUNCTIONS: readonly string[] = [
  'auth_tenant_by_code',
  'maintenance_tenant_ids',
];

/** The USING and WITH CHECK expression of every tenant_isolation policy, as pg_get_expr prints it. */
export const TENANT_ISOLATION_EXPRESSION = '(tenant_id = app_tenant_id())';

export const isListed = (record: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

export const isGlobalTable = (name: string): boolean =>
  isListed(GLOBAL_TABLES, name);

/** Every ordinary or partitioned table of the public schema. */
export async function publicTables(c: Client): Promise<string[]> {
  const { rows } = await c.query<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      ORDER BY c.relname`,
  );
  return rows.map((r) => r.name);
}

/** Every public table that is not listed as global. */
export async function tenantTables(c: Client): Promise<string[]> {
  return (await publicTables(c)).filter((name) => !isGlobalTable(name));
}
```

- [ ] **Step 2: Write the failing guard**

`test/tenancy-schema-guard.e2e-spec.ts`:

```ts
// Schema guard (M1a). Every table of the public schema is either a listed global table or
// carries the full tenant isolation template: tenant_id, forced RLS with the exact policy,
// foreign keys scoped by tenant, unique keys inside a tenant, the indexes those need, and
// exactly the listed privileges. A new table, key, view, SECURITY DEFINER function or grant
// that would open a path around Row-Level Security fails here, before any data is at risk.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import type { Client } from 'pg';
import {
  ALL_PRIVILEGES,
  DML,
  GLOBAL_REFERENCES,
  GLOBAL_TABLES,
  GLOBAL_UNIQUE_EXCEPTIONS,
  SECURITY_DEFINER_FUNCTIONS,
  TENANT_ISOLATION_EXPRESSION,
  isGlobalTable,
  isListed,
  publicTables,
  tenantTables,
} from './support/tenancy-catalog';
import {
  TENANT_1,
  createTenantDatabase,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

interface ForeignKeyRow {
  name: string;
  table: string;
  parent: string;
  validated: boolean;
  columns: string[];
  parentColumns: string[];
}

interface IndexRow {
  table: string;
  index: string;
  unique: boolean;
  primary: boolean;
  partial: boolean;
  nullsNotDistinct: boolean;
  columns: string[];
  notNull: boolean[];
}

const FOREIGN_KEYS_SQL = `
  SELECT f.conname AS name, c.relname AS "table", p.relname AS parent,
         f.convalidated AS validated,
         ARRAY(SELECT a.attname FROM unnest(f.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.attnum
                ORDER BY k.ord)::text[] AS columns,
         ARRAY(SELECT a.attname FROM unnest(f.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = f.confrelid AND a.attnum = k.attnum
                ORDER BY k.ord)::text[] AS "parentColumns"
    FROM pg_constraint f
    JOIN pg_class c ON c.oid = f.conrelid
    JOIN pg_class p ON p.oid = f.confrelid
   WHERE f.contype = 'f' AND c.relnamespace = 'public'::regnamespace
     AND c.relname = ANY ($1)
   ORDER BY c.relname, f.conname`;

// Key columns only (INCLUDE columns do not make an index unique or usable as a prefix)
const INDEXES_SQL = `
  SELECT c.relname AS "table", i.relname AS "index", x.indisunique AS "unique",
         x.indisprimary AS "primary", x.indpred IS NOT NULL AS partial,
         x.indnullsnotdistinct AS "nullsNotDistinct",
         ARRAY(SELECT COALESCE(a.attname, '<expression>')
                 FROM unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                 LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
                WHERE k.ord <= x.indnkeyatts ORDER BY k.ord)::text[] AS columns,
         ARRAY(SELECT COALESCE(a.attnotnull, false)
                 FROM unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                 LEFT JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
                WHERE k.ord <= x.indnkeyatts ORDER BY k.ord)::bool[] AS "notNull"
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class c ON c.oid = x.indrelid
   WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
   ORDER BY c.relname, i.relname`;

const foreignKeys = async (c: Client, tables: string[]) =>
  (await c.query<ForeignKeyRow>(FOREIGN_KEYS_SQL, [tables])).rows;
const indexes = async (c: Client, tables: string[]) =>
  (await c.query<IndexRow>(INDEXES_SQL, [tables])).rows;

/** The tenant-scoped foreign keys: those that pair tenant_id with the parent's tenant_id. */
const scopedForeignKeys = (fks: ForeignKeyRow[], tenantSet: Set<string>) =>
  fks.filter(
    (fk) =>
      tenantSet.has(fk.parent) &&
      fk.parentColumns[fk.columns.indexOf('tenant_id')] === 'tenant_id',
  );

describe('tenant schema guard (e2e)', () => {
  let db: TenantDatabase;
  let tables: string[];
  let globals: string[];

  beforeAll(async () => {
    db = await createTenantDatabase();
    [tables, globals] = await db.admin(async (c) => {
      const all = await publicTables(c);
      return [await tenantTables(c), all.filter(isGlobalTable)] as const;
    });
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('knows every global table it lists, and treats every other table as a tenant table', () => {
    expect([...globals].sort()).toEqual(Object.keys(GLOBAL_TABLES).sort());
    expect(tables.length).toBeGreaterThanOrEqual(66);
  });

  it('gives every tenant table tenant_id uuid NOT NULL DEFAULT app_tenant_id(), validated against tenants', async () => {
    const rows = await db.admin(
      async (c) =>
        (
          await c.query<{
            table: string;
            type: string | null;
            notNull: boolean | null;
            default: string | null;
            referencesTenants: boolean;
          }>(
            `SELECT c.relname AS "table", format_type(a.atttypid, a.atttypmod) AS type,
                    a.attnotnull AS "notNull", pg_get_expr(d.adbin, d.adrelid) AS "default",
                    EXISTS (SELECT 1 FROM pg_constraint f
                             WHERE f.conrelid = c.oid AND f.contype = 'f' AND f.convalidated
                               AND f.confrelid = 'tenants'::regclass
                               AND f.conkey = ARRAY[a.attnum]::int2[]) AS "referencesTenants"
               FROM pg_class c
               LEFT JOIN pg_attribute a
                 ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
               LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
              WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
              ORDER BY c.relname`,
            [tables],
          )
        ).rows,
    );
    const wrong = rows
      .filter(
        (r) =>
          !(
            r.type === 'uuid' &&
            r.notNull === true &&
            r.default === 'app_tenant_id()' &&
            r.referencesTenants
          ),
      )
      .map((r) => `${r.table}: ${JSON.stringify(r)}`);
    expect(wrong).toEqual([]);
  });

  it('forces row-level security with exactly the tenant_isolation policy on every tenant table', async () => {
    const rows = await db.admin(
      async (c) =>
        (
          await c.query<{
            table: string;
            enabled: boolean;
            forced: boolean;
            policies: unknown[];
          }>(
            `SELECT c.relname AS "table", c.relrowsecurity AS enabled,
                    c.relforcerowsecurity AS forced,
                    COALESCE(json_agg(json_build_object(
                      'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive,
                      'roles', ARRAY(SELECT r.rolname FROM pg_roles r
                                      WHERE r.oid = ANY (p.polroles) ORDER BY 1),
                      'using', pg_get_expr(p.polqual, p.polrelid),
                      'check', pg_get_expr(p.polwithcheck, p.polrelid)))
                      FILTER (WHERE p.oid IS NOT NULL), '[]') AS policies
               FROM pg_class c
               LEFT JOIN pg_policy p ON p.polrelid = c.oid
              WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
              GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
              ORDER BY c.relname`,
            [tables],
          )
        ).rows,
    );
    const template = [
      {
        name: 'tenant_isolation',
        command: '*',
        permissive: true,
        roles: ['mms_app'],
        using: TENANT_ISOLATION_EXPRESSION,
        check: TENANT_ISOLATION_EXPRESSION,
      },
    ];
    const wrong = rows
      .filter(
        (r) =>
          !r.enabled ||
          !r.forced ||
          JSON.stringify(r.policies) !== JSON.stringify(template),
      )
      .map((r) => `${r.table}: ${JSON.stringify(r)}`);
    expect(wrong).toEqual([]);
  });

  it('scopes every foreign key of a tenant table by tenant, and validates it', async () => {
    const fks = await db.admin((c) => foreignKeys(c, tables));
    const tenantSet = new Set(tables);
    const wrong: string[] = [];
    for (const fk of fks) {
      const label = `${fk.table}.${fk.name} -> ${fk.parent}`;
      if (!fk.validated) wrong.push(`${label}: not validated`);
      if (fk.parent === 'tenants') {
        if (fk.columns.join() !== 'tenant_id') {
          wrong.push(`${label}: references tenants with (${fk.columns.join(', ')})`);
        }
      } else if (tenantSet.has(fk.parent)) {
        const k = fk.columns.indexOf('tenant_id');
        if (k < 0 || fk.parentColumns[k] !== 'tenant_id') {
          wrong.push(
            `${label}: (${fk.columns.join(', ')}) does not pair tenant_id with the parent's tenant_id`,
          );
        }
      } else if (
        !isListed(GLOBAL_REFERENCES, fk.name) ||
        GLOBAL_REFERENCES[fk.name] !== fk.parent
      ) {
        wrong.push(`${label}: a global parent not listed in GLOBAL_REFERENCES`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps every unique key of a tenant table inside its tenant', async () => {
    const [all, fks] = await db.admin(
      async (c) => [await indexes(c, tables), await foreignKeys(c, tables)] as const,
    );
    const scoped = new Set(
      scopedForeignKeys(fks, new Set(tables)).flatMap((fk) =>
        fk.columns
          .filter((column) => column !== 'tenant_id')
          .map((column) => `${fk.table}.${column}`),
      ),
    );
    // A unique key is inside a tenant when it contains tenant_id, is the uuid primary key,
    // or contains a column that only ever holds ids of rows of the same tenant (a scoped
    // foreign key column) and cannot let NULLs collide across tenants
    const wrong = all
      .filter((u) => u.unique)
      .filter((u) => {
        if (u.columns.includes('tenant_id')) return false;
        if (u.primary && u.columns.join() === 'id') return false;
        if (isListed(GLOBAL_UNIQUE_EXCEPTIONS, u.index)) return false;
        return !u.columns.some(
          (column, k) =>
            scoped.has(`${u.table}.${column}`) &&
            (u.notNull[k] || !u.nullsNotDistinct),
        );
      })
      .map((u) => `${u.table}.${u.index} (${u.columns.join(', ')})`);
    expect(wrong).toEqual([]);
  });

  it('indexes every tenant-scoped foreign key, and gives every tenant table an index led by tenant_id', async () => {
    const [all, fks] = await db.admin(
      async (c) => [await indexes(c, tables), await foreignKeys(c, tables)] as const,
    );
    const usable = all.filter((i) => !i.partial);
    const wrong: string[] = [];
    for (const fk of scopedForeignKeys(fks, new Set(tables))) {
      const want = [...fk.columns].sort().join();
      const covered = usable.some(
        (i) =>
          i.table === fk.table &&
          [...i.columns.slice(0, fk.columns.length)].sort().join() === want,
      );
      if (!covered) {
        wrong.push(`${fk.table}.${fk.name} (${fk.columns.join(', ')}) has no index`);
      }
    }
    for (const table of tables) {
      if (!usable.some((i) => i.table === table && i.columns[0] === 'tenant_id')) {
        wrong.push(`${table} has no index led by tenant_id`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('grants the runtime role DML on tenant tables only, and each role exactly the listed privileges on global tables', async () => {
    const granted = await db.admin(async (c) =>
      (
        await c.query<{ grant: string }>(
          `SELECT c.relname || ':' || r.role || ':' || p.privilege AS "grant"
             FROM pg_class c
            CROSS JOIN (VALUES ('mms_app'), ('mms_platform')) AS r(role)
            CROSS JOIN unnest($1::text[]) AS p(privilege)
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
              AND has_table_privilege(r.role, c.oid, p.privilege)`,
          [ALL_PRIVILEGES],
        )
      ).rows.map((r) => r.grant),
    );
    const expected = [
      ...tables.flatMap((t) => DML.map((p) => `${t}:mms_app:${p}`)),
      ...Object.entries(GLOBAL_TABLES).flatMap(([t, g]) => [
        ...g.mmsApp.map((p) => `${t}:mms_app:${p}`),
        ...g.mmsPlatform.map((p) => `${t}:mms_platform:${p}`),
      ]),
    ];
    expect([...granted].sort()).toEqual([...expected].sort());
  });

  it('lets the runtime role write its own rows, but neither the tenant registry nor the role catalogue', async () => {
    await db.app(TENANT_1, async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          `INSERT INTO leave_types (code, name) VALUES ('guard_probe', 'Guard probe')`,
        );
      } finally {
        await c.query('ROLLBACK');
      }
      await expect(
        c.query(`UPDATE tenants SET name = name WHERE id = $1`, [TENANT_1]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        c.query(`INSERT INTO roles (code, name) VALUES ('guard_probe', 'x')`),
      ).rejects.toMatchObject({ code: '42501' });
    });
    await db.platform(async (c) => {
      await expect(c.query(`SELECT 1 FROM users`)).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        c.query(`SELECT id FROM auth_tenant_by_code('phu-dinh')`),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('grants nothing by default on tables created later, so a platform table never reaches the runtime role', async () => {
    const [defaults, probe] = await db.admin(async (c) => {
      const acl = (
        await c.query<{ acl: string }>(
          `SELECT d.defaclacl::text AS acl FROM pg_default_acl d`,
        )
      ).rows
        .map((r) => r.acl)
        .filter((text) => /mms_app=|mms_platform=/.test(text));
      await c.query('BEGIN');
      try {
        await c.query('CREATE TABLE platform_guard_probe (id int)');
        const roles = (
          await c.query<{ role: string }>(
            `SELECT r.role FROM (VALUES ('mms_app'), ('mms_platform')) AS r(role)
              WHERE has_table_privilege(r.role, 'platform_guard_probe',
                                        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')`,
          )
        ).rows.map((r) => r.role);
        return [acl, roles] as const;
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(defaults).toEqual([]);
    expect(probe).toEqual([]);
  });

  it('keeps the SECURITY DEFINER functions to the listed narrow ones, each with a pinned search_path', async () => {
    const rows = await db.admin(
      async (c) =>
        (
          await c.query<{ name: string; config: string[] | null }>(
            `SELECT p.proname AS name, p.proconfig AS config FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
              ORDER BY p.proname`,
          )
        ).rows,
    );
    expect(rows.map((r) => r.name)).toEqual([...SECURITY_DEFINER_FUNCTIONS].sort());
    rows.forEach((r) =>
      expect({ name: r.name, config: r.config }).toEqual({
        name: r.name,
        config: ['search_path=public, pg_temp'],
      }),
    );
  });

  it('has no view that would read tenant tables as its owner', async () => {
    const views = await db.admin(async (c) =>
      (
        await c.query<{ name: string }>(
          `SELECT c.relname AS name FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
              AND NOT COALESCE('security_invoker=true' = ANY (c.reloptions), false)`,
        )
      ).rows.map((r) => r.name),
    );
    expect(views).toEqual([]);
  });

  // Code names these: ON CONFLICT ON CONSTRAINT (training-plans.service.ts), the
  // constraint.includes('email' | 'cccd') mapping (admin.service.ts, militia.service.ts) and
  // test/migrations.e2e-spec.ts (uq_conversations_direct_key)
  it('keeps the constraint and index names code relies on, scoped by tenant', async () => {
    const definitions = await db.admin(async (c) => {
      const constraints = (
        await c.query<{ name: string; definition: string }>(
          `SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
            WHERE connamespace = 'public'::regnamespace AND conname = ANY ($1)`,
          [
            [
              'uq_training_plans_unit_year_type',
              'system_settings_pkey',
              'uq_users_tenant_email',
              'uq_militia_profiles_tenant_cccd',
            ],
          ],
        )
      ).rows;
      const indexDefinitions = (
        await c.query<{ name: string; definition: string }>(
          `SELECT indexname AS name, indexdef AS definition FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = ANY ($1)`,
          [['uq_conversations_direct_key', 'uidx_militia_cccd_lookup']],
        )
      ).rows;
      return Object.fromEntries(
        [...constraints, ...indexDefinitions].map((r) => [r.name, r.definition]),
      );
    });
    expect(definitions).toEqual({
      uq_training_plans_unit_year_type:
        'UNIQUE NULLS NOT DISTINCT (tenant_id, unit_id, year, training_type)',
      system_settings_pkey: 'PRIMARY KEY (tenant_id, key)',
      uq_users_tenant_email: 'UNIQUE (tenant_id, email)',
      uq_militia_profiles_tenant_cccd: 'UNIQUE (tenant_id, cccd)',
      uq_conversations_direct_key:
        'CREATE UNIQUE INDEX uq_conversations_direct_key ON public.conversations USING btree (tenant_id, direct_key) WHERE (direct_key IS NOT NULL)',
      uidx_militia_cccd_lookup:
        'CREATE UNIQUE INDEX uidx_militia_cccd_lookup ON public.militia_profiles USING btree (tenant_id, cccd_lookup_hash) WHERE (cccd_lookup_hash IS NOT NULL)',
    });
  });
});
```

- [ ] **Step 3: Run it and confirm it fails for the right reasons**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-schema-guard.e2e-spec.ts`
Expected: FAIL. The column test lists the 57 tables without `tenant_id` (e.g. `alerts: {"table":"alerts","type":null,...}`). The RLS test lists the same 57. The FK test lists all 114 keys between tenant tables, such as `tasks.tasks_created_by_fkey -> users: (created_by) does not pair tenant_id…`. The unique test lists `incidents.incidents_code_key (code)`, `system_settings.system_settings_pkey (key)` and others. The privilege test shows `roles:mms_app:INSERT` and others as extra. The default-privilege test shows the `mms_app=arwd` default ACL of 036. The code-named test shows the old definitions. These pass already: the global-table list, SECURITY DEFINER, views, and the behavioural role test except its `INSERT INTO roles` line (which fails until 039 revokes it).

- [ ] **Step 4: Lint and commit (RED on purpose)**

```bash
npx eslint test/support/tenancy-catalog.ts test/tenancy-schema-guard.e2e-spec.ts
git add test/support/tenancy-catalog.ts test/tenancy-schema-guard.e2e-spec.ts
git commit -m "test(tenancy): schema guard over every table, failing until migrations 038-040

The guard classifies every public table as listed-global or tenant and checks the
isolation template, scoped foreign keys and uniques, indexes, privileges, default ACLs,
SECURITY DEFINER functions, views and the constraint names code relies on. It is RED by
design: 57 tables have no tenant_id yet (M1a gate).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cross-tenant reference reproduction (RED until composite FKs)

**Files:**
- Create: `test/tenancy-references.e2e-spec.ts`

**Interfaces:**
- Consumes: `createTenantDatabase`, `seedTenant`, `SeededTenant` (`id, unitId, adminId, memberUserId, taskId, notificationId`) from `test/support/tenancy.ts`.
- Produces: nothing reused; it is the gate row "cross-tenant references".

- [ ] **Step 1: Write the failing test**

`test/tenancy-references.e2e-spec.ts`:

```ts
// Cross-tenant references (the M0 gate row left open, closed by M1a). A single-column
// foreign key is checked as the table owner, so Row-Level Security does not hide the other
// tenant's row from it: a tenant could point its rows at another tenant's rows, and that
// tenant's deletes would then cascade into, or be blocked by, rows it cannot even see.
// Composite (tenant_id, id) keys (migrations 038-040) close it. Every foreign key of the
// M0 slice is tried here as mms_app under tenant A with one id of tenant B.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

interface Pointer {
  fk: string;
  sql: string;
  values: (a: SeededTenant, b: SeededTenant) => unknown[];
}

const POINTERS: Pointer[] = [
  {
    fk: 'task_assignments_task_id_fkey',
    sql: `INSERT INTO task_assignments (task_id, assignee_id, assigned_by) VALUES ($1, $2, $2)`,
    values: (a, b) => [b.taskId, a.memberUserId],
  },
  {
    fk: 'task_assignments_assignee_id_fkey',
    sql: `INSERT INTO task_assignments (task_id, assignee_id, assigned_by) VALUES ($1, $2, $3)`,
    values: (a, b) => [a.taskId, b.adminId, a.adminId],
  },
  {
    fk: 'task_assignments_assigned_by_fkey',
    sql: `INSERT INTO task_assignments (task_id, assignee_id, assigned_by) VALUES ($1, $2, $3)`,
    values: (a, b) => [a.taskId, a.memberUserId, b.adminId],
  },
  {
    fk: 'tasks_created_by_fkey',
    sql: `INSERT INTO tasks (code, title, type, created_by, unit_id) VALUES ('REF-1', 'x', 'patrol', $1, $2)`,
    values: (a, b) => [b.adminId, a.unitId],
  },
  {
    fk: 'tasks_unit_id_fkey',
    sql: `INSERT INTO tasks (code, title, type, created_by, unit_id) VALUES ('REF-2', 'x', 'patrol', $1, $2)`,
    values: (a, b) => [a.adminId, b.unitId],
  },
  {
    fk: 'militia_profiles_unit_id_fkey',
    sql: `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date)
          VALUES ('DQ-REF-1', 'x', '000000000101', '1990-01-01', $1, '2020-01-01')`,
    values: (_a, b) => [b.unitId],
  },
  {
    fk: 'militia_profiles_user_id_fkey',
    sql: `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
          VALUES ('DQ-REF-2', 'x', '000000000102', '1990-01-01', $1, '2020-01-01', $2)`,
    values: (a, b) => [a.unitId, b.adminId],
  },
  {
    fk: 'notification_receipts_notification_id_fkey',
    sql: `INSERT INTO notification_receipts (notification_id, user_id) VALUES ($1, $2)`,
    values: (a, b) => [b.notificationId, a.memberUserId],
  },
  {
    fk: 'notification_receipts_user_id_fkey',
    sql: `INSERT INTO notification_receipts (notification_id, user_id) VALUES ($1, $2)`,
    values: (a, b) => [a.notificationId, b.adminId],
  },
  {
    fk: 'notifications_sender_id_fkey',
    sql: `INSERT INTO notifications (type, title, body, sender_id) VALUES ('system', 'x', 'y', $1)`,
    values: (_a, b) => [b.adminId],
  },
  {
    fk: 'audit_logs_actor_id_fkey',
    sql: `INSERT INTO audit_logs (actor_id, action, entity_type) VALUES ($1, 'ref', 'tasks')`,
    values: (_a, b) => [b.adminId],
  },
  {
    fk: 'files_uploaded_by_fkey',
    sql: `INSERT INTO files (storage_key, original_name, mime_type, size, uploaded_by)
          VALUES (gen_random_uuid()::text, 'x', 'text/plain', 1, $1)`,
    values: (_a, b) => [b.adminId],
  },
  {
    fk: 'units_parent_id_fkey',
    sql: `INSERT INTO units (code, name, type, parent_id) VALUES ('REF-U', 'x', 'area', $1)`,
    values: (_a, b) => [b.unitId],
  },
];

describe('cross-tenant references (e2e)', () => {
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

  it.each(POINTERS)(
    'refuses a row of one tenant that points at a row of another ($fk)',
    async ({ fk, sql, values }) => {
      await expect(
        db.app(a.id, (c) => c.query(sql, values(a, b))),
      ).rejects.toMatchObject({ code: '23503', constraint: fk });
    },
  );

  // Last: it deletes the task of B that the cases above point at
  it('lets another tenant delete its own rows without reaching into, or being blocked by, ours', async () => {
    // Refused by the composite key; with a single-column key this row would exist and the
    // delete below would silently remove it from tenant A
    await expect(
      db.app(a.id, (c) =>
        c.query(
          `INSERT INTO task_assignments (task_id, assignee_id, assigned_by) VALUES ($1, $2, $2)`,
          [b.taskId, a.memberUserId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const assignmentsOfA = () =>
      db.app(a.id, async (c) =>
        Number(
          (await c.query<{ n: string }>(`SELECT count(*) AS n FROM task_assignments`))
            .rows[0].n,
        ),
      );
    const before = await assignmentsOfA();

    await db.app(b.id, (c) => c.query(`DELETE FROM tasks WHERE id = $1`, [b.taskId]));

    expect(await assignmentsOfA()).toBe(before);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-references.e2e-spec.ts`
Expected: FAIL. All 13 `refuses…` cases fail with "Received promise resolved instead of rejected": today's single-column keys accept the other tenant's ids. The last test fails the same way at its first assertion.

- [ ] **Step 3: Lint and commit (RED on purpose)**

```bash
npx eslint test/tenancy-references.e2e-spec.ts
git add test/tenancy-references.e2e-spec.ts
git commit -m "test(tenancy): reproduce cross-tenant references through single-column foreign keys

A tenant can point its rows at another tenant's rows because foreign keys are checked as
the table owner, outside RLS. Failing on purpose until the composite keys of 039/040.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Catalog-driven canary seeder and whole-schema isolation proofs (RED)

**Files:**
- Create: `test/support/canary-seeder.ts`
- Create: `test/tenancy-canary-rls.e2e-spec.ts`

**Interfaces:**
- Consumes: `tenantTables` (Task 1); `createTenantDatabase`, `seedTenant`, `TenantDatabase` (M0).
- Produces (used by Tasks 4, 21, 22, 23): `ColumnShape`, `ForeignKeyShape { name; columns; parent; parentColumns; global }`, `TableShape { name; columns; foreignKeys }`, `Row`, `SeededRows = Map<string, Row>`, `SeedContext { tenantId; label; batch }`, `SeedOptions extends SeedContext { parentsOnly? }`, `Swap { foreignKey; parent }`, `readTenantSchema(c)`, `globalRows(c, shapes)`, `buildRow(shape, ctx, parents, globals, swap?)`, `insertRow(c, table, row)`, `seedCanaryRows(c, options)`, `canaryOf(label)`, `dateFor(batch)`, `quoteIdent(name)`.

- [ ] **Step 1: Write the seeder**

`test/support/canary-seeder.ts`:

```ts
// Plants rows in every tenant table of a tenant, driven by the catalog, so the isolation
// proofs cover each table without a hand-written fixture per table. A table added later is
// seeded (and swept) automatically, or the seeder fails and names the table and column.
//
// Value of a column, first rule that applies:
//  1. COLUMN_VALUES, by `table.column` then by `column` (cross-column CHECKs, periods).
//  2. tenant_id: the tenant. The uuid primary key `id`: left to its default.
//  3. A foreign-key column: the parent row seeded earlier in the same batch (tables go
//     parents first). A self-reference stays NULL. A key to a global table (roles) takes the
//     first row of that table.
//  4. A column with a default is left to it, except a text column no CHECK involves: that
//     one gets the canary, so a leak of it is visible.
//  5. A nullable column that a CHECK ties to other columns (other than a list of allowed
//     values) stays NULL: those CHECKs couple columns (returned_at, decided_*, expiry_date).
//  6. A column whose CHECK is a list of allowed values takes the first value.
//  7. By type: text -> CANARY-<label>-<uuid>, cut to the column length when it is at least
//     20 characters, else <label> + random digits (a 12-character cccd must stay unique);
//     uuid -> a random id; numbers -> 1; boolean -> false;
//     date -> a June 2026 day chosen by the batch; timestamps -> now; json -> {canary};
//     text[] -> [canary]; another array -> NULL when nullable.
import { randomBytes, randomUUID } from 'crypto';
import type { Client } from 'pg';
import { tenantTables } from './tenancy-catalog';

export interface ColumnShape {
  name: string;
  /** format_type, e.g. 'character varying(50)' */
  type: string;
  /** pg_type.typcategory: S string, N numeric, B boolean, D date/time, U uuid/json, A array, I inet */
  category: string;
  /** pg_type.typname, e.g. 'varchar', 'uuid', 'jsonb', '_text' */
  baseType: string;
  maxLength: number | null;
  notNull: boolean;
  hasDefault: boolean;
  /** The values of a single-column CHECK (col IN (...)) */
  allowed: string[] | null;
  /** Involved in any other CHECK */
  inOtherCheck: boolean;
}

export interface ForeignKeyShape {
  name: string;
  /** Referencing columns, tenant_id left out */
  columns: string[];
  parent: string;
  parentColumns: string[];
  /** The parent is a global table */
  global: boolean;
}

export interface TableShape {
  name: string;
  columns: ColumnShape[];
  foreignKeys: ForeignKeyShape[];
}

export type Row = Record<string, unknown>;
export type SeededRows = Map<string, Row>;

export interface SeedContext {
  tenantId: string;
  /** 'A' or 'B': text values read CANARY-<label>-<uuid> */
  label: string;
  /** Tells repeated seedings of one tenant apart (periods, dates) */
  batch: number;
}

export interface SeedOptions extends SeedContext {
  /** Only tables other tenant tables reference, and their own parents: rows nothing points at */
  parentsOnly?: boolean;
}

/** One foreign key of a row built for another purpose, pointed at a given parent row. */
export interface Swap {
  foreignKey: string;
  parent: Row;
}

export const canaryOf = (label: string): string =>
  `CANARY-${label}-${randomUUID()}`;

export const dateFor = (batch: number): string =>
  `2026-06-${String(((batch - 1) % 28) + 1).padStart(2, '0')}`;

const monthFor = (batch: number): number => ((batch - 1) % 12) + 1;

const randomDigits = (count: number): string =>
  Array.from(randomBytes(Math.max(count, 0)), (byte) => String(byte % 10)).join('');

export const quoteIdent = (name: string): string =>
  `"${name.replace(/"/g, '""')}"`;

const COLUMN_VALUES: Readonly<Record<string, (ctx: SeedContext) => unknown>> = {
  year: () => 2026,
  // Periods are unique per tenant and (year, month): one month per batch
  month: (ctx) => monthFor(ctx.batch),
  // A decided appeal (upheld) leaves its decision 'active', which the deferred
  // appeal-state trigger of migration 026 accepts with or without the appeal row
  'discipline_decisions.status': () => 'active',
  'discipline_appeals.outcome': () => 'upheld',
  'discipline_appeals.resolution': (ctx) => canaryOf(ctx.label),
  'discipline_appeals.decided_date': (ctx) => dateFor(ctx.batch),
  'discipline_appeals.decided_at': () => new Date(),
};

const OMIT = Symbol('omit');

// CHECK ((status)::text = ANY ((ARRAY['a'::character varying, 'b'::character varying])::text[]))
function allowedValues(definition: string): string[] | null {
  if (!/= ANY \(+ARRAY\[/.test(definition)) return null;
  const values = [...definition.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    m[1].replace(/''/g, "'"),
  );
  return values.length > 0 ? values : null;
}

/** Every tenant table with its columns and foreign keys, parents before children. */
export async function readTenantSchema(c: Client): Promise<TableShape[]> {
  const tables = await tenantTables(c);
  const tableSet = new Set(tables);
  const columns = (
    await c.query<ColumnShape & { table: string }>(
      `SELECT c.relname AS "table", a.attname AS name,
              format_type(a.atttypid, a.atttypmod) AS type,
              t.typcategory AS category, t.typname AS "baseType",
              CASE WHEN t.typname IN ('varchar', 'bpchar') AND a.atttypmod > 4
                   THEN a.atttypmod - 4 END AS "maxLength",
              a.attnotnull AS "notNull", a.atthasdef AS "hasDefault",
              NULL::text[] AS allowed, false AS "inOtherCheck"
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_type t ON t.oid = a.atttypid
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY ($1)
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum`,
      [tables],
    )
  ).rows;
  const checks = (
    await c.query<{ table: string; definition: string; columns: string[] }>(
      `SELECT c.relname AS "table", pg_get_constraintdef(k.oid) AS definition,
              ARRAY(SELECT a.attname FROM unnest(k.conkey) AS n(attnum)
                      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = n.attnum
                   )::text[] AS columns
         FROM pg_constraint k
         JOIN pg_class c ON c.oid = k.conrelid
        WHERE k.contype = 'c' AND c.relnamespace = 'public'::regnamespace
          AND c.relname = ANY ($1)`,
      [tables],
    )
  ).rows;
  for (const check of checks) {
    const allowed =
      check.columns.length === 1 ? allowedValues(check.definition) : null;
    for (const name of check.columns) {
      const column = columns.find(
        (col) => col.table === check.table && col.name === name,
      );
      if (!column) continue;
      if (allowed) column.allowed = allowed;
      else column.inOtherCheck = true;
    }
  }
  const keys = (
    await c.query<{
      table: string;
      name: string;
      parent: string;
      columns: string[];
      parentColumns: string[];
    }>(
      `SELECT c.relname AS "table", f.conname AS name, p.relname AS parent,
              ARRAY(SELECT a.attname FROM unnest(f.conkey) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.attnum
                     ORDER BY k.ord)::text[] AS columns,
              ARRAY(SELECT a.attname FROM unnest(f.confkey) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = f.confrelid AND a.attnum = k.attnum
                     ORDER BY k.ord)::text[] AS "parentColumns"
         FROM pg_constraint f
         JOIN pg_class c ON c.oid = f.conrelid
         JOIN pg_class p ON p.oid = f.confrelid
        WHERE f.contype = 'f' AND c.relnamespace = 'public'::regnamespace
          AND c.relname = ANY ($1) AND p.relname <> 'tenants'`,
      [tables],
    )
  ).rows;
  const shapes = tables.map((name) => ({
    name,
    columns: columns
      .filter((col) => col.table === name)
      .map(
        (col): ColumnShape => ({
          name: col.name,
          type: col.type,
          category: col.category,
          baseType: col.baseType,
          maxLength: col.maxLength,
          notNull: col.notNull,
          hasDefault: col.hasDefault,
          allowed: col.allowed,
          inOtherCheck: col.inOtherCheck,
        }),
      ),
    foreignKeys: keys
      .filter((k) => k.table === name)
      .map((k) => {
        const kept = k.columns
          .map((column, i) => [column, k.parentColumns[i]] as const)
          .filter(([column]) => column !== 'tenant_id');
        return {
          name: k.name,
          columns: kept.map(([column]) => column),
          parent: k.parent,
          parentColumns: kept.map(([, parentColumn]) => parentColumn),
          global: !tableSet.has(k.parent),
        };
      }),
  }));
  return topological(shapes);
}

function topological(shapes: TableShape[]): TableShape[] {
  const byName = new Map(shapes.map((s) => [s.name, s]));
  const state = new Map<string, 'visiting' | 'done'>();
  const ordered: TableShape[] = [];
  const visit = (shape: TableShape, path: string[]): void => {
    if (state.get(shape.name) === 'done') return;
    if (state.get(shape.name) === 'visiting') {
      throw new Error(`Foreign key cycle: ${[...path, shape.name].join(' -> ')}`);
    }
    state.set(shape.name, 'visiting');
    for (const fk of shape.foreignKeys) {
      const parent = byName.get(fk.parent);
      if (parent && parent.name !== shape.name) visit(parent, [...path, shape.name]);
    }
    state.set(shape.name, 'done');
    ordered.push(shape);
  };
  shapes.forEach((shape) => visit(shape, []));
  return ordered;
}

/** The first row of every global table a tenant table references. */
export async function globalRows(
  c: Client,
  shapes: TableShape[],
): Promise<SeededRows> {
  const parents = new Set(
    shapes.flatMap((s) => s.foreignKeys.filter((k) => k.global).map((k) => k.parent)),
  );
  const rows: SeededRows = new Map();
  for (const parent of parents) {
    const [first] = (
      await c.query<Row>(`SELECT * FROM ${quoteIdent(parent)} ORDER BY 1 LIMIT 1`)
    ).rows;
    if (!first) throw new Error(`Global table ${parent} is empty`);
    rows.set(parent, first);
  }
  return rows;
}

function byType(shape: TableShape, column: ColumnShape, ctx: SeedContext): unknown {
  switch (column.category) {
    case 'S': {
      const canary = canaryOf(ctx.label);
      if (column.maxLength === null || column.maxLength >= canary.length) return canary;
      // Room for the marker and enough randomness to stay unique: CANARY-B- + 11 hex digits
      if (column.maxLength >= 20) return canary.slice(0, column.maxLength);
      // Too short for a marker that stays unique (cccd is 12): the label and random digits
      return `${ctx.label}${randomDigits(column.maxLength - ctx.label.length)}`;
    }
    case 'N':
      return 1;
    case 'B':
      return false;
    case 'D':
      return column.baseType === 'date' ? dateFor(ctx.batch) : new Date();
    case 'I':
      return '127.0.0.1';
    case 'U':
      if (column.baseType === 'uuid') return randomUUID();
      if (column.baseType === 'json' || column.baseType === 'jsonb') {
        return { canary: canaryOf(ctx.label) };
      }
      break;
    case 'A':
      if (column.baseType === '_text' || column.baseType === '_varchar') {
        return [canaryOf(ctx.label)];
      }
      if (!column.notNull) return null;
      if (column.baseType === '_uuid') return [randomUUID()];
      break;
  }
  if (!column.notNull) return null;
  throw new Error(
    `No value rule for ${shape.name}.${column.name} (${column.type}): add one to COLUMN_VALUES`,
  );
}

function valueFor(
  shape: TableShape,
  column: ColumnShape,
  ctx: SeedContext,
  keys: ForeignKeyShape[],
  parents: SeededRows,
  globals: SeededRows,
): unknown {
  const explicit =
    COLUMN_VALUES[`${shape.name}.${column.name}`] ?? COLUMN_VALUES[column.name];
  if (explicit) return explicit(ctx);
  const fk = keys.find((k) => k.columns.includes(column.name));
  if (fk) {
    if (fk.parent === shape.name) return null;
    const parent = (fk.global ? globals : parents).get(fk.parent);
    if (!parent) {
      throw new Error(`${shape.name}.${column.name}: no seeded ${fk.parent} row`);
    }
    return parent[fk.parentColumns[fk.columns.indexOf(column.name)]];
  }
  const plainText =
    column.category === 'S' && column.allowed === null && !column.inOtherCheck;
  if (column.hasDefault && !plainText) return OMIT;
  if (!column.notNull && column.inOtherCheck) return null;
  if (column.allowed) return column.allowed[0];
  return byType(shape, column, ctx);
}

/** A valid row of `shape` for `ctx.tenantId`, its foreign keys pointing at `parents`. */
export function buildRow(
  shape: TableShape,
  ctx: SeedContext,
  parents: SeededRows,
  globals: SeededRows,
  swap?: Swap,
): Row {
  const row: Row = { tenant_id: ctx.tenantId };
  const filled = new Set(['tenant_id', 'id']);
  // Multi-column keys first: they fix every column they share with a single-column one
  const keys = [...shape.foreignKeys].sort(
    (x, y) => y.columns.length - x.columns.length,
  );
  if (swap) {
    const fk = keys.find((k) => k.name === swap.foreignKey);
    if (!fk) throw new Error(`${shape.name} has no foreign key ${swap.foreignKey}`);
    fk.columns.forEach((column, i) => {
      row[column] = swap.parent[fk.parentColumns[i]];
      filled.add(column);
    });
  }
  for (const column of shape.columns) {
    if (filled.has(column.name)) continue;
    const value = valueFor(shape, column, ctx, keys, parents, globals);
    if (value !== OMIT) row[column.name] = value;
  }
  return row;
}

export async function insertRow(c: Client, table: string, row: Row): Promise<Row> {
  const names = Object.keys(row);
  const { rows } = await c.query<Row>(
    `INSERT INTO ${quoteIdent(table)} (${names.map(quoteIdent).join(', ')})
     VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    names.map((name) => row[name]),
  );
  return rows[0];
}

function parentClosure(shapes: TableShape[]): TableShape[] {
  const byName = new Map(shapes.map((s) => [s.name, s]));
  const keep = new Set<string>();
  const add = (name: string): void => {
    if (keep.has(name)) return;
    keep.add(name);
    for (const fk of byName.get(name)?.foreignKeys ?? []) {
      if (!fk.global && fk.parent !== name) add(fk.parent);
    }
  };
  for (const shape of shapes) {
    for (const fk of shape.foreignKeys) {
      if (!fk.global && fk.parent !== shape.name) add(fk.parent);
    }
  }
  return shapes.filter((shape) => keep.has(shape.name));
}

/**
 * One row in every tenant table (or every parent table) of `options.tenantId`, in one
 * transaction, as the connected role (an admin connection writes tenant_id explicitly).
 */
export async function seedCanaryRows(
  c: Client,
  options: SeedOptions,
): Promise<SeededRows> {
  const shapes = await readTenantSchema(c);
  const globals = await globalRows(c, shapes);
  const wanted = options.parentsOnly ? parentClosure(shapes) : shapes;
  const seeded: SeededRows = new Map();
  let current = '';
  await c.query('BEGIN');
  try {
    for (const shape of wanted) {
      current = shape.name;
      seeded.set(
        shape.name,
        await insertRow(c, shape.name, buildRow(shape, options, seeded, globals)),
      );
    }
    current = 'COMMIT (deferred constraint triggers)';
    await c.query('COMMIT');
  } catch (error) {
    await c.query('ROLLBACK');
    throw new Error(
      `Seeding ${current} of tenant ${options.label} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return seeded;
}
```

- [ ] **Step 2: Write the failing whole-schema proofs**

`test/tenancy-canary-rls.e2e-spec.ts`:

```ts
// Tenant isolation of EVERY tenant table (M1a), at the database level, as the runtime role
// mms_app. The canary seeder plants a row in each table of each tenant, so these proofs
// cover a table the moment its migration adds it.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import {
  buildRow,
  globalRows,
  insertRow,
  quoteIdent,
  readTenantSchema,
  seedCanaryRows,
  type SeededRows,
  type TableShape,
} from './support/canary-seeder';
import { tenantTables } from './support/tenancy-catalog';
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(240_000);

describe('tenant isolation of every tenant table (e2e)', () => {
  let db: TenantDatabase;
  let a: SeededTenant;
  let b: SeededTenant;
  let tables: string[];
  let shapes: TableShape[];
  let globals: SeededRows;
  let rowsA: SeededRows;
  let rowsB: SeededRows;

  const countWhere = (table: string, where: string) =>
    `SELECT count(*) AS n FROM ${quoteIdent(table)} WHERE ${where}`;

  beforeAll(async () => {
    db = await createTenantDatabase();
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    [tables, shapes] = await db.admin(
      async (c) => [await tenantTables(c), await readTenantSchema(c)] as const,
    );
    globals = await db.admin((c) => globalRows(c, shapes));
    rowsA = await db.admin((c) =>
      seedCanaryRows(c, { tenantId: a.id, label: 'A', batch: 1 }),
    );
    rowsB = await db.admin((c) =>
      seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 1 }),
    );
  });

  afterAll(async () => {
    await db?.drop();
  });

  it('plants a canary row in every tenant table of both tenants', () => {
    expect([...rowsA.keys()].sort()).toEqual([...tables].sort());
    expect([...rowsB.keys()].sort()).toEqual([...tables].sort());
  });

  it('shows a connection with no tenant nothing, in every tenant table', async () => {
    const seen = await db.app('', async (c) => {
      const visible: string[] = [];
      for (const table of tables) {
        const { rows } = await c.query<{ n: string }>(countWhere(table, 'true'));
        if (Number(rows[0].n) !== 0) visible.push(`${table}: ${rows[0].n}`);
      }
      return visible;
    });
    expect(seen).toEqual([]);
  });

  it('shows each tenant its own rows and none of the other, in every tenant table', async () => {
    const wrong = await db.app(a.id, async (c) => {
      const found: string[] = [];
      for (const table of tables) {
        const all = Number(
          (await c.query<{ n: string }>(countWhere(table, 'true'))).rows[0].n,
        );
        const own = Number(
          (
            await c.query<{ n: string }>(countWhere(table, 'tenant_id = $1'), [a.id])
          ).rows[0].n,
        );
        if (own === 0 || all !== own) found.push(`${table}: ${own} own of ${all}`);
      }
      return found;
    });
    expect(wrong).toEqual([]);
  });

  it('refuses a row written for another tenant, in every tenant table', async () => {
    const wrong = await db.app(a.id, async (c) => {
      const found: string[] = [];
      for (const shape of shapes) {
        const row = buildRow(
          shape,
          { tenantId: b.id, label: 'B', batch: 30 },
          rowsB,
          globals,
        );
        await c.query('BEGIN');
        try {
          await insertRow(c, shape.name, row);
          found.push(`${shape.name}: accepted`);
        } catch (error) {
          const { code } = error as { code?: string };
          if (code !== '42501') found.push(`${shape.name}: ${code}`);
        } finally {
          await c.query('ROLLBACK');
        }
      }
      return found;
    });
    expect(wrong).toEqual([]);
  });

  it('refuses, foreign key by foreign key, a row that points at a row of another tenant', async () => {
    // Fresh parents nothing points at yet, so only the foreign key can refuse the row
    // (a unique key on a referencing column would otherwise answer first)
    const parentsA = await db.admin((c) =>
      seedCanaryRows(c, { tenantId: a.id, label: 'A', batch: 21, parentsOnly: true }),
    );
    const parentsB = await db.admin((c) =>
      seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 3, parentsOnly: true }),
    );
    let checked = 0;
    const wrong = await db.app(a.id, async (c) => {
      const found: string[] = [];
      for (const shape of shapes) {
        for (const fk of shape.foreignKeys.filter((k) => !k.global)) {
          const parent = parentsB.get(fk.parent);
          if (!parent) throw new Error(`no parent row of tenant B in ${fk.parent}`);
          // A column shared by two keys (training_records.militia_id) breaks both
          const sharing = shape.foreignKeys
            .filter((k) => k.columns.some((col) => fk.columns.includes(col)))
            .map((k) => k.name);
          const row = buildRow(
            shape,
            { tenantId: a.id, label: 'A', batch: 22 },
            parentsA,
            globals,
            { foreignKey: fk.name, parent },
          );
          await c.query('BEGIN');
          try {
            await insertRow(c, shape.name, row);
            found.push(`${shape.name}.${fk.name}: accepted a row of tenant B`);
          } catch (error) {
            const { code, constraint } = error as { code?: string; constraint?: string };
            if (code !== '23503' || !sharing.includes(constraint ?? '')) {
              found.push(
                `${shape.name}.${fk.name}: ${code} ${constraint ?? ''} ${error instanceof Error ? error.message : ''}`,
              );
            }
          } finally {
            await c.query('ROLLBACK');
          }
          checked++;
        }
      }
      return found;
    });
    expect(wrong).toEqual([]);
    expect(checked).toBe(114);
  });

  it('keeps the record-keeping triggers of migration 026 on tenant rows', async () => {
    await db.app(b.id, async (c) => {
      for (const sql of [
        `UPDATE reward_decisions SET basis = basis`,
        `DELETE FROM weapon_inventory_checks`,
        `UPDATE weapon_inventory_items SET found = found`,
        `UPDATE kpi_target_settings SET min_attendance_days = min_attendance_days`,
        `UPDATE discipline_decisions SET violation = 'changed'`,
      ]) {
        await expect(c.query(sql)).rejects.toMatchObject({ code: '23001' });
      }
    });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-canary-rls.e2e-spec.ts`
Expected: FAIL in `beforeAll` with `Seeding alerts of tenant A failed: column "tenant_id" of relation "alerts" does not exist` (or the first table in topological order without the column). Every test is reported failed.

- [ ] **Step 4: Lint and commit (RED on purpose)**

```bash
npx eslint test/support/canary-seeder.ts test/tenancy-canary-rls.e2e-spec.ts
git add test/support/canary-seeder.ts test/tenancy-canary-rls.e2e-spec.ts
git commit -m "test(tenancy): catalog-driven canary seeder and isolation proofs over every tenant table

Seeds one canary row per tenant table and proves, as mms_app, no-scope-sees-nothing,
own-rows-only, cross-tenant writes refused, all 114 foreign keys refusing another tenant's
rows and the 026 triggers intact. Failing on purpose until migrations 038-040.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Route-discovery sweep skeleton: every parameter mapped (RED)

**Files:**
- Create: `test/support/route-sweep.ts`
- Create: `test/tenancy-route-sweep.e2e-spec.ts`

**Interfaces:**
- Consumes: `seedCanaryRows`, `SeededRows` (Task 3); `tenantTables` (Task 1); `app-env`/`enforced-env` (M0).
- Produces (used by Tasks 21, 22): `DtoClass`, `SweptRoute { method; path; key; pathParams; bodyDto; bodyFields; queryDto; queryFields }`, `IdField { path; name; dto; array }`, `discoverRoutes(app)`, `idFieldsOf(dto, prefix?)`, `tableOfField(field)`, `unmappedParameters(routes, tenantTableSet)`, `staleParameterEntries(routes)`, `mappedTables()`, `PATH_PARAMS`, `FIELD_TABLES`, `CODE_FIELDS`, `NESTED_DTOS`.

- [ ] **Step 1: Write the discovery and the maps**

`test/support/route-sweep.ts`:

```ts
// Every route of the application as the isolation sweep calls it: its path parameters and
// the id fields of its body and query, each mapped to the tenant table whose ids it takes.
// A route whose parameter or id field is not mapped fails the coverage test, so a new route
// cannot stay out of the sweep. Read the service query that consumes a parameter before
// mapping it: the map is what makes the sweep send the other tenant's id where it matters.
import { RequestMethod, type INestApplication } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { getMetadataStorage } from 'class-validator';
import { AttendanceEntryDto } from '../../src/training/dto/training-plan.dto';
import { InventoryItemDto } from '../../src/weapons/dto/record-inventory.dto';

export type DtoClass = new (...args: never[]) => object;

export interface SweptRoute {
  /** 'GET', 'POST', ... */
  method: string;
  /** Without the global prefix, e.g. '/tasks/:id' */
  path: string;
  /** `${method} ${path}`, the key of PATH_PARAMS */
  key: string;
  pathParams: string[];
  bodyDto: DtoClass | null;
  /** @Body('name') single fields */
  bodyFields: string[];
  queryDto: DtoClass | null;
  queryFields: string[];
}

export interface IdField {
  /** Dotted path in the payload, e.g. 'attendance.memberId' */
  path: string;
  name: string;
  /** The DTO class declaring it */
  dto: string;
  array: boolean;
}

// Path parameter -> tenant table, per route. Checked against each service's query.
export const PATH_PARAMS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'DELETE /assignments/:id': { id: 'ca_dqtv_assignments' },
  'DELETE /devices/:sessionId': { sessionId: 'sessions' },
  'DELETE /devices/sessions/:id': { id: 'sessions' },
  'DELETE /militia/:id': { id: 'militia_profiles' },
  'DELETE /notifications/:id': { id: 'notifications' },
  'DELETE /official-documents/:id': { id: 'official_documents' },
  'DELETE /organization/units/:id': { id: 'organization_units' },
  'DELETE /recruitment/applications/:id': { id: 'recruitment_applications' },
  'DELETE /tasks/:id': { id: 'tasks' },
  'DELETE /training/:id': { id: 'training_records' },
  'DELETE /weapons/:id': { id: 'weapons' },
  'GET /admin/users/:id': { id: 'users' },
  'GET /chat/conversations/:id/messages': { id: 'conversations' },
  'GET /discipline/:id': { id: 'discipline_decisions' },
  'GET /files/:id': { id: 'files' },
  'GET /gps/history/:id': { id: 'militia_profiles' },
  'GET /leave/:id': { id: 'leave_requests' },
  'GET /militia/:id': { id: 'militia_profiles' },
  'GET /militia/:id/documents': { id: 'militia_profiles' },
  'GET /militia/:id/history': { id: 'militia_profiles' },
  'GET /militia/:id/rewards': { id: 'militia_profiles' },
  'GET /official-documents/:id': { id: 'official_documents' },
  'GET /organization/units/:id': { id: 'organization_units' },
  'GET /payroll/periods/:id/export-pdf': { id: 'payroll_periods' },
  'GET /recruitment/applications/:id': { id: 'recruitment_applications' },
  'GET /rewards/:id': { id: 'reward_decisions' },
  'GET /sos/:id': { id: 'incidents' },
  'GET /tasks/:id': { id: 'tasks' },
  'GET /training/:id': { id: 'training_records' },
  'GET /training/plans/:id': { id: 'training_plans' },
  'GET /training/sessions/:id': { id: 'training_sessions' },
  'GET /training/sessions/:id/members': { id: 'training_sessions' },
  'GET /weapons/:id': { id: 'weapons' },
  'GET /weapons/inventory/:id': { id: 'weapon_inventory_checks' },
  'GET /work-reports/:id': { id: 'work_reports' },
  'PATCH /admin/users/:id/role': { id: 'users' },
  'PATCH /admin/users/:id/status': { id: 'users' },
  'PATCH /discipline/:id/appeal': { id: 'discipline_decisions' },
  'PATCH /discipline/:id/appeal/decision': { id: 'discipline_decisions' },
  'PATCH /exemptions/:id/review': { id: 'exemptions' },
  'PATCH /leave/:id/cancel': { id: 'leave_requests' },
  'PATCH /leave/:id/review': { id: 'leave_requests' },
  'PATCH /militia/:id': { id: 'militia_profiles' },
  'PATCH /notifications/:id/read': { id: 'notifications' },
  'PATCH /official-documents/:id': { id: 'official_documents' },
  'PATCH /organization/positions/:id': { id: 'organization_units' },
  'PATCH /organization/units/:id': { id: 'organization_units' },
  'PATCH /payroll/kpi/:militiaId': { militiaId: 'militia_profiles' },
  'PATCH /recruitment/applications/:id': { id: 'recruitment_applications' },
  'PATCH /sos/:id/status': { id: 'incidents' },
  'PATCH /tasks/:id': { id: 'tasks' },
  'PATCH /tasks/:id/progress': { id: 'tasks' },
  'PATCH /training/:id': { id: 'training_records' },
  'PATCH /training/plans/:id/status': { id: 'training_plans' },
  'PATCH /weapons/:id': { id: 'weapons' },
  'PATCH /weapons/allocations/:id/return': { id: 'weapon_allocations' },
  'PATCH /work-reports/:id/review': { id: 'work_reports' },
  'POST /admin/users/:id/mfa/reset': { id: 'users' },
  'POST /admin/users/:id/reset-password': { id: 'users' },
  'POST /chat/conversations/:id/messages': { id: 'conversations' },
  'POST /chat/conversations/:id/read': { id: 'conversations' },
  'POST /militia/:id/documents': { id: 'militia_profiles' },
  'POST /payroll/periods/:id/calculate': { id: 'payroll_periods' },
  'POST /payroll/periods/:id/lock': { id: 'payroll_periods' },
  'POST /payroll/periods/:id/reopen': { id: 'payroll_periods' },
  'POST /tasks/:id/accept': { id: 'tasks' },
  'POST /tasks/:id/report': { id: 'tasks' },
  'POST /training/sessions/:id/attendance': { id: 'training_sessions' },
  'PUT /approvals/:id/approve': { id: 'leave_requests' },
  'PUT /approvals/:id/reject': { id: 'leave_requests' },
};

// Id field of a body or query DTO -> tenant table. `Dto.field` wins over `field`.
export const FIELD_TABLES: Readonly<Record<string, string>> = {
  caUserId: 'users',
  dqtvUserId: 'users',
  userId: 'users',
  targetUserId: 'users',
  replacementId: 'users',
  assignedTo: 'users',
  participantIds: 'users',
  militiaId: 'militia_profiles',
  memberId: 'militia_profiles',
  assigneeMilitiaId: 'militia_profiles',
  commanderId: 'militia_profiles',
  recipientId: 'militia_profiles',
  leaveTypeId: 'leave_types',
  fileId: 'files',
  fileIds: 'files',
  attachmentIds: 'files',
  photoIds: 'files',
  unitId: 'units',
  periodId: 'payroll_periods',
  planId: 'training_plans',
  weaponId: 'weapons',
  'CreateUnitDto.parentId': 'organization_units',
  'UpdateUnitDto.parentId': 'organization_units',
};

// String fields naming a row by its code: the sweep sends the other tenant's code
export const CODE_FIELDS: Readonly<Record<string, { table: string; column: string }>> = {
  unitCode: { table: 'units', column: 'code' },
};

// ValidateNested arrays lose their element type in design:type metadata
export const NESTED_DTOS: Readonly<Record<string, DtoClass>> = {
  'SessionAttendanceDto.attendance': AttendanceEntryDto,
  'RecordInventoryDto.items': InventoryItemDto,
};

const toPaths = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value ?? '']).map((p) => String(p));

const joinPath = (...parts: string[]): string =>
  '/' + parts.flatMap((p) => p.split('/')).filter(Boolean).join('/');

const isDtoClass = (value: unknown): value is DtoClass =>
  typeof value === 'function' &&
  ![Object, String, Number, Boolean, Array].includes(value as never);

const isListed = (record: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

interface Argument {
  data: unknown;
  type: unknown;
}

export function discoverRoutes(app: INestApplication): SweptRoute[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const routes: SweptRoute[] = [];
  for (const wrapper of discovery.getControllers() as InstanceWrapper<object>[]) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const controllerPaths = toPaths(Reflect.getMetadata(PATH_METADATA, metatype));
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as object;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      if (method === undefined) continue;
      const declared = (Reflect.getMetadata(ROUTE_ARGS_METADATA, metatype, name) ??
        {}) as Record<string, { index: number; data?: unknown }>;
      const types = (Reflect.getMetadata('design:paramtypes', prototype, name) ??
        []) as unknown[];
      const of = (kind: RouteParamtypes): Argument[] =>
        Object.entries(declared)
          .filter(([key]) => key.split(':')[0] === String(kind))
          .map(([, arg]) => ({ data: arg.data, type: types[arg.index] }));
      const bodies = of(RouteParamtypes.BODY);
      const queries = of(RouteParamtypes.QUERY);
      const dtoOf = (args: Argument[]): DtoClass | null => {
        const whole = args.find((arg) => arg.data === undefined && isDtoClass(arg.type));
        return whole && isDtoClass(whole.type) ? whole.type : null;
      };
      const fieldsOf = (args: Argument[]): string[] =>
        args.flatMap((arg) => (typeof arg.data === 'string' ? [arg.data] : []));
      for (const controllerPath of controllerPaths) {
        for (const methodPath of toPaths(Reflect.getMetadata(PATH_METADATA, handler))) {
          const path = joinPath(controllerPath, methodPath);
          const verb = RequestMethod[method];
          routes.push({
            method: verb,
            path,
            key: `${verb} ${path}`,
            pathParams: [...path.matchAll(/:(\w+)/g)].map((m) => m[1]),
            bodyDto: dtoOf(bodies),
            bodyFields: fieldsOf(bodies),
            queryDto: dtoOf(queries),
            queryFields: fieldsOf(queries),
          });
        }
      }
    }
  }
  return routes.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}

/** The id fields of a DTO (validated as UUID, or named *Id / *Ids), nested DTOs included. */
export function idFieldsOf(
  dto: DtoClass,
  prefix = '',
): { fields: IdField[]; problems: string[] } {
  const metadata = getMetadataStorage().getTargetValidationMetadatas(
    dto,
    '',
    true,
    false,
  );
  const byProperty = new Map<string, typeof metadata>();
  for (const entry of metadata) {
    byProperty.set(entry.propertyName, [
      ...(byProperty.get(entry.propertyName) ?? []),
      entry,
    ]);
  }
  const fields: IdField[] = [];
  const problems: string[] = [];
  for (const [property, entries] of byProperty) {
    const path = prefix ? `${prefix}.${property}` : property;
    if (entries.some((e) => e.name === 'isUuid') || /Ids?$/.test(property)) {
      fields.push({
        path,
        name: property,
        dto: dto.name,
        array: entries.some((e) => e.each === true) || /Ids$/.test(property),
      });
    }
    if (entries.some((e) => e.type === 'nestedValidation')) {
      const declaredType: unknown = Reflect.getMetadata(
        'design:type',
        dto.prototype,
        property,
      );
      const nested =
        NESTED_DTOS[`${dto.name}.${property}`] ??
        (isDtoClass(declaredType) ? declaredType : undefined);
      if (!nested) {
        problems.push(`${dto.name}.${property}: nested DTO without an entry in NESTED_DTOS`);
      } else {
        const inner = idFieldsOf(nested, path);
        fields.push(...inner.fields);
        problems.push(...inner.problems);
      }
    }
  }
  return { fields, problems };
}

export const tableOfField = (field: IdField): string | undefined =>
  isListed(FIELD_TABLES, `${field.dto}.${field.name}`)
    ? FIELD_TABLES[`${field.dto}.${field.name}`]
    : isListed(FIELD_TABLES, field.name)
      ? FIELD_TABLES[field.name]
      : undefined;

/** Every route parameter or id field that is not mapped to a tenant table. */
export function unmappedParameters(
  routes: SweptRoute[],
  tenantTableSet: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const check = (where: string, table: string | undefined) => {
    if (table === undefined) problems.push(`${where}: not mapped`);
    else if (!tenantTableSet.has(table)) {
      problems.push(`${where}: mapped to ${table}, which is not a tenant table`);
    }
  };
  for (const route of routes) {
    const params = isListed(PATH_PARAMS, route.key) ? PATH_PARAMS[route.key] : {};
    for (const param of route.pathParams) {
      check(
        `${route.key} :${param}`,
        isListed(params, param) ? params[param] : undefined,
      );
    }
    const parts = [
      ['body', route.bodyDto, route.bodyFields],
      ['query', route.queryDto, route.queryFields],
    ] as const;
    for (const [kind, dto, singles] of parts) {
      if (dto) {
        const { fields, problems: nested } = idFieldsOf(dto);
        problems.push(...nested.map((p) => `${route.key} ${kind}: ${p}`));
        for (const field of fields) {
          check(`${route.key} ${kind}.${field.path}`, tableOfField(field));
        }
      }
      for (const name of singles.filter((field) => /Ids?$/.test(field))) {
        check(
          `${route.key} ${kind}.${name}`,
          isListed(FIELD_TABLES, name) ? FIELD_TABLES[name] : undefined,
        );
      }
    }
  }
  return problems;
}

/** PATH_PARAMS entries of routes that no longer exist. */
export const staleParameterEntries = (routes: SweptRoute[]): string[] => {
  const keys = new Set(routes.map((route) => route.key));
  return Object.keys(PATH_PARAMS).filter((key) => !keys.has(key));
};

/** Every table a mapped parameter or field names. */
export const mappedTables = (): string[] =>
  [
    ...new Set([
      ...Object.values(PATH_PARAMS).flatMap((params) => Object.values(params)),
      ...Object.values(FIELD_TABLES),
      ...Object.values(CODE_FIELDS).map((field) => field.table),
    ]),
  ].sort();
```

- [ ] **Step 2: Write the skeleton suite**

`test/tenancy-route-sweep.e2e-spec.ts`:

```ts
// Isolation sweep over EVERY route (spec C12, the M1 gate). Task 4: the map from every
// route parameter and id field to a tenant table, and the other tenant's canary rows the
// sweep points them at. Task 21 adds the cross-tenant calls.
// Runs the backend as mms_app with TENANCY_MODE=enforced. Requires MIGRATION_TEST_ADMIN_URL
// and TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import './support/enforced-env';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { seedCanaryRows, type SeededRows } from './support/canary-seeder';
import {
  discoverRoutes,
  mappedTables,
  staleParameterEntries,
  unmappedParameters,
  type SweptRoute,
} from './support/route-sweep';
import { tenantTables } from './support/tenancy-catalog';
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(300_000);

describe('isolation sweep of every route (e2e)', () => {
  let db: TenantDatabase;
  let app: INestApplication;
  let a: SeededTenant;
  let b: SeededTenant;
  let routes: SweptRoute[];
  let tables: string[];

  beforeAll(async () => {
    db = await createTenantDatabase({ name: E2E_DB_NAME });
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    tables = await db.admin((c) => tenantTables(c));
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.init();
    routes = discoverRoutes(app);
  });

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  describe('route map', () => {
    it('discovers every route of the application', () => {
      expect(routes.length).toBeGreaterThan(150);
      expect(a.id).not.toBe(b.id);
    });

    it('maps every path parameter and every id field of every route to a tenant table', () => {
      expect(unmappedParameters(routes, new Set(tables))).toEqual([]);
    });

    it('keeps no parameter entry for a route that no longer exists', () => {
      expect(staleParameterEntries(routes)).toEqual([]);
    });
  });

  describe('the other tenant', () => {
    let rowsB: SeededRows;

    beforeAll(async () => {
      rowsB = await db.admin((c) =>
        seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 1 }),
      );
    });

    it('has a canary row in every table a parameter names', () => {
      expect(mappedTables().filter((table) => !rowsB.has(table))).toEqual([]);
    });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-route-sweep.e2e-spec.ts`
Expected: the three `route map` tests can already pass, but one fails as long as a parameter is unmapped. `the other tenant` FAILS in its `beforeAll` with `Seeding … of tenant B failed: column "tenant_id" … does not exist`. That part stays RED until Task 10.

If `maps every path parameter…` lists entries, handle each one: read the controller and the service query that consumes it, then add the right tenant table to `PATH_PARAMS`, `FIELD_TABLES` (use the `Dto.field` key when one name means different tables in different DTOs) or `NESTED_DTOS`. Re-run until the `route map` block passes. Never map a field to a table the query does not read.

- [ ] **Step 4: Lint and commit (RED on purpose)**

```bash
npx eslint test/support/route-sweep.ts test/tenancy-route-sweep.e2e-spec.ts
git add test/support/route-sweep.ts test/tenancy-route-sweep.e2e-spec.ts
git commit -m "test(tenancy): route-discovery sweep skeleton mapping every parameter to a tenant table

Every route found by DiscoveryService must map each path parameter and each id field of its
body and query DTOs; an unmapped one fails. Failing on purpose until the canary rows of every
tenant table can be seeded (migrations 038-040).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
## Phase B — migration runner: non-transactional files (spec D16 / 8A)

### Task 5: SQL statement splitter

**Files:**
- Create: `src/database/migrations/sql-statements.ts`
- Create: `src/database/migrations/sql-statements.spec.ts`

**Interfaces:**
- Produces: `splitSqlStatements(sql: string): string[]` (trimmed top-level statements, each with its leading comments, no empty or comment-only entries) and `class SqlSplitError extends Error`. Task 6 uses both.

- [ ] **Step 1: Write the failing tests**

`src/database/migrations/sql-statements.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { thrownBy } from '../../../test/support/thrown-by';
import { SqlSplitError, splitSqlStatements } from './sql-statements';

describe('splitSqlStatements', () => {
  it('splits on top-level semicolons and drops empty and comment-only statements', () => {
    expect(
      splitSqlStatements('SELECT 1;\n\n;  SELECT 2 ;\n-- trailing comment ;\n'),
    ).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps the comments that lead a statement with it', () => {
    expect(splitSqlStatements('-- header\n-- more\nSELECT 1;')).toEqual([
      '-- header\n-- more\nSELECT 1',
    ]);
  });

  it('does not split inside literals, identifiers, dollar quotes or comments', () => {
    const sql = [
      `SELECT 'a;b'`,
      `SELECT E'it\\'s; x'`,
      `SELECT "we;ird" FROM t`,
      `DO $$ BEGIN PERFORM 1; END $$`,
      `DO $body$ SELECT $$;$$ $body$`,
      `/* c ; /* nested ; */ */ SELECT 2`,
      `SELECT 'it''s; fine'`,
    ];
    expect(splitSqlStatements(sql.join(';\n') + ';')).toEqual(sql);
  });

  it('reads a $1 or an identifier containing $ as code, not as a dollar quote', () => {
    expect(splitSqlStatements('SELECT a$b$c FROM t; SELECT $1;')).toEqual([
      'SELECT a$b$c FROM t',
      'SELECT $1',
    ]);
  });

  it.each([
    ["SELECT 'open", 'string'],
    ['SELECT "open', 'quoted identifier'],
    ['DO $x$ BEGIN', 'dollar-quoted string $x$'],
    ['/* open /* nested */', 'block comment'],
  ])('refuses an unterminated construct: %s', (sql, what) => {
    expect(thrownBy(() => splitSqlStatements(sql))).toMatchObject({
      name: 'SqlSplitError',
      message: expect.stringContaining(`Unterminated ${what}`) as unknown,
    });
    expect(thrownBy(() => splitSqlStatements(sql))).toBeInstanceOf(SqlSplitError);
  });

  it('splits every migration file of the repository', () => {
    const directory = path.join(__dirname, '..', '..', '..', 'migrations');
    const counts = Object.fromEntries(
      fs
        .readdirSync(directory)
        .filter((name) => name.endsWith('.sql'))
        .map((name) => [
          name,
          splitSqlStatements(fs.readFileSync(path.join(directory, name), 'utf8'))
            .length,
        ]),
    );
    expect(counts['036_tenants.sql']).toBe(18);
    expect(counts['037_tenant_slice_rls.sql']).toBe(8);
    Object.entries(counts).forEach(([name, count]) =>
      expect({ name, nonEmpty: count > 0 }).toEqual({ name, nonEmpty: true }),
    );
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/database/migrations/sql-statements.spec.ts`
Expected: FAIL with `Cannot find module './sql-statements'`.

- [ ] **Step 3: Implement**

`src/database/migrations/sql-statements.ts`:

```ts
// Splits a migration file into its top-level statements, for the files the runner executes
// one statement at a time (non-transactional migrations, see migration-runner.ts). A
// semicolon splits only outside string literals ('...', E'...'), quoted identifiers
// ("..."), dollar-quoted bodies ($$...$$, $tag$...$tag$) and comments (--, nested /* */).
// Each statement keeps the comments that lead it; empty and comment-only ones are dropped.

export class SqlSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlSplitError';
  }
}

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;
const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;
// A dollar-quote tag is an identifier: 63 bytes at most, plus the two dollar signs
const LONGEST_TAG = 65;

function skipBlockComment(sql: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql[i] === '/' && sql[i + 1] === '*') {
      depth++;
      i += 2;
    } else if (sql[i] === '*' && sql[i + 1] === '/') {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  throw new SqlSplitError(`Unterminated block comment at offset ${start}`);
}

function skipQuoted(
  sql: string,
  start: number,
  quote: "'" | '"',
  backslashEscapes: boolean,
): number {
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (backslashEscapes && ch === '\\') {
      i += 2;
    } else if (ch === quote) {
      if (sql[i + 1] !== quote) return i + 1;
      i += 2;
    } else {
      i++;
    }
  }
  throw new SqlSplitError(
    `Unterminated ${quote === "'" ? 'string' : 'quoted identifier'} at offset ${start}`,
  );
}

// E'...' accepts backslash escapes; the E must not end an identifier (WHERE'x' is not one)
function isEscapeString(sql: string, quoteAt: number): boolean {
  const prefix = sql[quoteAt - 1];
  return (
    (prefix === 'E' || prefix === 'e') &&
    (quoteAt < 2 || !IDENTIFIER_CHAR.test(sql[quoteAt - 2]))
  );
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let hasCode = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (ch === '/' && next === '*') {
      i = skipBlockComment(sql, i);
    } else if (ch === "'") {
      hasCode = true;
      i = skipQuoted(sql, i, "'", isEscapeString(sql, i));
    } else if (ch === '"') {
      hasCode = true;
      i = skipQuoted(sql, i, '"', false);
    } else if (ch === '$' && (i === 0 || !IDENTIFIER_CHAR.test(sql[i - 1]))) {
      hasCode = true;
      const tag = DOLLAR_TAG.exec(sql.slice(i, i + LONGEST_TAG))?.[0];
      if (tag === undefined) {
        i++;
      } else {
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) {
          throw new SqlSplitError(
            `Unterminated dollar-quoted string ${tag} at offset ${i}`,
          );
        }
        i = end + tag.length;
      }
    } else if (ch === ';') {
      if (hasCode) statements.push(sql.slice(start, i).trim());
      start = i + 1;
      hasCode = false;
      i++;
    } else {
      if (!/\s/.test(ch)) hasCode = true;
      i++;
    }
  }
  if (hasCode) statements.push(sql.slice(start).trim());
  return statements;
}
```

- [ ] **Step 4: Run them and confirm they pass**

Run: `npx jest src/database/migrations/sql-statements.spec.ts`
Expected: PASS (10 tests). The algorithm was checked against migrations 001–037 when the plan was written: 036 splits into 18 statements and 037 into 8.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/database/migrations/sql-statements.ts src/database/migrations/sql-statements.spec.ts
git add src/database/migrations/sql-statements.ts src/database/migrations/sql-statements.spec.ts
git commit -m "feat(migrations): split a migration file into its top-level statements

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Non-transactional migrations and `--through` in the runner and the Postgres store

**Files:**
- Modify: `src/database/migrations/migration-runner.ts` (interface `MigrationStore`, `MigrationReport`, `RunOptions`, `runMigrations` lines 140-232)
- Modify: `src/database/migrations/postgres-migration-store.ts` (new `applyWithoutTransaction`, `dropInvalidIndexes`, `resetLockTimeout`)
- Modify: `src/database/migrations/migrate.ts:85-87` (pass `through`)
- Modify: `src/database/migrations/migration-config.ts` (`through` from `--through=` / `MIGRATION_THROUGH`)
- Modify: `src/database/migrations/migrate.cli.ts` (print pending files; header comment)
- Test: `src/database/migrations/migration-runner.spec.ts`, `postgres-migration-store.spec.ts`, `migration-config.spec.ts`

**Interfaces:**
- Consumes: `splitSqlStatements`, `SqlSplitError` (Task 5).
- Produces: `NO_TRANSACTION_MARKER = '-- mms:migration no-transaction'`, `isNonTransactional(sql)`, `nonTransactionalStatements(file): string[]` (throws `MigrationInvalidError`), `indexesBuiltBy(statements): string[]`, `MigrationStore.applyWithoutTransaction(file, checksum, statements): Promise<void>`, `RunOptions.through?: string`, `MigrationReport.pending: string[]`, `MigrationThroughError`, `MigrationInvalidError { fileName }`. `MigrateOptions` gains `through` through `RunOptions`.

The contract, also documented in `docs/migrations.md` by Task 10:

1. The file's leading comment lines contain the exact line `-- mms:migration no-transaction`. A marker after the first SQL line does not count.
2. The runner splits the file and runs each statement on its own, autocommitted, on the migration session. That session keeps holding the advisory lock. Each statement waits at most `MIGRATION_LOCK_TIMEOUT` for a lock (session `SET`, reset afterwards).
3. Before the first statement, the runner drops (`DROP INDEX CONCURRENTLY`) every INVALID index the file builds: an interrupted `CONCURRENTLY` build leaves one behind.
4. The `schema_migrations` row is written only after the last statement succeeds. A failure leaves no row, and the next start runs the whole file again. Every statement must therefore be idempotent. The runner checks what it can before running anything: every `CREATE [UNIQUE] INDEX` is `CONCURRENTLY IF NOT EXISTS`, every `DROP INDEX` is `CONCURRENTLY IF EXISTS`, and no statement controls a transaction. `ADD COLUMN IF NOT EXISTS` and `VALIDATE CONSTRAINT` are the author's responsibility.
5. Checksums are unchanged. The checksum covers the whole file text, and an applied file is still never edited.

- [ ] **Step 1: Write the failing runner tests**

In `src/database/migrations/migration-runner.spec.ts`, extend the in-memory store and add the tests.

Add to `class MemoryStore` (beside `applyInTransaction`):

```ts
  readonly statementRuns: { file: string; statements: string[] }[] = [];

  applyWithoutTransaction(
    file: MigrationFile,
    sum: string,
    statements: string[],
  ): Promise<void> {
    if (file.name === this.failOn) {
      return Promise.reject(new Error(`statement failed in ${file.name}`));
    }
    this.statementRuns.push({ file: file.name, statements });
    this.checksums.set(file.name, sum);
    return Promise.resolve();
  }
```

Extend the import from `./migration-runner` with `indexesBuiltBy`, `isNonTransactional`, `MigrationThroughError` (keep the existing names). Add `import { thrownBy } from '../../../test/support/thrown-by';`. Then append:

```ts
describe('non-transactional migrations', () => {
  const base: MigrationFile = { name: '001_a.sql', sql: 'CREATE TABLE a (v int);' };
  const online = (body: string, name = '002_online.sql'): MigrationFile => ({
    name,
    sql: `-- mms:migration no-transaction\n-- Builds the index online\n${body}`,
  });

  it('recognises the marker among the leading comment lines only', () => {
    expect(isNonTransactional('-- mms:migration no-transaction\nSELECT 1;')).toBe(true);
    expect(isNonTransactional('-- About it\n\n--  mms:migration  no-transaction \nSELECT 1;')).toBe(true);
    expect(isNonTransactional('SELECT 1;\n-- mms:migration no-transaction')).toBe(false);
    expect(isNonTransactional('-- mms:migration no-transaction please\nSELECT 1;')).toBe(false);
  });

  it('runs a marked file statement by statement, outside a transaction', async () => {
    const store = new MemoryStore();
    const file = online(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_a ON a (v);\nALTER TABLE a VALIDATE CONSTRAINT a_fkey;',
    );

    const report = await runMigrations(store, [base, file]);

    expect(report.applied).toEqual(['001_a.sql', '002_online.sql']);
    expect(store.executed).toEqual(['001_a.sql']);
    expect(store.statementRuns).toHaveLength(1);
    const [run] = store.statementRuns;
    expect(run.file).toBe('002_online.sql');
    expect(run.statements).toHaveLength(2);
    expect(run.statements[0]).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_a ON a \(v\)$/,
    );
    expect(run.statements[1]).toBe('ALTER TABLE a VALIDATE CONSTRAINT a_fkey');
  });

  it.each([
    ['CREATE INDEX ix_a ON a (v);', 'must be CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS'],
    ['CREATE UNIQUE INDEX CONCURRENTLY ix_a ON a (v);', 'must be CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS'],
    ['DROP INDEX ix_a;', 'must be DROP INDEX CONCURRENTLY IF EXISTS'],
    ['BEGIN;\nALTER TABLE a ADD COLUMN IF NOT EXISTS w int;\nCOMMIT;', 'controls a transaction'],
  ])('refuses, before running any file, a marked file that could not run again: %s', async (body, problem) => {
    const store = new MemoryStore();

    await expect(runMigrations(store, [base, online(body)])).rejects.toMatchObject({
      name: 'MigrationInvalidError',
      fileName: '002_online.sql',
      message: expect.stringContaining(problem) as unknown,
    });
    expect(store.executed).toEqual([]);
    expect(store.statementRuns).toEqual([]);
  });

  it('records nothing for a marked file that fails, and names it', async () => {
    const store = new MemoryStore();
    store.failOn = '002_online.sql';

    await expect(
      runMigrations(store, [base, online('ALTER TABLE a VALIDATE CONSTRAINT a_fkey;')]),
    ).rejects.toMatchObject({ name: 'MigrationFailedError', fileName: '002_online.sql' });
    expect([...store.checksums.keys()]).toEqual(['001_a.sql']);
  });

  it('keeps the checksum rules for marked files', async () => {
    const store = new MemoryStore();
    const file = online('ALTER TABLE a VALIDATE CONSTRAINT a_fkey;');
    await runMigrations(store, [base, file]);

    await expect(
      runMigrations(store, [base, { ...file, sql: `${file.sql}\n-- edited` }]),
    ).rejects.toMatchObject({ name: 'MigrationChecksumError', fileName: '002_online.sql' });
  });

  it('names the indexes a marked file builds concurrently, quoted names unquoted', () => {
    expect(
      indexesBuiltBy([
        '-- c\nCREATE INDEX CONCURRENTLY IF NOT EXISTS Ix_A ON a (v)',
        'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Odd""Name" ON a (v)',
        'ALTER TABLE a VALIDATE CONSTRAINT a_fkey',
      ]),
    ).toEqual(['ix_a', 'Odd"Name']);
  });

  it('stops after the file named by through, and reports the rest as pending', async () => {
    const store = new MemoryStore();
    const third: MigrationFile = { name: '003_c.sql', sql: 'CREATE TABLE c (v int);' };

    const report = await runMigrations(
      store,
      [base, online('ALTER TABLE a VALIDATE CONSTRAINT a_fkey;'), third],
      { through: '002_online.sql' },
    );

    expect(report.applied).toEqual(['001_a.sql', '002_online.sql']);
    expect(report.pending).toEqual(['003_c.sql']);
  });

  it('refuses a through that names no migration file, before running anything', async () => {
    const store = new MemoryStore();

    await expect(
      runMigrations(store, [base], { through: '002_missing.sql' }),
    ).rejects.toBeInstanceOf(MigrationThroughError);
    expect(store.executed).toEqual([]);
  });

  it('refuses a marked file that cannot be split, before running anything', async () => {
    const store = new MemoryStore();

    await expect(
      runMigrations(store, [base, online("UPDATE a SET v = 'open;")]),
    ).rejects.toMatchObject({
      name: 'MigrationInvalidError',
      fileName: '002_online.sql',
      message: expect.stringContaining('Unterminated string') as unknown,
    });
    expect(store.executed).toEqual([]);
  });

  it('builds the invalid-file error from every problem it found', () => {
    expect(
      thrownBy(() => nonTransactionalStatements(online('CREATE INDEX a1 ON a (v);\nDROP INDEX a2;'))),
    ).toMatchObject({
      name: 'MigrationInvalidError',
      problems: [
        expect.stringContaining('statement 1') as unknown,
        expect.stringContaining('statement 2') as unknown,
      ],
    });
  });
});
```

Add `nonTransactionalStatements` to the same import. `MigrationFailedError`, `MigrationInvalidError` and `MigrationThroughError` are named in the assertions through `name`; keep `MigrationThroughError` imported for the `toBeInstanceOf` check.

Every existing `toEqual({ applied, skipped, baselined })` on a report now also needs `pending: []`. Update those assertions mechanically (the shape changed, and the meaning did not).

- [ ] **Step 2: Write the failing store and config tests**

In `src/database/migrations/postgres-migration-store.spec.ts`, give `fakeClient` an optional second parameter `rowsFor: (sql: string) => unknown[] = () => []` and resolve `{ rows: rowsFor(statement) }`. Then append:

```ts
describe('PostgresMigrationStore without a transaction', () => {
  const online = { name: '038_online.sql', sql: '-- mms:migration no-transaction' };
  const statements = [
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_a ON a (v)',
    'ALTER TABLE a VALIDATE CONSTRAINT a_fkey',
  ];

  it('runs each statement on its own, bounded by the lock timeout, and records the file after the last', async () => {
    const client = fakeClient();

    await new PostgresMigrationStore(client as never).applyWithoutTransaction(
      online,
      'x'.repeat(64),
      statements,
    );

    expect(client.statements).not.toContain('BEGIN');
    expect(client.statements[0]).toBe("SET lock_timeout = '10s'");
    expect(client.statements[1]).toMatch(/NOT x\.indisvalid/);
    expect(client.statements.slice(2, 4)).toEqual(statements);
    expect(client.statements[4]).toMatch(/^INSERT INTO schema_migrations/);
    expect(last(client.statements)).toBe('RESET lock_timeout');
  });

  it('drops an index an interrupted build left INVALID before building it again', async () => {
    const client = fakeClient(undefined, (sql) =>
      /NOT x\.indisvalid/.test(sql) ? [{ name: 'ix_a' }] : [],
    );

    await new PostgresMigrationStore(client as never).applyWithoutTransaction(
      online,
      'x'.repeat(64),
      statements,
    );

    expect(client.statements[2]).toBe('DROP INDEX CONCURRENTLY IF EXISTS "ix_a"');
    expect(client.statements[3]).toBe(statements[0]);
  });

  it('records nothing when a statement fails, reports that failure, and still resets the lock timeout', async () => {
    const failure = new Error('could not validate');
    const client = fakeClient((sql) => (sql === statements[1] ? failure : undefined));

    await expect(
      new PostgresMigrationStore(client as never).applyWithoutTransaction(
        online,
        'x'.repeat(64),
        statements,
      ),
    ).rejects.toBe(failure);
    expect(client.statements.some((s) => s.startsWith('INSERT INTO schema_migrations'))).toBe(false);
    expect(last(client.statements)).toBe('RESET lock_timeout');
  });

  it('reports the statement failure even when the reset fails too', async () => {
    const failure = new Error('could not validate');
    const client = fakeClient((sql) =>
      sql === statements[1] ? failure : sql === 'RESET lock_timeout' ? new Error('gone') : undefined,
    );

    await expect(
      new PostgresMigrationStore(client as never).applyWithoutTransaction(
        online,
        'x'.repeat(64),
        statements,
      ),
    ).rejects.toBe(failure);
  });
});
```

In `src/database/migrations/migration-config.spec.ts`, add:

```ts
  it('reads the last file to apply from --through, then MIGRATION_THROUGH', () => {
    expect(
      migrationOptionsFromEnv({ MIGRATION_THROUGH: '038_a.sql' }, [], '/app').through,
    ).toBe('038_a.sql');
    expect(
      migrationOptionsFromEnv(
        { MIGRATION_THROUGH: '038_a.sql' },
        ['node', 'migrate', '--through=039_b.sql'],
        '/app',
      ).through,
    ).toBe('039_b.sql');
    expect(migrationOptionsFromEnv({}, [], '/app').through).toBeUndefined();
  });
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx jest src/database/migrations`
Expected: FAIL. TypeScript errors: `Property 'applyWithoutTransaction' does not exist`, the missing exports (`isNonTransactional`, `indexesBuiltBy`, `MigrationInvalidError`, `MigrationThroughError`), and `through` not existing on the options type.

- [ ] **Step 4: Implement the runner**

In `src/database/migrations/migration-runner.ts`:

Add the import `import { splitSqlStatements } from './sql-statements';`. Extend the interfaces:

```ts
export interface MigrationStore {
  ensureTable(): Promise<void>;
  appliedChecksums(): Promise<Map<string, string>>;
  applyInTransaction(file: MigrationFile, checksum: string): Promise<void>;
  /**
   * Runs the statements one by one, each committing on its own (CREATE INDEX CONCURRENTLY
   * cannot run in a transaction), and records the file only after the last one succeeded.
   */
  applyWithoutTransaction(
    file: MigrationFile,
    checksum: string,
    statements: string[],
  ): Promise<void>;
  /** Records every entry as applied, all or nothing, without running the SQL. */
  baseline(entries: BaselineEntry[]): Promise<void>;
  inspectSchema(): Promise<SchemaInventory>;
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  baselined: string[];
  /** Files after `through`, left for a later run */
  pending: string[];
}

export interface RunOptions {
  baselineThrough?: string;
  /**
   * Exact file name: applies the pending files up to and including it and leaves the later
   * ones pending. Runs the online preparation (038) ahead of the drained window (039).
   */
  through?: string;
}
```

(Keep the existing doc comment on `baselineThrough` and on `inspectSchema`.)

Add after `MigrationBaselineSchemaError`:

```ts
export class MigrationThroughError extends Error {
  constructor(readonly through: string) {
    super(
      `Through ${JSON.stringify(through)} is not the exact name of a migration file; nothing was run`,
    );
    this.name = 'MigrationThroughError';
  }
}

export class MigrationInvalidError extends Error {
  constructor(
    readonly fileName: string,
    readonly problems: string[],
  ) {
    super(
      `Migration ${fileName} cannot run outside a transaction: ${problems.join('; ')}. Nothing was run`,
    );
    this.name = 'MigrationInvalidError';
  }
}

/**
 * The header line that makes the runner execute a file statement by statement, outside a
 * transaction (CREATE INDEX CONCURRENTLY, online VALIDATE CONSTRAINT). See docs/migrations.md.
 */
export const NO_TRANSACTION_MARKER = '-- mms:migration no-transaction';

const MARKER_LINE = /^--\s*mms:migration\s+no-transaction\s*$/;

/** True when the leading comment lines of the file contain the marker line. */
export function isNonTransactional(sql: string): boolean {
  for (const line of sql.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (text === '') continue;
    if (!text.startsWith('--')) return false;
    if (MARKER_LINE.test(text)) return true;
  }
  return false;
}

const LEADING_COMMENTS = /^(?:\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/))*\s*/;
const withoutLeadingComments = (statement: string): string =>
  statement.replace(LEADING_COMMENTS, '');

const CREATE_INDEX = /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i;
const CREATE_INDEX_ONLINE =
  /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)/i;
const DROP_INDEX = /^DROP\s+INDEX\b/i;
const DROP_INDEX_ONLINE = /^DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\b/i;
const TRANSACTION_CONTROL =
  /^(?:BEGIN|COMMIT|ROLLBACK|END|ABORT|SAVEPOINT|RELEASE|START\s+TRANSACTION)\b/i;

/**
 * The statements of a non-transactional file. A failed run is repeated from the first
 * statement, so each one must be safe to run again; what the text can show is checked here,
 * before anything runs.
 */
export function nonTransactionalStatements(file: MigrationFile): string[] {
  let statements: string[];
  try {
    statements = splitSqlStatements(file.sql);
  } catch (error) {
    throw new MigrationInvalidError(file.name, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  const problems: string[] = [];
  statements.forEach((statement, k) => {
    const text = withoutLeadingComments(statement);
    const label = `statement ${k + 1} (${text.slice(0, 60).replace(/\s+/g, ' ')})`;
    if (TRANSACTION_CONTROL.test(text)) problems.push(`${label} controls a transaction`);
    if (CREATE_INDEX.test(text) && !CREATE_INDEX_ONLINE.test(text)) {
      problems.push(`${label} must be CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS`);
    }
    if (DROP_INDEX.test(text) && !DROP_INDEX_ONLINE.test(text)) {
      problems.push(`${label} must be DROP INDEX CONCURRENTLY IF EXISTS`);
    }
  });
  if (statements.length === 0) problems.push('it has no statement');
  if (problems.length > 0) throw new MigrationInvalidError(file.name, problems);
  return statements;
}

/** The indexes the statements build CONCURRENTLY; an interrupted build leaves one INVALID. */
export function indexesBuiltBy(statements: string[]): string[] {
  return statements.flatMap((statement) => {
    const name = CREATE_INDEX_ONLINE.exec(withoutLeadingComments(statement))?.[1];
    if (name === undefined) return [];
    return [
      name.startsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name.toLowerCase(),
    ];
  });
}
```

In `runMigrations`:

1. Validate `through` right after the missing-file check:

```ts
  if (
    options.through !== undefined &&
    !ordered.some(({ file }) => file.name === options.through)
  ) {
    throw new MigrationThroughError(options.through);
  }
```

2. Use `const report: MigrationReport = { applied: [], skipped: [], baselined: [], pending: [] };`.

3. Replace the final loop (currently lines 221-232) with a version that validates every pending non-transactional file before it applies the first file:

```ts
  const isPending = (name: string) =>
    !applied.has(name) &&
    !baselined.has(name) &&
    (options.through === undefined || name <= options.through);
  // Every file this run will apply is checked before the first one runs
  const statementsOf = new Map<string, string[]>();
  for (const { file } of ordered) {
    if (isPending(file.name) && isNonTransactional(file.sql)) {
      statementsOf.set(file.name, nonTransactionalStatements(file));
    }
  }

  for (const { file, checksum: sum } of ordered) {
    if (applied.has(file.name)) {
      report.skipped.push(file.name);
    } else if (baselined.has(file.name)) {
      continue;
    } else if (!isPending(file.name)) {
      report.pending.push(file.name);
    } else {
      const statements = statementsOf.get(file.name);
      try {
        if (statements) {
          await store.applyWithoutTransaction(file, sum, statements);
        } else {
          await store.applyInTransaction(file, sum);
        }
      } catch (err) {
        throw new MigrationFailedError(file.name, err);
      }
      report.applied.push(file.name);
    }
  }
  return report;
```

- [ ] **Step 5: Implement the store, the config and the CLI**

In `src/database/migrations/postgres-migration-store.ts`:
- Change the import to `import { indexesBuiltBy, type BaselineEntry, type MigrationFile, type MigrationStore, type SchemaInventory } from './migration-runner';`.
- Add the following methods after `applyInTransaction`:

```ts
  async applyWithoutTransaction(
    file: MigrationFile,
    checksum: string,
    statements: string[],
  ): Promise<void> {
    // Session-wide: there is no transaction for SET LOCAL to belong to. It also bounds how
    // long CREATE INDEX CONCURRENTLY waits for older transactions; a build that times out
    // leaves an INVALID index, which the next run drops and builds again.
    await this.client.query(`SET lock_timeout = '${this.lockTimeout}'`);
    try {
      await this.dropInvalidIndexes(indexesBuiltBy(statements));
      for (const statement of statements) {
        await this.client.query(statement);
      }
      await this.record(file.name, checksum);
    } finally {
      await this.resetLockTimeout();
    }
  }

  // IF NOT EXISTS would skip an INVALID index for ever: drop it, without blocking writers
  private async dropInvalidIndexes(names: string[]): Promise<void> {
    if (names.length === 0) return;
    const { rows } = await this.client.query<{ name: string }>(
      `SELECT c.relname AS name FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
        WHERE c.relnamespace = 'public'::regnamespace AND NOT x.indisvalid
          AND c.relname = ANY ($1)`,
      [names],
    );
    for (const { name } of rows) {
      await this.client.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "${name.replace(/"/g, '""')}"`,
      );
    }
  }

  private async resetLockTimeout(): Promise<void> {
    try {
      await this.client.query('RESET lock_timeout');
    } catch {
      // The connection is broken; the statement's own error is the one to report
    }
  }
```

In `src/database/migrations/migrate.ts`, pass `through` (lines 85-87):

```ts
    return await runMigrations(store, files, {
      baselineThrough: options.baselineThrough,
      through: options.through,
    });
```

In `src/database/migrations/migration-config.ts`:
- Add `'through'` to the `Pick` of `MigrationCliOptions`.
- After the baseline lines, add:

```ts
  const through = argValue(argv, 'through') ?? env.MIGRATION_THROUGH;
  if (through) options.through = through;
```

In `src/database/migrations/migrate.cli.ts`:
- Add to the header comment: `// --through=<file> (or MIGRATION_THROUGH) applies the pending files up to and including that file and leaves the later ones pending: the online preparation of a release runs ahead of its drained window. See docs/migrations.md.`
- After the `applied` loop, add `for (const name of report.pending) console.log(\`pending   ${name}\`);` and add `, ${report.pending.length} pending` to the summary line.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx jest src/database/migrations`
Expected: PASS. All runner, store, config, schema-objects and migrate specs pass, including the new ones.

Run: `npx tsc --noEmit`
Expected: exit 0 (no other implementer of `MigrationStore` exists in `src`).

- [ ] **Step 7: Lint and commit**

```bash
npx eslint src/database/migrations
git add src/database/migrations/migration-runner.ts src/database/migrations/migration-runner.spec.ts \
  src/database/migrations/postgres-migration-store.ts src/database/migrations/postgres-migration-store.spec.ts \
  src/database/migrations/migrate.ts src/database/migrations/migration-config.ts \
  src/database/migrations/migration-config.spec.ts src/database/migrations/migrate.cli.ts
git commit -m "feat(migrations): non-transactional migration files and a --through stop

A file whose header carries '-- mms:migration no-transaction' runs statement by statement on
the migration session (advisory lock held, lock_timeout bounded), drops the INVALID indexes
an interrupted CONCURRENTLY build left, and is recorded only after its last statement.
Index statements must be CONCURRENTLY IF [NOT] EXISTS, checked before anything runs.
--through / MIGRATION_THROUGH stops after a named file and reports the rest as pending.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Non-transactional migrations on a real database (e2e)

**Files:**
- Modify: `test/migrations.e2e-spec.ts` (append one `describe`; add `import { eventually } from './support/eventually';`)

**Interfaces:**
- Consumes: `migrateDatabase` with `through` and `lockTimeout`/`advisoryLockTimeout` (Task 6), and the file's own helpers `createDatabase()`, `scratchMigrations()` and `withClient`.

These tests confirm on Postgres what the unit tests pinned with fakes. They are expected to pass on the first run. If one fails, the store is wrong: fix it here, test-first, and never adjust the expectation.

- [ ] **Step 1: Write the e2e tests**

Append to `test/migrations.e2e-spec.ts`:

```ts
describe('non-transactional migrations (e2e)', () => {
  const header = '-- mms:migration no-transaction\n';
  const base = {
    '001_online_base.sql': `CREATE TABLE online_t (id int PRIMARY KEY, v int);
INSERT INTO online_t SELECT g, g % 3 FROM generate_series(1, 30) g;`,
  };

  const indexState = (url: string, names: string[]) =>
    withClient(url, async (c) => ({
      indexes: (
        await c.query<{ name: string; valid: boolean }>(
          `SELECT c.relname AS name, x.indisvalid AS valid FROM pg_index x
             JOIN pg_class c ON c.oid = x.indexrelid
            WHERE c.relname = ANY ($1) ORDER BY 1`,
          [names],
        )
      ).rows,
      recorded: (
        await c.query(`SELECT 1 FROM schema_migrations WHERE filename = '002_online.sql'`)
      ).rowCount,
    }));

  it('builds indexes concurrently, outside a transaction, and records the file', async () => {
    const url = await createDatabase();
    const directory = scratchMigrations({
      ...base,
      '002_online.sql': `${header}CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_online_v ON online_t (v);
ALTER TABLE online_t ADD COLUMN IF NOT EXISTS w int;`,
    });

    const report = await migrateDatabase({ connectionString: url, directory });

    expect(report.applied).toEqual(['001_online_base.sql', '002_online.sql']);
    expect(await indexState(url, ['ix_online_v'])).toEqual({
      indexes: [{ name: 'ix_online_v', valid: true }],
      recorded: 1,
    });
  });

  it('records nothing after a failure half way, drops the INVALID index it left, and completes on the next run', async () => {
    const url = await createDatabase();
    const directory = scratchMigrations({
      ...base,
      '002_online.sql': `${header}CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_online_id ON online_t (id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_online_v ON online_t (v);`,
    });

    // v repeats: the unique build fails after the first index was built and committed
    await expect(
      migrateDatabase({ connectionString: url, directory }),
    ).rejects.toMatchObject({ name: 'MigrationFailedError', fileName: '002_online.sql' });
    expect(await indexState(url, ['ix_online_id', 'uq_online_v'])).toEqual({
      indexes: [
        { name: 'ix_online_id', valid: true },
        { name: 'uq_online_v', valid: false },
      ],
      recorded: 0,
    });

    // The data the unique index refused is repaired; the same file runs again unchanged
    await withClient(url, (c) => c.query(`UPDATE online_t SET v = id`));
    const report = await migrateDatabase({ connectionString: url, directory });

    expect(report.applied).toEqual(['002_online.sql']);
    expect(await indexState(url, ['ix_online_id', 'uq_online_v'])).toEqual({
      indexes: [
        { name: 'ix_online_id', valid: true },
        { name: 'uq_online_v', valid: true },
      ],
      recorded: 1,
    });
  });

  it('lets writers write while it waits to build, and keeps other migrators out', async () => {
    const url = await createDatabase();
    await migrateDatabase({ connectionString: url, directory: scratchMigrations(base) });
    const directory = scratchMigrations({
      ...base,
      '002_online.sql': `${header}CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_online_wait ON online_t (v);`,
    });
    // An open snapshot makes a concurrent build wait for it to end
    const holder = new Client({ connectionString: url });
    await holder.connect();
    try {
      await holder.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await holder.query('SELECT count(*) FROM online_t');
      const migrating = migrateDatabase({
        connectionString: url,
        directory,
        lockTimeout: '60s',
      });
      await eventually(
        () =>
          withClient(url, async (c) => {
            const { rowCount } = await c.query(
              `SELECT 1 FROM pg_stat_activity
                WHERE datname = current_database() AND pid <> pg_backend_pid()
                  AND query LIKE '%CREATE INDEX CONCURRENTLY%' AND wait_event_type = 'Lock'`,
            );
            return (rowCount ?? 0) > 0;
          }),
        'the index build waiting for the open snapshot',
      );

      // A writer is not blocked by the waiting build (it would time out after 5 s)
      await withClient(url, async (c) => {
        await c.query(`SET statement_timeout = '5s'`);
        await c.query(`INSERT INTO online_t VALUES (1000, 1)`);
      });
      // A second migrator waits for the advisory lock the first one still holds
      await expect(
        migrateDatabase({ connectionString: url, directory, advisoryLockTimeout: '1s' }),
      ).rejects.toMatchObject({ name: 'MigrationLockTimeoutError' });

      await holder.query('COMMIT');
      await expect(migrating).resolves.toMatchObject({ applied: ['002_online.sql'] });
    } finally {
      await holder.end();
    }
  });

  it('stops after the file named by through', async () => {
    const url = await createDatabase();
    const directory = scratchMigrations({
      ...base,
      '002_online.sql': `${header}CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_online_v ON online_t (v);`,
    });

    const report = await migrateDatabase({
      connectionString: url,
      directory,
      through: '001_online_base.sql',
    });

    expect(report.applied).toEqual(['001_online_base.sql']);
    expect(report.pending).toEqual(['002_online.sql']);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/migrations.e2e-spec.ts`
Expected: PASS, the existing tests plus the 4 new ones. Every existing `toEqual` on a full report (for example `report.applied` alone) is unaffected. Fix any assertion that compares a whole report object by adding `pending: []`, as in Task 6.

- [ ] **Step 3: Lint and commit**

```bash
npx eslint test/migrations.e2e-spec.ts
git add test/migrations.e2e-spec.ts
git commit -m "test(migrations): non-transactional files on a real database

Concurrent builds outside a transaction, recovery from a failure half way (no record, the
INVALID index dropped and rebuilt), writers not blocked while a build waits, the advisory
lock held, and --through.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
## Phase C — the migrations

### Task 8: Migration 038, online preparation

**Files:**
- Create: `migrations/038_tenant_columns_online.sql`
- Modify: `test/migrations.e2e-spec.ts` (append one `describe`)

**Interfaces:**
- Consumes: the non-transactional runner (Task 6), `migrationsThrough()`, `createDatabase()` and `withClient` in `test/migrations.e2e-spec.ts`.
- Produces: `tenant_id` on the 57 remaining tenant tables (`DEFAULT app_tenant_id()`), and the indexes 039 attaches. Names: `uq_<parent>_tenant_row` (24), the 15 natural keys listed in the SQL, `ix_<child>_tenant_<cols>` (113), `ix_<table>_tenant_created` / `ix_gps_points_tenant_captured` (14). Nothing here changes behaviour.

- [ ] **Step 1: Write the failing e2e tests**

Append to `test/migrations.e2e-spec.ts`:

```ts
describe('online tenant preparation (038)', () => {
  const FIRST_TENANT = 'a1000000-0000-4000-8000-000000000001';
  const SEEDED = [
    'reward_decisions',
    'weapons',
    'weapon_inventory_checks',
    'weapon_inventory_items',
    'kpi_target_settings',
    'discipline_decisions',
    'system_settings',
  ];
  let url: string;
  let xminBefore: Record<string, string[]>;

  const xmins = () =>
    withClient(url, async (c) => {
      const out: Record<string, string[]> = {};
      for (const table of SEEDED) {
        const { rows } = await c.query<{ xmin: string }>(
          `SELECT xmin::text AS xmin FROM ${table} ORDER BY xmin::text`,
        );
        out[table] = rows.map((r) => r.xmin);
      }
      return out;
    });

  beforeAll(async () => {
    url = await createDatabase();
    await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough('037_tenant_slice_rls.sql'),
    });
    // Rows written before 038, several in tables whose triggers (026) refuse any UPDATE
    await withClient(url, async (c) => {
      const one = async (sql: string, values: unknown[] = []) =>
        (await c.query<{ id: string }>(sql, values)).rows[0].id;
      const unit = await one(
        `INSERT INTO units (code, name, type) VALUES ('U38', 'Unit 38', 'area') RETURNING id`,
      );
      const user = await one(
        `INSERT INTO users (username, password_hash, full_name, status)
         VALUES ('u38', 'x', 'User 38', 'active') RETURNING id`,
      );
      const militia = await one(
        `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date)
         VALUES ('DQ38', 'M', '000000000038', '1990-01-01', $1, '2020-01-01') RETURNING id`,
        [unit],
      );
      await c.query(
        `INSERT INTO reward_decisions (militia_id, reward_form, issuing_authority, issued_date, created_by)
         VALUES ($1, 'giay_khen', 'commune', '2026-01-10', $2)`,
        [militia, user],
      );
      const weapon = await one(
        `INSERT INTO weapons (type, serial_number, acquired_at, storage_location)
         VALUES ('AK', 'S38', '2020-01-01', 'Kho') RETURNING id`,
      );
      const check = await one(
        `INSERT INTO weapon_inventory_checks (performed_by, expected_count, confirmed_count)
         VALUES ($1, 1, 1) RETURNING id`,
        [user],
      );
      await c.query(
        `INSERT INTO weapon_inventory_items (check_id, weapon_id, weapon_type, serial_number, condition, storage_location)
         VALUES ($1, $2, 'AK', 'S38', 'good', 'Kho')`,
        [check, weapon],
      );
      await c.query(
        `INSERT INTO kpi_target_settings (effective_from, min_attendance_days, min_tasks_completed,
                                          max_overdue_tasks, min_training_hours, evaluation_period, created_by)
         VALUES ('2026-01-01', 20, 5, 2, 40, 'monthly', $1)`,
        [user],
      );
      await c.query(
        `INSERT INTO discipline_decisions (militia_id, discipline_form, violation, decision_date, created_by)
         VALUES ($1, 'khien_trach', 'late', '2026-01-10', $2)`,
        [militia, user],
      );
      await c.query(`INSERT INTO system_settings (key, value) VALUES ('k38', 'v')`);
    });
    xminBefore = await xmins();
    await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough('038_tenant_columns_online.sql'),
    });
  });

  it('puts every row written before it into the first tenant without updating a row', async () => {
    expect(await xmins()).toEqual(xminBefore);
    const tenants = await withClient(url, async (c) => {
      const out: Record<string, string[]> = {};
      for (const table of SEEDED) {
        const { rows } = await c.query<{ tenant: string }>(
          `SELECT DISTINCT tenant_id::text AS tenant FROM ${table}`,
        );
        out[table] = rows.map((r) => r.tenant);
      }
      return out;
    });
    expect(tenants).toEqual(
      Object.fromEntries(SEEDED.map((table) => [table, [FIRST_TENANT]])),
    );
  });

  it('defaults tenant_id to the tenant of the session on all 66 tenant tables', async () => {
    const defaults = await withClient(url, async (c) =>
      (
        await c.query<{ value: string; n: string }>(
          `SELECT column_default AS value, count(*) AS n FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'tenant_id'
              AND table_name <> 'tenants'
            GROUP BY column_default`,
        )
      ).rows,
    );
    expect(defaults).toEqual([{ value: 'app_tenant_id()', n: '66' }]);
  });

  it('builds every index of 038 valid, and keeps the old keys until the cutover', async () => {
    const [counts] = await withClient(url, async (c) =>
      (
        await c.query<{ parents: string; others: string; invalid: string; old: string }>(
          `SELECT count(*) FILTER (WHERE c.relname LIKE 'uq\\_%\\_tenant\\_row') AS parents,
                  count(*) FILTER (WHERE c.relname LIKE 'ix\\_%\\_tenant\\_%') AS others,
                  count(*) FILTER (WHERE NOT x.indisvalid) AS invalid,
                  count(*) FILTER (WHERE c.relname IN ('incidents_code_key', 'system_settings_pkey',
                                                     'uq_training_plans_unit_year_type',
                                                     'uq_conversations_direct_key')) AS old
             FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
            WHERE c.relnamespace = 'public'::regnamespace`,
        )
      ).rows,
    );
    expect(counts).toEqual({ parents: '24', others: '127', invalid: '0', old: '4' });
  });

  it('leaves the record-keeping triggers of 026 untouched', async () => {
    await withClient(url, async (c) => {
      await expect(
        c.query(`UPDATE reward_decisions SET basis = basis`),
      ).rejects.toMatchObject({ code: '23001' });
    });
  });

  it('runs again from the top after an interruption', async () => {
    await withClient(url, (c) =>
      c.query(`DELETE FROM schema_migrations WHERE filename = '038_tenant_columns_online.sql'`),
    );
    const report = await migrateDatabase({
      connectionString: url,
      directory: migrationsThrough('038_tenant_columns_online.sql'),
    });
    expect(report.applied).toEqual(['038_tenant_columns_online.sql']);
    expect(await xmins()).toEqual(xminBefore);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/migrations.e2e-spec.ts -t "online tenant preparation"`
Expected: FAIL in `beforeAll`: `no migration 038_tenant_columns_online.sql` (thrown by `migrationsThrough`).

- [ ] **Step 3: Write the migration**

`migrations/038_tenant_columns_online.sql`. This text was generated from the catalog of a database migrated through 037 and run, then re-run, on a clone of it while this plan was written (280 statements; 0 invalid indexes):

```sql
-- mms:migration no-transaction
-- Migration 038: online preparation for tenant isolation of every tenant table (M1a).
--
-- Runs OUTSIDE a transaction, one statement at a time (see docs/migrations.md,
-- "Non-transactional migrations"), so the index builds below are CONCURRENTLY and never
-- block writers. Every statement is idempotent: a run that stopped half way is re-run
-- from the top; the runner first drops any index an interrupted CONCURRENTLY build left
-- INVALID. Nothing here changes behaviour: the constraints, foreign keys and policies that
-- use these columns and indexes are attached by 039 in one short transaction.
--
-- 1. tenant_id on the 57 tables that do not have it yet. Added with the first tenant as a
--    constant default (kept in the catalog: no table rewrite, no UPDATE, so the
--    immutability triggers of migration 026 never fire), then the default becomes the
--    tenant of the session. The foreign key to tenants comes in 039 (NOT VALID) and is
--    validated online in 040.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE alerts ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE attendance_records ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE auth_challenges ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE ca_dqtv_assignments ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE ca_dqtv_assignments ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE conversation_participants ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE conversations ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE device_tokens ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE devices ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE discipline_appeals ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE discipline_appeals ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE discipline_decisions ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE discipline_decisions ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE exemptions ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE exemptions ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE gps_latest ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE gps_latest ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE gps_points ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE gps_points ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE incidents ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE kpi_criteria ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE kpi_criteria ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE kpi_evaluations ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE kpi_evaluations ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE kpi_periods ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE kpi_periods ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE kpi_scores ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE kpi_scores ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE kpi_target_settings ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE kpi_target_settings ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE leave_approvals ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE leave_approvals ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE leave_balances ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE leave_requests ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE leave_types ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE messages ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE mfa_recovery_codes ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE mfa_recovery_codes ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE mfa_temp_tokens ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE mfa_temp_tokens ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE militia_rewards ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE militia_rewards ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE notification_preferences ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE official_documents ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE official_documents ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE organization_units ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE organization_units ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE outbox_events ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE payroll_items ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE payroll_periods ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE payroll_periods ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE payroll_rules ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE payroll_rules ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE police_profiles ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE police_profiles ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE recovery_codes ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE recovery_codes ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE recruitment_applications ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE recruitment_applications ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE reward_decisions ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE reward_decisions ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE sessions ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE system_settings ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE task_evidences ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE task_evidences ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE task_report_photos ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE task_report_photos ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE task_reports ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE task_reports ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE task_updates ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE task_updates ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE training_plans ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE training_records ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE training_session_attendance ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE training_session_attendance ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE training_sessions ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE user_password_history ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE user_password_history ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE user_roles ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE user_unit_scopes ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE user_unit_scopes ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE weapon_allocations ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE weapon_allocations ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE weapon_inventory_checks ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE weapon_inventory_checks ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE weapon_inventory_items ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE weapon_inventory_items ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE weapons ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE weapons ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE work_report_attachments ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE work_report_attachments ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT 'a1000000-0000-4000-8000-000000000001';
ALTER TABLE work_reports ALTER COLUMN tenant_id SET DEFAULT app_tenant_id();

-- 2. Parent keys: every table another tenant table references gets a unique
--    (tenant_id, <referenced columns>) that the composite foreign keys of 039 point at.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_conversations_tenant_row ON conversations (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_devices_tenant_row ON devices (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_discipline_decisions_tenant_row ON discipline_decisions (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_files_tenant_row ON files (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_kpi_periods_tenant_row ON kpi_periods (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_leave_requests_tenant_row ON leave_requests (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_leave_types_tenant_row ON leave_types (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_militia_profiles_tenant_row ON militia_profiles (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_notifications_tenant_row ON notifications (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_organization_units_tenant_row ON organization_units (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_payroll_periods_tenant_row ON payroll_periods (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_sessions_tenant_row ON sessions (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_task_assignments_tenant_row ON task_assignments (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_task_reports_tenant_row ON task_reports (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_task_updates_tenant_row ON task_updates (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_tasks_tenant_row ON tasks (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_training_plans_tenant_row ON training_plans (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_training_session_attendance_tenant_row ON training_session_attendance (tenant_id, session_id, militia_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_training_sessions_tenant_row ON training_sessions (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_units_tenant_row ON units (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_users_tenant_row ON users (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_weapon_inventory_checks_tenant_row ON weapon_inventory_checks (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_weapons_tenant_row ON weapons (tenant_id, id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_work_reports_tenant_row ON work_reports (tenant_id, id);

-- 3. Natural keys become unique per tenant (039 swaps them for the global ones)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_incidents_tenant_code ON incidents (tenant_id, code);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_kpi_criteria_tenant_code ON kpi_criteria (tenant_id, code);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_kpi_periods_tenant_year_month ON kpi_periods (tenant_id, year, month);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_leave_requests_tenant_code ON leave_requests (tenant_id, code);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_leave_types_tenant_code ON leave_types (tenant_id, code);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_payroll_periods_tenant_year_month ON payroll_periods (tenant_id, year, month);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_payroll_rules_tenant_rule_code ON payroll_rules (tenant_id, rule_code);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_police_profiles_tenant_badge_no ON police_profiles (tenant_id, badge_no);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_police_profiles_tenant_cccd ON police_profiles (tenant_id, cccd);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_devices_tenant_fingerprint ON devices (tenant_id, fingerprint);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_device_tokens_tenant_push_token ON device_tokens (tenant_id, push_token);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_system_settings_tenant_key ON system_settings (tenant_id, key);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_training_plans_tenant_unit_year_type ON training_plans (tenant_id, unit_id, year, training_type) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_conversations_tenant_direct_key ON conversations (tenant_id, direct_key) WHERE direct_key IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_weapons_tenant_serial ON weapons (tenant_id, serial_number) WHERE serial_number IS NOT NULL AND serial_number <> '';

-- 4. One (tenant_id, <columns>) index per composite foreign key of 039, so a parent delete
--    or key check finds the child rows of its own tenant by index. The single-column
--    indexes they supersede stay while legacy mode exists (dropped after the enforced
--    flip, M1b). training_session_attendance.session_id is covered by its parent key.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_attendance_records_tenant_militia_id ON attendance_records (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_attendance_records_tenant_task_id ON attendance_records (tenant_id, task_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_logs_tenant_actor_id ON audit_logs (tenant_id, actor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_auth_challenges_tenant_user_id ON auth_challenges (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ca_dqtv_assignments_tenant_assigned_by ON ca_dqtv_assignments (tenant_id, assigned_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ca_dqtv_assignments_tenant_ca_user_id ON ca_dqtv_assignments (tenant_id, ca_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_ca_dqtv_assignments_tenant_dqtv_user_id ON ca_dqtv_assignments (tenant_id, dqtv_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_conversation_participants_tenant_conversation_id ON conversation_participants (tenant_id, conversation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_conversation_participants_tenant_user_id ON conversation_participants (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_conversations_tenant_created_by ON conversations (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_device_tokens_tenant_device_id ON device_tokens (tenant_id, device_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_device_tokens_tenant_user_id ON device_tokens (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_devices_tenant_user_id ON devices (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_discipline_appeals_tenant_decided_by ON discipline_appeals (tenant_id, decided_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_discipline_appeals_tenant_decision_id ON discipline_appeals (tenant_id, decision_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_discipline_appeals_tenant_filed_by ON discipline_appeals (tenant_id, filed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_discipline_decisions_tenant_created_by ON discipline_decisions (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_discipline_decisions_tenant_militia_id ON discipline_decisions (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_exemptions_tenant_militia_id ON exemptions (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_files_tenant_uploaded_by ON files (tenant_id, uploaded_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gps_latest_tenant_militia_id ON gps_latest (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gps_points_tenant_militia_id ON gps_points (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_incidents_tenant_assigned_to ON incidents (tenant_id, assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_incidents_tenant_reporter_id ON incidents (tenant_id, reporter_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_incidents_tenant_resolved_by ON incidents (tenant_id, resolved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_kpi_evaluations_tenant_evaluator_id ON kpi_evaluations (tenant_id, evaluator_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_kpi_evaluations_tenant_target_user_id ON kpi_evaluations (tenant_id, target_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_kpi_periods_tenant_closed_by ON kpi_periods (tenant_id, closed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_kpi_scores_tenant_militia_id ON kpi_scores (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_kpi_scores_tenant_period_id ON kpi_scores (tenant_id, period_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_kpi_target_settings_tenant_created_by ON kpi_target_settings (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_approvals_tenant_approver_id ON leave_approvals (tenant_id, approver_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_approvals_tenant_leave_request_id ON leave_approvals (tenant_id, leave_request_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_balances_tenant_leave_type_id ON leave_balances (tenant_id, leave_type_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_balances_tenant_user_id ON leave_balances (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_requests_tenant_leave_type_id ON leave_requests (tenant_id, leave_type_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_requests_tenant_replacement_id ON leave_requests (tenant_id, replacement_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_requests_tenant_requester_id ON leave_requests (tenant_id, requester_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_tenant_conversation_id ON messages (tenant_id, conversation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_messages_tenant_sender_id ON messages (tenant_id, sender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_mfa_recovery_codes_tenant_user_id ON mfa_recovery_codes (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_mfa_temp_tokens_tenant_user_id ON mfa_temp_tokens (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_militia_profiles_tenant_unit_id ON militia_profiles (tenant_id, unit_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_militia_profiles_tenant_user_id ON militia_profiles (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_militia_rewards_tenant_militia_id ON militia_rewards (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notification_preferences_tenant_user_id ON notification_preferences (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notification_receipts_tenant_notification_id ON notification_receipts (tenant_id, notification_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notification_receipts_tenant_user_id ON notification_receipts (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notifications_tenant_sender_id ON notifications (tenant_id, sender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_official_documents_tenant_created_by ON official_documents (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_official_documents_tenant_file_id ON official_documents (tenant_id, file_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_official_documents_tenant_related_militia_id ON official_documents (tenant_id, related_militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_official_documents_tenant_related_unit_id ON official_documents (tenant_id, related_unit_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_organization_units_tenant_commander_id ON organization_units (tenant_id, commander_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_organization_units_tenant_parent_id ON organization_units (tenant_id, parent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payroll_items_tenant_adjusted_by ON payroll_items (tenant_id, adjusted_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payroll_items_tenant_militia_id ON payroll_items (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payroll_items_tenant_payroll_period_id ON payroll_items (tenant_id, payroll_period_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payroll_periods_tenant_approved_by ON payroll_periods (tenant_id, approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payroll_periods_tenant_locked_by ON payroll_periods (tenant_id, locked_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_payroll_periods_tenant_processed_by ON payroll_periods (tenant_id, processed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_police_profiles_tenant_unit_id ON police_profiles (tenant_id, unit_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_police_profiles_tenant_user_id ON police_profiles (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_recovery_codes_tenant_user_id ON recovery_codes (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_recruitment_applications_tenant_created_by ON recruitment_applications (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_recruitment_applications_tenant_reviewed_by ON recruitment_applications (tenant_id, reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_reward_decisions_tenant_created_by ON reward_decisions (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_reward_decisions_tenant_militia_id ON reward_decisions (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sessions_tenant_device_id ON sessions (tenant_id, device_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sessions_tenant_replaced_by ON sessions (tenant_id, replaced_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sessions_tenant_user_id ON sessions (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_system_settings_tenant_updated_by ON system_settings (tenant_id, updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_assignments_tenant_assigned_by ON task_assignments (tenant_id, assigned_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_assignments_tenant_assignee_id ON task_assignments (tenant_id, assignee_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_assignments_tenant_task_id ON task_assignments (tenant_id, task_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_evidences_tenant_file_id ON task_evidences (tenant_id, file_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_evidences_tenant_task_update_id ON task_evidences (tenant_id, task_update_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_report_photos_tenant_file_id ON task_report_photos (tenant_id, file_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_report_photos_tenant_task_report_id ON task_report_photos (tenant_id, task_report_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_reports_tenant_submitted_by ON task_reports (tenant_id, submitted_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_reports_tenant_task_id ON task_reports (tenant_id, task_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_updates_tenant_task_assignment_id ON task_updates (tenant_id, task_assignment_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_task_updates_tenant_updated_by ON task_updates (tenant_id, updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_tenant_cancelled_by ON tasks (tenant_id, cancelled_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_tenant_completed_by ON tasks (tenant_id, completed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_tenant_created_by ON tasks (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_tenant_unit_id ON tasks (tenant_id, unit_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_plans_tenant_created_by ON training_plans (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_plans_tenant_unit_id ON training_plans (tenant_id, unit_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_records_tenant_created_by ON training_records (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_records_tenant_militia_id ON training_records (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_records_tenant_session_id_militia_id ON training_records (tenant_id, session_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_session_attendance_tenant_militia_id ON training_session_attendance (tenant_id, militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_session_attendance_tenant_recorded_by ON training_session_attendance (tenant_id, recorded_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_sessions_tenant_created_by ON training_sessions (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_training_sessions_tenant_plan_id ON training_sessions (tenant_id, plan_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_units_tenant_parent_id ON units (tenant_id, parent_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_password_history_tenant_user_id ON user_password_history (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_roles_tenant_assigned_by ON user_roles (tenant_id, assigned_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_roles_tenant_user_id ON user_roles (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_unit_scopes_tenant_unit_id ON user_unit_scopes (tenant_id, unit_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_unit_scopes_tenant_user_id ON user_unit_scopes (tenant_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weapon_allocations_tenant_recipient_id ON weapon_allocations (tenant_id, recipient_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weapon_allocations_tenant_weapon_id ON weapon_allocations (tenant_id, weapon_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weapon_inventory_checks_tenant_performed_by ON weapon_inventory_checks (tenant_id, performed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weapon_inventory_items_tenant_check_id ON weapon_inventory_items (tenant_id, check_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weapon_inventory_items_tenant_holder_militia_id ON weapon_inventory_items (tenant_id, holder_militia_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weapon_inventory_items_tenant_weapon_id ON weapon_inventory_items (tenant_id, weapon_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weapons_tenant_responsible_person_id ON weapons (tenant_id, responsible_person_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_report_attachments_tenant_file_id ON work_report_attachments (tenant_id, file_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_report_attachments_tenant_work_report_id ON work_report_attachments (tenant_id, work_report_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_reports_tenant_created_by ON work_reports (tenant_id, created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_reports_tenant_reviewed_by ON work_reports (tenant_id, reviewed_by);

-- 5. Newest-first lists of a tenant, and a tenant-leading index for the two tables that
--    would have none otherwise (alerts, outbox_events)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_alerts_tenant_created ON alerts (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_discipline_decisions_tenant_created ON discipline_decisions (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_exemptions_tenant_created ON exemptions (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_incidents_tenant_created ON incidents (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_leave_requests_tenant_created ON leave_requests (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_notifications_tenant_created ON notifications (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_official_documents_tenant_created ON official_documents (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_outbox_events_tenant_created ON outbox_events (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_recruitment_applications_tenant_created ON recruitment_applications (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_reward_decisions_tenant_created ON reward_decisions (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tasks_tenant_created ON tasks (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_work_reports_tenant_created ON work_reports (tenant_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_gps_points_tenant_captured ON gps_points (tenant_id, captured_at DESC);
```

- [ ] **Step 4: Run the tests and the regression**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/migrations.e2e-spec.ts`
Expected: PASS: the new `online tenant preparation (038)` block (5 tests) and every existing migrations test. "applies every migration to an empty database" now includes 038. The 019 FK-index test is unaffected, because the single-column keys still exist.

Run: `npx jest src/database/migrations/sql-statements.spec.ts src/database/migrations/schema-objects.spec.ts`
Expected: PASS. The splitter splits 038 into 280 statements. Add `expect(counts['038_tenant_columns_online.sql']).toBe(280);` to the "splits every migration file" test.

Run one legacy suite as a behaviour check: `npx jest --config ./test/jest-e2e.json --runInBand test/incidents-tasks-scope.e2e-spec.ts`
Expected: PASS (038 changes no behaviour).

- [ ] **Step 5: Lint and commit**

```bash
npx eslint test/migrations.e2e-spec.ts src/database/migrations/sql-statements.spec.ts
git add migrations/038_tenant_columns_online.sql test/migrations.e2e-spec.ts src/database/migrations/sql-statements.spec.ts
git commit -m "feat(tenancy): migration 038 prepares tenant isolation of every table online

tenant_id on the 57 remaining tenant tables (constant first-tenant default, no rewrite, no
UPDATE, so the 026 triggers never fire; then DEFAULT app_tenant_id()), and every index the
cutover needs built CONCURRENTLY: 24 (tenant_id, id) parent keys, 15 per-tenant natural
keys, 113 composite foreign-key indexes and 14 tenant list indexes. Idempotent.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Migration 039, the cutover window, and the code that names the swapped keys

**Files:**
- Create: `migrations/039_tenant_isolation_cutover.sql`
- Modify: `src/admin/admin.controller.ts:133-135`, `src/sos/sos.service.ts:52`, `src/chat/chat.service.ts:206`, `src/common/codes/record-code.ts:36` (comment)
- Modify (specs): `src/admin/admin.controller.spec.ts:240-243`, `src/sos/sos.service.spec.ts:73`, `src/chat/chat.service.spec.ts:247-249`
- Modify (fixture): `test/client-gaps-t20.e2e-spec.ts:1314`
- Modify: `test/migrations.e2e-spec.ts` (append one `describe`)

**Interfaces:**
- Consumes: the indexes of 038.
- Produces: per-tenant unique constraints (names in the SQL), composite FKs `NOT VALID` with their original names, RLS on all 66 tables, `system_settings_pkey = (tenant_id, key)`, `uq_training_plans_unit_year_type = (tenant_id, unit_id, year, training_type) NULLS NOT DISTINCT`, `uq_conversations_direct_key = (tenant_id, direct_key) WHERE direct_key IS NOT NULL`, revocation payloads with `tenantId`, no default privileges. **Conflict targets code must now use:** `system_settings (tenant_id, key)`, `incidents (tenant_id, code)`, `conversations (tenant_id, direct_key) WHERE direct_key IS NOT NULL`, `payroll_periods (tenant_id, year, month)`, `kpi_periods (tenant_id, year, month)`, `leave_types (tenant_id, code)`, `leave_requests (tenant_id, code)`.

**Grep-driven inventory of code that names a changed key** (`grep -rn "ON CONFLICT\|constraint\b.*includes\|ON CONSTRAINT\|23505" src test ../frontend/tests`, re-run before you start; anything new beyond this list is handled the same way):

| Location | Today | After 039 | Change |
|---|---|---|---|
| `src/admin/admin.controller.ts:135` | `ON CONFLICT (key)` | PK `(tenant_id, key)` | `ON CONFLICT (tenant_id, key)` |
| `src/sos/sos.service.ts:52` | `ON CONFLICT (code)` (record-code retry) | `(tenant_id, code)` | `ON CONFLICT (tenant_id, code)` |
| `src/chat/chat.service.ts:206` | `ON CONFLICT (direct_key) WHERE direct_key IS NOT NULL` | partial `(tenant_id, direct_key)` | `ON CONFLICT (tenant_id, direct_key) WHERE direct_key IS NOT NULL`. The follow-up `SELECT id FROM conversations WHERE direct_key = $1` (line 211) is unchanged: RLS or the single tenant scopes it |
| `src/common/codes/record-code.ts:36` | doc comment `ON CONFLICT (code)` | | comment → `ON CONFLICT (tenant_id, code)` |
| `src/training/training-plans.service.ts:308` | `ON CONFLICT ON CONSTRAINT uq_training_plans_unit_year_type` | same name, now `(tenant_id, unit_id, year, training_type)` | none (the name is kept; the guard pins it) |
| `src/admin/admin.service.ts:290-296` | `constraint.includes('email')` on 23505 | `uq_users_tenant_email` (M0) | none (the guard pins it) |
| `src/militia/militia.service.ts:291-297` | `constraint.includes('cccd')` | `uq_militia_profiles_tenant_cccd`, `uidx_militia_cccd_lookup` (M0) | none (the guard pins it) |
| `src/payroll/payroll.service.ts:414-425` | 23505 → `payroll_period_<y>_<m>_already_exists` | `(tenant_id, year, month)` | none: the meaning is now per tenant, which is right |
| `src/leave/leave.service.ts:382-400` | plain insert of a generated code | `(tenant_id, code)` | none |
| `src/kpi/kpi.service.ts:237`, `src/leave/leave.service.ts:426`, `src/payroll/payroll.service.ts:264,393`, `src/attendance/attendance.service.ts:182`, `src/gps/gps.service.ts:103`, `src/settings/notification-preferences.service.ts:135`, `src/training/training-plans.service.ts:559,582`, `src/chat/chat.service.ts:221` | targets on uniques that contain a NOT NULL tenant-scoped FK column | unchanged | none |
| `src/database/seeder.service.ts:45,50`, `src/tasks/tasks.service.ts:180`, `Web/frontend/tests/global-setup.ts:58` | already `(tenant_id, …)` since M0 | | none |
| `src/auth/login-attempts.service.ts:60,94` | `login_attempts` | global | none |
| `test/client-gaps-t20.e2e-spec.ts:1314` | `ON CONFLICT (year, month)` (fixture) | `(tenant_id, year, month)` | `ON CONFLICT (tenant_id, year, month)` (same adaptation as M0 made for `units`) |
| `core/backend/**` | `ON CONFLICT (code)`, `(fingerprint)` … | | out of scope: a separate legacy codebase that does not run against this schema (not in either compose file) |

- [ ] **Step 1: Write the failing tests**

`src/admin/admin.controller.spec.ts`, in "updates allowed settings and returns count", replace the `toHaveBeenCalledWith` with:

```ts
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringMatching(
          /INSERT INTO system_settings[\s\S]*ON CONFLICT \(tenant_id, key\) DO UPDATE/,
        ),
        ['session_timeout_minutes', '120', 'admin-1'],
      );
```

`src/sos/sos.service.spec.ts:73`:

```ts
      expect(sqlOf(0)).toMatch(/ON CONFLICT \(tenant_id, code\) DO NOTHING/);
```

`src/chat/chat.service.spec.ts:247-249`:

```ts
      expect(sqlOf(mockManager.query, 1)).toMatch(
        /ON CONFLICT \(tenant_id, direct_key\) WHERE direct_key IS NOT NULL DO NOTHING/,
      );
```

Append to `test/migrations.e2e-spec.ts`:

```ts
describe('tenant isolation cutover (039)', () => {
  const FIRST_TENANT = 'a1000000-0000-4000-8000-000000000001';
  let url: string;

  beforeAll(async () => {
    url = await createDatabase();
    await migrateDatabase({ connectionString: url, directory: MIGRATIONS_DIR });
  });

  it('scopes the natural keys per tenant: once in each of two tenants, never twice in one', async () => {
    await withClient(url, async (c) => {
      const second = (
        await c.query<{ id: string }>(
          `INSERT INTO tenants (code, name) VALUES ('second-39', 'Second') RETURNING id`,
        )
      ).rows[0].id;
      const inserts = [
        `INSERT INTO leave_types (tenant_id, code, name) VALUES ($1, 'k39', 'x')`,
        `INSERT INTO system_settings (tenant_id, key, value) VALUES ($1, 'k39', 'x')`,
        `INSERT INTO payroll_periods (tenant_id, year, month) VALUES ($1, 2039, 1)`,
        `INSERT INTO weapons (tenant_id, type, serial_number, acquired_at, storage_location)
         VALUES ($1, 'AK', 'S39', '2020-01-01', 'Kho')`,
      ];
      for (const tenant of [FIRST_TENANT, second]) {
        for (const sql of inserts) await c.query(sql, [tenant]);
      }
      for (const sql of inserts) {
        await expect(c.query(sql, [second])).rejects.toMatchObject({ code: '23505' });
      }
    });
  });

  it('announces the tenant with every revocation', async () => {
    const listener = new Client({ connectionString: url });
    await listener.connect();
    try {
      const payloads: string[] = [];
      listener.on('notification', (message) => payloads.push(message.payload ?? ''));
      await listener.query('LISTEN mms_auth_revocation');
      await withClient(url, async (c) => {
        const { id } = (
          await c.query<{ id: string }>(
            `INSERT INTO users (username, password_hash, full_name) VALUES ('rev39', 'x', 'x') RETURNING id`,
          )
        ).rows[0];
        await c.query(`UPDATE users SET auth_version = auth_version + 1 WHERE id = $1`, [id]);
      });
      await eventually(
        () => Promise.resolve(payloads.length > 0),
        'the revocation announcement',
      );
      expect(JSON.parse(payloads[0])).toMatchObject({
        kind: 'account',
        tenantId: FIRST_TENANT,
      });
    } finally {
      await listener.end();
    }
  });

  it('refuses the cutover when a foreign key it was not written for joins two tenant tables', async () => {
    const other = await createDatabase();
    await migrateDatabase({
      connectionString: other,
      directory: migrationsThrough('038_tenant_columns_online.sql'),
    });
    await withClient(other, (c) =>
      c.query(`ALTER TABLE alerts ADD COLUMN probe_user uuid REFERENCES users (id)`),
    );

    await expect(
      migrateDatabase({ connectionString: other, directory: MIGRATIONS_DIR }),
    ).rejects.toMatchObject({
      name: 'MigrationFailedError',
      fileName: '039_tenant_isolation_cutover.sql',
      message: expect.stringContaining('expected 114 foreign keys') as unknown,
    });
  });

  it('keeps a session without a tenant on the first tenant while the legacy default exists', async () => {
    const tenant = await withClient(url, async (c) =>
      (
        await c.query<{ tenant: string }>(
          `INSERT INTO kpi_criteria (code, name, category, max_score, weight)
           VALUES ('legacy39', 'x', 'x', 10, 0.5) RETURNING tenant_id::text AS tenant`,
        )
      ).rows[0].tenant,
    );
    expect(tenant).toBe(FIRST_TENANT);
  });
});
```

Change the fixture at `test/client-gaps-t20.e2e-spec.ts:1314` to `ON CONFLICT (tenant_id, year, month) DO UPDATE SET updated_at = now()`. The assertion lines stay unchanged.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/admin/admin.controller.spec.ts src/sos/sos.service.spec.ts src/chat/chat.service.spec.ts`
Expected: FAIL. The three regexes do not match the current SQL.

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/migrations.e2e-spec.ts -t "cutover \\(039\\)"`
Expected: FAIL. The second tenant's `k39` hits the still-global key (`23505` inside the loop), the payload has no `tenantId`, and the last migrate succeeds because no 039 exists yet to refuse it.

- [ ] **Step 3: Write the migration**

`migrations/039_tenant_isolation_cutover.sql`. This exact text ran in one transaction on a clone at 038, followed by 040, while this plan was written: 184 foreign keys, all validated afterwards; RLS on 66 tables; no default ACL left:

```sql
-- Migration 039: tenant isolation of every tenant table, the short cutover window (M1a).
--
-- One transaction. Everything slow was done online by 038 (columns, unique and foreign-key
-- indexes); this file only attaches: it swaps the global unique keys for the per-tenant
-- ones built by 038, turns every foreign key between two tenant tables into a composite
-- (tenant_id, ...) key added NOT VALID (validated online by 040), and enables Row-Level
-- Security everywhere. Each statement waits at most MIGRATION_LOCK_TIMEOUT for its lock.
-- The release that contains it is incompatible (ON CONFLICT targets change): deploy it
-- drained, see docs/migrations.md.
--
-- The legacy single-tenant database default of 037 (ALTER DATABASE ... SET app.tenant_id)
-- is NOT touched: a legacy deployment keeps writing and reading the first tenant on all 66
-- tables exactly as it did on the nine of the M0 slice. It is removed at the enforced
-- cutover (M1b).

-- 1. Parent keys: the (tenant_id, id) unique indexes of 038 become constraints the
--    composite foreign keys can reference
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'conversations', 'devices', 'discipline_decisions', 'files', 'kpi_periods',
        'leave_requests', 'leave_types', 'militia_profiles', 'notifications',
        'organization_units', 'payroll_periods', 'sessions', 'task_assignments',
        'task_reports', 'task_updates', 'tasks', 'training_plans',
        'training_session_attendance', 'training_sessions', 'units', 'users',
        'weapon_inventory_checks', 'weapons', 'work_reports'] LOOP
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE USING INDEX %I',
                       t, 'uq_' || t || '_tenant_row', 'uq_' || t || '_tenant_row');
    END LOOP;
END $$;

-- 2. Natural keys: unique per tenant. Constraint names that code relies on are kept:
--    ON CONFLICT ON CONSTRAINT uq_training_plans_unit_year_type (training-plans.service.ts)
--    and system_settings_pkey.
ALTER TABLE incidents
    DROP CONSTRAINT incidents_code_key,
    ADD CONSTRAINT uq_incidents_tenant_code UNIQUE USING INDEX uq_incidents_tenant_code;
ALTER TABLE kpi_criteria
    DROP CONSTRAINT kpi_criteria_code_key,
    ADD CONSTRAINT uq_kpi_criteria_tenant_code UNIQUE USING INDEX uq_kpi_criteria_tenant_code;
ALTER TABLE kpi_periods
    DROP CONSTRAINT kpi_periods_year_month_key,
    ADD CONSTRAINT uq_kpi_periods_tenant_year_month
        UNIQUE USING INDEX uq_kpi_periods_tenant_year_month;
ALTER TABLE leave_requests
    DROP CONSTRAINT leave_requests_code_key,
    ADD CONSTRAINT uq_leave_requests_tenant_code UNIQUE USING INDEX uq_leave_requests_tenant_code;
ALTER TABLE leave_types
    DROP CONSTRAINT leave_types_code_key,
    ADD CONSTRAINT uq_leave_types_tenant_code UNIQUE USING INDEX uq_leave_types_tenant_code;
ALTER TABLE payroll_periods
    DROP CONSTRAINT payroll_periods_year_month_key,
    ADD CONSTRAINT uq_payroll_periods_tenant_year_month
        UNIQUE USING INDEX uq_payroll_periods_tenant_year_month;
ALTER TABLE payroll_rules
    DROP CONSTRAINT payroll_rules_rule_code_key,
    ADD CONSTRAINT uq_payroll_rules_tenant_rule_code
        UNIQUE USING INDEX uq_payroll_rules_tenant_rule_code;
ALTER TABLE police_profiles
    DROP CONSTRAINT police_profiles_badge_no_key,
    DROP CONSTRAINT police_profiles_cccd_key,
    ADD CONSTRAINT uq_police_profiles_tenant_badge_no
        UNIQUE USING INDEX uq_police_profiles_tenant_badge_no,
    ADD CONSTRAINT uq_police_profiles_tenant_cccd UNIQUE USING INDEX uq_police_profiles_tenant_cccd;
ALTER TABLE devices
    DROP CONSTRAINT devices_fingerprint_key,
    ADD CONSTRAINT uq_devices_tenant_fingerprint UNIQUE USING INDEX uq_devices_tenant_fingerprint;
ALTER TABLE device_tokens
    DROP CONSTRAINT device_tokens_push_token_key,
    ADD CONSTRAINT uq_device_tokens_tenant_push_token
        UNIQUE USING INDEX uq_device_tokens_tenant_push_token;
ALTER TABLE system_settings
    DROP CONSTRAINT system_settings_pkey,
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY USING INDEX uq_system_settings_tenant_key;
ALTER TABLE training_plans
    DROP CONSTRAINT uq_training_plans_unit_year_type,
    ADD CONSTRAINT uq_training_plans_unit_year_type
        UNIQUE USING INDEX uq_training_plans_tenant_unit_year_type;
-- Partial unique indexes cannot be constraints; 038 built their per-tenant successors. The
-- direct-conversation key keeps its name (test/migrations.e2e-spec.ts names it)
DROP INDEX uq_conversations_direct_key;
ALTER INDEX uq_conversations_tenant_direct_key RENAME TO uq_conversations_direct_key;
DROP INDEX idx_weapons_serial;

-- 3. Every foreign key between two tenant tables becomes (tenant_id, <columns>), same name,
--    same delete rule. A nullable SET NULL key clears only its own column (PostgreSQL 15+):
--    a plain SET NULL would also clear tenant_id, which is NOT NULL. Checked as the table
--    owner, a single-column key let a tenant point a row at another tenant's row; the
--    composite key cannot match a parent of another tenant.
DO $$
DECLARE
    tenant_tables constant text[] := ARRAY[
        'alerts', 'attendance_records', 'audit_logs', 'auth_challenges', 'ca_dqtv_assignments',
        'conversation_participants', 'conversations', 'device_tokens', 'devices',
        'discipline_appeals', 'discipline_decisions', 'exemptions', 'files', 'gps_latest',
        'gps_points', 'incidents', 'kpi_criteria', 'kpi_evaluations', 'kpi_periods',
        'kpi_scores', 'kpi_target_settings', 'leave_approvals', 'leave_balances',
        'leave_requests', 'leave_types', 'messages', 'mfa_recovery_codes', 'mfa_temp_tokens',
        'militia_profiles', 'militia_rewards', 'notification_preferences',
        'notification_receipts', 'notifications', 'official_documents', 'organization_units',
        'outbox_events', 'payroll_items', 'payroll_periods', 'payroll_rules',
        'police_profiles', 'recovery_codes', 'recruitment_applications', 'reward_decisions',
        'sessions', 'system_settings', 'task_assignments', 'task_evidences',
        'task_report_photos', 'task_reports', 'task_updates', 'tasks', 'training_plans',
        'training_records', 'training_session_attendance', 'training_sessions', 'units',
        'user_password_history', 'user_roles', 'user_unit_scopes', 'users',
        'weapon_allocations', 'weapon_inventory_checks', 'weapon_inventory_items', 'weapons',
        'work_report_attachments', 'work_reports'];
    fk record;
    child_cols text;
    parent_cols text;
    on_delete text;
    rewritten int := 0;
BEGIN
    FOR fk IN
        SELECT c.conname, c.conrelid, c.confrelid, c.conkey, c.confkey, c.confdeltype,
               c.confupdtype, c.condeferrable
          FROM pg_constraint c
         WHERE c.contype = 'f'
           AND c.connamespace = 'public'::regnamespace
           AND c.conrelid::regclass::text = ANY (tenant_tables)
           AND c.confrelid::regclass::text = ANY (tenant_tables)
         ORDER BY c.conrelid::regclass::text, c.conname
    LOOP
        IF fk.confupdtype <> 'a' OR fk.condeferrable THEN
            RAISE EXCEPTION 'foreign key % has an ON UPDATE action or is deferrable: rewrite it by hand',
                fk.conname;
        END IF;
        SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO child_cols
          FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k.attnum;
        SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO parent_cols
          FROM unnest(fk.confkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = fk.confrelid AND a.attnum = k.attnum;
        on_delete := CASE fk.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN format('SET NULL (%s)', child_cols)
        END;
        IF on_delete IS NULL THEN
            RAISE EXCEPTION 'foreign key % has delete rule %: rewrite it by hand',
                fk.conname, fk.confdeltype;
        END IF;
        EXECUTE format(
            'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %s) '
            'REFERENCES %s (tenant_id, %s) ON DELETE %s NOT VALID',
            fk.conrelid::regclass, fk.conname, fk.conname, child_cols,
            fk.confrelid::regclass, parent_cols, on_delete);
        rewritten := rewritten + 1;
    END LOOP;
    -- The schema at this point is fixed by migrations 001-038: a different count means a
    -- foreign key was added or lost and must be reviewed, not silently rewritten
    IF rewritten <> 114 THEN
        RAISE EXCEPTION 'expected 114 foreign keys between tenant tables, rewrote %', rewritten;
    END IF;
END $$;

-- 4. The tenant of every row of the 57 new tenant tables exists (validated online by 040),
--    and Row-Level Security answers for them exactly as for the slice of 037
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'alerts', 'attendance_records', 'auth_challenges', 'ca_dqtv_assignments',
        'conversation_participants', 'conversations', 'device_tokens', 'devices',
        'discipline_appeals', 'discipline_decisions', 'exemptions', 'gps_latest', 'gps_points',
        'incidents', 'kpi_criteria', 'kpi_evaluations', 'kpi_periods', 'kpi_scores',
        'kpi_target_settings', 'leave_approvals', 'leave_balances', 'leave_requests',
        'leave_types', 'messages', 'mfa_recovery_codes', 'mfa_temp_tokens', 'militia_rewards',
        'notification_preferences', 'official_documents', 'organization_units',
        'outbox_events', 'payroll_items', 'payroll_periods', 'payroll_rules',
        'police_profiles', 'recovery_codes', 'recruitment_applications', 'reward_decisions',
        'sessions', 'system_settings', 'task_evidences', 'task_report_photos', 'task_reports',
        'task_updates', 'training_plans', 'training_records', 'training_session_attendance',
        'training_sessions', 'user_password_history', 'user_roles', 'user_unit_scopes',
        'weapon_allocations', 'weapon_inventory_checks', 'weapon_inventory_items', 'weapons',
        'work_report_attachments', 'work_reports'] LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants (id) NOT VALID',
            t, t || '_tenant_id_fkey');
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL TO mms_app
                 USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
    END LOOP;
END $$;

-- 5. Privileges. 036 granted mms_app every FUTURE table of the schema by default, which
--    would hand the runtime role the platform tables of M2 the moment they are created.
--    From here on a table is reachable by mms_app only through an explicit GRANT in its
--    migration (the schema guard test checks every table against an explicit list).
--    The global catalogues are read-only for the runtime role: a tenant must not change
--    what a role means for every other tenant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM mms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM mms_platform;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON roles, permissions, role_permissions
    FROM mms_app;
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT c.relname FROM pg_class c
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND EXISTS (SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
    LOOP
        EXECUTE format('REVOKE ALL ON %I FROM mms_app', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO mms_app', t);
    END LOOP;
END $$;

-- 6. The revocation announcements of 035 name the tenant, so a replica closes the sockets of
--    the user in that tenant's rooms instead of scanning every socket it holds
CREATE OR REPLACE FUNCTION notify_session_ended() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.revoked_at IS NULL THEN
      PERFORM pg_notify('mms_auth_revocation', json_build_object(
        'kind', 'session', 'userId', OLD.user_id, 'sessionId', OLD.id,
        'tenantId', OLD.tenant_id)::text);
    END IF;
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
        AND NEW.replaced_by IS NULL THEN
    PERFORM pg_notify('mms_auth_revocation', json_build_object(
      'kind', 'session', 'userId', NEW.user_id, 'sessionId', NEW.id,
      'tenantId', NEW.tenant_id)::text);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION notify_account_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.auth_version IS DISTINCT FROM OLD.auth_version
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pg_notify('mms_auth_revocation', json_build_object(
      'kind', 'account', 'userId', NEW.id,
      'version', NEW.auth_version, 'active', NEW.status = 'active',
      'tenantId', NEW.tenant_id)::text);
  END IF;
  RETURN NULL;
END $$;

-- 7. Catalog assertions: the cutover is all or nothing
DO $$
DECLARE
    problems text[];
BEGIN
    SELECT array_agg(format('%s: %s', c.relname, p.problem) ORDER BY c.relname)
      INTO problems
      FROM pg_class c
      CROSS JOIN LATERAL (
          SELECT 'tenant_id is not uuid NOT NULL DEFAULT app_tenant_id()' AS problem
           WHERE NOT EXISTS (
               SELECT 1 FROM pg_attribute a
                 JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnotnull
                  AND a.atttypid = 'uuid'::regtype
                  AND pg_get_expr(d.adbin, d.adrelid) = 'app_tenant_id()')
          UNION ALL
          SELECT 'row-level security is not enabled and forced'
           WHERE NOT (c.relrowsecurity AND c.relforcerowsecurity)
          UNION ALL
          SELECT 'has no tenant_isolation policy'
           WHERE NOT EXISTS (SELECT 1 FROM pg_policy p
                              WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
          UNION ALL
          SELECT format('foreign key %s to tenant table %s does not include tenant_id',
                        f.conname, f.confrelid::regclass)
            FROM pg_constraint f
           WHERE f.conrelid = c.oid AND f.contype = 'f'
             AND f.confrelid <> 'tenants'::regclass
             AND EXISTS (SELECT 1 FROM pg_attribute pa
                          WHERE pa.attrelid = f.confrelid AND pa.attname = 'tenant_id')
             AND NOT EXISTS (SELECT 1 FROM unnest(f.conkey) k
                               JOIN pg_attribute ka ON ka.attrelid = f.conrelid AND ka.attnum = k
                              WHERE ka.attname = 'tenant_id')
      ) p
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname NOT IN ('schema_migrations', 'tenants', 'roles', 'permissions',
                             'role_permissions', 'login_attempts');
    IF problems IS NOT NULL THEN
        RAISE EXCEPTION 'tenant isolation is incomplete: %', array_to_string(problems, '; ');
    END IF;
END $$;
```

- [ ] **Step 4: Adapt the code that names the swapped keys**

`src/admin/admin.controller.ts:133-135`:

```ts
        `INSERT INTO system_settings(key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
```

`src/sos/sos.service.ts:52`: `ON CONFLICT (tenant_id, code) DO NOTHING`

`src/chat/chat.service.ts:206`: `ON CONFLICT (tenant_id, direct_key) WHERE direct_key IS NOT NULL DO NOTHING`

`src/common/codes/record-code.ts:36` (doc comment): `already exists, as INSERT ... ON CONFLICT (tenant_id, code) DO NOTHING RETURNING does: codes are unique per tenant (migration 039).`

- [ ] **Step 5: Run the tests and the regression in legacy mode**

Run: `npx jest src/admin src/sos src/chat src/common/codes src/database/migrations`
Expected: PASS. Add `expect(counts['039_tenant_isolation_cutover.sql']).toBe(25);` to the splitter's repository test (the statements of 039 as written).

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/migrations.e2e-spec.ts`
Expected: PASS, including `tenant isolation cutover (039)` (4 tests). The existing `refuses a second direct conversation keyed to the same pair` still names `uq_conversations_direct_key`, which 039 kept.

Run each of these in its own process (legacy mode, the default):

```bash
for f in api-contract client-gaps-t20 features-t18 frontend-routes-t23 incidents-tasks-scope gps-live realtime-session app; do
  npx jest --config ./test/jest-e2e.json --runInBand "test/$f.e2e-spec.ts" || break
done
```

Expected: every suite PASS in legacy mode, with the composite keys, RLS on all 66 tables and the new conflict targets (as superuser `mms` the RLS is bypassed; every row and default is the first tenant).

Run the tenancy suites (enforced mode, `mms_app`): `tenancy-rls`, `tenancy-binding`, `tenancy-slice`, `tenancy-references`, `tenancy-canary-rls`.
Expected: `tenancy-references` and `tenancy-canary-rls` now PASS: a `NOT VALID` key is enforced for every new row. `tenancy-rls`, `tenancy-binding` and `tenancy-slice` PASS. If one of these fails because a path of the slice now meets RLS on a table it reads (for example `user_roles`, `sessions`, `notification_preferences`), it is an unscoped path. Fix it in this task: write a failing unit test for the path first, then the root-cause fix, and record it for the Task 24 defect table. Never relax a policy. `tenancy-schema-guard` still fails only on `validated`. That is Task 10.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint src/admin/admin.controller.ts src/admin/admin.controller.spec.ts src/sos/sos.service.ts \
  src/sos/sos.service.spec.ts src/chat/chat.service.ts src/chat/chat.service.spec.ts \
  src/common/codes/record-code.ts test/migrations.e2e-spec.ts test/client-gaps-t20.e2e-spec.ts \
  src/database/migrations/sql-statements.spec.ts
git add migrations/039_tenant_isolation_cutover.sql src/admin/admin.controller.ts src/admin/admin.controller.spec.ts \
  src/sos/sos.service.ts src/sos/sos.service.spec.ts src/chat/chat.service.ts src/chat/chat.service.spec.ts \
  src/common/codes/record-code.ts test/migrations.e2e-spec.ts test/client-gaps-t20.e2e-spec.ts \
  src/database/migrations/sql-statements.spec.ts
git commit -m "feat(tenancy): migration 039 isolates every tenant table in one short window

Per-tenant unique keys attached from the 038 indexes (constraint names code relies on kept),
the 114 foreign keys between tenant tables rewritten as composite (tenant_id, ...) keys NOT
VALID with SET NULL (col) for the nullable ones, forced RLS and the tenant_isolation policy
on the 57 remaining tables, no default privileges for the application roles, read-only role
catalogue, and the revocation announcements naming the tenant. Conflict targets follow:
system_settings (tenant_id, key), incidents (tenant_id, code), conversations
(tenant_id, direct_key). Incompatible release: deploy drained.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Migration 040, online validation; the guards turn green; migration docs

**Files:**
- Create: `migrations/040_tenant_validate_online.sql`
- Modify: `test/migrations.e2e-spec.ts` (one test), `src/database/migrations/sql-statements.spec.ts` (one count)
- Modify: `docs/migrations.md`

**Interfaces:**
- Consumes: the `NOT VALID` keys of 039.
- Produces: every FK validated, and a catalog assertion. After this task the Phase A suites `tenancy-schema-guard`, `tenancy-references`, `tenancy-canary-rls` and the `the other tenant` block of `tenancy-route-sweep` are green.

- [ ] **Step 1: Write the failing test**

Append to the `tenant isolation cutover (039)` describe of `test/migrations.e2e-spec.ts`:

```ts
  it('validates every foreign key it added, online (040)', async () => {
    const pending = await withClient(url, async (c) =>
      (
        await c.query<{ name: string }>(
          `SELECT conrelid::regclass::text || '.' || conname AS name FROM pg_constraint
            WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND NOT convalidated`,
        )
      ).rows.map((r) => r.name),
    );
    expect(pending).toEqual([]);
  });
```

- [ ] **Step 2: Run it and the guard, and watch them fail**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/migrations.e2e-spec.ts -t "validates every foreign key"`
Expected: FAIL, listing 171 constraints (`alerts.alerts_tenant_id_fkey`, …, `work_reports.work_reports_user_id_fkey`).

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-schema-guard.e2e-spec.ts`
Expected: FAIL in two places only: the column test (`referencesTenants: false` for the 57 tables, because the key is not validated) and the FK test (`… not validated`).

- [ ] **Step 3: Write the migration**

`migrations/040_tenant_validate_online.sql`, as generated from the catalog and run on the clone (171 `VALIDATE` statements and the assertion):

```sql
-- mms:migration no-transaction
-- Migration 040: validate online every foreign key 039 added NOT VALID (M1a).
--
-- VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE on the child and ROW SHARE on the
-- parent: reads and writes go on while each one scans. One statement per constraint, each
-- in its own transaction, so no lock is held longer than its own scan. Re-running a
-- validated constraint is a no-op, so an interrupted run is simply run again.

-- The tenant of every row exists
ALTER TABLE alerts VALIDATE CONSTRAINT alerts_tenant_id_fkey;
ALTER TABLE attendance_records VALIDATE CONSTRAINT attendance_records_tenant_id_fkey;
ALTER TABLE auth_challenges VALIDATE CONSTRAINT auth_challenges_tenant_id_fkey;
ALTER TABLE ca_dqtv_assignments VALIDATE CONSTRAINT ca_dqtv_assignments_tenant_id_fkey;
ALTER TABLE conversation_participants VALIDATE CONSTRAINT conversation_participants_tenant_id_fkey;
ALTER TABLE conversations VALIDATE CONSTRAINT conversations_tenant_id_fkey;
ALTER TABLE device_tokens VALIDATE CONSTRAINT device_tokens_tenant_id_fkey;
ALTER TABLE devices VALIDATE CONSTRAINT devices_tenant_id_fkey;
ALTER TABLE discipline_appeals VALIDATE CONSTRAINT discipline_appeals_tenant_id_fkey;
ALTER TABLE discipline_decisions VALIDATE CONSTRAINT discipline_decisions_tenant_id_fkey;
ALTER TABLE exemptions VALIDATE CONSTRAINT exemptions_tenant_id_fkey;
ALTER TABLE gps_latest VALIDATE CONSTRAINT gps_latest_tenant_id_fkey;
ALTER TABLE gps_points VALIDATE CONSTRAINT gps_points_tenant_id_fkey;
ALTER TABLE incidents VALIDATE CONSTRAINT incidents_tenant_id_fkey;
ALTER TABLE kpi_criteria VALIDATE CONSTRAINT kpi_criteria_tenant_id_fkey;
ALTER TABLE kpi_evaluations VALIDATE CONSTRAINT kpi_evaluations_tenant_id_fkey;
ALTER TABLE kpi_periods VALIDATE CONSTRAINT kpi_periods_tenant_id_fkey;
ALTER TABLE kpi_scores VALIDATE CONSTRAINT kpi_scores_tenant_id_fkey;
ALTER TABLE kpi_target_settings VALIDATE CONSTRAINT kpi_target_settings_tenant_id_fkey;
ALTER TABLE leave_approvals VALIDATE CONSTRAINT leave_approvals_tenant_id_fkey;
ALTER TABLE leave_balances VALIDATE CONSTRAINT leave_balances_tenant_id_fkey;
ALTER TABLE leave_requests VALIDATE CONSTRAINT leave_requests_tenant_id_fkey;
ALTER TABLE leave_types VALIDATE CONSTRAINT leave_types_tenant_id_fkey;
ALTER TABLE messages VALIDATE CONSTRAINT messages_tenant_id_fkey;
ALTER TABLE mfa_recovery_codes VALIDATE CONSTRAINT mfa_recovery_codes_tenant_id_fkey;
ALTER TABLE mfa_temp_tokens VALIDATE CONSTRAINT mfa_temp_tokens_tenant_id_fkey;
ALTER TABLE militia_rewards VALIDATE CONSTRAINT militia_rewards_tenant_id_fkey;
ALTER TABLE notification_preferences VALIDATE CONSTRAINT notification_preferences_tenant_id_fkey;
ALTER TABLE official_documents VALIDATE CONSTRAINT official_documents_tenant_id_fkey;
ALTER TABLE organization_units VALIDATE CONSTRAINT organization_units_tenant_id_fkey;
ALTER TABLE outbox_events VALIDATE CONSTRAINT outbox_events_tenant_id_fkey;
ALTER TABLE payroll_items VALIDATE CONSTRAINT payroll_items_tenant_id_fkey;
ALTER TABLE payroll_periods VALIDATE CONSTRAINT payroll_periods_tenant_id_fkey;
ALTER TABLE payroll_rules VALIDATE CONSTRAINT payroll_rules_tenant_id_fkey;
ALTER TABLE police_profiles VALIDATE CONSTRAINT police_profiles_tenant_id_fkey;
ALTER TABLE recovery_codes VALIDATE CONSTRAINT recovery_codes_tenant_id_fkey;
ALTER TABLE recruitment_applications VALIDATE CONSTRAINT recruitment_applications_tenant_id_fkey;
ALTER TABLE reward_decisions VALIDATE CONSTRAINT reward_decisions_tenant_id_fkey;
ALTER TABLE sessions VALIDATE CONSTRAINT sessions_tenant_id_fkey;
ALTER TABLE system_settings VALIDATE CONSTRAINT system_settings_tenant_id_fkey;
ALTER TABLE task_evidences VALIDATE CONSTRAINT task_evidences_tenant_id_fkey;
ALTER TABLE task_report_photos VALIDATE CONSTRAINT task_report_photos_tenant_id_fkey;
ALTER TABLE task_reports VALIDATE CONSTRAINT task_reports_tenant_id_fkey;
ALTER TABLE task_updates VALIDATE CONSTRAINT task_updates_tenant_id_fkey;
ALTER TABLE training_plans VALIDATE CONSTRAINT training_plans_tenant_id_fkey;
ALTER TABLE training_records VALIDATE CONSTRAINT training_records_tenant_id_fkey;
ALTER TABLE training_session_attendance VALIDATE CONSTRAINT training_session_attendance_tenant_id_fkey;
ALTER TABLE training_sessions VALIDATE CONSTRAINT training_sessions_tenant_id_fkey;
ALTER TABLE user_password_history VALIDATE CONSTRAINT user_password_history_tenant_id_fkey;
ALTER TABLE user_roles VALIDATE CONSTRAINT user_roles_tenant_id_fkey;
ALTER TABLE user_unit_scopes VALIDATE CONSTRAINT user_unit_scopes_tenant_id_fkey;
ALTER TABLE weapon_allocations VALIDATE CONSTRAINT weapon_allocations_tenant_id_fkey;
ALTER TABLE weapon_inventory_checks VALIDATE CONSTRAINT weapon_inventory_checks_tenant_id_fkey;
ALTER TABLE weapon_inventory_items VALIDATE CONSTRAINT weapon_inventory_items_tenant_id_fkey;
ALTER TABLE weapons VALIDATE CONSTRAINT weapons_tenant_id_fkey;
ALTER TABLE work_report_attachments VALIDATE CONSTRAINT work_report_attachments_tenant_id_fkey;
ALTER TABLE work_reports VALIDATE CONSTRAINT work_reports_tenant_id_fkey;

-- Every reference stays inside its tenant
ALTER TABLE attendance_records VALIDATE CONSTRAINT attendance_records_militia_id_fkey;
ALTER TABLE attendance_records VALIDATE CONSTRAINT attendance_records_task_id_fkey;
ALTER TABLE audit_logs VALIDATE CONSTRAINT audit_logs_actor_id_fkey;
ALTER TABLE auth_challenges VALIDATE CONSTRAINT auth_challenges_user_id_fkey;
ALTER TABLE ca_dqtv_assignments VALIDATE CONSTRAINT ca_dqtv_assignments_assigned_by_fkey;
ALTER TABLE ca_dqtv_assignments VALIDATE CONSTRAINT ca_dqtv_assignments_ca_user_id_fkey;
ALTER TABLE ca_dqtv_assignments VALIDATE CONSTRAINT ca_dqtv_assignments_dqtv_user_id_fkey;
ALTER TABLE conversation_participants VALIDATE CONSTRAINT conversation_participants_conversation_id_fkey;
ALTER TABLE conversation_participants VALIDATE CONSTRAINT conversation_participants_user_id_fkey;
ALTER TABLE conversations VALIDATE CONSTRAINT conversations_created_by_fkey;
ALTER TABLE device_tokens VALIDATE CONSTRAINT device_tokens_device_id_fkey;
ALTER TABLE device_tokens VALIDATE CONSTRAINT device_tokens_user_id_fkey;
ALTER TABLE devices VALIDATE CONSTRAINT devices_user_id_fkey;
ALTER TABLE discipline_appeals VALIDATE CONSTRAINT discipline_appeals_decided_by_fkey;
ALTER TABLE discipline_appeals VALIDATE CONSTRAINT discipline_appeals_decision_id_fkey;
ALTER TABLE discipline_appeals VALIDATE CONSTRAINT discipline_appeals_filed_by_fkey;
ALTER TABLE discipline_decisions VALIDATE CONSTRAINT discipline_decisions_created_by_fkey;
ALTER TABLE discipline_decisions VALIDATE CONSTRAINT discipline_decisions_militia_id_fkey;
ALTER TABLE exemptions VALIDATE CONSTRAINT exemptions_militia_id_fkey;
ALTER TABLE files VALIDATE CONSTRAINT files_uploaded_by_fkey;
ALTER TABLE gps_latest VALIDATE CONSTRAINT gps_latest_militia_id_fkey;
ALTER TABLE gps_points VALIDATE CONSTRAINT gps_points_militia_id_fkey;
ALTER TABLE incidents VALIDATE CONSTRAINT incidents_assigned_to_fkey;
ALTER TABLE incidents VALIDATE CONSTRAINT incidents_reporter_id_fkey;
ALTER TABLE incidents VALIDATE CONSTRAINT incidents_resolved_by_fkey;
ALTER TABLE kpi_evaluations VALIDATE CONSTRAINT kpi_evaluations_evaluator_id_fkey;
ALTER TABLE kpi_evaluations VALIDATE CONSTRAINT kpi_evaluations_target_user_id_fkey;
ALTER TABLE kpi_periods VALIDATE CONSTRAINT kpi_periods_closed_by_fkey;
ALTER TABLE kpi_scores VALIDATE CONSTRAINT kpi_scores_militia_id_fkey;
ALTER TABLE kpi_scores VALIDATE CONSTRAINT kpi_scores_period_id_fkey;
ALTER TABLE kpi_target_settings VALIDATE CONSTRAINT kpi_target_settings_created_by_fkey;
ALTER TABLE leave_approvals VALIDATE CONSTRAINT leave_approvals_approver_id_fkey;
ALTER TABLE leave_approvals VALIDATE CONSTRAINT leave_approvals_leave_request_id_fkey;
ALTER TABLE leave_balances VALIDATE CONSTRAINT leave_balances_leave_type_id_fkey;
ALTER TABLE leave_balances VALIDATE CONSTRAINT leave_balances_user_id_fkey;
ALTER TABLE leave_requests VALIDATE CONSTRAINT leave_requests_leave_type_id_fkey;
ALTER TABLE leave_requests VALIDATE CONSTRAINT leave_requests_replacement_id_fkey;
ALTER TABLE leave_requests VALIDATE CONSTRAINT leave_requests_requester_id_fkey;
ALTER TABLE messages VALIDATE CONSTRAINT messages_conversation_id_fkey;
ALTER TABLE messages VALIDATE CONSTRAINT messages_sender_id_fkey;
ALTER TABLE mfa_recovery_codes VALIDATE CONSTRAINT mfa_recovery_codes_user_id_fkey;
ALTER TABLE mfa_temp_tokens VALIDATE CONSTRAINT mfa_temp_tokens_user_id_fkey;
ALTER TABLE militia_profiles VALIDATE CONSTRAINT militia_profiles_unit_id_fkey;
ALTER TABLE militia_profiles VALIDATE CONSTRAINT militia_profiles_user_id_fkey;
ALTER TABLE militia_rewards VALIDATE CONSTRAINT militia_rewards_militia_id_fkey;
ALTER TABLE notification_preferences VALIDATE CONSTRAINT notification_preferences_user_id_fkey;
ALTER TABLE notification_receipts VALIDATE CONSTRAINT notification_receipts_notification_id_fkey;
ALTER TABLE notification_receipts VALIDATE CONSTRAINT notification_receipts_user_id_fkey;
ALTER TABLE notifications VALIDATE CONSTRAINT notifications_sender_id_fkey;
ALTER TABLE official_documents VALIDATE CONSTRAINT official_documents_created_by_fkey;
ALTER TABLE official_documents VALIDATE CONSTRAINT official_documents_file_id_fkey;
ALTER TABLE official_documents VALIDATE CONSTRAINT official_documents_related_militia_id_fkey;
ALTER TABLE official_documents VALIDATE CONSTRAINT official_documents_related_unit_id_fkey;
ALTER TABLE organization_units VALIDATE CONSTRAINT organization_units_commander_id_fkey;
ALTER TABLE organization_units VALIDATE CONSTRAINT organization_units_parent_id_fkey;
ALTER TABLE payroll_items VALIDATE CONSTRAINT payroll_items_adjusted_by_fkey;
ALTER TABLE payroll_items VALIDATE CONSTRAINT payroll_items_militia_id_fkey;
ALTER TABLE payroll_items VALIDATE CONSTRAINT payroll_items_payroll_period_id_fkey;
ALTER TABLE payroll_periods VALIDATE CONSTRAINT payroll_periods_approved_by_fkey;
ALTER TABLE payroll_periods VALIDATE CONSTRAINT payroll_periods_locked_by_fkey;
ALTER TABLE payroll_periods VALIDATE CONSTRAINT payroll_periods_processed_by_fkey;
ALTER TABLE police_profiles VALIDATE CONSTRAINT police_profiles_unit_id_fkey;
ALTER TABLE police_profiles VALIDATE CONSTRAINT police_profiles_user_id_fkey;
ALTER TABLE recovery_codes VALIDATE CONSTRAINT recovery_codes_user_id_fkey;
ALTER TABLE recruitment_applications VALIDATE CONSTRAINT recruitment_applications_created_by_fkey;
ALTER TABLE recruitment_applications VALIDATE CONSTRAINT recruitment_applications_reviewed_by_fkey;
ALTER TABLE reward_decisions VALIDATE CONSTRAINT reward_decisions_created_by_fkey;
ALTER TABLE reward_decisions VALIDATE CONSTRAINT reward_decisions_militia_id_fkey;
ALTER TABLE sessions VALIDATE CONSTRAINT sessions_device_id_fkey;
ALTER TABLE sessions VALIDATE CONSTRAINT fk_sessions_replaced_by;
ALTER TABLE sessions VALIDATE CONSTRAINT sessions_user_id_fkey;
ALTER TABLE system_settings VALIDATE CONSTRAINT system_settings_updated_by_fkey;
ALTER TABLE task_assignments VALIDATE CONSTRAINT task_assignments_assigned_by_fkey;
ALTER TABLE task_assignments VALIDATE CONSTRAINT task_assignments_assignee_id_fkey;
ALTER TABLE task_assignments VALIDATE CONSTRAINT task_assignments_task_id_fkey;
ALTER TABLE task_evidences VALIDATE CONSTRAINT task_evidences_file_id_fkey;
ALTER TABLE task_evidences VALIDATE CONSTRAINT task_evidences_task_update_id_fkey;
ALTER TABLE task_report_photos VALIDATE CONSTRAINT task_report_photos_file_id_fkey;
ALTER TABLE task_report_photos VALIDATE CONSTRAINT task_report_photos_task_report_id_fkey;
ALTER TABLE task_reports VALIDATE CONSTRAINT task_reports_submitted_by_fkey;
ALTER TABLE task_reports VALIDATE CONSTRAINT task_reports_task_id_fkey;
ALTER TABLE task_updates VALIDATE CONSTRAINT task_updates_task_assignment_id_fkey;
ALTER TABLE task_updates VALIDATE CONSTRAINT task_updates_updated_by_fkey;
ALTER TABLE tasks VALIDATE CONSTRAINT fk_tasks_cancelled_by;
ALTER TABLE tasks VALIDATE CONSTRAINT tasks_completed_by_fkey;
ALTER TABLE tasks VALIDATE CONSTRAINT tasks_created_by_fkey;
ALTER TABLE tasks VALIDATE CONSTRAINT tasks_unit_id_fkey;
ALTER TABLE training_plans VALIDATE CONSTRAINT training_plans_created_by_fkey;
ALTER TABLE training_plans VALIDATE CONSTRAINT training_plans_unit_id_fkey;
ALTER TABLE training_records VALIDATE CONSTRAINT training_records_created_by_fkey;
ALTER TABLE training_records VALIDATE CONSTRAINT training_records_militia_id_fkey;
ALTER TABLE training_records VALIDATE CONSTRAINT fk_training_records_session_attendance;
ALTER TABLE training_session_attendance VALIDATE CONSTRAINT training_session_attendance_militia_id_fkey;
ALTER TABLE training_session_attendance VALIDATE CONSTRAINT training_session_attendance_recorded_by_fkey;
ALTER TABLE training_session_attendance VALIDATE CONSTRAINT training_session_attendance_session_id_fkey;
ALTER TABLE training_sessions VALIDATE CONSTRAINT training_sessions_created_by_fkey;
ALTER TABLE training_sessions VALIDATE CONSTRAINT training_sessions_plan_id_fkey;
ALTER TABLE units VALIDATE CONSTRAINT units_parent_id_fkey;
ALTER TABLE user_password_history VALIDATE CONSTRAINT user_password_history_user_id_fkey;
ALTER TABLE user_roles VALIDATE CONSTRAINT user_roles_assigned_by_fkey;
ALTER TABLE user_roles VALIDATE CONSTRAINT user_roles_user_id_fkey;
ALTER TABLE user_unit_scopes VALIDATE CONSTRAINT user_unit_scopes_unit_id_fkey;
ALTER TABLE user_unit_scopes VALIDATE CONSTRAINT user_unit_scopes_user_id_fkey;
ALTER TABLE weapon_allocations VALIDATE CONSTRAINT weapon_allocations_recipient_id_fkey;
ALTER TABLE weapon_allocations VALIDATE CONSTRAINT weapon_allocations_weapon_id_fkey;
ALTER TABLE weapon_inventory_checks VALIDATE CONSTRAINT weapon_inventory_checks_performed_by_fkey;
ALTER TABLE weapon_inventory_items VALIDATE CONSTRAINT weapon_inventory_items_check_id_fkey;
ALTER TABLE weapon_inventory_items VALIDATE CONSTRAINT weapon_inventory_items_holder_militia_id_fkey;
ALTER TABLE weapon_inventory_items VALIDATE CONSTRAINT weapon_inventory_items_weapon_id_fkey;
ALTER TABLE weapons VALIDATE CONSTRAINT weapons_responsible_person_id_fkey;
ALTER TABLE work_report_attachments VALIDATE CONSTRAINT work_report_attachments_file_id_fkey;
ALTER TABLE work_report_attachments VALIDATE CONSTRAINT work_report_attachments_work_report_id_fkey;
ALTER TABLE work_reports VALIDATE CONSTRAINT work_reports_user_id_fkey;
ALTER TABLE work_reports VALIDATE CONSTRAINT work_reports_reviewed_by_fkey;

-- Catalog assertion: every foreign key of the schema is validated, and none between two
-- tenant tables is missing tenant_id
DO $$
DECLARE
    problems text[];
BEGIN
    SELECT array_agg(format('%s.%s', f.conrelid::regclass, f.conname) ORDER BY 1)
      INTO problems
      FROM pg_constraint f
     WHERE f.connamespace = 'public'::regnamespace AND f.contype = 'f'
       AND (NOT f.convalidated
            OR (f.confrelid <> 'tenants'::regclass
                AND EXISTS (SELECT 1 FROM pg_attribute pa
                             WHERE pa.attrelid = f.confrelid AND pa.attname = 'tenant_id')
                AND EXISTS (SELECT 1 FROM pg_attribute ca
                             WHERE ca.attrelid = f.conrelid AND ca.attname = 'tenant_id')
                AND NOT EXISTS (SELECT 1 FROM unnest(f.conkey) k
                                  JOIN pg_attribute ka
                                    ON ka.attrelid = f.conrelid AND ka.attnum = k
                                 WHERE ka.attname = 'tenant_id')));
    IF problems IS NOT NULL THEN
        RAISE EXCEPTION 'foreign keys not validated or not tenant-scoped: %',
            array_to_string(problems, ', ');
    END IF;
END $$;
```

- [ ] **Step 4: Run the gate suites and confirm they turn green**

Run: `npx jest src/database/migrations/sql-statements.spec.ts`. First add `expect(counts['040_tenant_validate_online.sql']).toBe(172);` to the repository test. Expected: PASS.

Run each in its own process:

```bash
for f in migrations tenancy-schema-guard tenancy-references tenancy-canary-rls tenancy-route-sweep tenancy-rls tenancy-binding tenancy-slice; do
  npx jest --config ./test/jest-e2e.json --runInBand "test/$f.e2e-spec.ts" || break
done
```

Expected: all PASS. These are the three RED guards of Phase A (schema guard 12 tests, references 14, canary RLS 6) and the sweep skeleton (4). In the canary suite, `checked` is 114. If the schema guard still lists a table, a key or a privilege, the migrations are incomplete. Fix 039 or 040 **only if neither is committed to any shared branch yet** (they are not: never pushed). Otherwise add a `041`. Never relax the guard.

- [ ] **Step 5: Document the migrations**

In `docs/migrations.md`:

1. Under "Guarantees", replace the first bullet with:

```markdown
- **One transaction per file, unless the file says otherwise.** A file runs in one
  transaction together with its `schema_migrations` row, so a failure leaves nothing half
  applied. The error names the file. The exception is a file marked non-transactional
  (see below), which is recorded only after its last statement succeeded.
```

2. Add a section after "Settings", and add the row `| MIGRATION_THROUGH | unset | Apply pending files up to and including this exact file name and leave the later ones pending. The CLI flag --through= does the same and takes precedence. |` to the settings table:

```markdown
## Non-transactional migrations

`CREATE INDEX CONCURRENTLY` cannot run in a transaction, and an online `VALIDATE
CONSTRAINT` should not hold its locks longer than its own scan. A file whose leading comment
lines contain the exact line

    -- mms:migration no-transaction

is run statement by statement on the migration session: each statement commits on its own,
the advisory lock stays held, and each waits at most `MIGRATION_LOCK_TIMEOUT` for a lock
(this also bounds how long a concurrent index build waits for older transactions). The file
is recorded in `schema_migrations` only after its last statement succeeded.

A failure leaves the statements before it applied and the file unrecorded: the next start
runs the **whole file again**. So every statement must be safe to run twice:
`ADD COLUMN IF NOT EXISTS`, `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS`,
`DROP INDEX CONCURRENTLY IF EXISTS`, `VALIDATE CONSTRAINT` (a no-op once valid). The runner
refuses, before running anything, a marked file with a non-concurrent or non-idempotent index
statement or with `BEGIN`/`COMMIT`. An interrupted concurrent build leaves an INVALID index
that `IF NOT EXISTS` would skip for ever; before running a marked file the runner drops
(`CONCURRENTLY`) every INVALID index the file builds. Checksums work as for any file.

`--through=<file>` (or `MIGRATION_THROUGH`) stops after that file, reporting the rest as
pending. It is how a release runs its online preparation ahead of its drained window.
```

3. Add after "Multi-tenancy migrations (036 and 037)":

```markdown
## Multi-tenancy migrations 038, 039 and 040 (M1a)

They extend the isolation of the M0 slice to every tenant table (66 tables; the 6 global
ones are `schema_migrations`, `tenants`, `roles`, `permissions`, `role_permissions`,
`login_attempts`, see `docs/tenancy.md`).

- **`038_tenant_columns_online.sql`** (non-transactional, online): `tenant_id` on the 57
  remaining tables, added with the first tenant as a constant default (kept in the catalog:
  no rewrite, no UPDATE, so the record-keeping triggers of 026 never fire), then defaulting
  to `app_tenant_id()`; every index the cutover needs, built `CONCURRENTLY`: 24 parent keys
  `(tenant_id, id)`, 15 per-tenant natural keys, 113 composite foreign-key indexes and 14
  tenant list indexes. It changes no behaviour and can run while the old version serves.
- **`039_tenant_isolation_cutover.sql`** (one transaction, short): attaches the per-tenant
  unique keys (`ADD CONSTRAINT … USING INDEX`, no scan), rewrites the 114 foreign keys between
  tenant tables as composite `(tenant_id, …)` keys `NOT VALID` with the same names and
  delete rules (`ON DELETE SET NULL (<col>)` for the nullable ones), enables and forces RLS
  with the `tenant_isolation` policy on the 57 tables, adds their `tenant_id` foreign keys
  `NOT VALID`, removes the default privileges of 036 (every later migration grants its tables
  explicitly; the schema guard test checks it), makes `roles`, `permissions` and
  `role_permissions` read-only for `mms_app`, and adds `tenantId` to the revocation
  announcements of 035. It asserts the catalog at its end: all or nothing.
- **`040_tenant_validate_online.sql`** (non-transactional, online): `VALIDATE CONSTRAINT`
  for each of the 171 keys, each in its own transaction (`SHARE UPDATE EXCLUSIVE` on the
  child, `ROW SHARE` on the parent: reads and writes go on), then a catalog assertion.

**039 is an incompatible release** (the conflict targets of `system_settings`, `incidents`
and `conversations` change). Deploy it like this:

1. Any time before the window, with the old version still serving: run the migrator with
   `--through=038_tenant_columns_online.sql`. Repeat it if it is interrupted.
2. Drain and stop the old version; back up with `pg_dump --create`.
3. Run the migrator with `--through=039_tenant_isolation_cutover.sql`.
4. Start the new version (migrating at start applies 040 online, or run it as a step).

The legacy database default (`app.tenant_id`) is untouched: a legacy deployment keeps
writing and reading the first tenant on all 66 tables. The lock windows measured on a
synthetic production-sized database are in "Rehearsal" below (Task 23).
```

- [ ] **Step 6: Lint and commit**

```bash
npx eslint test/migrations.e2e-spec.ts src/database/migrations/sql-statements.spec.ts
git add migrations/040_tenant_validate_online.sql test/migrations.e2e-spec.ts \
  src/database/migrations/sql-statements.spec.ts docs/migrations.md
git commit -m "feat(tenancy): migration 040 validates every tenant foreign key online

Each of the 171 keys added NOT VALID by 039 is validated in its own transaction, then the
catalog is asserted. The schema guard, the cross-tenant reference reproduction and the
whole-schema RLS proofs are green. docs/migrations.md documents non-transactional files,
--through and the 038/039/040 release procedure.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
## Phase D — runtime carry-overs from M0

### Task 11: One first-tenant constant, tenancy settings frozen at boot, lower-case tenant ids

**Files:**
- Create: `src/database/tenancy/first-tenant.ts`, `src/database/tenancy/first-tenant.spec.ts`
- Modify: `src/database/tenancy/tenancy-mode.ts` (whole file below), `src/database/tenancy/tenancy-mode.spec.ts`
- Modify: `src/database/tenancy/tenant-context.ts` (`assertScope`, `scopeKey`, `runAs`, `adopt`), `src/database/tenancy/tenant-context.spec.ts`
- Modify: `src/database/typeorm.options.ts:56-58`, `src/database/typeorm.options.spec.ts:171-184`
- Modify: `src/database/seeder.service.ts:7-8`, `src/database/tenancy/boot-guards.ts:91`, `test/support/tenancy.ts:8`

**Interfaces:**
- Produces: `FIRST_TENANT_ID`, `FIRST_TENANT_CODE`. Also `TenancySettings { mode: TenancyMode; legacyDefaultTenantCode: string | null }`, `readTenancySettings(env?)`, `freezeTenancySettings(env?)`, `tenancySettings()`, and `isTenancyEnforced(env?)`: with no argument it reads the settings frozen at boot, or the environment before boot. Tenant ids in a scope are always lower case. Tasks 12–17 use these names.

- [ ] **Step 1: Write the failing tests**

`src/database/tenancy/first-tenant.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { FIRST_TENANT_CODE, FIRST_TENANT_ID } from './first-tenant';

// SQL cannot import the constant: the migrations repeat it and must keep repeating this one
const migration = (name: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'migrations', name), 'utf8');

describe('first tenant', () => {
  it('is the tenant migration 036 creates', () => {
    expect(migration('036_tenants.sql')).toContain(
      `VALUES ('${FIRST_TENANT_ID}', '${FIRST_TENANT_CODE}',`,
    );
  });

  it('is the tenant 037 and 038 give every pre-existing row, and the legacy default', () => {
    const slice = migration('037_tenant_slice_rls.sql');
    expect(slice).toContain(`first_tenant constant uuid := '${FIRST_TENANT_ID}'`);
    expect(slice).toContain(`'${FIRST_TENANT_ID}');`);
    expect(
      migration('038_tenant_columns_online.sql').split(`DEFAULT '${FIRST_TENANT_ID}'`),
    ).toHaveLength(58);
  });

  it('is a lower-case uuid', () => {
    expect(FIRST_TENANT_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
```

Append to `src/database/tenancy/tenancy-mode.spec.ts` (import `freezeTenancySettings`, `readTenancySettings`, `tenancySettings` and `thrownBy` from `../../../test/support/thrown-by`):

```ts
describe('tenancy settings', () => {
  const previousMode = process.env.TENANCY_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
  });

  it('refuses an empty TENANCY_MODE: an unset compose variable must not pick a mode', () => {
    expect(thrownBy(() => readTenancySettings({ TENANCY_MODE: '' }))).toMatchObject({
      name: 'TenancyConfigError',
    });
  });

  it('reads LEGACY_DEFAULT_TENANT_CODE lower-cased, and null when unset or blank', () => {
    expect(readTenancySettings({ LEGACY_DEFAULT_TENANT_CODE: ' Phu-Dinh ' })).toEqual({
      mode: 'legacy',
      legacyDefaultTenantCode: 'phu-dinh',
    });
    expect(readTenancySettings({ LEGACY_DEFAULT_TENANT_CODE: '  ' }).legacyDefaultTenantCode).toBeNull();
    expect(readTenancySettings({}).legacyDefaultTenantCode).toBeNull();
  });

  it('refuses a LEGACY_DEFAULT_TENANT_CODE that cannot be a tenant code', () => {
    expect(
      thrownBy(() => readTenancySettings({ LEGACY_DEFAULT_TENANT_CODE: "x'; --" })),
    ).toMatchObject({
      name: 'TenancyConfigError',
      message: expect.stringContaining('Invalid LEGACY_DEFAULT_TENANT_CODE') as unknown,
    });
  });

  // First in order: nothing in this file has frozen the settings yet
  it('follows the environment until startup freezes the settings', () => {
    process.env.TENANCY_MODE = 'enforced';
    expect(isTenancyEnforced()).toBe(true);
    process.env.TENANCY_MODE = 'legacy';
    expect(isTenancyEnforced()).toBe(false);
  });

  it('keeps the settings frozen at startup whatever the environment does later', () => {
    freezeTenancySettings({ TENANCY_MODE: 'enforced' });
    process.env.TENANCY_MODE = 'legacy';
    expect(isTenancyEnforced()).toBe(true);
    expect(tenancySettings().mode).toBe('enforced');
    // An explicit environment is read as given, frozen or not
    expect(isTenancyEnforced({ TENANCY_MODE: 'legacy' })).toBe(false);
    // The next startup freezes again
    freezeTenancySettings({ TENANCY_MODE: 'legacy' });
    expect(isTenancyEnforced()).toBe(false);
  });
});
```

Append to `src/database/tenancy/tenant-context.spec.ts` (import `thrownBy`):

```ts
describe('TenantContext ids', () => {
  it('keeps tenant ids lower-cased, so another case of the same id is the same scope', async () => {
    const upper = A.toUpperCase();
    expect(
      await TenantContext.runAs({ tenantId: upper }, () => TenantContext.requireTenantId()),
    ).toBe(A);
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: upper });
      expect(thrownBy(() => TenantContext.adopt({ tenantId: A }))).toBeUndefined();
      expect(scopeKey(TenantContext.current())).toBe(`tenant:${A}`);
    });
    expect(scopeKey({ tenantId: upper })).toBe(`tenant:${A}`);
  });

  it('leaves the scope as it was when adopt is refused', () => {
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: A });
      expect(thrownBy(() => TenantContext.adopt({ tenantId: B }))).toMatchObject({
        code: 'scope_already_set',
      });
      expect(TenantContext.current()).toEqual({ tenantId: A });
    });
  });

  it('names a tenant id that is not a uuid by its code', () => {
    expect(thrownBy(() => TenantContext.runAs({ tenantId: 'x' }, () => 1))).toMatchObject({
      name: 'TenantScopeError',
      code: 'invalid_tenant_id',
    });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/database/tenancy`
Expected: FAIL. `Cannot find module './first-tenant'`, missing exports `readTenancySettings`/`freezeTenancySettings`/`tenancySettings`, and the upper-case id case (`requireTenantId` returns the upper-case id).

- [ ] **Step 3: Implement**

`src/database/tenancy/first-tenant.ts`:

```ts
// The tenant migration 036 creates for every row that existed before multi-tenancy. The
// migrations repeat the literal (SQL cannot import it); first-tenant.spec.ts keeps them equal.
export const FIRST_TENANT_ID = 'a1000000-0000-4000-8000-000000000001';
export const FIRST_TENANT_CODE = 'phu-dinh';
```

`src/database/tenancy/tenancy-mode.ts`, the whole file:

```ts
export type TenancyMode = 'legacy' | 'enforced';

/**
 * A tenancy setting or database that cannot work as configured. Retrying never fixes it, so
 * the TypeORM module (which retries its data source factory) gives up on this error at once.
 */
export class TenancyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenancyConfigError';
  }
}

export interface TenancySettings {
  readonly mode: TenancyMode;
  /**
   * Transitional (spec D17): under enforced mode, a sign-in that sends no tenant code signs
   * in to this tenant, for clients released before the tenant-code screen. Null: a 400.
   */
  readonly legacyDefaultTenantCode: string | null;
}

// The format of tenants.code (migration 036, chk_tenants_code)
const TENANT_CODE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/**
 * TENANCY_MODE: `legacy` keeps the single-tenant behaviour (no tenant scope is written to
 * the connection); `enforced` binds every connection to the tenant of the request. A typo
 * (or an empty value) must not silently pick a mode, so anything else fails.
 */
export function tenancyMode(env: NodeJS.ProcessEnv = process.env): TenancyMode {
  const raw = (env.TENANCY_MODE ?? 'legacy').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'enforced') return raw;
  throw new TenancyConfigError(
    `Invalid TENANCY_MODE ${JSON.stringify(env.TENANCY_MODE)}: use 'legacy' or 'enforced'`,
  );
}

export function readTenancySettings(
  env: NodeJS.ProcessEnv = process.env,
): TenancySettings {
  const mode = tenancyMode(env);
  const code = (env.LEGACY_DEFAULT_TENANT_CODE ?? '').trim().toLowerCase();
  if (code && !TENANT_CODE.test(code)) {
    throw new TenancyConfigError(
      `Invalid LEGACY_DEFAULT_TENANT_CODE ${JSON.stringify(env.LEGACY_DEFAULT_TENANT_CODE)}: use a tenant code such as 'phu-dinh'`,
    );
  }
  return { mode, legacyDefaultTenantCode: code || null };
}

let frozen: TenancySettings | undefined;

/**
 * Reads the settings once, at startup (tenantAwareDataSource): the hook, the guards and every
 * mode check of a running application then agree, whatever the environment does later.
 */
export function freezeTenancySettings(
  env: NodeJS.ProcessEnv = process.env,
): TenancySettings {
  frozen = readTenancySettings(env);
  return frozen;
}

/** The settings frozen at startup; before startup (scripts, unit tests), the environment's. */
export function tenancySettings(): TenancySettings {
  return frozen ?? readTenancySettings();
}

export const isTenancyEnforced = (env?: NodeJS.ProcessEnv): boolean =>
  (env ? tenancyMode(env) : tenancySettings().mode) === 'enforced';
```

`src/database/tenancy/tenant-context.ts`: keep everything else, and change the scope handling so that every stored and compared id is lower case:

```ts
// Tenant ids are compared as strings everywhere (scopeKey, room names, tid claims); a UUID
// in upper case is the same tenant, so it is stored in lower case
const normalised = (scope: TenantScope): TenantScope => {
  if (!isUUID(scope.tenantId)) {
    throw new TenantScopeError(
      'invalid_tenant_id',
      'A tenant scope needs a UUID tenant id',
    );
  }
  return { tenantId: scope.tenantId.toLowerCase() };
};

/** Comparable identity of a scope; `none` is the absence of one. */
export const scopeKey = (scope: TenantScope | undefined): string =>
  scope ? `tenant:${scope.tenantId.toLowerCase()}` : 'none';
```

In `TenantContext.runAs`, replace `assertScope(scope); return storage.run({ scope }, fn);` with `return storage.run({ scope: normalised(scope) }, fn);`. In `adopt`, replace `assertScope(scope);` with `const next = normalised(scope);`, compare `store.scope.tenantId !== next.tenantId`, and assign `store.scope = next;`. Delete `assertScope`.

`src/database/typeorm.options.ts:56-58`: replace

```ts
  const dataSource = new DataSource(options as DataSourceOptions);
  const enforced = isTenancyEnforced();
```

with

```ts
  // Read once, here: a bad TENANCY_MODE fails before any connection, and the running
  // application keeps the mode it started in
  const settings = freezeTenancySettings();
  const enforced = settings.mode === 'enforced';
  const dataSource = new DataSource(options as DataSourceOptions);
```

and import `freezeTenancySettings` instead of `isTenancyEnforced`. In `src/database/typeorm.options.spec.ts:171-184`, move the `warn.mockRestore()` into a `try { … } finally { warn.mockRestore(); }` around the test body, so a failed assertion cannot leak the spy into later tests.

Replace the duplicated literal with the constant:
- `src/database/seeder.service.ts:7-8`: delete the local constant and `import { FIRST_TENANT_ID } from './tenancy/first-tenant';`.
- `src/database/tenancy/boot-guards.ts:91`: delete `const FIRST_TENANT_ID = …` and `import { FIRST_TENANT_ID } from './first-tenant';`.
- `test/support/tenancy.ts:8`: `export const TENANT_1 = FIRST_TENANT_ID;` with `import { FIRST_TENANT_ID } from '../../src/database/tenancy/first-tenant';`.

- [ ] **Step 4: Run the tests**

Run: `npx jest src/database src/notifications src/auth src/common/guards src/files src/scheduler`
Expected: PASS. The specs that set `process.env.TENANCY_MODE` per test keep working, because nothing in them freezes the settings. In `typeorm.options.spec`, each call to `tenantAwareDataSource` freezes again.

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-binding.e2e-spec.ts`
Expected: PASS. If a test there flips `TENANCY_MODE` and then expects a changed mode *without* building a new data source, it relied on per-call reads. Make that test call `freezeTenancySettings()` where the application would boot, and keep its assertion unchanged.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/database test/support/tenancy.ts
git add src/database/tenancy/first-tenant.ts src/database/tenancy/first-tenant.spec.ts \
  src/database/tenancy/tenancy-mode.ts src/database/tenancy/tenancy-mode.spec.ts \
  src/database/tenancy/tenant-context.ts src/database/tenancy/tenant-context.spec.ts \
  src/database/typeorm.options.ts src/database/typeorm.options.spec.ts \
  src/database/seeder.service.ts src/database/tenancy/boot-guards.ts test/support/tenancy.ts
git commit -m "refactor(tenancy): one first-tenant constant, settings frozen at boot, lower-case tenant ids

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(If `test/tenancy-binding.e2e-spec.ts` needed `freezeTenancySettings()`, add it to this commit.)

---

### Task 12: `LEGACY_DEFAULT_TENANT_CODE`, the transitional sign-in fallback (spec D17)

**Files:**
- Modify: `src/auth/auth.service.ts:170-221` (`requireTenantCode` → `signInTenantCode`, `resolveLoginTenant` private and fed the resolved code, `validateUser`), add `Logger`
- Modify: `src/auth/auth.service.spec.ts:703-870` (tenant describe), and the top-level `beforeEach`
- Modify: `src/database/tenancy/boot-guards.ts` (+ `assertLegacyDefaultTenantCode`), `boot-guards.spec.ts`
- Modify: `src/database/typeorm.options.ts` (call it in the enforced branch), `typeorm.options.spec.ts`
- Modify: `C:\MMS\.env.example`, `C:\MMS\.env.docker.example`

**Interfaces:**
- Consumes: `tenancySettings().legacyDefaultTenantCode` (Task 11).
- Produces: under `enforced`, `POST /auth/login` without a `tenantCode` signs in to `LEGACY_DEFAULT_TENANT_CODE` when it is set, and logs a warning per such sign-in. Unset, it answers 400 `tenant_code_required` as before. Boot refuses a code that names no active tenant (`legacy_default_tenant_code_unknown`). Legacy mode ignores the setting. Task 13's enforced harness relies on this.

- [ ] **Step 1: Write the failing tests**

In `src/auth/auth.service.spec.ts`:

1. In the top-level `beforeEach`, before any default mock answer is set, add `mockDataSource.query.mockReset();`, and re-apply any default implementation the `beforeEach` gives it. This stops a `mockImplementation` from leaking between tests (M0 triage T5).
2. Replace `describe('resolveLoginTenant', …)` (lines 833–870), which called the method that becomes private, with:

```ts
    describe('the transitional tenant code', () => {
      const previousCode = process.env.LEGACY_DEFAULT_TENANT_CODE;
      afterEach(() => {
        if (previousCode === undefined) delete process.env.LEGACY_DEFAULT_TENANT_CODE;
        else process.env.LEGACY_DEFAULT_TENANT_CODE = previousCode;
      });

      const signIn = (tenantCode: string | undefined) =>
        TenantContext.start(() => service.validateUser('caphuong', PW, tenantCode));

      test('signs a client that sends no code in to LEGACY_DEFAULT_TENANT_CODE, and says so', async () => {
        process.env.TENANCY_MODE = 'enforced';
        process.env.LEGACY_DEFAULT_TENANT_CODE = 'phu-dinh';
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        try {
          mockDataSource.query.mockImplementation((sql: string) =>
            Promise.resolve(
              sql === LOOKUP
                ? [{ id: TID, status: 'active' }]
                : sql.includes('FROM users WHERE username')
                  ? [userRow]
                  : [],
            ),
          );

          await expect(signIn(undefined)).resolves.toMatchObject({ id: userRow.id });

          expect(mockDataSource.query).toHaveBeenCalledWith(LOOKUP, ['phu-dinh']);
          expect(warn).toHaveBeenCalledTimes(1);
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('LEGACY_DEFAULT_TENANT_CODE'),
          );
        } finally {
          warn.mockRestore();
        }
      });

      test('still prefers the code the client sent', async () => {
        process.env.TENANCY_MODE = 'enforced';
        process.env.LEGACY_DEFAULT_TENANT_CODE = 'phu-dinh';
        mockDataSource.query.mockResolvedValueOnce([]);

        await expect(signIn('other')).rejects.toThrow(
          new UnauthorizedException('invalid_credentials'),
        );
        expect(mockDataSource.query).toHaveBeenCalledWith(LOOKUP, ['other']);
      });

      test('is ignored in legacy mode, which looks no tenant up', async () => {
        delete process.env.TENANCY_MODE;
        process.env.LEGACY_DEFAULT_TENANT_CODE = 'phu-dinh';
        mockDataSource.query.mockImplementation((sql: string) =>
          Promise.resolve(sql.includes('FROM users WHERE username') ? [userRow] : []),
        );

        await signIn(undefined);

        expect(mockDataSource.query).not.toHaveBeenCalledWith(LOOKUP, expect.anything());
      });

      test('spends the bcrypt work before it counts an unknown tenant as a failure', async () => {
        process.env.TENANCY_MODE = 'enforced';
        mockDataSource.query.mockResolvedValueOnce([]);

        await expect(signIn('nope')).rejects.toThrow(
          new UnauthorizedException('invalid_credentials'),
        );
        const compared = jest.mocked(bcrypt.compare).mock.invocationCallOrder.at(-1);
        const failed = mockAttempt.failed.mock.invocationCallOrder.at(-1);
        expect(compared).toBeDefined();
        expect(failed).toBeDefined();
        expect(compared as number).toBeLessThan(failed as number);
      });
    });
```

`userRow` is the row the file's existing successful-sign-in tests build for `caphuong` (its `id`, `password_hash` of `PW_HASH`, `mfa_enabled: false`). Reuse it, or declare it once next to `TID` if each test builds its own. `bcrypt` is already mocked with the real implementation observed (lines 21–31), and `Logger` comes from `@nestjs/common`. The existing test `asks for a tenant code before it takes a slot` stays unchanged: with no `LEGACY_DEFAULT_TENANT_CODE` set, the blank code is still a 400.

In `src/database/tenancy/boot-guards.spec.ts`, add:

```ts
describe('assertLegacyDefaultTenantCode', () => {
  const ds = (rows: unknown[]) => ({ query: jest.fn().mockResolvedValue(rows) });

  it('accepts no setting, and a code naming an active tenant', async () => {
    await expect(assertLegacyDefaultTenantCode(ds([]), null)).resolves.toBeUndefined();
    const active = ds([{ status: 'active' }]);
    await expect(assertLegacyDefaultTenantCode(active, 'phu-dinh')).resolves.toBeUndefined();
    expect(active.query).toHaveBeenCalledWith(
      'SELECT status FROM auth_tenant_by_code($1)',
      ['phu-dinh'],
    );
  });

  it.each([
    [[], 'no such tenant'],
    [[{ status: 'suspended' }], 'status suspended'],
  ])('refuses a code that names no active tenant (%j)', async (rows, why) => {
    await expect(assertLegacyDefaultTenantCode(ds(rows), 'phu-dinh')).rejects.toMatchObject({
      name: 'TenancyConfigError',
      message: expect.stringContaining(why) as unknown,
    });
  });
});
```

In `src/database/typeorm.options.spec.ts`, in the enforced-mode block, add a test that `assertLegacyDefaultTenantCode` (mocked like the other guards) is called with `'phu-dinh'` when `LEGACY_DEFAULT_TENANT_CODE=phu-dinh`, and that its rejection destroys the data source and rejects with the same error. Copy the structure of the neighbouring `assertRuntimeRoleEnforcesRls` refusal test.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/auth/auth.service.spec.ts src/database`
Expected: FAIL. No fallback (400 `tenant_code_required`), `assertLegacyDefaultTenantCode` not exported, guard not called.

- [ ] **Step 3: Implement**

`src/database/tenancy/boot-guards.ts`, append:

```ts
// LEGACY_DEFAULT_TENANT_CODE signs clients that send no tenant code in to one tenant
// (spec D17). A code naming no active tenant would make every such sign-in fail like a
// wrong password, with only a warning per attempt to show for it: refuse to start instead.
export async function assertLegacyDefaultTenantCode(
  dataSource: Pick<DataSource, 'query'>,
  code: string | null,
): Promise<void> {
  if (code === null) return;
  const rows = await dataSource.query<{ status: string }[]>(
    'SELECT status FROM auth_tenant_by_code($1)',
    [code],
  );
  const status = rows[0]?.status;
  if (status !== 'active') {
    throw new TenancyConfigError(
      `legacy_default_tenant_code_unknown: LEGACY_DEFAULT_TENANT_CODE=${JSON.stringify(code)} names no active tenant (${status === undefined ? 'no such tenant' : `status ${status}`}). Fix the code or remove the setting`,
    );
  }
}
```

`src/database/typeorm.options.ts`, in the enforced branch after `assertRuntimeRoleEnforcesRls(dataSource)`:

```ts
      await assertLegacyDefaultTenantCode(
        dataSource,
        settings.legacyDefaultTenantCode,
      );
```

`src/auth/auth.service.ts`: add `Logger` to the `@nestjs/common` import and `private readonly logger = new Logger(AuthService.name);` to the class. Import `tenancySettings` beside `isTenancyEnforced`. Replace `requireTenantCode`, `resolveLoginTenant` and `validateUser` (lines 170–221) with:

```ts
  // The tenant code a sign-in names: none in legacy mode. Under enforced mode a blank code
  // falls back to LEGACY_DEFAULT_TENANT_CODE while clients that send none are in use (spec
  // D17, removed one release after the tenant-code clients of M1c ship); without it a blank
  // code is a 400, answered before any lockout slot is taken.
  private signInTenantCode(tenantCode: string | undefined): string | null {
    if (!isTenancyEnforced()) return null;
    const code = (tenantCode ?? '').trim();
    if (code) return code;
    const fallback = tenancySettings().legacyDefaultTenantCode;
    if (fallback === null) throw new BadRequestException('tenant_code_required');
    this.logger.warn(
      `Sign-in without a tenant code: using the transitional LEGACY_DEFAULT_TENANT_CODE "${fallback}". Update the client to send tenantCode`,
    );
    return fallback;
  }

  /**
   * The tenant a sign-in is for. Legacy mode has none. Enforced mode resolves the code
   * inside the sign-in attempt: an unknown or inactive tenant looks exactly like a wrong
   * password (same answer, same bcrypt work, same failure counted against the name), so
   * codes cannot be probed, not even through the lockout. The tenant is adopted into the
   * request scope, so every later query of the sign-in runs under it.
   */
  private async resolveLoginTenant(
    code: string | null,
    password: string,
    attempt: LoginAttempt,
  ): Promise<string | null> {
    if (code === null) return null;
    const [tenant] = await this.dataSource.query<
      { id: string; status: string }[]
    >('SELECT id, status FROM auth_tenant_by_code($1)', [code]);
    if (!tenant || tenant.status !== 'active') {
      await bcrypt.compare(password, DUMMY_HASH);
      await attempt.failed();
      throw new UnauthorizedException('invalid_credentials');
    }
    TenantContext.adopt({ tenantId: tenant.id });
    return tenant.id;
  }

  // US-W001 AC-1: Validate credentials. BR-AUTH-02: the attempt takes a lockout slot first
  // (403 account_locked when none is left) and counts only when the name is unknown or the
  // password wrong. Under TENANCY_MODE=enforced the tenant is resolved inside the attempt,
  // so an unknown tenant spends the slot like a wrong password.
  async validateUser(
    username: string,
    password: string,
    tenantCode?: string,
  ): Promise<ValidatedUser> {
    const code = this.signInTenantCode(tenantCode);
    const attempt = await this.loginAttempts.begin(username);
    try {
      await this.resolveLoginTenant(code, password, attempt);
      return await this.checkCredentials(username, password, attempt);
    } finally {
      // A no-op once settled; frees the slot when an unexpected error ended the attempt
      await attempt.release();
    }
  }
```

`C:\MMS\.env.example` (after the `TENANCY_MODE` lines) and `C:\MMS\.env.docker.example` (same place):

```bash
# LEGACY_DEFAULT_TENANT_CODE: TENANCY_MODE=enforced only. A sign-in that sends no tenantCode
# (a client released before the tenant-code screen) signs in to this tenant, with a warning
# in the log per sign-in. Transitional: remove it one release after the updated clients
# ship. Unset: such a sign-in is a 400 tenant_code_required. Boot refuses a code that names
# no active tenant.
# LEGACY_DEFAULT_TENANT_CODE=phu-dinh
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/auth src/database`
Expected: PASS.

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice.e2e-spec.ts`
Expected: PASS. The slice runs without the setting, so a blank code is still a 400 there.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/auth/auth.service.ts src/auth/auth.service.spec.ts src/database
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts src/database/tenancy/boot-guards.ts \
  src/database/tenancy/boot-guards.spec.ts src/database/typeorm.options.ts src/database/typeorm.options.spec.ts
git -C /c/MMS add .env.example .env.docker.example
git commit -m "feat(auth): transitional LEGACY_DEFAULT_TENANT_CODE for clients that send no tenant code

Under TENANCY_MODE=enforced a sign-in without tenantCode signs in to that tenant with a
warning (spec D17), resolved once inside the lockout attempt like any code. Boot refuses a
code naming no active tenant. resolveLoginTenant is private again; the bcrypt-before-failure
order of an unknown tenant is pinned.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The two-mode e2e harness, and role hygiene

**Files:**
- Create: `test/support/e2e-tenancy.ts`, `test/support/e2e-roles.global-teardown.ts`, `test/tenancy-harness.e2e-spec.ts`, `scripts/run-e2e.mjs`
- Modify: `test/support/db.ts`, `test/support/app-env.ts`, `test/support/enforced-env.ts`, `test/support/tenancy.ts` (passwords, `alterRole`, failure cleanup), `test/jest-e2e.json`, `package.json`, `.gitignore` (backend)
- Modify (setup lines only, no assertion): `test/api-contract.e2e-spec.ts:110-128`, `test/client-gaps-t20.e2e-spec.ts:154-176`, `test/features-t18.e2e-spec.ts:111-130`, `test/frontend-routes-t23.e2e-spec.ts:159-180`, `test/app.e2e-spec.ts:33-36`, `test/gps-live.e2e-spec.ts:133-136`, `test/incidents-tasks-scope.e2e-spec.ts:94-97`, `test/realtime-session.e2e-spec.ts:41-44`
- Modify: `test/socket-adapter-redis.e2e-spec.ts:59-72` (use the shared `eventually`), `test/tenancy-binding.e2e-spec.ts:393` (admin user from the URL)

**Interfaces:**
- Consumes: `FIRST_TENANT_ID`, `FIRST_TENANT_CODE` (Task 11); the fallback (Task 12).
- Produces: `E2eTenancy`, `e2eTenancy(env?)`, `isEnforcedRun()`, `backendTenancyEnv(): Record<string, string>`, `fixtureConnectionOptions(): string | undefined`, `prepareDatabaseForTenancy(databaseName)`, `asFixtureTenant(fn)`, `storedContentPath(uploadDir, storageKey)`, `storedContentDir(uploadDir)`, `storedFileCount(uploadDir)`. Also `alterRole` (exported, retries only `XX000`), random `APP_PASSWORD`/`PLATFORM_PASSWORD` per process, the global teardown, and the scripts `npm run test:e2e:legacy|enforced|all`. **The only allowed adaptations of a pre-existing suite in Tasks 18–20 are calls to these helpers.**

- [ ] **Step 1: Write the failing harness test**

`test/tenancy-harness.e2e-spec.ts`:

```ts
// The two-mode e2e harness (M1a): what an enforced run (E2E_TENANCY=enforced) changes for
// the pre-existing suites, and the role hygiene after a run.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import * as path from 'path';
import lockApplicationRoles from './support/e2e-roles.global-teardown';
import {
  backendTenancyEnv,
  e2eTenancy,
  fixtureConnectionOptions,
  prepareDatabaseForTenancy,
  storedContentPath,
} from './support/e2e-tenancy';
import { withClient } from './support/db';
import { thrownBy } from './support/thrown-by';
import {
  APP_PASSWORD,
  TENANT_1,
  createTenantDatabase,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(180_000);

describe('two-mode e2e harness (e2e)', () => {
  const previous = process.env.E2E_TENANCY;
  afterEach(() => {
    if (previous === undefined) delete process.env.E2E_TENANCY;
    else process.env.E2E_TENANCY = previous;
  });

  it('reads the mode, legacy by default, and refuses anything else', () => {
    expect(e2eTenancy({})).toBe('legacy');
    expect(e2eTenancy({ E2E_TENANCY: ' Enforced ' })).toBe('enforced');
    expect(thrownBy(() => e2eTenancy({ E2E_TENANCY: 'enforce' }))).toMatchObject({
      message: expect.stringContaining('Invalid E2E_TENANCY') as unknown,
    });
  });

  it('changes nothing in a legacy run', () => {
    process.env.E2E_TENANCY = 'legacy';
    expect(backendTenancyEnv()).toEqual({});
    expect(fixtureConnectionOptions()).toBeUndefined();
    expect(storedContentPath('/uploads', 'key')).toBe(path.join('/uploads', 'key'));
  });

  it('runs the backend as mms_app, enforced, with the transitional tenant code, in an enforced run', () => {
    process.env.E2E_TENANCY = 'enforced';
    expect(backendTenancyEnv()).toEqual({
      TENANCY_MODE: 'enforced',
      DB_USER: 'mms_app',
      DB_PASSWORD: APP_PASSWORD,
      LEGACY_DEFAULT_TENANT_CODE: 'phu-dinh',
    });
    expect(fixtureConnectionOptions()).toBe(`-c app.tenant_id=${TENANT_1}`);
    expect(storedContentPath('/uploads', 'key')).toBe(path.join('/uploads', TENANT_1, 'key'));
  });

  it('uses a password that is not in the repository', () => {
    expect(APP_PASSWORD).not.toBe('mms_app_e2e');
    expect(APP_PASSWORD.length).toBeGreaterThanOrEqual(24);
  });

  describe('on a database', () => {
    let db: TenantDatabase;

    beforeAll(async () => {
      db = await createTenantDatabase({ keepLegacyDefault: true });
    });

    afterAll(async () => {
      await db?.drop();
    });

    it('makes a migrated database an enforced one, and lands fixture rows in the first tenant', async () => {
      process.env.E2E_TENANCY = 'enforced';
      await prepareDatabaseForTenancy(db.name);

      const defaults = await db.admin(async (c) =>
        (
          await c.query<{ n: string }>(
            `SELECT count(*) AS n FROM pg_db_role_setting s
               CROSS JOIN LATERAL unnest(s.setconfig) AS c
              WHERE s.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
                AND starts_with(c, 'app.tenant_id=')`,
          )
        ).rows[0].n,
      );
      expect(defaults).toBe('0');
      const tenant = await withClient(db.adminUrl, async (c) =>
        (
          await c.query<{ tenant: string }>(
            `INSERT INTO kpi_criteria (code, name, category, max_score, weight)
             VALUES ('harness', 'x', 'x', 1, 1) RETURNING tenant_id::text AS tenant`,
          )
        ).rows[0].tenant,
      );
      expect(tenant).toBe(TENANT_1);
      await db.app(TENANT_1, async (c) => {
        expect((await c.query('SELECT 1')).rowCount).toBe(1);
      });
    });

    it('locks the application roles again after the run', async () => {
      await lockApplicationRoles();
      const roles = await db.admin(
        async (c) =>
          (
            await c.query<{ rolname: string; rolcanlogin: boolean }>(
              `SELECT rolname, rolcanlogin FROM pg_roles
                WHERE rolname IN ('mms_app', 'mms_platform') ORDER BY rolname`,
            )
          ).rows,
      );
      expect(roles).toEqual([
        { rolname: 'mms_app', rolcanlogin: false },
        { rolname: 'mms_platform', rolcanlogin: false },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-harness.e2e-spec.ts`
Expected: FAIL with `Cannot find module './support/e2e-roles.global-teardown'` and `'./support/e2e-tenancy'`.

- [ ] **Step 3: Implement the harness**

`test/support/e2e-tenancy.ts`:

```ts
// The tenancy mode the e2e suites run the backend in: E2E_TENANCY=legacy (the default) or
// enforced. Enforced runs it as mms_app with TENANCY_MODE=enforced on a database without the
// legacy default, signs the suites' tenant-less sign-ins in through LEGACY_DEFAULT_TENANT_CODE,
// and gives fixture connections (support/db.ts) the first tenant as their default, so the
// fixtures, written for one tenant, keep their meaning. The suites' assertions are the same
// in both modes: these helpers are the only place the modes differ.
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import {
  FIRST_TENANT_CODE,
  FIRST_TENANT_ID,
} from '../../src/database/tenancy/first-tenant';
import { TenantContext } from '../../src/database/tenancy/tenant-context';
import { APP_PASSWORD, alterRole } from './tenancy';

export type E2eTenancy = 'legacy' | 'enforced';

export function e2eTenancy(env: NodeJS.ProcessEnv = process.env): E2eTenancy {
  const raw = (env.E2E_TENANCY ?? 'legacy').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'enforced') return raw;
  throw new Error(
    `Invalid E2E_TENANCY ${JSON.stringify(env.E2E_TENANCY)}: use 'legacy' or 'enforced'`,
  );
}

export const isEnforcedRun = (): boolean => e2eTenancy() === 'enforced';

/** The backend settings of the run's mode, merged last over a suite's own DB_* settings. */
export function backendTenancyEnv(): Record<string, string> {
  if (!isEnforcedRun()) return {};
  return {
    TENANCY_MODE: 'enforced',
    DB_USER: 'mms_app',
    DB_PASSWORD: APP_PASSWORD,
    LEGACY_DEFAULT_TENANT_CODE: FIRST_TENANT_CODE,
  };
}

/** The `options` startup parameter of fixture connections: the first tenant when enforced. */
export const fixtureConnectionOptions = (): string | undefined =>
  isEnforcedRun() ? `-c app.tenant_id=${FIRST_TENANT_ID}` : undefined;

/** After a suite migrated its database: in an enforced run, make it an enforced database. */
export async function prepareDatabaseForTenancy(databaseName: string): Promise<void> {
  if (!isEnforcedRun()) return;
  const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!adminUrl) throw new Error('MIGRATION_TEST_ADMIN_URL is not set');
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `ALTER DATABASE "${databaseName.replace(/"/g, '""')}" RESET app.tenant_id`,
    );
    await alterRole(client, 'mms_app', APP_PASSWORD);
  } finally {
    await client.end();
  }
}

/** A service a suite calls directly has no request, so no scope: run it as the first tenant. */
export const asFixtureTenant = <T>(fn: () => T): T =>
  TenantContext.runAs({ tenantId: FIRST_TENANT_ID }, fn);

/** The directory holding the uploads of the fixture tenant (FilesService.tenantUploadDir). */
export const storedContentDir = (uploadDir: string): string =>
  isEnforcedRun() ? path.join(uploadDir, FIRST_TENANT_ID) : uploadDir;

/** Where an upload's content lives (FilesService.contentPath). */
export const storedContentPath = (uploadDir: string, storageKey: string): string =>
  path.join(storedContentDir(uploadDir), storageKey);

/** How many uploads the fixture tenant has on disk. */
export const storedFileCount = (uploadDir: string): number => {
  const dir = storedContentDir(uploadDir);
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};
```

`test/support/e2e-roles.global-teardown.ts`:

```ts
// After every e2e run the application roles go back to NOLOGIN with no password, so a
// cluster never keeps a login a test set (docs/tenancy.md, "Running the e2e suites").
import { Client } from 'pg';

export default async function lockApplicationRoles(): Promise<void> {
  const url = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!url) return;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const role of ['mms_app', 'mms_platform']) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [role],
      );
      if (rowCount) await client.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);
    }
  } finally {
    await client.end();
  }
}
```

`test/support/tenancy.ts`:
- `import { randomBytes } from 'crypto';` (beside `randomUUID`).
- Replace the two password constants:

```ts
// One password per Jest process (the suites run one file per process): never a password
// committed to the repository, and the global teardown sets NOLOGIN afterwards
export const APP_PASSWORD = randomBytes(18).toString('base64url');
export const PLATFORM_PASSWORD = randomBytes(18).toString('base64url');
```

- Replace `alterRole` with an exported version that retries only the concurrent-update error:

```ts
// Two Jest processes altering the same cluster-wide role can meet "tuple concurrently
// updated" (XX000): retry that one; anything else is a real failure
export async function alterRole(
  client: Client,
  role: string,
  password: string,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== 'XX000' || attempt >= 5) throw error;
    }
  }
}
```

- In `createTenantDatabase`, replace `await dropDatabase().catch(() => undefined); throw error;` with:

```ts
    try {
      await dropDatabase();
    } catch (dropError) {
      throw new AggregateError(
        [error, dropError],
        `Creating ${name} failed, and dropping the half-built database failed too`,
      );
    }
    throw error;
```

`test/support/db.ts`:

```ts
import { Client } from 'pg';
import { fixtureConnectionOptions } from './e2e-tenancy';

/**
 * Runs `fn` with a connected client and always closes it. In an enforced run the session
 * defaults to the first tenant (support/e2e-tenancy.ts), as the legacy database default did.
 */
export async function withClient<T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: url,
    options: fixtureConnectionOptions(),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
```

`test/support/app-env.ts`, append (after the existing `Object.assign`):

```ts
// E2E_TENANCY=enforced: the backend runs as mms_app in enforced mode (support/e2e-tenancy.ts)
Object.assign(process.env, backendTenancyEnv());
```

with `import { backendTenancyEnv } from './e2e-tenancy';` at the top.

`test/support/enforced-env.ts`, append `delete process.env.LEGACY_DEFAULT_TENANT_CODE;` with the comment `// The tenancy suites test the strict sign-in: a blank tenant code is a 400`.

`test/jest-e2e.json`: add `"globalTeardown": "<rootDir>/support/e2e-roles.global-teardown.ts",` after `globalSetup`.

`scripts/run-e2e.mjs`:

```js
// Runs every e2e suite, one Jest process per file (a single process trips the Terminus heap
// check of app.e2e-spec: docs/tenancy.md), in legacy mode, enforced mode or both, and prints
// one line per run. Failed runs leave their output in test-results/.
//   node scripts/run-e2e.mjs [--mode=legacy|enforced|both] [file-name-fragment]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = (args.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'both').toLowerCase();
const fragment = args.find((a) => !a.startsWith('--'));
const modes = mode === 'both' ? ['legacy', 'enforced'] : [mode];
if (!modes.every((m) => m === 'legacy' || m === 'enforced')) {
  console.error(`Unknown --mode=${mode}: use legacy, enforced or both`);
  process.exit(2);
}
const files = readdirSync(join(root, 'test'))
  .filter((f) => f.endsWith('.e2e-spec.ts') && (!fragment || f.includes(fragment)))
  .sort();
const jest = join(root, 'node_modules', 'jest', 'bin', 'jest.js');
const out = join(root, 'test-results');
mkdirSync(out, { recursive: true });
const results = [];
for (const m of modes) {
  for (const file of files) {
    const started = Date.now();
    const run = spawnSync(
      process.execPath,
      [jest, '--config', './test/jest-e2e.json', '--runInBand', `test/${file}`],
      {
        cwd: root,
        env: { ...process.env, E2E_TENANCY: m },
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const summary = /Tests:\s+(.*)/.exec(output)?.[1]?.trim() ?? 'no test summary';
    const ok = run.status === 0;
    results.push({ mode: m, file, ok, summary, seconds: Math.round((Date.now() - started) / 1000) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${m.padEnd(8)}  ${file.padEnd(46)}  ${summary}`);
    if (!ok) writeFileSync(join(out, `${m}--${file}.log`), output);
  }
}
writeFileSync(join(out, 'e2e-summary.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} suite runs passed`);
process.exit(failed === 0 ? 0 : 1);
```

`package.json` scripts, after `test:e2e`:

```json
    "test:e2e:legacy": "node scripts/run-e2e.mjs --mode=legacy",
    "test:e2e:enforced": "node scripts/run-e2e.mjs --mode=enforced",
    "test:e2e:all": "node scripts/run-e2e.mjs --mode=both",
```

`Web/backend/.gitignore`: add `test-results/` if it is not ignored yet.

- [ ] **Step 4: Wire the pre-existing suites (setup only)**

Make each change below and nothing else. Add each import to the file's existing `./support/...` imports.

| Suite | Change |
|---|---|
| `api-contract` (after `migrateDatabase` at 110-113; in the `Object.assign` at 118-128) | `await prepareDatabaseForTenancy(dbName);` and `...backendTenancyEnv(),` as the last property |
| `client-gaps-t20` (154-157; 161-176) | same two lines |
| `features-t18` (111-114; 118-130) | same two lines (only the main database of the suite, not the scratch databases its migration tests create) |
| `frontend-routes-t23` (159-162; 166-180) | same two lines |
| `app`, `gps-live`, `incidents-tasks-scope`, `realtime-session` (after their `migrateDatabase` of `E2E_DB_URL`) | `await prepareDatabaseForTenancy(E2E_DB_NAME);` (the backend settings come from `app-env.ts`) |
| `socket-adapter-redis` (59-72) | delete the local `eventually` and `import { eventually } from './support/eventually';` (same signature) |
| `tenancy-binding` (393) | `connectionsOf(db, new URL(process.env.MIGRATION_TEST_ADMIN_URL ?? '').username)` instead of the hard-coded `'mms'` |

- [ ] **Step 5: Run the harness, then one pre-existing suite in both modes**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-harness.e2e-spec.ts`
Expected: PASS (6 tests).

Run: `node scripts/run-e2e.mjs --mode=both app.e2e`
Expected:
```
PASS  legacy    app.e2e-spec.ts                                 Tests:       2 passed, 2 total
PASS  enforced  app.e2e-spec.ts                                 Tests:       2 passed, 2 total
```

Run: `node scripts/run-e2e.mjs --mode=legacy`
Expected: every suite PASS in legacy mode. This regression proves the harness changed nothing for legacy, because `prepareDatabaseForTenancy` and `backendTenancyEnv` are no-ops there.

- [ ] **Step 6: Lint and commit**

```bash
npx eslint test/support test/tenancy-harness.e2e-spec.ts test/*.e2e-spec.ts
git add test/support/e2e-tenancy.ts test/support/e2e-roles.global-teardown.ts test/tenancy-harness.e2e-spec.ts \
  test/support/db.ts test/support/app-env.ts test/support/enforced-env.ts test/support/tenancy.ts \
  test/jest-e2e.json scripts/run-e2e.mjs package.json .gitignore \
  test/api-contract.e2e-spec.ts test/client-gaps-t20.e2e-spec.ts test/features-t18.e2e-spec.ts \
  test/frontend-routes-t23.e2e-spec.ts test/app.e2e-spec.ts test/gps-live.e2e-spec.ts \
  test/incidents-tasks-scope.e2e-spec.ts test/realtime-session.e2e-spec.ts \
  test/socket-adapter-redis.e2e-spec.ts test/tenancy-binding.e2e-spec.ts
git commit -m "test(tenancy): run every e2e suite in legacy or enforced mode, and lock the test roles after

E2E_TENANCY=enforced runs the backend as mms_app with TENANCY_MODE=enforced and the
transitional LEGACY_DEFAULT_TENANT_CODE on a database without the legacy default, with
fixture connections defaulting to the first tenant; the suites' assertions are unchanged.
scripts/run-e2e.mjs runs each suite in its own process in one or both modes. Role
passwords are random per process, set back to NOLOGIN by a global teardown; alterRole retries
only concurrent updates and a failed cleanup is reported.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: MFA sign-in challenges carry the tenant (moved from M1b)

**Files:**
- Modify: `src/auth/mfa/mfa-challenge.service.ts` (`TOKEN_PATTERN` line 48, `issue` lines 65-88, `load` lines 91-131; add `challengeTenantOf`, `enterTenantOf`)
- Modify: `src/auth/mfa/mfa.service.ts` (`verify` line 164, `startEnrollment` line 243, `confirmEnrollment` line 289: first statement)
- Test: `src/auth/mfa/mfa-challenge.service.spec.ts`, `src/auth/mfa/mfa.service.spec.ts`

**Interfaces:**
- Consumes: `TenantContext.{current,adopt,requireTenantId}`, `TenantScopeError`, `isTenancyEnforced()`.
- Produces: under `enforced` a challenge token is `<tenantId>.<challengeId>.<secret>` (117 characters, within `TOKEN_MAX_LENGTH` 128). Legacy keeps `<challengeId>.<secret>`. `challengeTenantOf(token): string | null`. `MfaChallengeService.enterTenantOf(token): void` adopts the token's tenant before the first read, and answers `401 mfa_token_invalid` for a token without a tenant under `enforced`, or for one whose tenant conflicts with the request's.

Why the token carries the tenant (rather than a `SECURITY DEFINER` lookup of the challenge): the verify call is pre-authentication and has no scope, while `auth_challenges` and `users` are behind RLS. A forged tenant prefix with a real challenge id finds no row under that tenant's RLS, so it gets the same `mfa_token_invalid` as any wrong token: no oracle, and no new door around RLS.

- [ ] **Step 1: Write the failing tests**

In `src/auth/mfa/mfa-challenge.service.spec.ts`, add (reusing the file's service and data-source mocks; `TID = 'a1000000-0000-4000-8000-000000000001'`):

```ts
describe('the tenant of a challenge', () => {
  const previousMode = process.env.TENANCY_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
  });

  it('prefixes the token with the tenant of the sign-in under enforced mode', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const { token } = await TenantContext.runAs({ tenantId: TID }, () =>
      service.issue(USER_ID, 'verify'),
    );
    const [tenant, id, secret] = token.split('.');
    expect(tenant).toBe(TID);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(secret).toHaveLength(43);
    expect(challengeTenantOf(token)).toBe(TID);
  });

  it('keeps the legacy token, which names no tenant', async () => {
    delete process.env.TENANCY_MODE;
    const { token } = await service.issue(USER_ID, 'verify');
    expect(token.split('.')).toHaveLength(2);
    expect(challengeTenantOf(token)).toBeNull();
  });

  it('enters the tenant of the token before anything is read', () => {
    process.env.TENANCY_MODE = 'enforced';
    TenantContext.start(() => {
      service.enterTenantOf(`${TID}.${CHALLENGE_ID}.${'s'.repeat(43)}`);
      expect(TenantContext.current()).toEqual({ tenantId: TID });
    });
  });

  it.each([
    ['a token without a tenant', `${CHALLENGE_ID}.${'s'.repeat(43)}`],
    ['a malformed token', 'nonsense'],
  ])('answers %s like any invalid token under enforced mode', (_label, token) => {
    process.env.TENANCY_MODE = 'enforced';
    TenantContext.start(() => {
      expect(thrownBy(() => service.enterTenantOf(token))).toMatchObject({
        message: 'mfa_token_invalid',
      });
    });
  });

  it('answers a token of another tenant than the session like any invalid token', () => {
    process.env.TENANCY_MODE = 'enforced';
    TenantContext.start(() => {
      TenantContext.adopt({ tenantId: OTHER_TID });
      expect(
        thrownBy(() => service.enterTenantOf(`${TID}.${CHALLENGE_ID}.${'s'.repeat(43)}`)),
      ).toMatchObject({ message: 'mfa_token_invalid' });
    });
  });

  it('enters nothing in legacy mode', () => {
    delete process.env.TENANCY_MODE;
    TenantContext.start(() => {
      service.enterTenantOf(`${CHALLENGE_ID}.${'s'.repeat(43)}`);
      expect(TenantContext.current()).toBeUndefined();
    });
  });

  it('loads a challenge from a token with or without the tenant prefix', async () => {
    // The row lookup is by challenge id: the prefix only chose the tenant
    mockQuery.mockResolvedValue([challengeRow]);
    await expect(service.load(mockManager, `${TID}.${CHALLENGE_ID}.${SECRET}`, 'verify')).resolves.toMatchObject({ id: CHALLENGE_ID });
    await expect(service.load(mockManager, `${CHALLENGE_ID}.${SECRET}`, 'verify')).resolves.toMatchObject({ id: CHALLENGE_ID });
  });
});
```

`USER_ID`, `CHALLENGE_ID`, `SECRET`, `challengeRow`, `mockQuery` and `mockManager` stand for the names the existing spec already uses for its issue and load tests (the test at line 67 splits `[id, secret]`). Use those names, and define `OTHER_TID = 'b2000000-0000-4000-8000-000000000002'` beside `TID`.

In `src/auth/mfa/mfa.service.spec.ts`, add one test per entry point (`verify`, `startEnrollment`, `confirmEnrollment`) asserting that `challenges.enterTenantOf` is called with the token before `dataSource.transaction`:

```ts
  it.each([
    ['verify', (s: MfaService) => s.verify({ mfaToken: TOKEN, method: 'totp', code: '123456' })],
    ['startEnrollment', (s: MfaService) => s.startEnrollment(TOKEN)],
    ['confirmEnrollment', (s: MfaService) => s.confirmEnrollment({ mfaToken: TOKEN, code: '123456' }, {})],
  ])('%s enters the tenant of the token before it opens its transaction', async (_name, call) => {
    mockChallenges.enterTenantOf.mockImplementation(() => {
      throw new UnauthorizedException('mfa_token_invalid');
    });
    await expect(call(service)).rejects.toThrow(new UnauthorizedException('mfa_token_invalid'));
    expect(mockChallenges.enterTenantOf).toHaveBeenCalledWith(TOKEN);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });
```

(`mockChallenges`, `mockDataSource` and `TOKEN` are the spec's existing mocks. Add `enterTenantOf: jest.fn()` to `mockChallenges`.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/auth/mfa`
Expected: FAIL: `challengeTenantOf` and `enterTenantOf` are not defined, and the enforced token has 2 parts.

- [ ] **Step 3: Implement**

`src/auth/mfa/mfa-challenge.service.ts`:
- Imports: `import { TenantContext, TenantScopeError } from '../../database/tenancy/tenant-context';` and `import { isTenancyEnforced } from '../../database/tenancy/tenancy-mode';`.
- Replace `TOKEN_PATTERN` and add the parser:

```ts
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// "<tenant>.<id>.<secret>" under enforced mode (the verify call has no scope yet, and the
// challenge row is behind RLS), "<id>.<secret>" in legacy mode
const TOKEN_PATTERN = new RegExp(`^(?:(${UUID})\\.)?(${UUID})\\.([A-Za-z0-9_-]{43})$`, 'i');

/** The tenant a challenge token names, or null when it names none. */
export function challengeTenantOf(token: string): string | null {
  return TOKEN_PATTERN.exec(token ?? '')?.[1]?.toLowerCase() ?? null;
}
```

- In `issue`, build the token as:

```ts
    const tenant = isTenancyEnforced() ? TenantContext.requireTenantId() : null;
    return {
      token: tenant ? `${tenant}.${row.id}.${secret}` : `${row.id}.${secret}`,
      expiresAt,
    };
```

- In `load`, take `const [, , id, secret] = match;` (the tenant group is ignored there: the scope was entered before).
- Add the method:

```ts
  /**
   * Enters the tenant a sign-in challenge was issued in, before anything reads it (enforced
   * mode). A token without a tenant, or naming another tenant than the one the request
   * already runs under, gets the answer of any invalid token.
   */
  enterTenantOf(token: string): void {
    if (!isTenancyEnforced()) return;
    const tenantId = challengeTenantOf(token);
    if (tenantId === null) throw invalidToken();
    try {
      TenantContext.adopt({ tenantId });
    } catch (error) {
      if (error instanceof TenantScopeError) throw invalidToken();
      throw error;
    }
  }
```

`src/auth/mfa/mfa.service.ts`: make the first statement of `verify` `this.challenges.enterTenantOf(input.mfaToken);`, of `startEnrollment` `this.challenges.enterTenantOf(mfaToken);`, and of `confirmEnrollment` `this.challenges.enterTenantOf(input.mfaToken);`.

- [ ] **Step 4: Run the unit tests, then the MFA e2e tests in both modes**

Run: `npx jest src/auth`
Expected: PASS.

Run: `node scripts/run-e2e.mjs --mode=both api-contract` and read the `multi-factor authentication` block in the output (also `test-results/enforced--api-contract.e2e-spec.ts.log` if it failed).
Expected: every `multi-factor authentication` test PASSES in both modes. Other api-contract failures in enforced mode belong to Task 18. Record them; do not fix them here.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/auth/mfa
git add src/auth/mfa/mfa-challenge.service.ts src/auth/mfa/mfa-challenge.service.spec.ts \
  src/auth/mfa/mfa.service.ts src/auth/mfa/mfa.service.spec.ts
git commit -m "feat(auth): MFA challenges carry the tenant of the sign-in under enforced mode

The pre-authentication verify and enrolment calls enter the tenant named by the token before
they read the challenge behind RLS; a token without a tenant or of another tenant is an
invalid token. Legacy tokens are unchanged. Moved from M1b: the MFA sign-in tests of
api-contract must pass under enforced mode for the M1a gate.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: `TenantScopeError` becomes a clean HTTP error

**Files:**
- Modify: `src/database/tenancy/tenant-context.ts` (export `TENANT_SCOPE_ERROR_CODES`, derive `ScopeErrorCode` from it)
- Modify: `src/common/filters/http-exception.filter.ts:47-89`
- Test: `src/common/filters/http-exception.filter.spec.ts`

**Interfaces:**
- Produces: `TENANT_SCOPE_ERROR_CODES = ['no_scope_store', 'scope_already_set', 'no_tenant_scope', 'invalid_tenant_id', 'tenant_scope_mismatch'] as const`. Any non-HTTP exception whose `code` is one of them (`TenantScopeError` itself, or TypeORM's `QueryFailedError`, which copies the code) is answered `500 { code: 'E005', message: 'tenant_scope_error', details: { reason: <code> } }` and logged as an error that names the route and the reason. Every other unexpected error is unchanged (`Internal server error`, no details).

Why 500 and not 4xx: each of these codes means the server ran tenant data access outside, or across, the scope of the request. That is a programming error, never the client's fault. A 401 would make the clients sign the user out.

- [ ] **Step 1: Write the failing tests**

Append to `src/common/filters/http-exception.filter.spec.ts` (reuse its host and response mocks):

```ts
  describe('tenant scope errors', () => {
    it.each([
      ['a TenantScopeError', new TenantScopeError('tenant_scope_mismatch', 'mismatch')],
      ['a query error carrying its code', Object.assign(new Error('query failed'), { code: 'no_tenant_scope' })],
    ])('answers %s as a server error with a stable reason', (_label, exception) => {
      filter.catch(exception, host);

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'E005',
          message: 'tenant_scope_error',
          details: { reason: (exception as { code: string }).code },
        }),
      );
    });

    it('leaves another database error as an unexplained server error', () => {
      filter.catch(Object.assign(new Error('duplicate'), { code: '23505' }), host);

      const body = jest.mocked(response.json).mock.calls[0][0] as Record<string, unknown>;
      expect(body).toMatchObject({ message: 'Internal server error' });
      expect(body.details).toBeUndefined();
    });
  });
```

(`filter`, `host` and `response` are the spec's existing fixtures. Import `TenantScopeError` from `../../database/tenancy/tenant-context`.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/common/filters`
Expected: FAIL: the message is `Internal server error` and there are no details.

- [ ] **Step 3: Implement**

`src/database/tenancy/tenant-context.ts`: replace the `ScopeErrorCode` union with

```ts
export const TENANT_SCOPE_ERROR_CODES = [
  'no_scope_store',
  'scope_already_set',
  'no_tenant_scope',
  'invalid_tenant_id',
  'tenant_scope_mismatch',
] as const;

type ScopeErrorCode = (typeof TENANT_SCOPE_ERROR_CODES)[number];
```

`src/common/filters/http-exception.filter.ts`: import `TENANT_SCOPE_ERROR_CODES` and add, before the class:

```ts
// A tenant scope failure (TenantScopeError, or the QueryFailedError TypeORM wraps it in, which
// copies its code) means the server ran tenant data access outside or across the request's
// scope: a programming error, never the client's. A stable reason, nothing more.
function tenantScopeReason(exception: unknown): string | undefined {
  const code = (exception as { code?: unknown } | null)?.code;
  return typeof code === 'string' &&
    (TENANT_SCOPE_ERROR_CODES as readonly string[]).includes(code)
    ? code
    : undefined;
}
```

In `catch`, replace the computation of `message`/`details` and the error log with:

```ts
    const scopeReason = isHttp ? undefined : tenantScopeReason(exception);
    const details = isHttp
      ? detailsOf(exception)
      : scopeReason
        ? { reason: scopeReason }
        : undefined;

    // Application errors carry a code (e.g. "leave_request_not_pending"); unexpected
    // errors never reveal their details
    const message = !isHttp
      ? scopeReason
        ? 'tenant_scope_error'
        : 'Internal server error'
      : errors
        ? 'validation_failed'
        : exception.message;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}${scopeReason ? ` (tenant scope: ${scopeReason})` : ''}`,
        (exception as Error).stack,
      );
    }
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/common/filters src/database/tenancy`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/common/filters src/database/tenancy/tenant-context.ts
git add src/common/filters/http-exception.filter.ts src/common/filters/http-exception.filter.spec.ts \
  src/database/tenancy/tenant-context.ts
git commit -m "feat(tenancy): answer tenant scope errors as 500 tenant_scope_error with a stable reason

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Mode-aware `TenantJobRunner`; jobs per tenant with attributed failures

**Files:**
- Modify: `src/database/tenancy/tenant-job-runner.ts` (+ `run`), `tenant-job-runner.spec.ts`
- Modify: `src/files/files.service.ts:482-507` (`purgeAbandonedUploadsOnSchedule`; delete `purgeEveryTenant`), `files.service.spec.ts`
- Modify: `src/scheduler/compliance-alerts.service.ts:20-24, 101-104`, `compliance-alerts.service.spec.ts`
- Modify: `src/scheduler/gps-retention.service.ts` (whole method), `gps-retention.service.spec.ts`
- Modify: `test/tenancy-slice.e2e-spec.ts` (one test; the compliance fixture of B)

**Interfaces:**
- Produces: `TenantJobOutcome = { tenantId: string | null; ok: true } | { tenantId: string | null; ok: false; error: string }` and `TenantJobRunner.run(job: (tenantId: string | null) => Promise<void>): Promise<TenantJobOutcome[]>`. In legacy mode it runs the job once, unscoped, with `null`. In enforced mode it runs `forEachTenant(job)`. Callers no longer branch on the mode.

- [ ] **Step 1: Write the failing tests**

`src/database/tenancy/tenant-job-runner.spec.ts`, add:

```ts
describe('TenantJobRunner.run', () => {
  const previousMode = process.env.TENANCY_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
  });

  it('runs the job once, unscoped, in legacy mode, without listing tenants', async () => {
    delete process.env.TENANCY_MODE;
    const query = jest.fn();
    const runner = new TenantJobRunner({ query } as never);
    const seen: (string | null | undefined)[] = [];

    const outcomes = await runner.run((tenantId) => {
      seen.push(tenantId, TenantContext.current()?.tenantId);
      return Promise.resolve();
    });

    expect(seen).toEqual([null, undefined]);
    expect(query).not.toHaveBeenCalled();
    expect(outcomes).toEqual([{ tenantId: null, ok: true }]);
  });

  it('reports a legacy failure as the outcome of the one run', async () => {
    delete process.env.TENANCY_MODE;
    const runner = new TenantJobRunner({ query: jest.fn() } as never);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      await expect(runner.run(() => Promise.reject(new Error('boom')))).resolves.toEqual([
        { tenantId: null, ok: false, error: 'boom' },
      ]);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('boom'), expect.anything());
    } finally {
      error.mockRestore();
    }
  });

  it('runs the job once per tenant, each under its scope, in enforced mode', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const query = jest.fn().mockResolvedValue([{ id: A }, { id: B }]);
    const runner = new TenantJobRunner({ query } as never);
    const seen: (string | undefined)[] = [];

    const outcomes = await runner.run((tenantId) => {
      seen.push(`${tenantId}:${TenantContext.current()?.tenantId}`);
      return Promise.resolve();
    });

    expect(seen).toEqual([`${A}:${A}`, `${B}:${B}`]);
    expect(outcomes).toEqual([
      { tenantId: A, ok: true },
      { tenantId: B, ok: true },
    ]);
  });
});
```

(`A`, `B` are the spec's tenant ids; import `Logger` from `@nestjs/common`.)

`src/scheduler/compliance-alerts.service.spec.ts`: change the jobs mock to `const mockJobs = { run: jest.fn((job: (t: string | null) => Promise<void>) => job(null).then(() => [])) };`, and add:

```ts
  describe('scheduling', () => {
    useUtcServerClock(new Date('2026-12-20T03:00:00Z'));

    it('runs the check through the job runner, which decides the tenants', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await service.checkComplianceAlerts();

      expect(mockJobs.run).toHaveBeenCalledTimes(1);
      // The closure ran the check: it read the at-risk members
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM militia_profiles mp'),
        [2026],
      );
    });

    it('lets a failed check fail its tenant, logged with the tenant, instead of swallowing it', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      try {
        mockDataSource.query.mockRejectedValueOnce(new Error('db down'));
        await expect(
          TenantContext.runAs({ tenantId: TID }, () => service.runCheck()),
        ).rejects.toThrow('db down');
        expect(error).toHaveBeenCalledWith(
          expect.stringContaining(`tenant ${TID}`),
          expect.anything(),
        );
      } finally {
        error.mockRestore();
      }
    });
  });
```

(`TID = 'a1000000-0000-4000-8000-000000000001'`. Import `Logger`, `TenantContext`. `useUtcServerClock` pins the date, which replaces the date dependence of the old enforced test noted in triage T9. Update the existing tests that referenced `mockJobs.forEachTenant` to `mockJobs.run`.)

`src/scheduler/gps-retention.service.spec.ts`: provide `{ provide: TenantJobRunner, useValue: mockJobs }` with `mockJobs = { run: jest.fn() }`. By default it runs the job once with `null`, as in legacy mode. Keep the existing cutoff tests, and add:

```ts
  it('purges each tenant through the job runner and logs the count of each', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    mockJobs.run.mockImplementation(async (job: (t: string | null) => Promise<void>) => {
      await job('a1000000-0000-4000-8000-000000000001');
      await job('b2000000-0000-4000-8000-000000000002');
      return [];
    });

    await service.purgeOldGpsPoints();

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('a1000000-0000-4000-8000-000000000001: deleted 5'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('b2000000-0000-4000-8000-000000000002: deleted 5'),
    );
  });
```

`src/files/files.service.spec.ts`: in the scheduled-purge tests, replace the `isTenancyEnforced` branching expectations with a `tenantJobs.run` mock. Add a test that a failed tenant outcome (`[{ tenantId: 'b2…', ok: false, error: 'x' }]`) appears in the log line beside the purged count.

`test/tenancy-slice.e2e-spec.ts`:
- In the scheduled-jobs block, add:

```ts
    it('purges the old GPS points of every tenant under that tenant', async () => {
      const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
      await db.admin((c) =>
        c.query(
          `INSERT INTO gps_points (tenant_id, militia_id, lat, lng, captured_at)
           VALUES ($1, $2, 10.7, 106.6, $5), ($1, $2, 10.7, 106.6, now()),
                  ($3, $4, 10.7, 106.6, $5), ($3, $4, 10.7, 106.6, now())`,
          [a.id, a.memberId, b.id, b.memberId, old],
        ),
      );

      await app.get(GpsRetentionService).purgeOldGpsPoints();

      const left = await db.admin(
        async (c) =>
          (
            await c.query<{ tenant: string; recent: boolean }>(
              `SELECT tenant_id::text AS tenant, captured_at > now() - interval '1 day' AS recent
                 FROM gps_points WHERE tenant_id IN ($1, $2) ORDER BY 1`,
              [a.id, b.id],
            )
          ).rows,
      );
      expect(left).toEqual(
        [
          { tenant: a.id, recent: true },
          { tenant: b.id, recent: true },
        ].sort((x, y) => (x.tenant < y.tenant ? -1 : 1)),
      );
    });
```

- In the compliance e2e (triage T9: both tenants' payloads were identical), give tenant B a second at-risk member before the check. Insert one more active `militia_profiles` row for B with the admin connection, beside the existing B fixtures of that block. Then assert the exact `atRiskCount` each tenant's socket receives: A's count and B's count differ by one. Keep the existing "only that tenant" assertions.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/database/tenancy/tenant-job-runner.spec.ts src/scheduler src/files/files.service.spec.ts`
Expected: FAIL: `run` is not a function, `runCheck` swallows the error, and GPS retention issues one query.

- [ ] **Step 3: Implement**

`src/database/tenancy/tenant-job-runner.ts`: change the outcome type and add `run` (import `isTenancyEnforced`):

```ts
export type TenantJobOutcome =
  | { tenantId: string | null; ok: true }
  | { tenantId: string | null; ok: false; error: string };
```

```ts
  /**
   * The way a scheduled job runs: in legacy mode once, unscoped (tenantId null; the single
   * tenant of the database), in enforced mode once per tenant under its scope. Callers do not
   * branch on the mode; a failure is logged and returned, never thrown.
   */
  async run(
    job: (tenantId: string | null) => Promise<void>,
  ): Promise<TenantJobOutcome[]> {
    if (isTenancyEnforced()) return this.forEachTenant(job);
    try {
      await job(null);
      return [{ tenantId: null, ok: true }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Job failed (legacy mode): ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [{ tenantId: null, ok: false, error: message }];
    }
  }
```

`src/scheduler/compliance-alerts.service.ts`:
- `checkComplianceAlerts` becomes `await this.tenantJobs.run(() => this.runCheck());`. Drop the `isTenancyEnforced` import.
- In `runCheck`, compute `const tenant = TenantContext.current()?.tenantId ?? 'legacy';`. Log `Running compliance alerts check for tenant ${tenant}...`, and replace the final `catch` with:

```ts
    } catch (err) {
      this.logger.error(
        `Compliance alerts check failed for tenant ${tenant}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
```

`src/scheduler/gps-retention.service.ts`, the whole service:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantJobRunner } from '../database/tenancy/tenant-job-runner';

@Injectable()
export class GpsRetentionService {
  private readonly logger = new Logger(GpsRetentionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantJobs: TenantJobRunner,
  ) {}

  // gps_points is a tenant table: each tenant's points are purged under its scope (a
  // failing tenant is logged by the runner and does not stop the others)
  @Cron('0 2 * * *') // every day at 02:00
  async purgeOldGpsPoints(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    await this.tenantJobs.run(async (tenantId) => {
      // The Postgres driver answers a DELETE without RETURNING with [rows, rowCount]
      const [, deleted] = await this.dataSource.query<[unknown[], number | null]>(
        `DELETE FROM gps_points WHERE captured_at < $1::timestamptz`,
        [cutoff.toISOString()],
      );
      this.logger.log(
        `GPS retention, tenant ${tenantId ?? 'legacy'}: deleted ${deleted ?? 0} rows older than 90 days`,
      );
    });
  }
}
```

`src/files/files.service.ts:482-507`: replace `purgeAbandonedUploadsOnSchedule` and delete `purgeEveryTenant`:

```ts
  @Cron(CronExpression.EVERY_HOUR)
  async purgeAbandonedUploadsOnSchedule(): Promise<void> {
    let purged = 0;
    // Per tenant under enforced mode: RLS limits the rows and contentPath names the
    // tenant's directory; once in legacy mode
    const outcomes = await this.tenantJobs.run(async () => {
      purged += await this.purgeAbandonedUploads();
    });
    const failed = outcomes.filter((outcome) => !outcome.ok);
    if (purged > 0 || failed.length > 0) {
      this.logger.log(
        `Purged ${purged} abandoned uploads${failed.length > 0 ? `; not purged for ${failed.map((f) => f.tenantId ?? 'legacy').join(', ')} (see the errors above)` : ''}`,
      );
    }
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/database/tenancy src/scheduler src/files`
Expected: PASS.

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice.e2e-spec.ts` and `node scripts/run-e2e.mjs --mode=legacy client-gaps-t20`
Expected: PASS. The purge e2e of client-gaps-t20 calls `purgeAbandonedUploads()` directly, so it is unchanged.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/database/tenancy src/scheduler src/files test/tenancy-slice.e2e-spec.ts
git add src/database/tenancy/tenant-job-runner.ts src/database/tenancy/tenant-job-runner.spec.ts \
  src/scheduler/compliance-alerts.service.ts src/scheduler/compliance-alerts.service.spec.ts \
  src/scheduler/gps-retention.service.ts src/scheduler/gps-retention.service.spec.ts \
  src/files/files.service.ts src/files/files.service.spec.ts test/tenancy-slice.e2e-spec.ts
git commit -m "feat(tenancy): scheduled jobs run through a mode-aware TenantJobRunner.run

Legacy runs a job once, enforced once per tenant under its scope; callers no longer branch.
GPS retention purges per tenant now that gps_points is a tenant table, the compliance check
fails its tenant (logged with the tenant) instead of swallowing errors, and the upload purge
reports the tenants it could not purge.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The revocation announcement names the tenant; socket hardening; no server-wide emit

**Files:**
- Modify: `src/auth/auth-revocation-feed.ts` (`AuthRevocation`, `parseAuthRevocation`), `auth-revocation-feed.spec.ts`
- Modify: `src/notifications/recent-revocations.ts` (`revocationEnds`), `recent-revocations.spec.ts`
- Modify: `src/notifications/notifications.gateway.ts` (`closeRevoked` 281-295, `handleConnection` 225, emitters 326-360), `notifications.gateway.spec.ts`
- Modify: `src/notifications/ws-tenant-scope.interceptor.ts:15-23`, `ws-tenant-scope.interceptor.spec.ts`
- Modify: `src/gps/gps.service.ts:115-131`, `gps.service.spec.ts`
- Modify: `eslint.config.mjs`
- Modify: `test/tenancy-slice.e2e-spec.ts` (one socket test)

**Interfaces:**
- Consumes: the `tenantId` that 039 adds to the `mms_auth_revocation` payloads.
- Produces: `AuthRevocation` variants with `tenantId?: string` (lower case). `parseAuthRevocation` rejects a malformed `tenantId`. `revocationEnds(event, claims)` ignores an event of another tenant. `closeRevoked` looks only at the sockets of `rooms.user(<tenant>, <user>)`; without a tenant (a trigger older than 039) it falls back to every local socket. `NotificationsGateway.emitToGpsAudience(unitCode, caOfficerIds, data)`. A lint rule bans `server.emit(`.

- [ ] **Step 1: Write the failing tests**

`src/auth/auth-revocation-feed.spec.ts`, add to the parser tests:

```ts
  it('carries the tenant an announcement names, lower-cased', () => {
    expect(
      parseAuthRevocation(
        JSON.stringify({ kind: 'session', userId: U, sessionId: S, tenantId: T.toUpperCase() }),
      ),
    ).toEqual({ kind: 'session', userId: U, sessionId: S, tenantId: T });
  });

  it('refuses an announcement whose tenant is not a uuid', () => {
    expect(
      parseAuthRevocation(JSON.stringify({ kind: 'session', userId: U, sessionId: S, tenantId: 'x' })),
    ).toBeNull();
  });

  it('still reads an announcement that names no tenant (a trigger older than 039)', () => {
    expect(parseAuthRevocation(JSON.stringify({ kind: 'session', userId: U, sessionId: S }))).toEqual({
      kind: 'session',
      userId: U,
      sessionId: S,
    });
  });
```

(`U`, `S`: the spec's user and session ids; `T = 'a1000000-0000-4000-8000-000000000001'`.)

`src/notifications/recent-revocations.spec.ts`, add:

```ts
  it('does not end a session of another tenant than the announcement names', () => {
    const event = { kind: 'account' as const, userId: SUB, version: 9, active: false, tenantId: T1 };
    expect(revocationEnds(event, { sub: SUB, ver: 1, tid: T2 })).toBe(false);
    expect(revocationEnds(event, { sub: SUB, ver: 1, tid: T1 })).toBe(true);
    expect(revocationEnds(event, { sub: SUB, ver: 1 })).toBe(true);
  });
```

`src/notifications/notifications.gateway.spec.ts`, in the `revocation` describe, give the server mock a room view and add:

```ts
      it('looks only at the user room of the tenant the announcement names', async () => {
        const inRoom = live();
        const elsewhere = live({ sid: OTHER_SID });
        const roomOf = jest.fn(() => ({ fetchSockets: () => Promise.resolve([inRoom]) }));
        gateway.server = {
          to,
          local: { fetchSockets: () => Promise.resolve([inRoom, elsewhere]), in: roomOf },
        } as unknown as Server;

        subscriber.revoked({ kind: 'account', userId: SUB, version: 99, active: false, tenantId: TID });
        await flush();

        expect(roomOf).toHaveBeenCalledWith(rooms.user(roomTenant, SUB));
        toldBeforeDisconnect(inRoom, 'session_revoked');
        notTold(elsewhere);
      });
```

`roomTenant` is `TID` in enforced mode and `undefined` in legacy mode. Run the test under the describe's existing mode, and add one more test under the other mode, using the spec's mode switch. `SUB`, `OTHER_SID`, `live`, `to`, `flush`, `notTold` and `toldBeforeDisconnect` are the existing helpers. Keep the existing test `closes only the sockets of the session that ended, among all the sockets of the replica` (no `tenantId`, so the fallback path). Rename its comment to say it covers announcements without a tenant.

Also add, in the connection describe:

```ts
    it('disconnects a socket whose token names no valid tenant under enforced mode', () => {
      process.env.TENANCY_MODE = 'enforced';
      const client = live({ tid: 'not-a-uuid' });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('emits nothing, and says so, before the server exists', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      try {
        gateway.server = undefined as unknown as Server;
        expect(() => gateway.emitToTenant('x', {})).not.toThrow();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('before the socket server'));
      } finally {
        warn.mockRestore();
      }
    });
```

`src/notifications/ws-tenant-scope.interceptor.spec.ts`, add the case from triage T8: a handler whose work starts only when the Observable is subscribed, and is subscribed **outside** the `intercept` call:

```ts
  it('runs a handler that starts on subscription under the socket tenant, wherever it is subscribed', async () => {
    process.env.TENANCY_MODE = 'enforced';
    const next = {
      handle: () => defer(() => of(TenantContext.current()?.tenantId)),
    };
    const result = interceptor.intercept(contextFor({ tid: TID }), next);

    // Subscribed later, from code that runs under no scope
    await expect(lastValueFrom(result)).resolves.toBe(TID);
  });
```

(`defer`, `of`, `lastValueFrom` come from `rxjs`; `contextFor` is the spec's helper.)

`src/gps/gps.service.spec.ts`: change the push expectation from `gateway.emitToRooms([...])` to `gateway.emitToGpsAudience(row.unitCode, caOfficerIds, row)`. Give the mock gateway `emitToGpsAudience: jest.fn()`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/auth/auth-revocation-feed.spec.ts src/notifications src/gps`
Expected: FAIL: the parser drops `tenantId`, `revocationEnds` ignores the tenant, there is no `local.in`, no non-UUID disconnect, no server guard, the deferred handler sees no scope, and `emitToGpsAudience` does not exist.

- [ ] **Step 3: Implement**

`src/auth/auth-revocation-feed.ts`:

```ts
export type AuthRevocation =
  | { kind: 'session'; userId: string; sessionId: string; tenantId?: string }
  | {
      kind: 'account';
      userId: string;
      version: number;
      active: boolean;
      tenantId?: string;
    };
```

In `parseAuthRevocation`, read `tenantId` beside the other fields:

```ts
  const { kind, userId, sessionId, version, active, tenantId } = value as Record<string, unknown>;
  if (typeof userId !== 'string' || !isUUID(userId)) return null;
  // Named since migration 039; absent from an older trigger
  if (tenantId !== undefined && (typeof tenantId !== 'string' || !isUUID(tenantId))) return null;
  const tenant = typeof tenantId === 'string' ? { tenantId: tenantId.toLowerCase() } : {};
```

and spread `...tenant` into both returned objects.

`src/notifications/recent-revocations.ts`, `revocationEnds`: take `claims: AccessClaims & { tid?: string }`, and add as its first check after the `sub` comparison:

```ts
  // A user id belongs to one tenant; a claim naming another tenant is not this session
  if (
    event.tenantId !== undefined &&
    claims.tid !== undefined &&
    claims.tid.toLowerCase() !== event.tenantId
  ) {
    return false;
  }
```

`src/notifications/notifications.gateway.ts`:
- `closeRevoked` (replacing lines 281-295):

```ts
  // The sockets of this replica whose session the announced change ended. The announcement
  // names the tenant (migration 039), so only that user's room of that tenant is looked at;
  // one without a tenant (a trigger older than 039) is matched against every local socket.
  private async closeRevoked(event: AuthRevocation): Promise<void> {
    this.recentRevocations.record(event);
    const candidates =
      event.tenantId === undefined
        ? await this.server.local.fetchSockets()
        : await this.server.local
            .in(rooms.user(roomTenantOf({ tid: event.tenantId }), event.userId))
            .fetchSockets();
    for (const client of candidates) {
      const user = userOf(client);
      if (user && revocationEnds(event, user)) {
        this.endSession(client, 'session_revoked');
      }
    }
  }
```

- `handleConnection`, after the `if (!user)` block:

```ts
    // The handshake refuses such a token already; a socket must never sit in the shared
    // t:none (or t:legacy) namespace by way of a token naming no valid tenant
    if (isTenancyEnforced() && !isUUID(user.tid)) {
      client.disconnect(true);
      return;
    }
```

- Add a guarded broadcast helper, and route every emitter through it (`emitToRooms`, `emitToUnit`, `emitToUser`, `emitToTenant`, `emitToConversationOf`, the GPS method below):

```ts
  // Jobs and requests can emit before the gateway is initialised (tests, start-up): nothing
  // is delivered then, and the log says so instead of an error on undefined
  private broadcast(targets: string | string[], event: string, data: unknown): void {
    if (!this.server) {
      this.logger.warn(`Event ${event} emitted before the socket server started; not delivered`);
      return;
    }
    if (Array.isArray(targets) && targets.length === 0) return;
    this.server.to(targets).emit(event, data);
  }

  // gps:update reaches ward-wide staff, staff of the member's unit and the CA officers the
  // member is assigned to, in the tenant that emits it (never the unit room, which the
  // member's teammates share)
  emitToGpsAudience(unitCode: string, caOfficerIds: string[], data: unknown): void {
    const tid = this.currentTid();
    this.broadcast(
      [gpsWardRoom(tid), gpsUnitRoom(tid, unitCode), ...caOfficerIds.map((id) => rooms.user(tid, id))],
      GPS_UPDATE_EVENT,
      data,
    );
  }
```

(import `GPS_UPDATE_EVENT`, `gpsUnitRoom`, `gpsWardRoom` from `../gps/gps-rooms`).

`src/gps/gps.service.ts:121-130`: replace the `tid` lookup and the `emitToRooms` call with `this.gateway.emitToGpsAudience(row.unitCode, caOfficers, row);`. Drop the now unused imports (`TenantContext`, `rooms`, `gpsWardRoom`, `gpsUnitRoom`, `GPS_UPDATE_EVENT` if unused).

`src/notifications/ws-tenant-scope.interceptor.ts:15-23`:

```ts
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isTenancyEnforced()) return next.handle();
    const client = context.switchToWs().getClient<Socket>();
    const tenantId =
      (client.data as { user?: { tid?: string } }).user?.tid ?? '';
    // The handler's work may start only when the Observable is subscribed, which Nest may do
    // outside this call: subscribe inside the scope. runAs validates the id, so a socket
    // without a tenant never reaches the handler.
    return new Observable((subscriber) =>
      TenantContext.runAs({ tenantId }, () => next.handle().subscribe(subscriber)),
    );
  }
```

`eslint.config.mjs`, add a block after the rules block:

```js
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='emit'][callee.object.type='MemberExpression'][callee.object.property.name='server']",
          message:
            'A server-wide emit reaches every tenant: emit to a tenant room (NotificationsGateway.emitToTenant / emitToRooms).',
        },
        {
          selector:
            "CallExpression[callee.property.name='emit'][callee.object.type='Identifier'][callee.object.name='server']",
          message:
            'A server-wide emit reaches every tenant: emit to a tenant room (NotificationsGateway.emitToTenant / emitToRooms).',
        },
      ],
    },
  },
```

`test/tenancy-slice.e2e-spec.ts`, in the sockets block:

```ts
    it("closes the socket of a revoked session in its own tenant, and leaves the other tenant's alone", async () => {
      const signedA = await signIn('phu-dinh', a.adminUsername);
      const signedB = await signIn('tenant-b', b.adminUsername);
      const socketA = await connected(signedA.tokens.accessToken);
      const socketB = await connected(signedB.tokens.accessToken);
      const told = new Promise((resolve) => socketA.once('session_expired', resolve));

      await api().post(url('/auth/logout')).set({ Authorization: `Bearer ${signedA.tokens.accessToken}` })
        .send({ refreshToken: signedA.tokens.refreshToken }).expect(204);

      await expect(told).resolves.toEqual({ reason: 'session_revoked' });
      expect(socketB.connected).toBe(true);
      socketB.disconnect();
    });
```

(`connected(token)` is the slice's existing helper that opens a socket and waits for `connect`. If it has another name, use it. Use the status the slice already expects from `/auth/logout`.)

- [ ] **Step 4: Run the tests**

Run: `npx jest src/auth src/notifications src/gps`
Expected: PASS.

Run: `npx eslint "src/**/*.ts"`
Expected: 0 errors, 0 warnings (nothing in `src` calls `server.emit(`). To see the rule work, add `this.server.emit('x', {});` to any gateway method temporarily, run eslint on that file, and confirm the restricted-syntax error. Then revert the line.

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-slice.e2e-spec.ts` and `node scripts/run-e2e.mjs --mode=both realtime-session`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/auth src/notifications src/gps eslint.config.mjs test/tenancy-slice.e2e-spec.ts
git add src/auth/auth-revocation-feed.ts src/auth/auth-revocation-feed.spec.ts \
  src/notifications/recent-revocations.ts src/notifications/recent-revocations.spec.ts \
  src/notifications/notifications.gateway.ts src/notifications/notifications.gateway.spec.ts \
  src/notifications/ws-tenant-scope.interceptor.ts src/notifications/ws-tenant-scope.interceptor.spec.ts \
  src/gps/gps.service.ts src/gps/gps.service.spec.ts eslint.config.mjs test/tenancy-slice.e2e-spec.ts
git commit -m "feat(tenancy): revocations close sockets in the announced tenant's room; socket hardening

The revocation feed reads the tenant migration 039 adds to the announcement and closes the
user's sockets in that tenant's room (every local socket only for an announcement without
one). A socket whose token names no valid tenant is disconnected under enforced mode, the
interceptor subscribes the handler inside the scope, GPS pushes go through the gateway's
tenant, emitting before the server exists is logged, and lint bans server.emit(.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
## Phase E — every pre-existing suite in enforced mode (the heart of M1a)

The procedure for each suite, in Tasks 18, 19 and 20:

1. Run the suite in enforced mode: `node scripts/run-e2e.mjs --mode=enforced <suite>`. Read `test-results/enforced--<suite>.e2e-spec.ts.log` for each failing test.
2. Classify every failing test with this table. Decide **before** you change anything.

   | Kind | Recognise it by | Allowed action |
   |---|---|---|
   | **A. Product defect** | A query or code path that runs with no tenant scope (sees nothing, `42501` on insert, `tenant_scope_error`); reaches across tenants; relies on a global unique key; runs in a callback outside the request's scope (pg events, timers, `setImmediate` after the response); a socket or job path outside `runAs` | Root-cause fix in `src`, **unit test first** (it must fail without the fix), plus a note in the findings table. Never relax a policy or a guard |
   | **B. Harness assumption of legacy mode** | The *fixture* encodes legacy facts: the flat upload layout, a service called directly outside a request, SQL depending on a key 039 made per-tenant | Adapt only through the Task 13 helpers (`asFixtureTenant`, `storedContentPath`, `storedContentDir`, `storedFileCount`, `fixtureConnectionOptions` via `withClient`). Never touch an `expect` line. Add a note in the findings table |
   | **C. Anything else** | The only way to pass would be to change what a test asserts | **Stop.** Record it as an open question for the controller. Do not change the assertion |

3. After each fix, re-run the suite **in both modes**: `node scripts/run-e2e.mjs --mode=both <suite>`. The legacy run must stay green.
4. Commit each root-cause fix on its own (`fix(tenancy): <what was unscoped>`), with its unit test. Commit the harness adaptations of one suite together (`test(tenancy): <suite> under enforced mode through the harness helpers`).
5. Exit criterion of the task: every suite of the task's group passes in both modes, and the findings table lists every change with its kind.

The findings table lives in `PROGRESS.md`, under the M1a section that Task 24 completes. Start it in the first task that finds something:

```markdown
#### M1a enforced-mode findings
| Suite | Test | Kind | Root cause | Fix (commit) |
|---|---|---|---|---|
```

### Task 18: Enforced mode, round 1: `api-contract`, `app`, `realtime-session`, `gps-live`

**Files:** decided by the findings. Expected touch points: `test/api-contract.e2e-spec.ts` (harness helpers only), and each `src/**` file a kind-A finding names, with its `*.spec.ts`.

**Interfaces:**
- Consumes: Task 13 helpers; Tasks 11–17 behaviour.
- Produces: the four suites green in both modes; findings rows.

- [ ] **Step 1: Baseline the four suites in enforced mode**

Run:
```bash
for s in api-contract app realtime-session gps-live; do node scripts/run-e2e.mjs --mode=enforced $s; done
```
Expected: `app` PASS (verified in Task 13). Write the failing tests of the others into the findings table before you fix anything. Known so far: the `multi-factor authentication` block already passes (Task 14); `api-contract:1547` calls `LoginAttemptsService.nameHash`, a pure function that needs no scope.

- [ ] **Step 2: Fix kind A findings test-first, adapt kind B through the helpers**

For each finding, apply the procedure above. Here is the shape of a kind-A fix, for a path that read a tenant table outside the request's scope. Take a timer callback that queries after the request ended:

```ts
// Before: the callback runs after the request's AsyncLocalStorage context ended, so the
// query below has no tenant (under enforced mode: sees nothing)
setImmediate(() => void this.dataSource.query(sql, params));

// After: capture the scope while the request still runs, and re-enter it
const scope = TenantContext.current();
setImmediate(() =>
  void (scope ? TenantContext.runAs(scope, () => this.dataSource.query(sql, params)) : this.dataSource.query(sql, params)),
);
```

with a unit test that runs the method inside `TenantContext.runAs({ tenantId: TID }, …)` and asserts the query ran under `TID` (`TenantContext.current()` captured in the mocked `query`).

- [ ] **Step 3: Exit check**

Run: `node scripts/run-e2e.mjs --mode=both api-contract` and the same for `app`, `realtime-session`, `gps-live`.
Expected: 8 PASS lines. Then `npx jest` (the unit suite) PASS, and `npx eslint "{src,test}/**/*.ts"` gives 0 errors and 0 warnings.

- [ ] **Step 4: Commit the findings table**

```bash
git -C /c/MMS add PROGRESS.md
git commit -m "docs(tenancy): M1a enforced-mode findings, round 1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(The fixes were committed one by one in Step 2.)

---

### Task 19: Enforced mode, round 2: `client-gaps-t20`, `features-t18`

**Files:** decided by the findings. Known harness adaptations in `test/client-gaps-t20.e2e-spec.ts`. They change no `expect` line:

| Line | Today (legacy layout or no scope) | Through the harness |
|---|---|---|
| 440 | `const storedFiles = () => fs.readdirSync(uploadDir).length;` | `const storedFiles = () => storedFileCount(uploadDir);` |
| 477 | `fs.readFileSync(path.join(uploadDir, row.storage_key as string))` | `fs.readFileSync(storedContentPath(uploadDir, row.storage_key as string))` |
| 608 | `return await app.get(FilesService).purgeAbandonedUploads();` | `return await asFixtureTenant(() => app.get(FilesService).purgeAbandonedUploads());` |
| 620, 623 | `fs.existsSync(path.join(uploadDir, …storage_key))` | `fs.existsSync(storedContentPath(uploadDir, …storage_key))` |

If the suite writes a file to the upload directory itself (to stage a pre-existing upload), stage it at `storedContentPath(uploadDir, key)`, which creates the tenant directory first in an enforced run (`fs.mkdirSync(storedContentDir(uploadDir), { recursive: true })`).

**Interfaces:** as Task 18.

- [ ] **Step 1: Baseline**

Run: `node scripts/run-e2e.mjs --mode=enforced client-gaps-t20` and `… features-t18`. Record every failing test as a finding before changing anything.

- [ ] **Step 2: Apply the harness adaptations above, then fix kind A findings test-first**

Follow the procedure at the top of Phase E. `features-t18` creates scratch databases for its migration-guard tests (lines 1696–1960) with `migrateDatabase`. Those tests test the migrator and stay in legacy semantics in both modes. Do not call `prepareDatabaseForTenancy` on them: they never boot the application.

- [ ] **Step 3: Exit check**

Run: `node scripts/run-e2e.mjs --mode=both client-gaps-t20` and `… features-t18`.
Expected: 4 PASS lines. The unit suite and eslint are clean.

- [ ] **Step 4: Commit the findings table** (as Task 18 Step 4, message `… round 2`).

---

### Task 20: Enforced mode, round 3: every remaining suite, and the whole run in both modes

**Files:** decided by the findings. Suites: `frontend-routes-t23`, `incidents-tasks-scope`, `migrations`, `socket-adapter-redis`, `throttler-guard-redis`, `throttler-redis-storage`, and every `tenancy-*` suite (which choose their own mode and must pass in both passes).

**Interfaces:** as Task 18. Produces the exit criterion of Phase E: **every e2e suite green in both modes**.

- [ ] **Step 1: Baseline, fix, adapt**

Run: `node scripts/run-e2e.mjs --mode=enforced frontend-routes-t23` and `… incidents-tasks-scope`, then follow the procedure. `migrations`, `socket-adapter-redis` and the two throttler suites do not boot the application on a migrated database (or create their own databases to test the migrator), so they must pass unchanged in an enforced run. A failure there is a harness defect of Task 13 (for example `db.ts` sending `options` to a server that refuses them): fix the harness, not the suite.

- [ ] **Step 2: The whole run, both modes**

Run: `node scripts/run-e2e.mjs --mode=both`
Expected: `N/N suite runs passed`, where N = 2 × the number of `test/*.e2e-spec.ts` files (21 files at this point: the 16 of M0, the 4 Phase A suites and the harness suite → 42). Keep `test-results/e2e-summary.json` for Task 24.

- [ ] **Step 3: Commit the findings table** (as Task 18 Step 4, message `… round 3`).

---

## Phase F — the full isolation sweep (spec C12, the M1 gate)

### Task 21: Cross-tenant sweep of every route: ids, bodies, files, exports, sockets

**Files:**
- Modify: `test/support/route-sweep.ts` (append: `synthesizePayload`, `buildCall`, `send`, `responseText`, `tenantDigest`, `ACCEPTED_400`)
- Modify: `test/tenancy-route-sweep.e2e-spec.ts` (the whole file, below)

**Interfaces:**
- Consumes: `discoverRoutes`, `idFieldsOf`, `tableOfField`, `PATH_PARAMS`, `FIELD_TABLES`, `CODE_FIELDS`, `NESTED_DTOS` (Task 4); `seedCanaryRows`, `SeededRows`, `quoteIdent` (Task 3); `seedTenant`, `ADMIN_PASSWORD` (M0).
- Produces: `SweepCall { path; query; body; problems }`, `buildCall(route, ids: SeededRows)`, `send(agent, method, path, token, call)`, `responseText(response)`, `tenantDigest(db, tenantId, tables)`. Task 22 reuses `send`, `responseText` and `buildCall`.

What the sweep proves, route by route, with tenant A's administrator: every path parameter carries the id of tenant B's canary row for its table; every id field of the body and query carries B's ids; `unitCode` carries B's unit code; every other required field is synthesised from the DTO's validators. Then:
- no answer is a 5xx;
- no answer contains `CANARY-B` (JSON, HTML, text, or every cell of an `.xlsx`);
- a route with a path parameter answers 403 or 404. A 400 is accepted only when it is listed in `ACCEPTED_400` with the reason the route refuses before any lookup;
- B's rows are byte-for-byte unchanged afterwards (a digest of every tenant table);
- B's socket heard nothing, and A's socket heard nothing containing `CANARY-B`.

- [ ] **Step 1: Write the sweep helpers**

Append to `test/support/route-sweep.ts` (add the imports `import { randomUUID } from 'crypto';`, `import * as ExcelJS from 'exceljs';`, `import request from 'supertest';`, `import { quoteIdent, type SeededRows } from './canary-seeder';`, `import type { TenantDatabase } from './tenancy';`):

```ts
/**
 * Routes answering 400 to a valid id of another tenant BEFORE looking anything up, with the
 * reason (read from the service). Empty until a route proves it; never added to get green.
 */
export const ACCEPTED_400: Readonly<Record<string, string>> = {};

// Sample strings tried, in order, against a @Matches pattern
const PATTERN_SAMPLES = ['0901234567', 'SWEEP-1', 'sweep_user', 'sweep', '2026-06-15'];
const TODAY = new Date().toISOString().slice(0, 10);

type Metadata = ReturnType<ReturnType<typeof getMetadataStorage>['getTargetValidationMetadatas']>[number];

function constraintOf(entries: Metadata[], name: string): unknown {
  const entry = entries.find((e) => e.name === name);
  return (entry?.constraints as unknown[] | undefined)?.[0];
}

function stringFor(dto: DtoClass, property: string, entries: Metadata[], problems: string[]): string {
  const pattern = constraintOf(entries, 'matches');
  const lengthMin = constraintOf(entries, 'isLength');
  const min = Math.max(Number(constraintOf(entries, 'minLength') ?? 0), Number(lengthMin ?? 0), 1);
  const max = Number(
    constraintOf(entries, 'maxLength') ??
      (entries.find((e) => e.name === 'isLength')?.constraints as unknown[] | undefined)?.[1] ??
      200,
  );
  if (pattern instanceof RegExp) {
    const sample = PATTERN_SAMPLES.find((s) => pattern.test(s) && s.length <= max);
    if (sample) return sample;
    problems.push(`${dto.name}.${property}: no sample matches ${String(pattern)}`);
    return 'sweep';
  }
  if (entries.some((e) => e.name === 'isEmail')) return 'sweep@example.com';
  return 'sweep'.padEnd(min, 'x').slice(0, Math.max(min, Math.min(max, 5)));
}

/**
 * A payload the DTO's validators accept: every id field takes the id (or ids) of `ids`
 * (the other tenant's canary rows); an optional field that is not an id is left out.
 */
export function synthesizePayload(
  dto: DtoClass,
  ids: SeededRows,
  problems: string[],
): Record<string, unknown> {
  const metadata = getMetadataStorage().getTargetValidationMetadatas(dto, '', true, false);
  const byProperty = new Map<string, Metadata[]>();
  for (const entry of metadata) {
    byProperty.set(entry.propertyName, [...(byProperty.get(entry.propertyName) ?? []), entry]);
  }
  const payload: Record<string, unknown> = {};
  for (const [property, entries] of byProperty) {
    const has = (name: string) => entries.some((e) => e.name === name || e.type === name);
    const isId = has('isUuid') || /Ids?$/.test(property);
    if (isId) {
      const table = tableOfField({ path: property, name: property, dto: dto.name, array: false });
      const id = table === undefined ? undefined : ids.get(table)?.id;
      if (id === undefined) {
        problems.push(`${dto.name}.${property}: no row of the other tenant to point at`);
        continue;
      }
      payload[property] = entries.some((e) => e.each === true) || /Ids$/.test(property) || has('isArray') ? [id] : id;
      continue;
    }
    if (isListed(CODE_FIELDS, property)) {
      const { table, column } = CODE_FIELDS[property];
      payload[property] = ids.get(table)?.[column];
      continue;
    }
    if (has('conditionalValidation')) continue;
    if (has('nestedValidation')) {
      const declaredType: unknown = Reflect.getMetadata('design:type', dto.prototype, property);
      const nested = NESTED_DTOS[`${dto.name}.${property}`] ?? (isDtoClass(declaredType) ? declaredType : undefined);
      if (!nested) {
        problems.push(`${dto.name}.${property}: nested DTO without an entry in NESTED_DTOS`);
        continue;
      }
      const inner = synthesizePayload(nested, ids, problems);
      payload[property] = entries.some((e) => e.each === true) ? [inner] : inner;
      continue;
    }
    const allowed = constraintOf(entries, 'isIn');
    if (Array.isArray(allowed)) payload[property] = allowed[0] as unknown;
    else if (has('isBoolean')) payload[property] = false;
    else if (has('isInt') || has('isNumber') || has('min') || has('max')) {
      const min = constraintOf(entries, 'min');
      const max = constraintOf(entries, 'max');
      payload[property] = typeof min === 'number' ? min : typeof max === 'number' ? Math.min(1, max) : 1;
    } else if (has('isDateString') || has('isDateOnly')) payload[property] = TODAY;
    else if (has('isLatitude')) payload[property] = 10.75;
    else if (has('isLongitude')) payload[property] = 106.65;
    else if (has('isArray')) {
      const size = Number(constraintOf(entries, 'arrayMinSize') ?? 0);
      payload[property] = Array.from({ length: size }, (_, i) => `sweep${i}`);
    } else payload[property] = stringFor(dto, property, entries, problems);
  }
  return payload;
}

export interface SweepCall {
  path: string;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  problems: string[];
}

/** The call of `route` that points every parameter and id field at the rows of `ids`. */
export function buildCall(route: SweptRoute, ids: SeededRows): SweepCall {
  const problems: string[] = [];
  const params = isListed(PATH_PARAMS, route.key) ? PATH_PARAMS[route.key] : {};
  const path = route.path.replace(/:(\w+)/g, (_, param: string) => {
    const table = isListed(params, param) ? params[param] : undefined;
    const id = table === undefined ? undefined : ids.get(table)?.id;
    if (typeof id !== 'string') {
      problems.push(`:${param}: no row to point at`);
      return randomUUID();
    }
    return id;
  });
  const query = route.queryDto ? synthesizePayload(route.queryDto, ids, problems) : {};
  for (const name of route.queryFields) {
    if (isListed(CODE_FIELDS, name)) {
      query[name] = ids.get(CODE_FIELDS[name].table)?.[CODE_FIELDS[name].column];
    } else if (/Ids?$/.test(name) && isListed(FIELD_TABLES, name)) {
      query[name] = ids.get(FIELD_TABLES[name])?.id;
    }
  }
  const body = route.bodyDto ? synthesizePayload(route.bodyDto, ids, problems) : {};
  for (const name of route.bodyFields) {
    body[name] =
      /Ids?$/.test(name) && isListed(FIELD_TABLES, name) ? ids.get(FIELD_TABLES[name])?.id : 'sweep';
  }
  return { path, query, body, problems };
}

export interface SweepResponse {
  status: number;
  type: string;
  body: Buffer;
}

/** Sends `call` as `method` with a bearer token, keeping the raw body whatever its type. */
type Agent = ReturnType<typeof request>;

export async function send(
  agent: Agent,
  method: string,
  path: string,
  token: string,
  call: Pick<SweepCall, 'query' | 'body'>,
): Promise<SweepResponse> {
  const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  let req = agent[verb](path)
    .set('Authorization', `Bearer ${token}`)
    .query(call.query)
    .buffer(true)
    .parse((res, done) => {
      const raw = res as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      raw.on('data', (chunk: Buffer) => chunks.push(chunk));
      raw.on('end', () => done(null, Buffer.concat(chunks)));
    });
  if (verb !== 'get' && verb !== 'delete') req = req.send(call.body);
  const res = await req;
  return {
    status: res.status,
    type: String(res.headers['content-type'] ?? ''),
    body: res.body as Buffer,
  };
}

/** Everything a person could read in the answer: the text, or every cell of a workbook. */
export async function responseText(response: SweepResponse): Promise<string> {
  const isWorkbook =
    response.type.includes('spreadsheetml') ||
    (response.body.length > 2 && response.body.subarray(0, 2).toString('latin1') === 'PK');
  if (!isWorkbook) return response.body.toString('utf8');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(response.body as unknown as ArrayBuffer);
  const texts: string[] = [];
  workbook.eachSheet((sheet) => {
    texts.push(sheet.name, sheet.headerFooter?.oddHeader ?? '', sheet.headerFooter?.oddFooter ?? '');
    sheet.eachRow({ includeEmpty: false }, (row) =>
      row.eachCell({ includeEmpty: false }, (cell) => texts.push(cell.text)),
    );
  });
  return texts.join('\n');
}

/** One digest per tenant table of the rows of `tenantId`: any change to them changes it. */
export async function tenantDigest(
  db: TenantDatabase,
  tenantId: string,
  tables: string[],
): Promise<Record<string, string>> {
  return db.admin(async (c) => {
    const digests: Record<string, string> = {};
    for (const table of tables) {
      const { rows } = await c.query<{ digest: string }>(
        `SELECT md5(COALESCE(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest
           FROM ${quoteIdent(table)} t WHERE t.tenant_id = $1`,
        [tenantId],
      );
      digests[table] = rows[0].digest;
    }
    return digests;
  });
}
```

- [ ] **Step 2: Write the sweep (the whole test file)**

Replace `test/tenancy-route-sweep.e2e-spec.ts` with:

```ts
// Isolation sweep over EVERY route (spec C12, the M1 gate). Tenant A's administrator calls
// every route the application exposes with tenant B's ids in every path parameter, body and
// query id field: nothing of B may come back (JSON, text, workbook cells), no route may fail,
// a by-id route answers 403/404, B's rows stay unchanged, and no socket event crosses.
// Runs the backend as mms_app with TENANCY_MODE=enforced. Requires MIGRATION_TEST_ADMIN_URL
// and TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import './support/enforced-env';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { seedCanaryRows, type SeededRows } from './support/canary-seeder';
import {
  ACCEPTED_400,
  buildCall,
  discoverRoutes,
  mappedTables,
  responseText,
  send,
  staleParameterEntries,
  tenantDigest,
  unmappedParameters,
  type SweptRoute,
} from './support/route-sweep';
import { tenantTables } from './support/tenancy-catalog';
import {
  ADMIN_PASSWORD,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(900_000);

interface Listener {
  socket: ClientSocket;
  events: string[];
}

describe('isolation sweep of every route (e2e)', () => {
  let db: TenantDatabase;
  let app: INestApplication;
  let baseUrl: string;
  let a: SeededTenant;
  let b: SeededTenant;
  let rowsB: SeededRows;
  let routes: SweptRoute[];
  let tables: string[];

  const url = (path: string) => `/${E2E_API_PREFIX}${path}`;
  const signIn = async (tenant: SeededTenant): Promise<string> =>
    (
      (
        await request(baseUrl)
          .post(url('/auth/login'))
          .send({ tenantCode: tenant.code, username: tenant.adminUsername, password: ADMIN_PASSWORD })
          .expect(200)
      ).body as { tokens: { accessToken: string } }
    ).tokens.accessToken;
  const listen = (token: string) =>
    new Promise<Listener>((resolve, reject) => {
      const socket = connectClient(baseUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });
      const events: string[] = [];
      socket.onAny((event: string, ...args: unknown[]) =>
        events.push(`${event} ${JSON.stringify(args)}`),
      );
      socket.once('connect', () => resolve({ socket, events }));
      socket.once('connect_error', reject);
    });

  beforeAll(async () => {
    db = await createTenantDatabase({ name: E2E_DB_NAME });
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    tables = await db.admin((c) => tenantTables(c));
    rowsB = await db.admin((c) => seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 1 }));
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.listen(0);
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    routes = discoverRoutes(app);
  });

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  describe('route map', () => {
    it('discovers every route of the application', () => {
      expect(routes.length).toBeGreaterThan(150);
    });

    it('maps every path parameter and every id field of every route to a tenant table', () => {
      expect(unmappedParameters(routes, new Set(tables))).toEqual([]);
    });

    it('keeps no parameter entry for a route that no longer exists', () => {
      expect(staleParameterEntries(routes)).toEqual([]);
    });

    it('has a canary row of the other tenant in every table a parameter names', () => {
      expect(mappedTables().filter((table) => !rowsB.has(table))).toEqual([]);
    });
  });

  describe('tenant A calling every route with the ids of tenant B', () => {
    it('never answers with B data, never fails, refuses B ids, leaves B unchanged and crosses no socket', async () => {
      // B signs in and listens BEFORE the digest: its sign-in is not A's doing
      const listenerB = await listen(await signIn(b));
      const listenerA = await listen(await signIn(a));
      const before = await tenantDigest(db, b.id, tables);
      const findings: string[] = [];
      let swept = 0;

      for (const route of routes) {
        const call = buildCall(route, rowsB);
        findings.push(...call.problems.map((p) => `${route.key}: ${p}`));
        // A fresh session per call: a route may end the caller's session (logout, MFA)
        const token = await signIn(a);
        const res = await send(request(baseUrl), route.method, url(call.path), token, call);
        const text = await responseText(res);
        swept++;
        if (res.status >= 500) {
          findings.push(`${route.key}: ${res.status} ${text.slice(0, 300)}`);
        }
        if (text.includes('CANARY-B')) {
          findings.push(`${route.key}: answered with data of tenant B`);
        }
        if (
          route.pathParams.length > 0 &&
          ![403, 404].includes(res.status) &&
          !(res.status === 400 && route.key in ACCEPTED_400)
        ) {
          findings.push(
            `${route.key}: ${res.status} for an id of tenant B (expected 403 or 404) ${text.slice(0, 200)}`,
          );
        }
      }

      expect(findings).toEqual([]);
      expect(swept).toBe(routes.length);
      expect(await tenantDigest(db, b.id, tables)).toEqual(before);
      expect(listenerB.events).toEqual([]);
      expect(listenerA.events.filter((e) => e.includes('CANARY-B'))).toEqual([]);
      listenerA.socket.disconnect();
      listenerB.socket.disconnect();
    });
  });
});
```

(`route.key in ACCEPTED_400` is safe: the object is a plain literal with string keys. Use `isListed` from `./support/tenancy-catalog` if lint objects.)

- [ ] **Step 3: Run it, and work the findings down to none**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-route-sweep.e2e-spec.ts`
Expected at first: the `route map` block passes; the sweep lists findings. Handle them one at a time:
- `… : no sample matches /…/` or `nested DTO without an entry`: extend `PATTERN_SAMPLES` or `NESTED_DTOS` (test support only).
- a 5xx: find the cause in the server log. A kind-A tenancy defect (for example a 23503 from a composite key turned into a 500, where the service should first look up the referenced row under RLS and answer 404) is fixed in `src`, test-first, as in Phase E. A pre-existing, non-tenancy defect is fixed test-first too, because the gate requires no 5xx; record it separately in the findings table.
- `answered with data of tenant B`: an isolation leak. Stop and fix its root cause test-first. This is exactly what the sweep exists to find.
- `200 for an id of tenant B`: the route acted (or pretended to act) on a row it cannot see. Make it look the row up under RLS and answer 404 (test-first). A 400 that the service raises before any lookup goes into `ACCEPTED_400` only with the reason read from the code.
- B's digest changed, B's socket heard an event, A heard `CANARY-B`: a leak. Stop and fix the root cause.

Expected at the end: PASS (5 tests), with every change recorded in the findings table of `PROGRESS.md`.

- [ ] **Step 4: Prove the sweep has teeth (mutation check, not committed)**

On a scratch copy of the database state, disable RLS on one table behind a list route and re-run the sweep. Do it after `beforeAll` seeded, by adding `await db.admin((c) => c.query('ALTER TABLE incidents NO FORCE ROW LEVEL SECURITY; ALTER TABLE incidents DISABLE ROW LEVEL SECURITY'));` temporarily as the first line of the sweep test. Expected: FAIL with `GET /sos: answered with data of tenant B` (and `/sos/alerts`). Remove the line. Record the result in the Task 24 "test power" notes.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint test/support/route-sweep.ts test/tenancy-route-sweep.e2e-spec.ts
git add test/support/route-sweep.ts test/tenancy-route-sweep.e2e-spec.ts
git commit -m "test(tenancy): sweep every route with the other tenant's ids, bodies, files, exports and sockets

Tenant A calls each route DiscoveryService finds with tenant B's ids in every path
parameter and id field (bodies synthesised from the DTO validators): no 5xx, no CANARY-B in
any JSON, text or workbook cell, 403/404 for B's ids, B's rows byte-for-byte unchanged, no
socket event crossing.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(The fixes the sweep forced are committed separately, each with its test.)

---

### Task 22: Differential sweep: tenant A's answers do not move when tenant B grows

**Files:**
- Modify: `test/support/route-sweep.ts` (append `VOLATILE_KEYS`, `normalise`)
- Create: `test/tenancy-differential.e2e-spec.ts`

**Interfaces:**
- Consumes: `discoverRoutes`, `buildCall`, `send`, `responseText` (Tasks 4, 21); `seedCanaryRows` (Task 3).
- Produces: the differential gate row (spec Kiểm chứng: "chạy 2 lần (B rỗng / B đầy) → phản hồi của A giống hệt").

- [ ] **Step 1: Write the normalisation and the failing test**

Append to `test/support/route-sweep.ts`:

```ts
/**
 * JSON keys whose value comes from the clock, not from data: the error filter's timestamp.
 * A key is added here only when the stability check of the differential shows it changes
 * between two identical runs, with the reason beside it.
 */
export const VOLATILE_KEYS: ReadonlySet<string> = new Set(['timestamp']);

// hh:mm[:ss] in generated text and workbook headers ("Xuất lúc 14:05")
const TIME_OF_DAY = /\b\d{1,2}:\d{2}(:\d{2})?\b/g;

function withoutVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatile);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !VOLATILE_KEYS.has(key))
        .map(([key, inner]) => [key, withoutVolatile(inner)]),
    );
  }
  return value;
}

/** An answer as the differential compares it: status, and its readable content. */
export async function normalise(response: SweepResponse): Promise<string> {
  const text = await responseText(response);
  if (response.type.includes('application/json')) {
    try {
      return `${response.status} ${JSON.stringify(withoutVolatile(JSON.parse(text)))}`;
    } catch {
      return `${response.status} ${text}`;
    }
  }
  return `${response.status} ${text.replace(TIME_OF_DAY, 'hh:mm')}`;
}
```

`test/tenancy-differential.e2e-spec.ts`:

```ts
// Differential isolation (spec C12): tenant A's answer from every GET route, with A's own
// ids in its parameters, is identical before and after tenant B goes from its first rows
// to a canary row in every table, twice over. A count, a total or a ranking that leaked
// across tenants would move. Runs as mms_app, TENANCY_MODE=enforced.
// Requires MIGRATION_TEST_ADMIN_URL and TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import './support/enforced-env';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { seedCanaryRows, type SeededRows } from './support/canary-seeder';
import {
  buildCall,
  discoverRoutes,
  mappedTables,
  normalise,
  send,
  type SweptRoute,
} from './support/route-sweep';
import {
  ADMIN_PASSWORD,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(900_000);

describe('differential isolation over every GET route (e2e)', () => {
  let db: TenantDatabase;
  let app: INestApplication;
  let baseUrl: string;
  let a: SeededTenant;
  let b: SeededTenant;
  let token: string;
  let gets: SweptRoute[];
  let ownIds: SeededRows;

  const url = (path: string) => `/${E2E_API_PREFIX}${path}`;

  const snapshot = async (): Promise<Record<string, string>> => {
    const answers: Record<string, string> = {};
    for (const route of gets) {
      const call = buildCall(route, ownIds);
      const res = await send(request(baseUrl), 'GET', url(call.path), token, call);
      answers[`${route.key} ${call.path}`] = await normalise(res);
    }
    return answers;
  };

  const differences = (x: Record<string, string>, y: Record<string, string>) =>
    Object.keys({ ...x, ...y })
      .filter((key) => x[key] !== y[key])
      .map((key) => `${key}\n  before: ${(x[key] ?? '').slice(0, 300)}\n  after:  ${(y[key] ?? '').slice(0, 300)}`);

  beforeAll(async () => {
    db = await createTenantDatabase({ name: E2E_DB_NAME });
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.listen(0);
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    gets = discoverRoutes(app).filter((route) => route.method === 'GET');
    // A's own rows where it has them; a fixed unknown id elsewhere (the same in every run)
    const own: Record<string, string> = {
      tasks: a.taskId,
      militia_profiles: a.memberId,
      files: a.fileId,
      notifications: a.notificationId,
      units: a.unitId,
      users: a.adminId,
    };
    ownIds = new Map(
      mappedTables().map((table) => [
        table,
        { id: own[table] ?? randomUUID(), code: table === 'units' ? a.unitCode : undefined },
      ]),
    );
    // One session for every snapshot: signing in again would move A's last_login_at
    token = (
      (
        await request(baseUrl)
          .post(url('/auth/login'))
          .send({ tenantCode: a.code, username: a.adminUsername, password: ADMIN_PASSWORD })
          .expect(200)
      ).body as { tokens: { accessToken: string } }
    ).tokens.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  it('answers tenant A the same whether tenant B is nearly empty or full', async () => {
    const first = await snapshot();
    // Stability: the same state twice must give the same answers, or the comparison below
    // would prove nothing (a clock-derived field belongs in VOLATILE_KEYS, with its reason)
    expect(differences(first, await snapshot())).toEqual([]);
    // Not a comparison of empty answers: A's own data is in them
    expect(JSON.stringify(first)).toContain('CANARY-A');

    await db.admin((c) => seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 1 }));
    await db.admin((c) => seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 2 }));

    expect(differences(first, await snapshot())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx jest --config ./test/jest-e2e.json --runInBand test/tenancy-differential.e2e-spec.ts`
Expected: PASS once Phases C–E are done. Handle failures as follows:
- the **stability** assertion fails: a field changes between two identical runs. If it comes from the clock (a "generated at" or "now" field), add its key to `VOLATILE_KEYS` with a comment naming the route and why. If it comes from data (an unordered list), fix the order in the service test-first (a list without a deterministic order is a defect).
- the **differential** assertion fails: an aggregate, count, ranking or list of A moved because of B's rows. That is a cross-tenant leak (for example a `count(*)` run on a connection outside the request's scope, or a cache keyed without the tenant). Fix its root cause test-first and record it in the findings table.

- [ ] **Step 3: Mutation check (not committed)**

Temporarily make B's growth visible to A: add `ALTER TABLE tasks DISABLE ROW LEVEL SECURITY` through `db.admin` right after the second `seedCanaryRows`. Expected: FAIL on `/tasks`, `/dashboard/stats` and others. Remove the line, and record the result for Task 24.

- [ ] **Step 4: Lint and commit**

```bash
npx eslint test/support/route-sweep.ts test/tenancy-differential.e2e-spec.ts
git add test/support/route-sweep.ts test/tenancy-differential.e2e-spec.ts
git commit -m "test(tenancy): differential sweep of every GET route while another tenant grows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Phase G — measurement and the gate

### Task 23: Lock-window rehearsal of 038/039/040 on a synthetic production-sized database

**Files:**
- Create: `test/rehearsal/tenant-migration-rehearsal.ts`
- Modify: `docs/migrations.md` (a "Rehearsal" subsection under the 038–040 section)

**Interfaces:**
- Consumes: `migrateDatabase({ through, lockTimeout })` (Task 6).
- Produces: the measured duration of each migration and the longest wait a concurrent reader and writer saw during each. This closes the PROGRESS item "measure the 037/038-style lock windows on a production-sized copy". The rehearsal on a real production copy, with rollback, stays in M5 per the spec.

This is a measurement script, not a test, so it is not in a Jest regex. Its probe loop paces itself with a 50 ms timer, which is acceptable in a measuring tool. It is not a test sleep.

- [ ] **Step 1: Write the script**

`test/rehearsal/tenant-migration-rehearsal.ts`:

```ts
// Lock-window rehearsal of migrations 038-040 on a synthetic production-sized database. It
// migrates a fresh database through 037, fills it (REHEARSAL_SCALE=1: 20k users and members,
// 200k tasks, 400k assignments, 2M audit rows, 2M notification receipts, 5M GPS points, 1M
// attendance rows), then applies 038, 039 and 040 one at a time while a probe reads and
// writes every 50 ms, and prints how long each took and the longest a probe call waited.
//   MIGRATION_TEST_ADMIN_URL=... REHEARSAL_SCALE=1 npx ts-node test/rehearsal/tenant-migration-rehearsal.ts
import * as path from 'path';
import { Client } from 'pg';
import { migrateDatabase } from '../../src/database/migrations/migrate';

const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
if (!adminUrl) throw new Error('MIGRATION_TEST_ADMIN_URL is not set');
const scale = Number(process.env.REHEARSAL_SCALE ?? '1');
const name = `mms_rehearsal_${Date.now()}`;
const directory = path.join(__dirname, '..', '..', 'migrations');
const urlOf = (db: string) => {
  const url = new URL(adminUrl);
  url.pathname = `/${db}`;
  return url.toString();
};

const n = (base: number) => Math.round(base * scale);
const VOLUME = [
  `INSERT INTO units (code, name, type) SELECT 'R' || g, 'Unit ' || g, 'area' FROM generate_series(1, ${n(200)}) g`,
  `INSERT INTO users (username, password_hash, full_name, status)
     SELECT 'r' || g, 'x', 'User ' || g, 'active' FROM generate_series(1, ${n(20000)}) g`,
  `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date)
     SELECT 'RM' || g, 'Member ' || g, lpad(g::text, 12, '0'), '1990-01-01',
            (SELECT id FROM units ORDER BY code LIMIT 1), '2020-01-01'
       FROM generate_series(1, ${n(20000)}) g`,
  `INSERT INTO tasks (code, title, type, created_by)
     SELECT 'RT' || g, 'Task ' || g, 'patrol', (SELECT id FROM users ORDER BY username LIMIT 1)
       FROM generate_series(1, ${n(200000)}) g`,
  `INSERT INTO task_assignments (task_id, assignee_id, assigned_by)
     SELECT t.id, u.id, u.id
       FROM (SELECT id, row_number() OVER () AS k FROM tasks) t
       JOIN (SELECT id, row_number() OVER () AS k FROM users) u
         ON u.k IN ((t.k % ${n(20000)}) + 1, ((t.k + 1) % ${n(20000)}) + 1)`,
  `INSERT INTO audit_logs (action, entity_type, created_at)
     SELECT 'rehearsal', 'tasks', now() - g * interval '1 second' FROM generate_series(1, ${n(2000000)}) g`,
  `INSERT INTO notifications (type, title, body)
     SELECT 'system', 'N ' || g, 'Body' FROM generate_series(1, ${n(200000)}) g`,
  `INSERT INTO notification_receipts (notification_id, user_id)
     SELECT nt.id, u.id FROM notifications nt
      CROSS JOIN (SELECT id FROM users ORDER BY id LIMIT 10) u`,
  `INSERT INTO gps_points (militia_id, lat, lng, captured_at)
     SELECT m.id, 10.7, 106.6, now() - g * interval '1 minute'
       FROM (SELECT id FROM militia_profiles ORDER BY id LIMIT 1000) m
      CROSS JOIN generate_series(1, ${n(5000)}) g`,
  `INSERT INTO attendance_records (militia_id, work_date, source, status)
     SELECT m.id, d::date, 'mobile', 'checked_in'
       FROM (SELECT id FROM militia_profiles ORDER BY id LIMIT ${n(1000)}) m
      CROSS JOIN generate_series(date '2024-01-01', date '2026-09-26', interval '1 day') d`,
  'ANALYZE',
];

interface ProbeResult {
  calls: number;
  maxReadMs: number;
  maxWriteMs: number;
  errors: string[];
}

function startProbe(url: string, militiaId: string): () => Promise<ProbeResult> {
  const result: ProbeResult = { calls: 0, maxReadMs: 0, maxWriteMs: 0, errors: [] };
  let running = true;
  const loop = (async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    await client.query(`SET statement_timeout = '120s'`);
    try {
      while (running) {
        const read = Date.now();
        try {
          await client.query(`SELECT count(*) FROM tasks WHERE code = 'RT1'`);
          result.maxReadMs = Math.max(result.maxReadMs, Date.now() - read);
          const write = Date.now();
          await client.query(
            `INSERT INTO gps_points (militia_id, lat, lng) VALUES ($1, 10.7, 106.6)`,
            [militiaId],
          );
          result.maxWriteMs = Math.max(result.maxWriteMs, Date.now() - write);
        } catch (error) {
          result.errors.push(error instanceof Error ? error.message : String(error));
        }
        result.calls++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      await client.end();
    }
  })();
  return async () => {
    running = false;
    await loop;
    return result;
  };
}

async function main(): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const url = urlOf(name);
  try {
    await migrateDatabase({ connectionString: url, directory, through: '037_tenant_slice_rls.sql' });
    const filler = new Client({ connectionString: url });
    await filler.connect();
    const started = Date.now();
    for (const sql of VOLUME) await filler.query(sql);
    const { rows } = await filler.query<{ id: string }>(`SELECT id FROM militia_profiles LIMIT 1`);
    await filler.end();
    console.log(`volume (scale ${scale}) written in ${Math.round((Date.now() - started) / 1000)} s`);

    console.log('| migration | seconds | longest probe read (ms) | longest probe write (ms) | probe calls | probe errors |');
    console.log('|---|---|---|---|---|---|');
    for (const file of [
      '038_tenant_columns_online.sql',
      '039_tenant_isolation_cutover.sql',
      '040_tenant_validate_online.sql',
    ]) {
      const stop = startProbe(url, rows[0].id);
      const t0 = Date.now();
      await migrateDatabase({ connectionString: url, directory, through: file, lockTimeout: '120s' });
      const seconds = ((Date.now() - t0) / 1000).toFixed(1);
      const probe = await stop();
      console.log(
        `| ${file} | ${seconds} | ${probe.maxReadMs} | ${probe.maxWriteMs} | ${probe.calls} | ${probe.errors.length ? probe.errors.join('; ') : 'none'} |`,
      );
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run it at scale 1, and at 0.1 for a quick check first**

Run: `REHEARSAL_SCALE=0.1 npx ts-node test/rehearsal/tenant-migration-rehearsal.ts`
Expected: a 3-row table and no probe errors. Then run `REHEARSAL_SCALE=1 npx ts-node …` (minutes).

Expected shape of the result (the numbers are what you record): 038 takes the longest but the probe's waits stay small, because it is online. 039's longest probe wait **is** the cutover window. 040's probe waits stay small. A probe error (lock timeout) during 038 or 040 is a defect of the online claim: investigate it before you go on.

- [ ] **Step 3: Record the numbers**

Add under the 038–040 section of `docs/migrations.md`:

```markdown
### Rehearsal (synthetic volume)

`test/rehearsal/tenant-migration-rehearsal.ts`, REHEARSAL_SCALE=1 (20k users and members,
200k tasks, 400k assignments, 2M audit rows, 2M receipts, 5M GPS points, 1M attendance
rows), PostgreSQL 16, <machine>, <date>:

<paste the table the script printed>

The longest probe wait of 039 is the cutover window a drained deploy must allow for. The
rehearsal on a copy of the production database, with the rollback, is part of M5.
```

- [ ] **Step 4: Lint and commit**

```bash
npx eslint test/rehearsal/tenant-migration-rehearsal.ts
git add test/rehearsal/tenant-migration-rehearsal.ts docs/migrations.md
git commit -m "test(tenancy): rehearse the lock windows of 038-040 on a synthetic production-sized database

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 24: The M1a gate: full verification, evidence table, documentation

**Files:**
- Modify: `C:\MMS\PROGRESS.md` (M1a section on top), `Web/backend/docs/tenancy.md`, `docs/superpowers/specs/2026-11-18-multi-tenant-design.md` (an "M1a as built" table)

- [ ] **Step 1: Run everything**

```bash
cd /c/MMS/Web/backend
npx tsc --noEmit
npx eslint "{src,test}/**/*.ts"
npx jest --silent
npx nest build
node scripts/run-e2e.mjs --mode=both
npx jest --coverage --coverageReporters=text-summary --coverageReporters=text \
  --collectCoverageFrom='database/migrations/sql-statements.ts' \
  --collectCoverageFrom='database/migrations/migration-runner.ts' \
  --collectCoverageFrom='database/migrations/postgres-migration-store.ts' \
  --collectCoverageFrom='database/tenancy/*.ts' \
  --collectCoverageFrom='auth/mfa/mfa-challenge.service.ts' \
  --collectCoverageFrom='common/filters/http-exception.filter.ts' \
  --collectCoverageFrom='scheduler/*.service.ts' \
  --collectCoverageFrom='notifications/{notifications.gateway,recent-revocations,ws-tenant-scope.interceptor}.ts' \
  --collectCoverageFrom='auth/auth-revocation-feed.ts'
```

The unit configuration's `rootDir` is `src`, so the coverage patterns are relative to it.
Expected: tsc exit 0; eslint 0 errors, 0 warnings; the unit suite passes; build exit 0; `N/N suite runs passed` with N = 2 × the e2e files (22 files with the differential suite → 44); line coverage ≥ 90% on every file listed. If a file is under 90%, add the missing unit tests (they were missed in its task) before you go on.

- [ ] **Step 2: Build the M1a gate table with the real evidence**

In `PROGRESS.md`, add a section at the top, above the M0 section, and keep the M0 section:

```markdown
## 2026-11-<dd> multi-tenant M1a (branch feat/multi-tenant): schema-wide isolation, gate <GREEN|RED>
Plan: docs/superpowers/plans/2026-11-18-multi-tenant-m1a-schema-wide-isolation.md. Commits <first>..<last>; never pushed.
Result: <one paragraph: 66 tenant tables isolated, 114 composite keys, every suite in both modes, sweep + differential>.
Verification (<date>): tsc 0; eslint 0/0; unit <suites>/<tests>; nest build 0; e2e one file per process, both modes: <N>/<N> (table from test-results/e2e-summary.json); coverage of new and changed files <min>-<max>%.

### M1a gate
| Criterion | Evidence (suite: tests) | Result |
|---|---|---|
| Every non-global table carries tenant_id NOT NULL DEFAULT app_tenant_id() → tenants, forced RLS with the exact policy | tenancy-schema-guard: column + RLS tests | |
| No foreign key between tenant tables without tenant_id; all validated (M0's OPEN row) | tenancy-schema-guard FK test; migrations "validates every foreign key (040)" | |
| A tenant cannot reference another tenant's row, for each of the 114 keys; another tenant's delete neither cascades into nor is blocked by its rows | tenancy-canary-rls "foreign key by foreign key" (checked = 114); tenancy-references 14 tests | |
| Unique keys inside a tenant; code-named constraints kept | tenancy-schema-guard unique + code-named tests; migrations 039 natural-key test | |
| No scope sees nothing; each tenant only its rows; cross-tenant write refused, on all 66 tables | tenancy-canary-rls | |
| mms_app has no privilege on future (platform) tables; the role catalogue is read-only; DEFINER functions and views limited | tenancy-schema-guard privilege, default-ACL, behavioural, DEFINER, view tests | |
| 026 triggers intact; existing rows moved to the first tenant without an UPDATE | tenancy-canary-rls trigger test; migrations 038 tests | |
| Online migrations: non-transactional runner, recovery after a failure, writers not blocked, --through | migrations e2e "non-transactional migrations" + unit specs | |
| Lock windows measured | docs/migrations.md "Rehearsal" | |
| Every route swept with the other tenant's ids; an unmapped parameter fails; no 5xx; no canary in JSON/text/xlsx; 403/404 by id; B unchanged; no socket crossing | tenancy-route-sweep (5 tests) | |
| A's answers unchanged when B grows, over every GET route | tenancy-differential | |
| Every pre-existing suite green in legacy AND enforced (as mms_app, legacy default reset) | run-e2e both modes: <N>/<N> | |
| MFA sign-in under enforced | api-contract "multi-factor authentication" in the enforced run; mfa specs | |
| Revocation by tenant room; sockets hardened; no server-wide emit | tenancy-slice revocation test; gateway/interceptor specs; eslint rule | |
| Jobs per tenant via TenantJobRunner.run (GPS retention, purge, compliance) | tenancy-slice jobs; scheduler specs | |
| TenantScopeError mapped | http-exception.filter.spec | |
| Legacy mode untouched by the harness | run-e2e legacy column | |

### Test power (mutations run, not committed)
- <Task 21 Step 4 result>; <Task 22 Step 3 result>; <any other mutation run during Phases A-F>.

#### M1a enforced-mode findings
<the table built in Tasks 9, 18-22>

### M1b queue (from this plan's "NOT in M1a" and the deferred triage)
<copy the M1b and M1c lists of "NOT in M1a", plus: drop the single-column FK indexes superseded by 038; T2 bind-tenant guards and tests; T5 known-tenant probe; T6 auditRowsOf settle step and shared-code test; T8 refusal ack>
```

Fill every `< >` with the real values from the run. A row that is not green means M1a is not done.

- [ ] **Step 3: Update `docs/tenancy.md`**

- The intro: M1a isolated all 66 tenant tables. List the 6 global tables with their reasons (copy `GLOBAL_TABLES`). Keep the warning that no client sends `tenantCode` yet (M1c), and add that `LEGACY_DEFAULT_TENANT_CODE` covers that gap under `enforced`, transitionally.
- The modes table: the `Sign-in` row gains the fallback. The `Scheduled jobs` row now says "`TenantJobRunner.run(job)`: once in legacy, per tenant in enforced".
- "How the tenant scope flows": add the MFA challenge (`<tenant>.<id>.<secret>`, `enterTenantOf`) and the revocation feed (`tenantId` in the payload, `closeRevoked` by the tenant's user room).
- Replace "Extending the slice" with "Adding a table or a key": `tenant_id` + RLS template + an explicit `GRANT … TO mms_app` (no default privileges since 039) + composite foreign keys `(tenant_id, …)` to tenant tables + per-tenant uniques + a `(tenant_id, …)` index per foreign key. Otherwise list it in `GLOBAL_TABLES` with its privileges. The schema guard (`test/tenancy-schema-guard.e2e-spec.ts`) enforces all of it. A new route parameter or id field must be mapped in `test/support/route-sweep.ts`. A new CHECK constraint the canary seeder cannot satisfy needs a `COLUMN_VALUES` entry.
- "Running the e2e suites": `npm run test:e2e:legacy | test:e2e:enforced | test:e2e:all` (one file per process), `E2E_TENANCY`, the harness helpers and the rule that assertions never differ between modes, random role passwords, and the global teardown that sets `NOLOGIN`. Remove the paragraph saying nothing sets the roles back.
- "Known gaps": replace it with the M1b list.

- [ ] **Step 4: Update the design spec**

Append to `docs/superpowers/specs/2026-11-18-multi-tenant-design.md`, after "M0 as built", a table "M1a as built: deviations". Rows: migrations are `038/039/040` (not `036b/037/038`); the runner marker `-- mms:migration no-transaction` and `--through`; FK indexes `(tenant_id, …)` for every composite key (single-column ones dropped in M1b); MFA challenge `tid` moved into M1a; `mms_tenant_state`, `TRUNCATE login_attempts` and the role rename not in 039 (M2/M1b); the default privileges revoked; `LEGACY_DEFAULT_TENANT_CODE` as the D17 fallback; `files.storage_key` and `login_attempts` global by decision.

- [ ] **Step 5: Commit**

```bash
git -C /c/MMS add PROGRESS.md Web/backend/docs/tenancy.md docs/superpowers/specs/2026-11-18-multi-tenant-design.md
git commit -m "docs(tenancy): M1a gate result, tenancy guide for all tables, spec deviations

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (M1a scope of the brief and the spec):**
- Failing guards first: schema guard (Task 1), the reference reproduction (Task 2), the canary-driven whole-schema proofs (Task 3), the sweep skeleton with an unmapped parameter failing (Task 4). All are RED until Tasks 8–10.
- Runner for non-transactional migrations: marker, statement-by-statement under the advisory lock, record-on-success, invalid-index cleanup, idempotent re-run, unchanged checksum rules. Plus `--through`, which makes D16's "online first, short window after" executable (Tasks 5–7, unit and e2e including a mid-file failure and re-run).
- Migrations `038` (online: columns with the constant-then-`app_tenant_id()` default, 24 parent keys, 15 natural keys, 113 FK indexes, 14 list indexes), `039` (window: `USING INDEX`, old uniques dropped with the code-named names kept, 114 composite FKs `NOT VALID` with `SET NULL (col)`, RLS on 57 tables, `system_settings` PK, privileges, notify payloads, catalog assertion), `040` (online `VALIDATE` + assertion). These are Tasks 8–10. The SQL was executed on a clone of the current schema while the plan was written. The ambiguous tables are classified in "Decisions". Legacy and enforced behaviour after 039 is stated. The 026 triggers are verified (Tasks 3, 8).
- Code that names swapped keys: a grep-driven inventory with file:line (Task 9).
- Enforced regression of the existing suites: central fixture scoping (`db.ts` `options`), the server fallback `LEGACY_DEFAULT_TENANT_CODE` (D17), the `E2E_TENANCY` switch with a run-both script, and a classified bug hunt with an exit criterion (Tasks 12, 13, 18–20).
- Full route-discovery canary and differential sweep, a catalog-driven seeder for all tables, bodies synthesised from validators, workbooks and text scanned, sockets observed, B's digest unchanged (Tasks 3, 4, 21, 22).
- Carried-over items: per-tenant jobs with a mode-aware runner and failure attribution (16), revocation by tenant (9, 17), `TenantScopeError` mapping (15), role hygiene (13), one first-tenant constant and settings read at boot (11). Each item of the PROGRESS M1 queue and triage has an IN/DEFERRED line in "M1 queue disposition".
- Gate (24), and lock-window measurement (23).
- "NOT in M1a" lists M1b/M1c. One item moved in (MFA sign-in challenges), with the reason.

**Placeholder scan:** code steps show the code. In two places the plan points at code that already exists instead of reproducing it, with the exact names and contracts to keep: spec helpers in Tasks 12, 14 and 17 (`userRow`, `mockChallenges`, `live`, `connected`), and the procedure for findings that cannot be known before running enforced mode (Tasks 18–22, which carry a decision table, a worked example of a kind-A fix and an exit criterion). The `< >` fields of Task 24 are filled from the measured run, by design.

**Type consistency:** `TenantJobOutcome.tenantId: string | null` (16) is consumed by `files.service` (16). `freezeTenancySettings`/`tenancySettings`/`isTenancyEnforced(env?)` (11) are used in 12, 13, 14 and 16. `MigrationStore.applyWithoutTransaction(file, checksum, statements)` (6) is implemented by the Postgres store (6) and the test `MemoryStore` (6). `SeededRows = Map<string, Row>` (3) is used by `buildCall` (21) and `snapshot` (22). `discoverRoutes`/`SweptRoute`/`PATH_PARAMS`/`FIELD_TABLES`/`CODE_FIELDS`/`NESTED_DTOS` (4) are used in 21 and 22. `AuthRevocation.tenantId?` (17) matches the payload key `tenantId` of 039. `APP_PASSWORD` (13) is used by `enforced-env`, `backendTenancyEnv` and `createTenantDatabase`.

**Risks the controller should know:**
1. 113 extra FK indexes (write amplification, notably `gps_points`) until M1b drops the superseded single-column ones. The alternative, relaxing the existing FK-index e2e check, would weaken a test.
2. The catalog-driven seeder and payload synthesiser are generic. A future CHECK or `@Matches` they cannot satisfy fails loudly with the table/column or DTO/property named, and needs one map entry.
3. 039's FK rewrite asserts exactly 114 keys. Any migration added before it that creates a key between tenant tables must update the count (intended).
4. Revoking the default privileges is a process change: every future migration must `GRANT` its tables. The guard enforces it.
5. Phases E and F cannot know their findings in advance. The plan bounds them with the kind A/B/C rule, and kind C stops for a decision.
6. Each e2e database now migrates about 470 more statements (038/040). Suite setup is a few seconds slower.

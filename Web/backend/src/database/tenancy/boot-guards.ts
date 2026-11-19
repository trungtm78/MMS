import type { DataSource } from 'typeorm';
import { FIRST_TENANT_ID } from './first-tenant';
import { TenancyConfigError } from './tenancy-mode';

// Enforced mode is only as safe as the database it runs against. These checks run once at
// startup and refuse to boot (with an error that is not retried) when isolation would be
// silently off.

// The legacy single-tenant default (migration 037) makes every session that writes no
// tenant inherit the first tenant. Enforced mode relies on "no tenant sees nothing", so it
// refuses to run while any default of app.tenant_id applies to its sessions.
// Two looks, because the setting can come from more places than the catalog shows:
//  1. pg_db_role_setting (ALTER DATABASE / ALTER ROLE ... SET): names the culprit;
//  2. the effective default of a fresh session (RESET app.tenant_id on a dedicated client,
//     rolled back): also sees postgresql.conf, ALTER SYSTEM and connection options.
export async function assertNoLegacyTenantDefault(
  dataSource: Pick<DataSource, 'query' | 'createQueryRunner'>,
): Promise<void> {
  const rows = await dataSource.query<{ setting: string }[]>(
    `SELECT c AS setting
       FROM pg_db_role_setting s
       CROSS JOIN LATERAL unnest(s.setconfig) AS c
      WHERE (s.setdatabase = 0
             OR s.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database()))
        AND starts_with(c, 'app.tenant_id=')`,
  );
  if (rows.length > 0) throw legacyDefaultPresent(rows[0].setting);

  const effective = await effectiveTenantDefault(dataSource);
  if (effective) {
    throw legacyDefaultPresent(
      `app.tenant_id=${effective} (not in pg_db_role_setting: postgresql.conf, ALTER SYSTEM or a connection option)`,
    );
  }
}

function legacyDefaultPresent(setting: string): TenancyConfigError {
  return new TenancyConfigError(
    `legacy_tenant_default_present: the database sets a default tenant (${setting}), ` +
      `so a request without a tenant would see that tenant. Remove it with ` +
      `ALTER DATABASE <db> RESET app.tenant_id (and ALTER ROLE ... RESET app.tenant_id) before running TENANCY_MODE=enforced`,
  );
}

// What a session starts with when nothing sets app.tenant_id explicitly: RESET goes back to
// the configured default whatever its source. The transaction is rolled back, and the hook
// writes the real scope again on the next checkout.
async function effectiveTenantDefault(
  dataSource: Pick<DataSource, 'createQueryRunner'>,
): Promise<string | null> {
  const runner = dataSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('RESET app.tenant_id');
      const rows = (await runner.query(
        `SELECT NULLIF(current_setting('app.tenant_id', true), '') AS tenant`,
      )) as { tenant: string | null }[];
      return rows[0]?.tenant ?? null;
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    }
  } finally {
    await runner.release();
  }
}

// A superuser or BYPASSRLS role skips Row-Level Security altogether, so every policy of the
// tenant slice would be decoration. The application must connect as a plain role (mms_app).
export async function assertRuntimeRoleEnforcesRls(
  dataSource: Pick<DataSource, 'query'>,
): Promise<void> {
  const rows = await dataSource.query<{ bypass: boolean }[]>(
    `SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`,
  );
  // Not being able to prove the role is safe is as bad as it being unsafe
  if (rows[0]?.bypass !== false) {
    throw new TenancyConfigError(
      `runtime_role_bypasses_rls: the database user is a superuser or has BYPASSRLS (or cannot be ` +
        `checked), so Row-Level Security would not apply to it. Connect as a NOSUPERUSER NOBYPASSRLS ` +
        `role such as mms_app before running TENANCY_MODE=enforced`,
    );
  }
}

// The first tenant owns every row that existed before multi-tenancy. In legacy mode the
// application never writes a tenant to its connections, so the database default below is
// the only thing that gives its sessions a tenant at all.
//
// Legacy mode silently depends on a database-level setting (migration 037:
// ALTER DATABASE ... SET app.tenant_id). pg_dump without --create does not carry it, so a
// restored database loses it and every write to a tenant table then fails on the NOT NULL
// tenant_id (and the fire-and-forget audit inserts fail with only a warning). Refuse to
// boot instead of losing data quietly.
export async function assertLegacyTenantDefaultPresent(
  dataSource: Pick<DataSource, 'query'>,
): Promise<void> {
  // A plain checkout: legacy mode writes no scope, so this is the database default
  const rows = await dataSource.query<{ tenant: string | null }[]>(
    `SELECT current_setting('app.tenant_id', true) AS tenant`,
  );
  const tenant = rows[0]?.tenant ?? null;
  if (tenant?.toLowerCase() !== FIRST_TENANT_ID) {
    throw new TenancyConfigError(
      `legacy_tenant_default_missing: sessions of this database default to ${JSON.stringify(tenant)} ` +
        `instead of the first tenant, so writes to the tenant tables would fail. Restore the ` +
        `default with ALTER DATABASE <db> SET app.tenant_id = '${FIRST_TENANT_ID}'. ` +
        `A pg_dump taken without --create does not carry that setting: back up with pg_dump --create ` +
        `(or repeat the statement after restoring), and restore the roles first (pg_dumpall --roles-only)`,
    );
  }
}

// The policies of the tenant tables are TO mms_app and FORCE ROW LEVEL SECURITY applies
// them to the table owner too: any other plain role gets default-deny and sees empty tables.
// A superuser or BYPASSRLS role skips RLS, and a role that has the privileges of mms_app
// (is a member of it) is covered by the policies and the database default.
export async function assertLegacyRoleSeesTenantData(
  dataSource: Pick<DataSource, 'query'>,
): Promise<void> {
  const rows = await dataSource.query<{ ok: boolean }[]>(
    `SELECT r.rolsuper OR r.rolbypassrls
            OR EXISTS (SELECT 1 FROM pg_roles m
                        WHERE m.rolname = 'mms_app' AND pg_has_role(current_user, m.oid, 'USAGE')) AS ok
       FROM pg_roles r
      WHERE r.rolname = current_user`,
  );
  // Not being able to prove the role sees its data is as bad as it not seeing it
  if (rows[0]?.ok !== true) {
    throw new TenancyConfigError(
      `legacy_role_blocked_by_rls: the database user is neither a superuser, nor BYPASSRLS, nor a member of ` +
        `mms_app (or cannot be checked), so Row-Level Security would show it empty tables. Connect as a ` +
        `superuser, a BYPASSRLS role or mms_app (see docs/tenancy.md)`,
    );
  }
}

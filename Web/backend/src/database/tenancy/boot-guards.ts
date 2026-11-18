import type { DataSource } from 'typeorm';
import { TenancyConfigError } from './tenancy-mode';

// Enforced mode is only as safe as the database it runs against. These checks run once at
// startup and refuse to boot (with an error that is not retried) when isolation would be
// silently off.

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
        AND starts_with(c, 'app.tenant_id=')`,
  );
  if (rows.length > 0) {
    throw new TenancyConfigError(
      `legacy_tenant_default_present: the database sets a default tenant (${rows[0].setting}), ` +
        `so a request without a tenant would see that tenant. Remove it with ` +
        `ALTER DATABASE <db> RESET app.tenant_id (and ALTER ROLE ... RESET app.tenant_id) before running TENANCY_MODE=enforced`,
    );
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

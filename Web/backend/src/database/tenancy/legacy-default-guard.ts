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

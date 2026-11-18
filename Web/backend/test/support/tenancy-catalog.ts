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

export const DML: readonly Privilege[] = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
];

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
    reason:
      'permission catalogue, the same for every tenant: read-only at runtime',
    mmsApp: ['SELECT'],
    mmsPlatform: [],
  },
  role_permissions: {
    reason:
      'role-permission catalogue, the same for every tenant: read-only at runtime',
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
  Object.keys(record).includes(key);

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

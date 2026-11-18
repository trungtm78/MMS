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

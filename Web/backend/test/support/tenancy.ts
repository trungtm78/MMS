import * as fs from 'fs';
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
  const dropDatabase = () =>
    withClient(base, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
    ).then(() => undefined);
  await withClient(base, (c) => c.query(`CREATE DATABASE ${name}`));
  const dbAdminUrl = urlFor(base, name);
  try {
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
  } catch (error) {
    // A half-built database would otherwise outlive the failed suite
    await dropDatabase().catch(() => undefined);
    throw error;
  }
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
    drop: dropDatabase,
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
  memberUserId: string;
  taskId: string;
  fileId: string;
  /** The storage key of the seeded file; its content is written by writeSeededFile. */
  storageKey: string;
  /** The content of the seeded file, marked with the canary of the tenant. */
  fileBody: string;
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
    // The member holds an account too, so a task can be assigned through the API
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
    const memberId = await one<string>(
      `INSERT INTO militia_profiles (tenant_id, militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
       VALUES ($1, $2, $3, $4, '1998-04-04', $5, '2022-01-01', $6) RETURNING id`,
      [
        id,
        `DQ-${code}`.toUpperCase(),
        `Member ${canary}`,
        String(Math.floor(Math.random() * 1e12)).padStart(12, '0'),
        unitId,
        memberUserId,
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
    const storageKey = randomUUID();
    const fileBody = `file body ${canary}`;
    const fileId = await one<string>(
      `INSERT INTO files (tenant_id, storage_key, original_name, mime_type, size, uploaded_by)
       VALUES ($1, $2, $3, 'text/plain', $4, $5) RETURNING id`,
      [
        id,
        storageKey,
        `file-${canary}.txt`,
        Buffer.byteLength(fileBody),
        adminId,
      ],
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
      memberUserId,
      taskId,
      fileId,
      storageKey,
      fileBody,
      notificationId,
    };
  });
}

/**
 * Puts the content of the seeded file where the backend looks for it, so that a download
 * answers with the content instead of "file not found". This is the one place that knows
 * the storage layout of enforced mode: one directory per tenant, upload dir / tenant id /
 * storage key.
 */
export function writeSeededFile(uploadDir: string, seeded: SeededTenant): void {
  const directory = path.join(uploadDir, seeded.id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, seeded.storageKey), seeded.fileBody);
}

// Cross-tenant references (the M0 gate row left open, closed by M1a). A single-column
// foreign key is checked as the table owner, so Row-Level Security does not hide the other
// tenant's row from it: a tenant could point its rows at another tenant's rows, and that
// tenant's deletes would then cascade into, or be blocked by, rows it cannot even see.
// Composite (tenant_id, id) keys (migrations 038-040) close it. Every foreign key of the
// M0 slice is tried here as mms_app under tenant A with one id of tenant B.
// Requires MIGRATION_TEST_ADMIN_URL; run with --runInBand.
import { randomUUID } from 'crypto';
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

  // Every case runs in its own transaction and rolls back: no case leaves a row for another
  // to meet, so the cases pass or fail in any order
  it.each(POINTERS)(
    'refuses a row of one tenant that points at a row of another ($fk)',
    async ({ fk, sql, values }) => {
      await expect(
        db.app(a.id, async (c) => {
          await c.query('BEGIN');
          try {
            return await c.query(sql, values(a, b));
          } finally {
            await c.query('ROLLBACK');
          }
        }),
      ).rejects.toMatchObject({ code: '23503', constraint: fk });
    },
  );

  // Builds its own rows, so it depends on no other case. With a single-column key the
  // pointing row is accepted (the first expectation fails: resolved instead of rejected) and
  // B's delete would cascade into A's row; the composite key refuses the row outright
  it('lets another tenant delete its own task without reaching into, or being blocked by, ours', async () => {
    const task = (t: SeededTenant, label: string) =>
      db.app(t.id, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO tasks (code, title, type, created_by, unit_id)
           VALUES ($1, 'x', 'patrol', $2, $3) RETURNING id`,
          [`REF-${label}-${randomUUID().slice(0, 8)}`, t.adminId, t.unitId],
        );
        return rows[0].id;
      });
    const taskOfA = await task(a, 'A');
    const taskOfB = await task(b, 'B');
    const assign = (taskId: string) =>
      db.app(a.id, (c) =>
        c.query(
          `INSERT INTO task_assignments (task_id, assignee_id, assigned_by) VALUES ($1, $2, $2)`,
          [taskId, a.memberUserId],
        ),
      );
    await assign(taskOfA);

    await expect(assign(taskOfB)).rejects.toMatchObject({ code: '23503' });

    const deleted = await db.app(b.id, (c) =>
      c.query(`DELETE FROM tasks WHERE id = $1`, [taskOfB]),
    );
    expect(deleted.rowCount).toBe(1);

    // Tenant A still holds its own assignment, and none to the deleted task of B
    const remaining = await db.app(a.id, async (c) =>
      (
        await c.query<{ task_id: string }>(
          `SELECT task_id FROM task_assignments WHERE task_id = ANY ($1) AND assignee_id = $2`,
          [[taskOfA, taskOfB], a.memberUserId],
        )
      ).rows.map((r) => r.task_id),
    );
    expect(remaining).toEqual([taskOfA]);
  });
});

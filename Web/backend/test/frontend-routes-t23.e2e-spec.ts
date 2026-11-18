// T23: the routes the web frontend calls that the backend lacked — /attendance/timesheet,
// /devices/sessions, /reports/custom, /tasks/report, /kpi/dashboard, /sos/alerts,
// /settings/kpi-targets and /settings/notifications — on a real, freshly migrated
// Postgres. Covers what mocked unit tests cannot: the SQL itself, unit and assignment scope
// through real tokens, validation through the global pipe, route order, session revocation
// taking effect at once, and migration 029 (its guard and append-only triggers).
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5440/postgres
import * as fs from 'fs';
import type { Server } from 'http';
import * as path from 'path';
import { Client } from 'pg';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { businessDate, shiftIsoDate } from '../src/common/time/business-date';
import { configureHttpApp } from '../src/app.setup';
import {
  CUSTOM_REPORT_DATASETS,
  supportedGroupings,
} from '../src/reports/custom-report.definitions';
import { withClient } from './support/db';

jest.setTimeout(180_000);

const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
if (!adminUrl) {
  throw new Error(
    'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:mms_secret@localhost:5440/postgres)',
  );
}

const PREFIX = 'api/v1/mms_core';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATION_029 = path.join(
  MIGRATIONS_DIR,
  '029_settings_kpi_notifications.sql',
);

type Body = Record<string, unknown>;
const bodyOf = <T = Body>(res: request.Response) => res.body as T;
const messageOf = (res: request.Response) =>
  bodyOf<{ message?: unknown }>(res).message;

// The session an access token names
const sidOf = (token: string) =>
  (
    JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    ) as { sid: string }
  ).sid;

function databaseUrl(name: string): string {
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  return url.toString();
}

interface TimesheetDay {
  date: string;
  status: string | null;
  checkIn: string | null;
  checkOut: string | null;
  onLeave: boolean;
}
interface TimesheetRow {
  militiaCode: string;
  unitCode: string;
  days: TimesheetDay[];
  totals: Record<string, number>;
}
interface TimesheetBody {
  unitCode: string | null;
  dates: string[];
  data: TimesheetRow[];
  total: number;
}

describe('Frontend routes T23 (e2e)', () => {
  const dbName = `mms_t23_${Date.now()}`;
  const targetUrl = databaseUrl(dbName);
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  // Militia profile ids: a1 (t23_dqtv_a) and a2 (t23_dqtv_a2) in unit A, a3 an inactive
  // member of unit A without an account, b1 (t23_dqtv_b) in unit B
  const members: Record<string, string> = {};
  const incidents: Record<string, string> = {};
  let payrollPeriodId: string;

  const api = () => request(app.getHttpServer() as Server);
  const db = <T>(fn: (client: Client) => Promise<T>) =>
    withClient(targetUrl, fn);
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const url = (route: string) => `/${PREFIX}${route}`;
  const get = (who: string, route: string) =>
    api().get(url(route)).set(auth(who));

  // The previous Vietnamese month: every day of it is in the past
  const today = businessDate().isoDate;
  const monthTo = shiftIsoDate(`${today.slice(0, 8)}01`, -1);
  const month = monthTo.slice(0, 7);
  const monthFrom = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const day = (n: number) => `${month}-${String(n).padStart(2, '0')}`;
  const onlyT23 = (rows: TimesheetRow[]) =>
    rows.filter((r) => r.militiaCode.startsWith('DQ-T23'));

  async function login(username: string, password: string): Promise<string> {
    const res = await api()
      .post(url('/auth/login'))
      .send({ username, password })
      .expect(200);
    return bodyOf<{ tokens: { accessToken: string } }>(res).tokens.accessToken;
  }

  const passwords: Record<string, string> = {};

  async function account(username: string, role: string, unitCode?: string) {
    const created = await api()
      .post(url('/admin/users'))
      .set(auth('admin'))
      .send({
        username,
        fullName: `Cán bộ ${username}`,
        role,
        ...(unitCode ? { unitCode } : {}),
      })
      .expect(201);
    const body = bodyOf<{ id: string; temporaryPassword: string }>(created);
    userIds[username] = body.id;
    passwords[username] = body.temporaryPassword;
    tokens[username] = await login(username, body.temporaryPassword);
  }

  async function insertMember(
    code: string,
    name: string,
    cccd: string,
    unitCode: string,
    userId: string | null,
    status = 'active',
  ): Promise<string> {
    return db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id, status)
         SELECT $1, $2, $3, '1998-04-04', u.id, '2022-01-01', $5, $6
         FROM units u WHERE u.code = $4
         RETURNING id`,
        [code, name, cccd, unitCode, userId, status],
      );
      return rows[0].id;
    });
  }

  beforeAll(async () => {
    await withClient(adminUrl, (c) => c.query(`CREATE DATABASE ${dbName}`));
    await migrateDatabase({
      connectionString: targetUrl,
      directory: MIGRATIONS_DIR,
    });

    // Configuration is read when AppModule is loaded, so set it before requiring it
    const target = new URL(targetUrl);
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DB_HOST: target.hostname,
      DB_PORT: target.port || '5432',
      DB_USER: decodeURIComponent(target.username),
      DB_PASSWORD: decodeURIComponent(target.password),
      DB_NAME: dbName,
      API_PREFIX: PREFIX,
      JWT_SECRET: 'e2e-access-secret-0123456789abcdef',
      JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
      AES_CCCD_KEY: 'a'.repeat(64),
      // The suite signs in far more often than a person could from one address
      THROTTLE_LOGIN_LIMIT: '100000',
      THROTTLE_MFA_LIMIT: '100000',
    });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // The same HTTP setup src/main.ts applies
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: PREFIX });
    await app.init(); // runs SeederService: admin / Admin@123

    tokens.admin = await login('admin', 'Admin@123');
    userIds.admin = await db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM users WHERE username = 'admin'`,
      );
      return rows[0].id;
    });

    await db((c) =>
      c.query(
        `INSERT INTO units (code, name, type)
         VALUES ('KV-T23-A', 'Khu vực T23 A', 'area'), ('KV-T23-B', 'Khu vực T23 B', 'area')
         ON CONFLICT (tenant_id, code) DO NOTHING`,
      ),
    );
    await account('t23_ward', 'police_ward');
    await account('t23_staff_a', 'office_staff', 'KV-T23-A');
    await account('t23_area_b', 'police_area', 'KV-T23-B');
    await account('t23_ca_a', 'ca_officer', 'KV-T23-A');
    await account('t23_leader', 'ubnd_leader');
    await account('t23_dqtv_a', 'dqtv', 'KV-T23-A');
    await account('t23_dqtv_a2', 'dqtv', 'KV-T23-A');
    await account('t23_dqtv_b', 'dqtv', 'KV-T23-B');
    await account('t23_sessions', 'dqtv', 'KV-T23-A');

    members.a1 = await insertMember(
      'DQ-T23-A1',
      'Nguyễn Văn An',
      '079202300001',
      'KV-T23-A',
      userIds.t23_dqtv_a,
    );
    members.a2 = await insertMember(
      'DQ-T23-A2',
      'Trần Văn Bình',
      '079202300002',
      'KV-T23-A',
      userIds.t23_dqtv_a2,
    );
    members.a3 = await insertMember(
      'DQ-T23-A3',
      'Phạm Văn Đông',
      '079202300003',
      'KV-T23-A',
      null,
      'inactive',
    );
    members.b1 = await insertMember(
      'DQ-T23-B1',
      'Lê Văn Cường',
      '079202300004',
      'KV-T23-B',
      userIds.t23_dqtv_b,
    );

    await api()
      .post(url('/assignments'))
      .set(auth('admin'))
      .send({ caUserId: userIds.t23_ca_a, dqtvUserId: userIds.t23_dqtv_a })
      .expect(201);

    await db(async (c) => {
      // Attendance in the previous month
      await c.query(
        `INSERT INTO attendance_records (militia_id, work_date, status, checkin_at, checkout_at, work_hours, source)
         VALUES ($1, $2, 'checked_out', $3, $4, 9.5, 'web'),
                ($1, $5, 'late', $6, NULL, NULL, 'web'),
                ($7, $2, 'absent', NULL, NULL, NULL, 'web'),
                ($8, $2, 'checked_in', $3, NULL, NULL, 'web')`,
        [
          members.a1,
          day(2),
          `${day(2)}T07:30:00+07:00`,
          `${day(2)}T17:00:00+07:00`,
          day(3),
          `${day(3)}T08:10:00+07:00`,
          members.a2,
          members.b1,
        ],
      );
      // Approved leave of a1 on the 5th and 6th
      const { rows: leaveTypes } = await c.query<{ id: string }>(
        `INSERT INTO leave_types (code, name) VALUES ('t23_annual', 'Nghỉ phép T23') RETURNING id`,
      );
      await c.query(
        `INSERT INTO leave_requests (code, requester_id, leave_type_id, from_date, to_date, reason, status)
         VALUES ('T23-LV-1', $1, $2, $3, $4, 'Việc gia đình', 'approved'),
                ('T23-LV-2', $1, $2, $5, $5, 'Chờ duyệt', 'pending')`,
        [userIds.t23_dqtv_a, leaveTypes[0].id, day(5), day(6), day(9)],
      );

      // Tasks created now: T1-T2 and T4 belong to unit A (T4 through its assignee), T3 to B
      const task = async (
        code: string,
        unitCode: string | null,
        status: string,
        assignee: string,
        deadlineSql = 'NULL',
      ) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO tasks (code, title, type, priority, status, deadline, unit_id, created_by)
           VALUES ($1::text, $1::text, 'patrol', 'high', $2, ${deadlineSql},
                   (SELECT id FROM units WHERE code = $3), $4)
           RETURNING id`,
          [code, status, unitCode, userIds.admin],
        );
        await c.query(
          `INSERT INTO task_assignments (task_id, assignee_id, assigned_by) VALUES ($1, $2, $3)`,
          [rows[0].id, assignee, userIds.admin],
        );
      };
      await task('T23-TASK-1', 'KV-T23-A', 'completed', userIds.t23_dqtv_a);
      await task(
        'T23-TASK-2',
        'KV-T23-A',
        'in_progress',
        userIds.t23_dqtv_a2,
        `now() - interval '2 days'`,
      );
      await task('T23-TASK-3', 'KV-T23-B', 'pending', userIds.t23_dqtv_b);
      await task('T23-TASK-4', null, 'cancelled', userIds.t23_dqtv_a);

      // KPI evaluations of the previous month: 95, 70 and 50 on the 100-point scale
      const evaluation = (
        target: string,
        score: number,
        recommendation: string,
      ) =>
        c.query(
          `INSERT INTO kpi_evaluations (evaluator_id, target_user_id, criteria, scores, weighted_score, recommendation, year, month)
           VALUES ($1, $2, '[]', '[5,5,5,5,5]', $3, $4, $5, $6)`,
          [userIds.admin, target, score, recommendation, year, monthNumber],
        );
      await evaluation(userIds.t23_dqtv_a, 9.5, 'reward');
      await evaluation(userIds.t23_dqtv_a2, 7, 'maintain');
      await evaluation(userIds.t23_dqtv_b, 5, 'warning');

      const { rows: periods } = await c.query<{ id: string }>(
        `INSERT INTO payroll_periods (year, month) VALUES ($1, $2) RETURNING id`,
        [year, monthNumber],
      );
      payrollPeriodId = periods[0].id;
      await c.query(
        `INSERT INTO payroll_items (payroll_period_id, militia_id, base_salary, net_salary)
         VALUES ($1, $2, 2000000, 2500000), ($1, $3, 2000000, 2100000)`,
        [payrollPeriodId, members.a1, members.b1],
      );

      const incident = async (
        code: string,
        reporter: string,
        severity: string,
        status: string,
      ) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO incidents (code, reporter_id, incident_type, severity, title, message, status, resolved_at)
           VALUES ($1::text, $2, 'sos', $3, $1::text, 'Cần hỗ trợ', $4::text,
                   CASE WHEN $4::text = 'resolved' THEN now() END)
           RETURNING id`,
          [code, reporter, severity, status],
        );
        return rows[0].id;
      };
      incidents.a_open = await incident(
        'T23-SOS-1',
        userIds.t23_dqtv_a,
        'high',
        'open',
      );
      incidents.b_open = await incident(
        'T23-SOS-2',
        userIds.t23_dqtv_b,
        'urgent',
        'open',
      );
      incidents.a_resolved = await incident(
        'T23-SOS-3',
        userIds.t23_dqtv_a,
        'low',
        'resolved',
      );
    });
  });

  afterAll(async () => {
    await app?.close();
    await withClient(adminUrl, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`),
    );
  });

  it('answers every new GET route without parameters and without a server error', async () => {
    const routes = [
      '/attendance/timesheet',
      '/devices/sessions',
      '/reports/custom',
      '/reports/custom/export',
      '/tasks/report',
      '/kpi/dashboard',
      '/sos/alerts',
      '/settings/kpi-targets',
      '/settings/notifications',
    ];
    for (const route of routes) {
      const res = await get('admin', route);
      expect({ route, status: res.status < 500 }).toEqual({
        route,
        status: true,
      });
    }
  });

  // ── Settings: KPI targets and notification preferences ───────────────────────

  describe('/settings/kpi-targets', () => {
    const targets = {
      minAttendanceDays: 20,
      minTasksCompleted: 8,
      maxOverdueTasks: 3,
      minTrainingHours: 60,
      evaluationPeriod: 'monthly',
    };

    it('answers the defaults to staff before anything is set, and refuses militia members', async () => {
      const res = await get('t23_staff_a', '/settings/kpi-targets').expect(200);
      expect(bodyOf(res)).toMatchObject({
        minAttendanceDays: 22,
        minTasksCompleted: 10,
        maxOverdueTasks: 2,
        minTrainingHours: 40,
        evaluationPeriod: 'monthly',
        isDefault: true,
        effectiveFrom: null,
      });
      await get('t23_dqtv_a', '/settings/kpi-targets').expect(403);
    });

    it('lets only system_admin change them, audited, effective from today', async () => {
      await api()
        .put(url('/settings/kpi-targets'))
        .set(auth('t23_ward'))
        .send(targets)
        .expect(403);

      const res = await api()
        .put(url('/settings/kpi-targets'))
        .set(auth('admin'))
        .send({ ...targets, minAttendanceDays: 18 })
        .expect(200);
      expect(bodyOf(res)).toMatchObject({
        minAttendanceDays: 18,
        effectiveFrom: today,
        isDefault: false,
        updatedBy: { id: userIds.admin },
      });

      // a second change the same day replaces the first
      await api()
        .put(url('/settings/kpi-targets'))
        .set(auth('admin'))
        .send(targets)
        .expect(200);
      const current = await get('t23_staff_a', '/settings/kpi-targets').expect(
        200,
      );
      expect(bodyOf(current)).toMatchObject({ ...targets, isDefault: false });

      // versions apply from their day on: yesterday still had the defaults
      const yesterday = await get(
        't23_ca_a',
        `/settings/kpi-targets?asOf=${shiftIsoDate(today, -1)}`,
      ).expect(200);
      expect(bodyOf(yesterday)).toMatchObject({ isDefault: true });

      const audit = await db(async (c) => {
        const { rows } = await c.query<{ after_json: Body }>(
          `SELECT after_json FROM audit_logs WHERE action = 'kpi_targets.updated'
           ORDER BY created_at`,
        );
        return rows.map((r) => r.after_json);
      });
      expect(audit).toHaveLength(2);
      expect(audit[1]).toMatchObject({
        before: { minAttendanceDays: 18, isDefault: false },
        after: { ...targets, isDefault: false },
      });
    });

    it.each<[string, Body]>([
      ['0 attendance days', { minAttendanceDays: 0 }],
      ['a numeric string', { minTasksCompleted: '8' }],
      ['a fraction', { maxOverdueTasks: 1.5 }],
      ['501 training hours', { minTrainingHours: 501 }],
      ['an unknown period', { evaluationPeriod: 'weekly' }],
      ['a missing field', { minTrainingHours: undefined }],
      ['an unknown field', { bonus: 1 }],
    ])('refuses %s with 400', async (_label, change) => {
      await api()
        .put(url('/settings/kpi-targets'))
        .set(auth('admin'))
        .send({ ...targets, ...change })
        .expect(400);
    });

    it('refuses an impossible asOf day', async () => {
      const res = await get(
        'admin',
        '/settings/kpi-targets?asOf=2026-02-30',
      ).expect(400);
      expect(messageOf(res)).toBe('invalid_date');
    });

    it('keeps versions append-only in the database', async () => {
      for (const statement of [
        `UPDATE kpi_target_settings SET min_attendance_days = 1`,
        `DELETE FROM kpi_target_settings`,
        `TRUNCATE kpi_target_settings`,
      ]) {
        await expect(db((c) => c.query(statement))).rejects.toThrow(
          /append-only/,
        );
      }
      await expect(
        db((c) =>
          c.query(
            `INSERT INTO kpi_target_settings
               (effective_from, min_attendance_days, min_tasks_completed, max_overdue_tasks,
                min_training_hours, evaluation_period, created_by)
             VALUES (current_date, 32, 0, 0, 0, 'monthly', $1)`,
            [userIds.admin],
          ),
        ),
      ).rejects.toThrow(/chk_kpi_target_settings_min_attendance_days/);
    });
  });

  describe('/settings/notifications', () => {
    const preferences = (
      change: {
        channels?: Body;
        categories?: Body;
      } = {},
    ) => ({
      channels: { inApp: true, push: true, email: false, ...change.channels },
      categories: {
        taskAssigned: true,
        taskOverdue: true,
        attendanceReminder: true,
        leaveApproval: true,
        systemAnnouncements: true,
        sosAlerts: true,
        ...change.categories,
      },
    });

    it('answers the defaults to a user who never chose', async () => {
      const res = await get('t23_dqtv_a2', '/settings/notifications').expect(
        200,
      );
      expect(bodyOf(res)).toEqual({
        ...preferences(),
        mandatory: ['channels.inApp'],
        updatedAt: null,
        isDefault: true,
      });
    });

    it('stores the caller own preferences, and only theirs', async () => {
      const wanted = preferences({
        channels: { push: false, email: true },
        categories: { taskOverdue: false, sosAlerts: false },
      });
      const saved = await api()
        .put(url('/settings/notifications'))
        .set(auth('t23_dqtv_a2'))
        .send(wanted)
        .expect(200);
      expect(bodyOf(saved)).toMatchObject({ ...wanted, isDefault: false });

      const reread = await get('t23_dqtv_a2', '/settings/notifications').expect(
        200,
      );
      expect(bodyOf(reread)).toMatchObject(wanted);
      const other = await get('t23_dqtv_b', '/settings/notifications').expect(
        200,
      );
      expect(bodyOf(other)).toMatchObject({ isDefault: true });
    });

    it('keeps SOS alerts on for responders and the in-app channel on for everyone', async () => {
      const ca = await get('t23_ca_a', '/settings/notifications').expect(200);
      expect(bodyOf<{ mandatory: string[] }>(ca).mandatory).toEqual([
        'channels.inApp',
        'categories.sosAlerts',
      ]);
      const refusedSos = await api()
        .put(url('/settings/notifications'))
        .set(auth('t23_ca_a'))
        .send(preferences({ categories: { sosAlerts: false } }))
        .expect(400);
      expect(messageOf(refusedSos)).toBe('notification_preference_mandatory');
      await api()
        .put(url('/settings/notifications'))
        .set(auth('t23_leader'))
        .send(preferences({ channels: { inApp: false } }))
        .expect(400);
    });

    it('refuses the flat body the page sends today and incomplete bodies', async () => {
      await api()
        .put(url('/settings/notifications'))
        .set(auth('t23_dqtv_b'))
        .send(preferences().categories)
        .expect(400);
      const incomplete = preferences();
      delete (incomplete.categories as Partial<typeof incomplete.categories>)
        .leaveApproval;
      await api()
        .put(url('/settings/notifications'))
        .set(auth('t23_dqtv_b'))
        .send(incomplete)
        .expect(400);
    });
  });

  // ── GET /attendance/timesheet ───────────────────────────────────────────────

  describe('GET /attendance/timesheet', () => {
    it('builds the month grid of the caller unit from records and approved leave', async () => {
      const res = await get(
        't23_staff_a',
        `/attendance/timesheet?month=${month}&unitCode=KV-T23-B`,
      ).expect(200);
      const body = bodyOf<TimesheetBody>(res);

      expect(body.unitCode).toBe('KV-T23-A');
      expect(body.dates[0]).toBe(monthFrom);
      expect(body.dates[body.dates.length - 1]).toBe(monthTo);
      // the inactive member without records is left out
      expect(onlyT23(body.data).map((r) => r.militiaCode)).toEqual([
        'DQ-T23-A1',
        'DQ-T23-A2',
      ]);

      const a1 = body.data.find((r) => r.militiaCode === 'DQ-T23-A1')!;
      const dayOf = (n: number) => a1.days.find((d) => d.date === day(n))!;
      expect(dayOf(2)).toMatchObject({
        status: 'present',
        checkIn: '07:30',
        checkOut: '17:00',
      });
      expect(dayOf(3)).toMatchObject({ status: 'late', checkIn: '08:10' });
      expect(dayOf(5)).toMatchObject({ status: 'leave', onLeave: true });
      expect(dayOf(9)).toMatchObject({ status: null, onLeave: false });
      expect(a1.totals).toMatchObject({
        present: 1,
        late: 1,
        absent: 0,
        leave: 2,
        unrecorded: body.dates.length - 4,
      });
    });

    it('lets a ward-wide role see every unit or narrow to one', async () => {
      const all = bodyOf<TimesheetBody>(
        await get(
          't23_ward',
          `/attendance/timesheet?month=${month}&limit=100`,
        ).expect(200),
      );
      expect(onlyT23(all.data).map((r) => r.militiaCode)).toEqual([
        'DQ-T23-A1',
        'DQ-T23-A2',
        'DQ-T23-B1',
      ]);
      const b = bodyOf<TimesheetBody>(
        await get(
          't23_ward',
          `/attendance/timesheet?from=${day(1)}&to=${day(10)}&unitCode=KV-T23-B`,
        ).expect(200),
      );
      expect(b.data.map((r) => r.militiaCode)).toEqual(['DQ-T23-B1']);
      expect(b.dates).toHaveLength(10);
    });

    it('limits a CA officer to the DQTV assigned to them', async () => {
      const body = bodyOf<TimesheetBody>(
        await get('t23_ca_a', `/attendance/timesheet?month=${month}`).expect(
          200,
        ),
      );
      expect(body.data.map((r) => r.militiaCode)).toEqual(['DQ-T23-A1']);
    });

    it('limits a militia member to themselves', async () => {
      const body = bodyOf<TimesheetBody>(
        await get(
          't23_dqtv_b',
          `/attendance/timesheet?month=${month}&unitCode=KV-T23-A`,
        ).expect(200),
      );
      expect(body.data.map((r) => r.militiaCode)).toEqual(['DQ-T23-B1']);
      expect(body.data[0].days.find((d) => d.date === day(2))).toMatchObject({
        status: 'present',
      });
    });

    it('refuses roles without timesheet access', async () => {
      await get('t23_leader', `/attendance/timesheet?month=${month}`).expect(
        403,
      );
    });

    it.each<[string, string]>([
      ['month=2026-13', 'invalid_month'],
      [`from=${day(1)}`, 'incomplete_date_range'],
      [
        `month=${month}&from=${day(1)}&to=${day(2)}`,
        'month_conflicts_with_range',
      ],
      ['from=2026-01-01&to=2026-03-04', 'date_range_too_long'],
      ['from=2026-03-02&to=2026-03-01', 'invalid_date_range'],
      ['from=2026-02-30&to=2026-03-01', 'invalid_date'],
    ])('refuses %s with 400 %s', async (query, code) => {
      const res = await get('admin', `/attendance/timesheet?${query}`).expect(
        400,
      );
      expect(messageOf(res)).toBe(code);
    });
  });

  // ── /devices/sessions ─────────────────────────────────────────────────────────

  describe('/devices/sessions', () => {
    let current: string;
    let phone: string;

    beforeAll(async () => {
      current = await login('t23_sessions', passwords.t23_sessions);
      phone = await login('t23_sessions', passwords.t23_sessions);
    });

    const sessionsOf = async (token: string, query = '') =>
      bodyOf<{
        data: { id: string; current: boolean; deviceName: string }[];
        total: number;
      }>(
        await api()
          .get(url(`/devices/sessions${query}`))
          .set({ Authorization: `Bearer ${token}` })
          .expect(200),
      );

    it('lists the caller live sessions with the one in use marked first', async () => {
      const body = await sessionsOf(current);
      expect(body.total).toBe(3);
      expect(body.data[0]).toMatchObject({ id: sidOf(current), current: true });
      expect(body.data.filter((s) => s.current)).toHaveLength(1);
      expect(body.data.map((s) => s.id)).toEqual(
        expect.arrayContaining([sidOf(phone), sidOf(tokens.t23_sessions)]),
      );
    });

    it('signs one device out at once, audited, and answers 404 afterwards', async () => {
      await api()
        .delete(url(`/devices/sessions/${sidOf(phone)}`))
        .set({ Authorization: `Bearer ${current}` })
        .expect(204);

      const refused = await api()
        .get(url('/devices/sessions'))
        .set({ Authorization: `Bearer ${phone}` })
        .expect(401);
      expect(messageOf(refused)).toBe('session_revoked');

      await api()
        .delete(url(`/devices/sessions/${sidOf(phone)}`))
        .set({ Authorization: `Bearer ${current}` })
        .expect(404);
      const audit = await db(async (c) => {
        const { rows } = await c.query<{ actor_id: string }>(
          `SELECT actor_id FROM audit_logs WHERE action = 'session.revoked' AND entity_id = $1`,
          [sidOf(phone)],
        );
        return rows;
      });
      expect(audit).toEqual([{ actor_id: userIds.t23_sessions }]);
    });

    it('never reaches another user sessions', async () => {
      await api()
        .delete(url(`/devices/sessions/${sidOf(tokens.t23_staff_a)}`))
        .set({ Authorization: `Bearer ${current}` })
        .expect(404);
      await get('t23_staff_a', '/devices/sessions').expect(200);
      await api()
        .get(url(`/devices/sessions?userId=${userIds.t23_staff_a}`))
        .set({ Authorization: `Bearer ${current}` })
        .expect(403);
      await api()
        .delete(url('/devices/sessions/not-a-uuid'))
        .set({ Authorization: `Bearer ${current}` })
        .expect(400);
    });

    it('lets a system admin read another user sessions', async () => {
      const body = await sessionsOf(
        tokens.admin,
        `?userId=${userIds.t23_sessions}`,
      );
      expect(body.total).toBe(2);
      expect(body.data.every((s) => !s.current)).toBe(true);
    });

    it('signs every other device out and keeps the current one', async () => {
      const res = await api()
        .post(url('/devices/sessions/revoke-others'))
        .set({ Authorization: `Bearer ${current}` })
        .expect(200);
      expect(bodyOf(res)).toEqual({ revoked: 1 });

      await get('t23_sessions', '/devices/sessions').expect(401);
      const body = await sessionsOf(current);
      expect(body.data.map((s) => s.id)).toEqual([sidOf(current)]);
    });
  });

  // ── GET /reports/custom ───────────────────────────────────────────────────────

  describe('GET /reports/custom', () => {
    type Report = {
      unitCode: string | null;
      rows: Body[];
      summary: { key: string; value: unknown }[];
      truncated: boolean;
      rowCount: number;
    };
    const range = `from=${monthFrom}&to=${monthTo}`;
    const summaryValue = (report: Report, key: string) =>
      report.summary.find((s) => s.key === key)?.value;

    it('reports attendance of the caller unit only', async () => {
      const report = bodyOf<Report>(
        await get(
          't23_staff_a',
          `/reports/custom?dataset=attendance&${range}&groupBy=unit&unitCode=KV-T23-B`,
        ).expect(200),
      );
      expect(report.unitCode).toBe('KV-T23-A');
      expect(report.rows.map((r) => r.unitCode)).toEqual(['KV-T23-A']);
      expect(summaryValue(report, 'records')).toBe(3);
      expect(summaryValue(report, 'present')).toBe(1);
      expect(summaryValue(report, 'late')).toBe(1);
      expect(summaryValue(report, 'absent')).toBe(1);
    });

    it('lets a ward-wide role see every unit, filter a status and cap the rows', async () => {
      const all = bodyOf<Report>(
        await get(
          't23_ward',
          `/reports/custom?dataset=attendance&${range}&groupBy=unit`,
        ).expect(200),
      );
      expect(all.rows.map((r) => r.unitCode)).toEqual(
        expect.arrayContaining(['KV-T23-A', 'KV-T23-B']),
      );

      const late = bodyOf<Report>(
        await get(
          't23_ward',
          `/reports/custom?dataset=attendance&${range}&status=late`,
        ).expect(200),
      );
      expect(summaryValue(late, 'records')).toBe(1);

      const capped = bodyOf<Report>(
        await get(
          't23_ward',
          `/reports/custom?dataset=attendance&${range}&groupBy=member&limit=1`,
        ).expect(200),
      );
      expect(capped).toMatchObject({ rowCount: 1, truncated: true });
    });

    it('runs every breakdown of every dataset against the real schema', async () => {
      for (const dataset of CUSTOM_REPORT_DATASETS) {
        for (const groupBy of supportedGroupings(dataset)) {
          const res = await get(
            't23_ward',
            `/reports/custom?dataset=${dataset}&${range}&groupBy=${groupBy}`,
          );
          expect({ dataset, groupBy, status: res.status }).toEqual({
            dataset,
            groupBy,
            status: 200,
          });
        }
      }
    });

    it('reads KPI, task and payroll figures of the scope', async () => {
      const kpi = bodyOf<Report>(
        await get('t23_staff_a', `/reports/custom?dataset=kpi&${range}`).expect(
          200,
        ),
      );
      expect(summaryValue(kpi, 'evaluations')).toBe(2);
      expect(summaryValue(kpi, 'averageScore')).toBe(82.5);

      const payroll = bodyOf<Report>(
        await get(
          't23_staff_a',
          `/reports/custom?dataset=payroll&${range}`,
        ).expect(200),
      );
      expect(summaryValue(payroll, 'netSalary')).toBe(2500000);

      const tasks = bodyOf<Report>(
        await get(
          't23_staff_a',
          `/reports/custom?dataset=tasks&from=${today}&to=${today}&groupBy=assignee`,
        ).expect(200),
      );
      expect(summaryValue(tasks, 'tasks')).toBe(3);
      expect(tasks.rows).toHaveLength(2);
    });

    it('exports the report as xlsx', async () => {
      const res = await get(
        't23_staff_a',
        `/reports/custom/export?dataset=attendance&${range}&groupBy=member`,
      ).expect(200);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    // The global filter answers DTO failures as validation_failed with the constraint
    // messages in `errors`; the report definitions answer with their own code
    it.each<[string, string, string | null]>([
      ['', 'validation_failed', 'invalid_dataset'],
      ['dataset=users', 'validation_failed', 'invalid_dataset'],
      [
        'type=attendance',
        'validation_failed',
        'property type should not exist',
      ],
      ['dataset=kpi&limit=5001', 'validation_failed', 'invalid_limit'],
      ['dataset=kpi&from=2026-02-30', 'validation_failed', 'invalid_date'],
      ['dataset=payroll&groupBy=priority', 'group_by_not_supported', null],
      ['dataset=attendance&status=approved', 'status_not_supported', null],
      [
        'dataset=kpi&from=2025-01-01&to=2026-01-02',
        'date_range_too_long',
        null,
      ],
    ])('refuses ?%s with 400 %s', async (query, code, error) => {
      const res = await get('admin', `/reports/custom?${query}`).expect(400);
      expect(messageOf(res)).toBe(code);
      if (error) {
        expect(bodyOf<{ errors: string[] }>(res).errors).toContain(error);
      }
    });

    it('refuses militia members', async () => {
      await get('t23_dqtv_a', '/reports/custom?dataset=attendance').expect(403);
    });
  });

  // ── GET /tasks/report ─────────────────────────────────────────────────────────

  describe('GET /tasks/report', () => {
    type Report = {
      unitCode: string | null;
      totals: Record<string, number>;
      byUnit: Body[];
      byAssignee: { data: { userId: string; total: number }[]; total: number };
      byMonth: { month: string }[];
    };

    it('counts the tasks of the caller unit, a task without a unit by its assignee', async () => {
      const report = bodyOf<Report>(
        await get('t23_staff_a', '/tasks/report?unitCode=KV-T23-B').expect(200),
      );
      expect(report.unitCode).toBe('KV-T23-A');
      expect(report.totals).toEqual({
        total: 3,
        pending: 0,
        assigned: 0,
        inProgress: 1,
        completed: 1,
        cancelled: 1,
        overdue: 1,
        completionRate: 50,
      });
      expect(report.byUnit).toEqual([
        expect.objectContaining({ unitCode: 'KV-T23-A', total: 3 }),
      ]);
      expect(report.byMonth).toHaveLength(12);
      expect(report.byAssignee.data).toEqual([
        expect.objectContaining({ userId: userIds.t23_dqtv_a, total: 2 }),
        expect.objectContaining({ userId: userIds.t23_dqtv_a2, total: 1 }),
      ]);
    });

    // The task readers of GET /tasks: system_admin is the ward-wide one, police_ward is not one
    it('lets system_admin see every unit or narrow to one', async () => {
      const all = bodyOf<Report>(
        await get('admin', '/tasks/report').expect(200),
      );
      expect(all.totals.total).toBe(4);
      await get('t23_ward', '/tasks/report').expect(403);
      const b = bodyOf<Report>(
        await get('admin', '/tasks/report?unitCode=KV-T23-B').expect(200),
      );
      expect(b.totals.total).toBe(1);
    });

    it('limits a CA officer to their assigned DQTV and a member to themselves', async () => {
      const ca = bodyOf<Report>(
        await get('t23_ca_a', '/tasks/report').expect(200),
      );
      expect(ca.totals.total).toBe(2);
      expect(ca.byAssignee.data.map((a) => a.userId)).toEqual([
        userIds.t23_dqtv_a,
      ]);

      const member = bodyOf<Report>(
        await get('t23_dqtv_b', '/tasks/report').expect(200),
      );
      expect(member.totals.total).toBe(1);
      expect(member.byAssignee.data.map((a) => a.userId)).toEqual([
        userIds.t23_dqtv_b,
      ]);
    });

    it('validates the range and the role', async () => {
      const long = await get(
        'admin',
        '/tasks/report?from=2025-01-01&to=2026-06-30',
      ).expect(400);
      expect(messageOf(long)).toBe('date_range_too_long');
      const bad = await get('admin', '/tasks/report?from=junk').expect(400);
      expect(messageOf(bad)).toBe('invalid_date');
      await get('t23_area_b', '/tasks/report').expect(403);
    });
  });

  // ── GET /kpi/dashboard ────────────────────────────────────────────────────────

  describe('GET /kpi/dashboard', () => {
    type Dashboard = {
      period: Body;
      unitCode: string | null;
      memberCount: number;
      evaluatedCount: number;
      averageScore: number | null;
      distribution: { grade: string; count: number }[];
      byUnit: { unitCode: string; averageScore: number | null }[];
      top: Body[];
      bottom: Body[];
      trend: Body[];
      targets: Body;
      metrics: { key: string; current: number | null; target: number }[];
      recommendations: { recommendation: string; count: number }[];
    };

    it('grades the members of the caller unit for a month, against the targets then in force', async () => {
      const dashboard = bodyOf<Dashboard>(
        await get(
          't23_staff_a',
          `/kpi/dashboard?year=${year}&month=${monthNumber}&unitCode=KV-T23-B`,
        ).expect(200),
      );
      expect(dashboard.unitCode).toBe('KV-T23-A');
      expect(dashboard).toMatchObject({
        memberCount: 2,
        evaluatedCount: 2,
        averageScore: 82.5,
      });
      expect(
        Object.fromEntries(
          dashboard.distribution.map((d) => [d.grade, d.count]),
        ),
      ).toEqual({ excellent: 1, good: 0, fair: 1, needs_improvement: 0 });
      expect(dashboard.top[0]).toMatchObject({
        fullName: 'Nguyễn Văn An',
        score: 95,
        grade: 'excellent',
      });
      expect(dashboard.bottom[0]).toMatchObject({ score: 70, grade: 'fair' });
      expect(dashboard.trend).toHaveLength(6);
      // the targets set today were not in force last month
      expect(dashboard.targets).toMatchObject({ isDefault: true });
      expect(
        dashboard.metrics.find((m) => m.key === 'attendanceDays'),
      ).toMatchObject({
        current: 1,
        target: 22,
      });
      expect(
        dashboard.recommendations
          .filter((r) => r.count > 0)
          .map((r) => r.recommendation),
      ).toEqual(['reward', 'maintain']);
    });

    it('lets a ward-wide role compare units, and reads the current month by default', async () => {
      const dashboard = bodyOf<Dashboard>(
        await get(
          't23_ward',
          `/kpi/dashboard?year=${year}&month=${monthNumber}`,
        ).expect(200),
      );
      expect(dashboard.byUnit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unitCode: 'KV-T23-A', averageScore: 82.5 }),
          expect.objectContaining({ unitCode: 'KV-T23-B', averageScore: 50 }),
        ]),
      );

      const current = bodyOf<Dashboard>(
        await get('t23_staff_a', '/kpi/dashboard').expect(200),
      );
      expect(current.period).toMatchObject({ year: Number(today.slice(0, 4)) });
      expect(current.evaluatedCount).toBe(0);
      expect(current.targets).toMatchObject({
        isDefault: false,
        minAttendanceDays: 20,
      });
      expect(
        current.metrics.find((m) => m.key === 'tasksCompleted'),
      ).toMatchObject({
        current: 0.5,
        target: 8,
      });
    });

    it('reads the month of a payroll period', async () => {
      const dashboard = bodyOf<Dashboard>(
        await get(
          't23_staff_a',
          `/kpi/dashboard?periodId=${payrollPeriodId}`,
        ).expect(200),
      );
      expect(dashboard.period).toMatchObject({
        year,
        month: monthNumber,
        periodId: payrollPeriodId,
      });
    });

    it.each<[string, number, string | null]>([
      [`periodId=PERIOD&year=2026`, 400, 'period_conflict'],
      ['year=2026', 400, 'incomplete_period'],
      ['year=2026&month=13', 400, 'invalid_month'],
      ['periodId=not-a-uuid', 400, null],
      [
        'periodId=00000000-0000-4000-8000-000000000000',
        404,
        'period_not_found',
      ],
    ])('answers ?%s with %i', async (query, status, code) => {
      const res = await get(
        'admin',
        `/kpi/dashboard?${query.replace('PERIOD', payrollPeriodId)}`,
      ).expect(status);
      if (code) expect(messageOf(res)).toBe(code);
    });

    it('refuses roles outside the KPI report readers', async () => {
      await get('t23_ca_a', '/kpi/dashboard').expect(403);
      await get('t23_dqtv_a', '/kpi/dashboard').expect(403);
    });
  });

  // ── GET /sos/alerts ───────────────────────────────────────────────────────────

  describe('GET /sos/alerts', () => {
    type Alerts = {
      data: {
        id: string;
        statusGroup: string;
        reporterName: string;
        reporterUnitCode: string;
      }[];
      total: number;
      counts: { active: number; resolved: number };
    };
    const idsOf = (body: Alerts) => body.data.map((a) => a.id);

    it('is not taken for /sos/:id, and limits unit staff to reporters of their unit', async () => {
      const body = bodyOf<Alerts>(
        await get('t23_staff_a', '/sos/alerts?unitCode=KV-T23-B').expect(200),
      );
      expect(idsOf(body)).toEqual([incidents.a_open, incidents.a_resolved]);
      expect(body.counts).toEqual({ active: 1, resolved: 1 });
      expect(body.data[0]).toMatchObject({
        statusGroup: 'active',
        reporterName: 'Cán bộ t23_dqtv_a',
        reporterUnitCode: 'KV-T23-A',
      });
    });

    it('puts the most severe active alert first for a ward-wide role, which may narrow to a unit', async () => {
      const all = bodyOf<Alerts>(
        await get('t23_ward', '/sos/alerts').expect(200),
      );
      expect(idsOf(all)).toEqual([
        incidents.b_open,
        incidents.a_open,
        incidents.a_resolved,
      ]);
      const b = bodyOf<Alerts>(
        await get('t23_ward', '/sos/alerts?unitCode=KV-T23-B').expect(200),
      );
      expect(idsOf(b)).toEqual([incidents.b_open]);
    });

    it('limits a CA officer to their assigned DQTV and a member to their own alerts', async () => {
      const ca = bodyOf<Alerts>(
        await get('t23_ca_a', '/sos/alerts').expect(200),
      );
      expect(idsOf(ca)).toEqual([incidents.a_open, incidents.a_resolved]);
      const member = bodyOf<Alerts>(
        await get('t23_dqtv_b', '/sos/alerts?unitCode=KV-T23-A').expect(200),
      );
      expect(idsOf(member)).toEqual([incidents.b_open]);
    });

    it('filters by status group and severity, and validates both', async () => {
      const active = bodyOf<Alerts>(
        await get('t23_staff_a', '/sos/alerts?status=active').expect(200),
      );
      expect(idsOf(active)).toEqual([incidents.a_open]);
      expect(active.counts).toEqual({ active: 1, resolved: 1 });
      const resolved = bodyOf<Alerts>(
        await get('t23_staff_a', '/sos/alerts?status=resolved').expect(200),
      );
      expect(idsOf(resolved)).toEqual([incidents.a_resolved]);
      const urgent = bodyOf<Alerts>(
        await get('t23_ward', '/sos/alerts?severity=urgent').expect(200),
      );
      expect(idsOf(urgent)).toEqual([incidents.b_open]);

      expect(
        messageOf(await get('admin', '/sos/alerts?status=bogus').expect(400)),
      ).toBe('invalid_status');
      expect(
        messageOf(await get('admin', '/sos/alerts?severity=x').expect(400)),
      ).toBe('invalid_severity');
    });

    it('refuses roles that do not read SOS alerts', async () => {
      await get('t23_leader', '/sos/alerts').expect(403);
    });
  });

  // ── Migration 029 ─────────────────────────────────────────────────────────────

  describe('migration 029', () => {
    const sql = fs.readFileSync(MIGRATION_029, 'utf8');

    it('runs again over its own tables without complaint', async () => {
      await expect(db((c) => c.query(sql))).resolves.toBeDefined();
    });

    it.each<[string, string, RegExp]>([
      [
        'a changed default',
        `ALTER TABLE notification_preferences ALTER COLUMN sos_alerts SET DEFAULT false`,
        /notification_preferences\.sos_alerts has default false, expected true/,
      ],
      [
        'a loosened range',
        `ALTER TABLE kpi_target_settings DROP CONSTRAINT chk_kpi_target_settings_max_overdue_tasks`,
        /has no CHECK constraint chk_kpi_target_settings_max_overdue_tasks/,
      ],
      [
        'a different index',
        `DROP INDEX idx_kpi_target_settings_effective;
         CREATE INDEX idx_kpi_target_settings_effective ON kpi_target_settings (effective_from)`,
        /idx_kpi_target_settings_effective is CREATE INDEX/,
      ],
    ])('refuses to adopt tables with %s', async (_label, change, problem) => {
      await expect(
        db(async (c) => {
          await c.query('BEGIN');
          try {
            await c.query(change);
            await c.query(sql);
          } finally {
            await c.query('ROLLBACK');
          }
        }),
      ).rejects.toThrow(problem);
    });
  });
});

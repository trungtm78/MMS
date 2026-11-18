// SOS alerts and tasks on the running backend, on a freshly migrated Postgres: every route acts
// as its caller, reaching only the records of their scope (anything else answers like a
// missing record), and records move only through the states that still apply.
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5440/postgres
// The environment module comes first: AppModule reads its configuration when it is loaded.
import {
  E2E_ADMIN_URL,
  E2E_API_PREFIX,
  E2E_DB_NAME,
  E2E_DB_URL,
} from './support/app-env';
import type { Server } from 'http';
import * as path from 'path';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { withClient } from './support/db';

jest.setTimeout(180_000);

describe('Scoped SOS alerts and tasks (e2e)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  const api = () => request(app.getHttpServer() as Server);
  const url = (route: string) => `/${E2E_API_PREFIX}${route}`;
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const db = <T>(work: Parameters<typeof withClient<T>>[1]) =>
    withClient(E2E_DB_URL, work);

  const login = async (username: string, password: string) => {
    const res = await api()
      .post(url('/auth/login'))
      .send({ username, password })
      .expect(200);
    return (res.body as { tokens: { accessToken: string } }).tokens.accessToken;
  };

  const ensureUnit = (code: string) =>
    db((c) =>
      c.query(
        `INSERT INTO units (code, name, type) VALUES ($1, $1, 'area')
         ON CONFLICT (code) DO NOTHING`,
        [code],
      ),
    );

  const account = async (username: string, role: string, unitCode?: string) => {
    if (unitCode) await ensureUnit(unitCode);
    const created = await api()
      .post(url('/admin/users'))
      .set(auth('admin'))
      .send({
        username,
        fullName: username,
        role,
        ...(unitCode ? { unitCode } : {}),
      })
      .expect(201);
    const body = created.body as { id: string; temporaryPassword: string };
    userIds[username] = body.id;
    tokens[username] = await login(username, body.temporaryPassword);
  };

  // A militia profile for a member account, in the member's unit
  const profileOf = (
    username: string,
    code: string,
    cccd: string,
    unitCode: string,
  ) =>
    db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
         SELECT $1, $2, $3, '1999-05-05', id, '2023-05-05', $4
         FROM units WHERE code = $5
         RETURNING id`,
        [code, username, cccd, userIds[username], unitCode],
      );
      return rows[0].id;
    });

  beforeAll(async () => {
    await withClient(E2E_ADMIN_URL, (c) =>
      c.query(`CREATE DATABASE ${E2E_DB_NAME}`),
    );
    await migrateDatabase({
      connectionString: E2E_DB_URL,
      directory: path.join(__dirname, '..', 'migrations'),
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.init();

    // SeederService creates admin / Admin@123
    tokens.admin = await login('admin', 'Admin@123');
  });

  afterAll(async () => {
    await app?.close();
    await withClient(E2E_ADMIN_URL, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`),
    );
  });

  describe('SOS alerts', () => {
    beforeAll(async () => {
      await account('sos_reporter', 'dqtv', 'KV-SOS-A');
      await account('sos_staff_a', 'office_staff', 'KV-SOS-A');
      await account('sos_staff_b', 'office_staff', 'KV-SOS-B');
      await account('sos_ward', 'police_ward');
      await account('sos_ca', 'ca_officer', 'KV-SOS-A');
    });

    const raise = (body: Record<string, unknown> = {}) =>
      api()
        .post(url('/sos'))
        .set(auth('sos_reporter'))
        .send({
          incidentType: 'sos',
          severity: 'urgent',
          title: 'Cần hỗ trợ',
          ...body,
        });

    // T23 agent: POST /sos never wrote the required code and message columns
    it('raises an alert with a readable code and an empty message when none is written', async () => {
      const res = await raise().expect(201);

      expect(res.body).toEqual(
        expect.objectContaining({
          code: expect.stringMatching(
            /^SOS-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/,
          ) as unknown,
          message: '',
          status: 'open',
        }),
      );
    });

    it('refuses an incident type or coordinates the incidents table does not accept', async () => {
      await raise({ incidentType: 'earthquake' }).expect(400);
      await raise({ lat: 91 }).expect(400);
    });

    // T23 agent: GET /sos and GET /sos/:id showed every unit's alerts to any reader
    it('shows an alert only to the responders of its reporter', async () => {
      const { id } = (await raise().expect(201)).body as { id: string };
      const read = (who: string) =>
        api()
          .get(url(`/sos/${id}`))
          .set(auth(who));

      await read('sos_staff_a').expect(200);
      await read('sos_ward').expect(200);
      await read('sos_staff_b').expect(404);
      // A CA officer reaches only the DQTV assigned to them
      await read('sos_ca').expect(404);

      const listed = await api()
        .get(url('/sos'))
        .set(auth('sos_staff_b'))
        .expect(200);
      expect(
        (listed.body as { data: { id: string }[] }).data.map((a) => a.id),
      ).not.toContain(id);

      await api()
        .get(url('/sos/not-a-uuid'))
        .set(auth('sos_staff_a'))
        .expect(400);
    });

    it('moves an alert through its lifecycle, keeping when it was resolved, and never reopens a closed one', async () => {
      const { id } = (await raise().expect(201)).body as { id: string };
      const move = (who: string, status: string) =>
        api()
          .patch(url(`/sos/${id}/status`))
          .set(auth(who))
          .send({ status });

      await move('sos_ward', 'acknowledged').expect(200);
      const resolved = (await move('sos_ward', 'resolved').expect(200))
        .body as { resolvedAt: string };
      expect(resolved.resolvedAt).toEqual(expect.any(String));
      const closed = (await move('sos_ward', 'closed').expect(200)).body as {
        resolvedAt: string;
      };
      expect(closed.resolvedAt).toBe(resolved.resolvedAt);

      await move('sos_ward', 'responding').expect(409);
      // Outside the responder's scope it answers like a missing alert
      await move('sos_ca', 'responding').expect(404);
    });
  });

  describe('tasks', () => {
    let memberProfileId: string;

    beforeAll(async () => {
      await account('task_staff_a', 'office_staff', 'KV-TSK-A');
      await account('task_staff_b', 'office_staff', 'KV-TSK-B');
      await account('task_ca', 'ca_officer', 'KV-TSK-A');
      await account('task_member', 'dqtv', 'KV-TSK-A');
      await account('task_other', 'dqtv', 'KV-TSK-A');
      memberProfileId = await profileOf(
        'task_member',
        'DQ-TSK-1',
        '079202800001',
        'KV-TSK-A',
      );
      await profileOf('task_other', 'DQ-TSK-2', '079202800002', 'KV-TSK-A');
    });

    const createTask = (who: string, body: Record<string, unknown> = {}) =>
      api()
        .post(url('/tasks'))
        .set(auth(who))
        .send({
          title: 'Tuần tra khu vực',
          assigneeMilitiaId: memberProfileId,
          ...body,
        });
    const newTask = async (body: Record<string, unknown> = {}) =>
      (
        (await createTask('task_staff_a', body).expect(201)).body as {
          id: string;
        }
      ).id;

    // The controller never passed the caller's role, so no creator scope was ever checked
    it('lets staff give a task only to a member of their scope', async () => {
      const created = await createTask('task_staff_a').expect(201);
      expect(created.body).toEqual(
        expect.objectContaining({
          code: expect.stringMatching(
            /^TASK-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/,
          ) as unknown,
          status: 'pending',
        }),
      );

      await createTask('task_staff_b').expect(404);
      // A CA officer without assigned DQTV reaches nobody
      await createTask('task_ca').expect(404);
    });

    // Flutter agent: GET /tasks and GET /tasks/:id showed every unit's tasks to any reader
    it('shows a task only inside the caller scope, one row per task', async () => {
      const id = await newTask();
      const read = (who: string) =>
        api()
          .get(url(`/tasks/${id}`))
          .set(auth(who));

      await read('task_staff_a').expect(200);
      await read('task_member').expect(200);
      await read('task_staff_b').expect(404);
      await read('task_other').expect(404);

      const ids = async (who: string) =>
        (
          (await api().get(url('/tasks')).set(auth(who)).expect(200)).body as {
            data: { id: string }[];
          }
        ).data.map((t) => t.id);
      const staffIds = await ids('task_staff_a');
      expect(staffIds.filter((taskId) => taskId === id)).toHaveLength(1);
      expect(await ids('task_staff_b')).not.toContain(id);

      await api()
        .get(url('/tasks/not-a-uuid'))
        .set(auth('task_staff_a'))
        .expect(400);
    });

    // Flutter agent: accept silently did nothing, progress set any status, and a report
    // completed even a cancelled task
    it('moves a task only through the states that still apply', async () => {
      const id = await newTask();
      const act = (who: string, route: string, body?: object) =>
        api()
          .post(url(`/tasks/${id}${route}`))
          .set(auth(who))
          .send(body);
      const progress = (body: object) =>
        api()
          .patch(url(`/tasks/${id}/progress`))
          .set(auth('task_member'))
          .send(body);

      await progress({ progress: 100, status: 'completed' }).expect(400);
      await act('task_other', '/accept').expect(404);
      const accepted = await act('task_member', '/accept').expect(200);
      expect((accepted.body as { status: string }).status).toBe('in_progress');
      await act('task_member', '/accept').expect(409);

      await progress({ progress: 60 }).expect(200);
      await act('task_member', '/report', {
        description: 'Đã hoàn thành tuần tra',
      }).expect(201);
      await progress({ progress: 100 }).expect(409);
      await act('task_member', '/report', {
        description: 'Báo cáo lần hai',
      }).expect(409);
    });

    // The reason DELETE /tasks/:id requires was discarded
    it('keeps who cancelled a task and why, and closes it for its assignee', async () => {
      const id = await newTask();

      await api()
        .delete(url(`/tasks/${id}`))
        .set(auth('admin'))
        .send({ reason: 'Không còn cần thiết' })
        .expect(204);

      const stored = await db(async (c) => {
        const { rows } = await c.query<{
          status: string;
          cancel_reason: string;
          cancelled_by_admin: boolean;
          cancelled: boolean;
        }>(
          `SELECT t.status, t.cancel_reason,
                  t.cancelled_by = (SELECT id FROM users WHERE username = 'admin') AS cancelled_by_admin,
                  t.cancelled_at IS NOT NULL AS cancelled
           FROM tasks t WHERE t.id = $1`,
          [id],
        );
        return rows[0];
      });
      expect(stored).toEqual({
        status: 'cancelled',
        cancel_reason: 'Không còn cần thiết',
        cancelled_by_admin: true,
        cancelled: true,
      });

      await api()
        .post(url(`/tasks/${id}/report`))
        .set(auth('task_member'))
        .send({ description: 'Đã làm xong' })
        .expect(409);
      await api()
        .delete(url(`/tasks/${id}`))
        .set(auth('admin'))
        .send({ reason: 'Lần nữa' })
        .expect(409);
    });

    // Flutter agent: nothing stores "overdue", so filtering on it found nothing
    it('lists open tasks past their deadline as overdue', async () => {
      const id = await newTask({ deadline: '2020-01-01T00:00:00Z' });

      const listed = await api()
        .get(url('/tasks'))
        .query({ status: 'overdue' })
        .set(auth('task_staff_a'))
        .expect(200);

      expect(
        (listed.body as { data: { id: string; overdue: boolean }[] }).data,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id, overdue: true }),
        ]),
      );
    });
  });
});

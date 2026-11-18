// Two tenants on the running backend as the runtime role mms_app (TENANCY_MODE=enforced).
// Requires MIGRATION_TEST_ADMIN_URL, TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import { E2E_UPLOAD_DIR } from './support/enforced-env';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { LOGIN_FAILURE_LIMIT } from '../src/auth/login-attempts.service';
import { FilesService } from '../src/files/files.service';
import {
  ADMIN_PASSWORD,
  createTenantDatabase,
  seedTenant,
  seededFilePath,
  writeSeededFile,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';
import { eventually } from './support/eventually';

jest.setTimeout(240_000);

interface SignedIn {
  tokens: { accessToken: string; refreshToken: string };
}

const withoutClaim = (claims: Record<string, unknown>, claim: string) =>
  Object.fromEntries(Object.entries(claims).filter(([name]) => name !== claim));

const claimsOf = (token: string) =>
  JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString(),
  ) as Record<string, unknown>;

describe('tenant slice (e2e)', () => {
  // Created and exported to UPLOAD_DIR by enforced-env.ts
  const uploadDir = E2E_UPLOAD_DIR;
  let db: TenantDatabase;
  let app: INestApplication;
  let baseUrl: string;
  let a: SeededTenant;
  let b: SeededTenant;
  const tokens: Record<string, string> = {};

  // Over the real socket the backend listens on, like a client would
  const api = () => request(baseUrl);
  const url = (route: string) => `/${E2E_API_PREFIX}${route}`;
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const canaryOf = (tenant: SeededTenant) =>
    tenant === a ? 'CANARY-A' : 'CANARY-B';

  // The error filter stamps every body with the time of the answer
  const withoutTimestamp = (body: unknown) =>
    Object.fromEntries(
      Object.entries(body as Record<string, unknown>).filter(
        ([field]) => field !== 'timestamp',
      ),
    );

  const login = (
    tenantCode: string | undefined,
    username: string,
    password = ADMIN_PASSWORD,
  ) => api().post(url('/auth/login')).send({ tenantCode, username, password });

  // A token signed with the real secret from the claims of an issued one, `change`d
  const forge = (
    issued: string,
    secret: string | undefined,
    change: (claims: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const claims = Object.fromEntries(
      Object.entries(claimsOf(issued)).filter(
        ([claim]) => !['iat', 'exp'].includes(claim),
      ),
    );
    return app
      .get(JwtService)
      .sign(change(claims), { secret, expiresIn: '5m' });
  };

  const signIn = async (tenantCode: string, username: string) =>
    (await login(tenantCode, username).expect(200)).body as SignedIn;

  beforeAll(async () => {
    // The database the backend will connect to (as mms_app) is the one app-env.ts names
    db = await createTenantDatabase({ name: E2E_DB_NAME });
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    // A download needs its content on disk, or every answer is 404 for any caller
    writeSeededFile(uploadDir, a);
    writeSeededFile(uploadDir, b);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;

    tokens.a = (await signIn('phu-dinh', a.adminUsername)).tokens.accessToken;
    tokens.b = (await signIn('tenant-b', b.adminUsername)).tokens.accessToken;
  });

  afterAll(async () => {
    // Whatever fails first, the database is dropped and the upload directory removed
    try {
      await app?.close();
    } finally {
      try {
        await db?.drop();
      } finally {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      }
    }
  });

  describe('sign-in', () => {
    it('signs a user in only through the tenant they belong to', async () => {
      await login('tenant-b', a.adminUsername).expect(401);
      await login('phu-dinh', b.adminUsername).expect(401);
    });

    it('answers an unknown tenant like a wrong password', async () => {
      const wrongPassword = await login(
        'phu-dinh',
        a.adminUsername,
        'Wrong@12345',
      ).expect(401);
      const unknownTenant = await login(
        'no-such-tenant',
        a.adminUsername,
      ).expect(401);
      expect(withoutTimestamp(unknownTenant.body)).toEqual(
        withoutTimestamp(wrongPassword.body),
      );
    });

    it('asks for the tenant code when none is given', async () => {
      const res = await login(undefined, a.adminUsername).expect(400);
      expect(JSON.stringify(res.body)).toContain('tenant_code_required');
    });

    it('issues access and refresh tokens that name the tenant', async () => {
      const { tokens: issued } = await signIn('phu-dinh', a.adminUsername);

      expect(claimsOf(issued.accessToken).tid).toBe(a.id);
      expect(claimsOf(issued.refreshToken).tid).toBe(a.id);
    });

    it('refreshes a session inside its own tenant', async () => {
      const { tokens: issued } = await signIn('phu-dinh', a.adminUsername);

      const res = await api()
        .post(url('/auth/refresh'))
        .send({ refreshToken: issued.refreshToken })
        .expect(200);
      expect(claimsOf((res.body as SignedIn['tokens']).accessToken).tid).toBe(
        a.id,
      );
    });

    it('opens the session of the token, and only of the token tenant', async () => {
      const mine = await api().get(url('/auth/me')).set(auth('a')).expect(200);
      expect((mine.body as { username: string }).username).toBe(
        a.adminUsername,
      );
      const theirs = await api()
        .get(url('/auth/me'))
        .set(auth('b'))
        .expect(200);
      expect((theirs.body as { username: string }).username).toBe(
        b.adminUsername,
      );
    });

    it('refuses an access token that names no tenant', async () => {
      const untenanted = forge(tokens.a, process.env.JWT_SECRET, (claims) =>
        withoutClaim(claims, 'tid'),
      );

      await api()
        .get(url('/auth/me'))
        .set({ Authorization: `Bearer ${untenanted}` })
        .expect(401);
    });

    // Replay across tenants: the session of tenant A's admin presented under tenant B.
    // The guard adopts B before it looks the session up, and B holds no such session.
    it('refuses the session of one tenant replayed under the tid of another', async () => {
      const replayed = forge(tokens.a, process.env.JWT_SECRET, (claims) => ({
        ...claims,
        tid: b.id,
      }));

      const res = await api()
        .get(url('/auth/me'))
        .set({ Authorization: `Bearer ${replayed}` })
        .expect(401);
      expect((res.body as { message: string }).message).toBe('session_revoked');
    });

    it('refuses a refresh token that names no tenant', async () => {
      const { tokens: issued } = await signIn('phu-dinh', a.adminUsername);
      const untenanted = forge(
        issued.refreshToken,
        process.env.JWT_REFRESH_SECRET,
        (claims) => withoutClaim(claims, 'tid'),
      );

      const res = await api()
        .post(url('/auth/refresh'))
        .send({ refreshToken: untenanted })
        .expect(401);
      expect((res.body as { message: string }).message).toBe(
        'invalid_refresh_token',
      );
    });

    // A tenant code that does not exist must cost an attacker exactly what a tenant that
    // does exist costs: the same failures counted against the name, so the lock after five
    // attempts shows up for both or for neither.
    it('answers an unknown tenant code like a known one through the whole lockout sequence', async () => {
      const attempts = LOGIN_FAILURE_LIMIT + 1;
      const sequence = async (tenantCode: string, username: string) => {
        const answers: { status: number; body: unknown }[] = [];
        for (let n = 0; n < attempts; n++) {
          const res = await login(tenantCode, username, 'Wrong@12345');
          answers.push({
            status: res.status,
            body: withoutTimestamp(res.body),
          });
        }
        return answers;
      };

      // Distinct names, so the two sequences do not share a counter
      const known = await sequence('phu-dinh', 'probe-known-code');
      const unknown = await sequence('no-such-tenant', 'probe-unknown-code');

      expect(known.map((r) => r.status)).toEqual([
        ...Array<number>(LOGIN_FAILURE_LIMIT).fill(401),
        403,
      ]);
      expect(unknown.map((r) => r.status)).toEqual(known.map((r) => r.status));
      expect(unknown.map((r) => r.body)).toEqual(known.map((r) => r.body));
    });
  });

  // Every GET route the slice serves to a tenant admin. The search terms match the canary
  // of BOTH tenants (users: "CANARY", units: "Unit CANARY-x"), so a search that ignored the
  // tenant would return the rows of the other one. The user search needs two characters.
  const GET_ROUTES = [
    '/tasks',
    '/militia',
    '/users/search?q=canary',
    '/units/search?q=unit',
    '/notifications',
    '/audit',
  ];

  // Keys a route may return that differ between two identical calls; add one here, with
  // a comment, only when a route really returns a clock value
  const VOLATILE_KEYS = new Set<string>([]);
  const stable = (value: unknown): unknown =>
    JSON.parse(
      JSON.stringify(value, (key, v: unknown) =>
        VOLATILE_KEYS.has(key) ? null : v,
      ),
    );

  const snapshot = async (who: string) =>
    Promise.all(
      GET_ROUTES.map(async (route) => {
        const res = await api().get(url(route)).set(auth(who));
        return { route, status: res.status, body: stable(res.body) };
      }),
    );

  const binary = (
    res: request.Response,
    cb: (error: Error | null, body: Buffer) => void,
  ) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  const cellTexts = async (body: Buffer): Promise<string> => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    const texts: string[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        // cell.text is the shown text, whatever the cell holds (string, rich text, formula)
        row.eachCell((cell) => texts.push(cell.text)),
      ),
    );
    return texts.join('\n');
  };

  // The audit row of a request is written after its answer went out; it is found by the
  // request id the request carried, so no other request can be mistaken for it. It is not
  // found by `action`: the AuditInterceptor reads the path with the API prefix in it, so
  // under the real prefix every row says 'POST:api' instead of 'POST:tasks' (a defect that
  // predates tenancy, left to a separate audit task). When that task makes sensitive GETs
  // audited, those rows are also written after the answer: the `/audit` snapshot of the
  // differential test then needs a settle step before `before` is taken.
  const auditRowsOf = async (requestId: string) => {
    let rows: { tenant_id: string; actor_id: string }[] = [];
    await eventually(async () => {
      rows = await db.admin(
        async (c) =>
          (
            await c.query<{ tenant_id: string; actor_id: string }>(
              `SELECT tenant_id, actor_id FROM audit_logs WHERE request_id = $1`,
              [requestId],
            )
          ).rows,
      );
      return rows.length > 0;
    }, `the audit row of request ${requestId}`);
    return rows;
  };

  describe('HTTP guard chain', () => {
    it('serves every list route with the caller tenant data only', async () => {
      const results = await snapshot('a');
      expect(results.length).toBeGreaterThanOrEqual(5);
      for (const { route, status, body } of results) {
        expect({ route, status }).toEqual({ route, status: 200 });
        // Not an empty answer: the tenant's own rows are there, the other tenant's are not
        expect({
          route,
          ownRows: JSON.stringify(body).includes('CANARY-A'),
        }).toEqual({ route, ownRows: true });
        expect(JSON.stringify(body)).not.toContain('CANARY-B');
      }
      const tasks = results.find((r) => r.route === '/tasks');
      expect(JSON.stringify(tasks?.body)).toContain('CANARY-A');
    });

    // Each tenant opens its own record (200, with its own canary) and gets 404 for the same
    // kind of record of the other, in both directions. The owner answer is the control: a
    // 404 for the foreign id proves nothing when the owner would get 404 as well.
    describe.each([
      { name: 'A reads B', who: 'a', own: () => a, foreign: () => b },
      { name: 'B reads A', who: 'b', own: () => b, foreign: () => a },
    ])('by id ($name)', ({ who, own, foreign }) => {
      it('opens the own task, militia profile and file', async () => {
        const mine = own();
        const task = await api()
          .get(url(`/tasks/${mine.taskId}`))
          .set(auth(who))
          .expect(200);
        expect(JSON.stringify(task.body)).toContain(canaryOf(mine));
        const member = await api()
          .get(url(`/militia/${mine.memberId}`))
          .set(auth(who))
          .expect(200);
        expect(JSON.stringify(member.body)).toContain(canaryOf(mine));
        const file = await api()
          .get(url(`/files/${mine.fileId}`))
          .set(auth(who))
          .expect(200);
        expect(file.text).toBe(mine.fileBody);
      });

      it('answers 404, without a trace of the other tenant, for its task, militia profile and file', async () => {
        const theirs = foreign();
        for (const route of [
          `/tasks/${theirs.taskId}`,
          `/militia/${theirs.memberId}`,
          `/files/${theirs.fileId}`,
        ]) {
          const res = await api().get(url(route)).set(auth(who)).expect(404);
          const answer = JSON.stringify(res.body) + res.text;
          expect({ route, leaked: answer.includes(canaryOf(theirs)) }).toEqual({
            route,
            leaked: false,
          });
        }
      });
    });

    it('does not let a tenant point its own record at another tenant', async () => {
      const requestId = randomUUID();
      const res = await api()
        .post(url('/tasks'))
        .set(auth('a'))
        .set('X-Request-Id', requestId)
        .send({ title: 'Cross tenant', assigneeMilitiaId: b.memberId })
        .expect(404);
      expect(JSON.stringify(res.body)).toContain('militia_not_found');

      const created = await db.admin((c) =>
        c.query<{ id: string }>(`SELECT id FROM tasks WHERE title = $1`, [
          'Cross tenant',
        ]),
      );
      expect(created.rows).toEqual([]);
      // The refused request is on the audit trail of the tenant that made it
      expect(await auditRowsOf(requestId)).toEqual([
        { tenant_id: a.id, actor_id: a.adminId },
      ]);
    });

    it('leaves the answers of one tenant unchanged when another tenant changes (differential)', async () => {
      const before = await snapshot('a');
      // The comparison is not between two empty answers, whatever ran before this test
      expect(JSON.stringify(before)).toContain('CANARY-A');
      await db.admin((c) =>
        c.query(
          `INSERT INTO tasks (tenant_id, code, title, type, created_by)
           VALUES ($1, 'TASK-B-EXTRA', 'Task CANARY-B extra', 'patrol', $2)`,
          [b.id, b.adminId],
        ),
      );
      const requestId = randomUUID();
      await api()
        .post(url('/tasks'))
        .set(auth('b'))
        .set('X-Request-Id', requestId)
        .send({ title: 'CANARY-B created', assigneeMilitiaId: b.memberId })
        .expect(201);
      // Tenant B's audit row is written after the answer; let it land before comparing,
      // and see that it is B's
      expect(await auditRowsOf(requestId)).toEqual([
        { tenant_id: b.id, actor_id: b.adminId },
      ]);

      // The change is real: tenant B sees it ...
      const seenByB = await api().get(url('/tasks')).set(auth('b')).expect(200);
      expect(JSON.stringify(seenByB.body)).toContain('CANARY-B created');
      expect(JSON.stringify(seenByB.body)).toContain('CANARY-B extra');
      // ... and tenant A's answers did not move
      const after = await snapshot('a');
      expect(after).toEqual(before);
    });

    it('writes a created record and its audit row under the caller tenant', async () => {
      const requestId = randomUUID();
      const created = await api()
        .post(url('/tasks'))
        .set(auth('a'))
        .set('X-Request-Id', requestId)
        .send({ title: 'Audited task', assigneeMilitiaId: a.memberId })
        .expect(201);
      const id = (created.body as { id: string }).id;
      const rows = await db.admin(
        async (c) =>
          (
            await c.query<{ tenant_id: string }>(
              `SELECT tenant_id FROM tasks WHERE id = $1`,
              [id],
            )
          ).rows,
      );
      expect(rows).toEqual([{ tenant_id: a.id }]);
      // Written after the answer, outside the handler: it still belongs to the caller
      expect(await auditRowsOf(requestId)).toEqual([
        { tenant_id: a.id, actor_id: a.adminId },
      ]);
    });

    it('lets two tenants hold the same task code, but a tenant only once', async () => {
      const insert = (tenant: SeededTenant) =>
        db.admin((c) =>
          c.query(
            `INSERT INTO tasks (tenant_id, code, title, type, created_by)
             VALUES ($1, 'TASK-SHARED', 'x', 'patrol', $2)`,
            [tenant.id, tenant.adminId],
          ),
        );
      await insert(a);
      await insert(b);

      const held = await db.admin((c) =>
        c.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM tasks WHERE code = 'TASK-SHARED'`,
        ),
      );
      expect(held.rows.map((r) => r.tenant_id).sort()).toEqual(
        [a.id, b.id].sort(),
      );
      // The code is still unique inside one tenant
      await expect(insert(a)).rejects.toMatchObject({
        code: '23505',
        constraint: 'uq_tasks_tenant_code',
      });
    });

    // Rows that tie one tenant to the records of another: until composite foreign keys
    // exist (M1) the database accepts them, so row-level security of EACH table has to hold
    // them back. Every table a route reads is exercised on its own: a row of tenant B
    // that points at a record of A must not change what A sees, and a receipt of A that
    // points at a notification of B must not show it.
    it('is not changed by rows of another tenant that reference its records, nor by its rows that reference another tenant', async () => {
      // A receipt of A for a notification of B: its own row, the notification is not its
      await db.admin((c) =>
        c.query(
          `INSERT INTO notification_receipts (tenant_id, notification_id, user_id)
           VALUES ($1, $2, $3)`,
          [a.id, b.notificationId, a.adminId],
        ),
      );
      const before = await snapshot('a');
      expect(JSON.stringify(before)).toContain('CANARY-A');
      expect(JSON.stringify(before)).not.toContain('CANARY-B');

      await db.admin(async (c) => {
        // A militia profile of B in a unit of A (seen by /militia and its export)
        await c.query(
          `INSERT INTO militia_profiles (tenant_id, militia_code, full_name, cccd, dob, unit_id, join_date)
           VALUES ($1, 'DQ-BRIDGE', 'Bridge CANARY-B', '999999999999', '1990-01-01', $2, '2022-01-01')`,
          [b.id, a.unitId],
        );
        // An assignment of B on a task of A, the first one of that task (it would become
        // the assignee of the task in /tasks)
        await c.query(
          `INSERT INTO task_assignments (tenant_id, task_id, assignee_id, assigned_by, assigned_at)
           VALUES ($1, $2, $3, $4, '2000-01-01T00:00:00Z')`,
          [b.id, a.taskId, a.memberUserId, b.adminId],
        );
        // A receipt of B for a notification and a user of A (counted by /notifications);
        // the notification is a second one of A, which A itself has no receipt for
        const second = await c.query<{ id: string }>(
          `INSERT INTO notifications (tenant_id, type, title, body, sender_id)
           VALUES ($1, 'system', 'Second notice CANARY-A', 'x', $2) RETURNING id`,
          [a.id, a.adminId],
        );
        await c.query(
          `INSERT INTO notification_receipts (tenant_id, notification_id, user_id)
           VALUES ($1, $2, $3)`,
          [b.id, second.rows[0].id, a.adminId],
        );
      });

      const after = await snapshot('a');
      expect(after).toEqual(before);
    });
  });

  describe('exports', () => {
    it('contains only the rows of the caller tenant', async () => {
      const res = await api()
        .get(url('/militia/export?format=xlsx'))
        .set(auth('a'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      const text = await cellTexts(res.body as Buffer);
      expect(text).toContain('Member CANARY-A');
      expect(text).not.toContain('CANARY-B');
    });

    it('contains the rows of the other tenant for the other tenant', async () => {
      const res = await api()
        .get(url('/militia/export?format=xlsx'))
        .set(auth('b'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      const text = await cellTexts(res.body as Buffer);
      expect(text).toContain('Member CANARY-B');
      expect(text).not.toContain('CANARY-A');
    });
  });

  describe('files', () => {
    // Uploads take images, PDF and Office files only, so the canary rides in a PDF
    const pdf = (text: string) => `%PDF-1.4 ${text}`;
    const upload = (who: string, text: string) =>
      api()
        .post(url('/files/upload'))
        .set(auth(who))
        .attach('file', Buffer.from(pdf(text)), {
          filename: 'note.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

    it('stores each tenant upload in the directory of its tenant', async () => {
      const fa = (await upload('a', 'canary A')).body as { id: string };
      const fb = (await upload('b', 'canary B')).body as { id: string };
      const keys = await db.admin(
        async (c) =>
          (
            await c.query<{
              id: string;
              tenant_id: string;
              storage_key: string;
            }>(
              `SELECT id, tenant_id, storage_key FROM files WHERE id = ANY($1::uuid[])`,
              [[fa.id, fb.id]],
            )
          ).rows,
      );
      for (const row of keys) {
        expect(
          fs.existsSync(path.join(uploadDir, row.tenant_id, row.storage_key)),
        ).toBe(true);
        expect(fs.existsSync(path.join(uploadDir, row.storage_key))).toBe(
          false,
        );
      }
      expect(new Set(keys.map((r) => r.tenant_id))).toEqual(
        new Set([a.id, b.id]),
      );
    });

    it('serves a file to its own tenant and hides it from another', async () => {
      const fa = (await upload('a', 'for A only')).body as { id: string };
      const own = await api()
        .get(url(`/files/${fa.id}`))
        .set(auth('a'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((own.body as Buffer).toString()).toBe(pdf('for A only'));
      await api()
        .get(url(`/files/${fa.id}`))
        .set(auth('b'))
        .expect(404);
    });

    // With the content of each file also in the directory of the other tenant, the content
    // path stops being a barrier: a row that leaked would be served. The 404 can then only
    // come from Row-Level Security.
    it('hides the file row of another tenant even where its content could be found', async () => {
      writeSeededFile(uploadDir, a, b.id);
      writeSeededFile(uploadDir, b, a.id);
      try {
        expect(fs.existsSync(seededFilePath(uploadDir, a, b.id))).toBe(true);
        expect(fs.existsSync(seededFilePath(uploadDir, b, a.id))).toBe(true);
        // Control: each tenant still opens its own file
        const own = await api()
          .get(url(`/files/${a.fileId}`))
          .set(auth('a'))
          .expect(200);
        expect(own.text).toBe(a.fileBody);
        await api()
          .get(url(`/files/${b.fileId}`))
          .set(auth('b'))
          .expect(200);

        const fromB = await api()
          .get(url(`/files/${a.fileId}`))
          .set(auth('b'))
          .expect(404);
        const fromA = await api()
          .get(url(`/files/${b.fileId}`))
          .set(auth('a'))
          .expect(404);
        expect(JSON.stringify(fromB.body) + fromB.text).not.toContain(
          a.fileBody,
        );
        expect(JSON.stringify(fromA.body) + fromA.text).not.toContain(
          b.fileBody,
        );
      } finally {
        fs.rmSync(seededFilePath(uploadDir, a, b.id), { force: true });
        fs.rmSync(seededFilePath(uploadDir, b, a.id), { force: true });
      }
    });

    it('purges abandoned uploads of every tenant with their content', async () => {
      const fa = (await upload('a', 'abandoned A')).body as { id: string };
      const fb = (await upload('b', 'abandoned B')).body as { id: string };
      const rows = await db.admin(async (c) => {
        await c.query(
          `UPDATE files SET created_at = now() - interval '48 hours' WHERE id = ANY($1::uuid[])`,
          [[fa.id, fb.id]],
        );
        return (
          await c.query<{ tenant_id: string; storage_key: string }>(
            `SELECT tenant_id, storage_key FROM files WHERE id = ANY($1::uuid[])`,
            [[fa.id, fb.id]],
          )
        ).rows;
      });
      // The content is there before the purge, so its absence afterwards proves a removal
      rows.forEach((row) =>
        expect(
          fs.existsSync(path.join(uploadDir, row.tenant_id, row.storage_key)),
        ).toBe(true),
      );
      await app.get(FilesService).purgeAbandonedUploadsOnSchedule();
      const left = await db.admin(
        async (c) =>
          (
            await c.query<{ id: string }>(
              `SELECT id FROM files WHERE id = ANY($1::uuid[])`,
              [[fa.id, fb.id]],
            )
          ).rows,
      );
      expect(left).toEqual([]);
      rows.forEach((row) =>
        expect(
          fs.existsSync(path.join(uploadDir, row.tenant_id, row.storage_key)),
        ).toBe(false),
      );
    });
  });
});

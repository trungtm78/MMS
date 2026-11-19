// Boots the whole backend on a freshly migrated database. Sweeps every GET route that
// needs no path parameter as system_admin (any 5xx means code and schema disagree), then
// exercises write paths whose SQL mocked unit tests cannot validate.
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5433/postgres
import { randomUUID } from 'crypto';
import type { Server } from 'http';
import * as path from 'path';
import { Client } from 'pg';
import request from 'supertest';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
} from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Test } from '@nestjs/testing';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { generateSync } from 'otplib';
import { ChatService } from '../src/chat/chat.service';
import { LoginAttemptsService } from '../src/auth/login-attempts.service';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { businessDate, shiftIsoDate } from '../src/common/time/business-date';
import { configureHttpApp } from '../src/app.setup';
import { withClient } from './support/db';
import {
  backendTenancyEnv,
  prepareDatabaseForTenancy,
} from './support/e2e-tenancy';
import { loadAllEntities } from './support/load-all-entities';

jest.setTimeout(180_000);

const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
if (!adminUrl) {
  throw new Error(
    'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:mms_secret@localhost:5433/postgres)',
  );
}

const PREFIX = 'api/v1/mms_core';

const toPaths = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value ?? '']).map((p) => String(p));

const joinUrl = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

// Every GET route without ":param" segments, read from controller metadata
function parameterlessGetRoutes(app: INestApplication): string[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const routes = new Set<string>();

  for (const wrapper of discovery.getControllers() as InstanceWrapper<object>[]) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const controllerPaths = toPaths(
      Reflect.getMetadata(PATH_METADATA, metatype),
    );
    const prototype = Object.getPrototypeOf(instance) as Record<
      string,
      unknown
    >;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as object;
      if (Reflect.getMetadata(METHOD_METADATA, handler) !== RequestMethod.GET)
        continue;
      for (const controllerPath of controllerPaths) {
        for (const methodPath of toPaths(
          Reflect.getMetadata(PATH_METADATA, handler),
        )) {
          const url = joinUrl(PREFIX, controllerPath, methodPath);
          if (!url.includes(':') && !url.includes('*')) routes.add(url);
        }
      }
    }
  }
  return [...routes].sort();
}

describe('API contract (e2e)', () => {
  const dbName = `mms_apitest_${Date.now()}`;
  const targetUrl = (() => {
    const url = new URL(adminUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  })();
  let app: INestApplication;
  let adminToken: string;

  const api = () => request(app.getHttpServer() as Server);
  const db = <T>(fn: (client: Client) => Promise<T>) =>
    withClient(targetUrl, fn);

  async function login(username: string, password: string): Promise<string> {
    const res = await api()
      .post(`/${PREFIX}/auth/login`)
      .send({ username, password })
      .expect(200);
    return (res.body as { tokens: { accessToken: string } }).tokens.accessToken;
  }

  beforeAll(async () => {
    await withClient(adminUrl, (c) => c.query(`CREATE DATABASE ${dbName}`));
    await migrateDatabase({
      connectionString: targetUrl,
      directory: path.join(__dirname, '..', 'migrations'),
    });
    await prepareDatabaseForTenancy(dbName);

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
      ...backendTenancyEnv(),
    });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();

    // The same HTTP setup src/main.ts applies
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: PREFIX });
    await app.init(); // runs SeederService: admin / Admin@123, dqtv01 / Dqtv@123

    adminToken = await login('admin', 'Admin@123');
  });

  afterAll(async () => {
    await app?.close();
    await withClient(adminUrl, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`),
    );
  });

  // Repositories fail at runtime (EntityMetadataNotFoundError, missing column) when an
  // entity is not registered or disagrees with the migrated schema
  describe('entity mapping', () => {
    it('registers every entity class with the running connection', () => {
      const dataSource = app.get(DataSource);
      loadAllEntities(path.join(__dirname, '..', 'src'));

      const unregistered = getMetadataArgsStorage()
        .tables.filter((t) => !dataSource.hasMetadata(t.target))
        .map((t) => (t.target as { name: string }).name);

      expect(unregistered).toEqual([]);
    });

    it('maps every entity column to a column the migrations create', async () => {
      const dataSource = app.get(DataSource);
      const existing = await db(async (c) => {
        const { rows } = await c.query<{ key: string }>(
          `SELECT table_name || '.' || column_name AS key
           FROM information_schema.columns WHERE table_schema = 'public'`,
        );
        return new Set(rows.map((r) => r.key));
      });

      const missing = dataSource.entityMetadatas
        .flatMap((m) =>
          m.columns.map((c) => `${m.tableName}.${c.databaseName}`),
        )
        .filter((key) => !existing.has(key));

      expect(missing).toEqual([]);
    });
  });

  describe('GET sweep', () => {
    it('discovers the GET routes to sweep', () => {
      expect(parameterlessGetRoutes(app).length).toBeGreaterThan(40);
    });

    it('answers every parameterless GET route without a server error', async () => {
      const failures: string[] = [];
      for (const url of parameterlessGetRoutes(app)) {
        let res: request.Response;
        try {
          res = await api()
            .get(url)
            .set('Authorization', `Bearer ${adminToken}`)
            .timeout(15_000);
        } catch (error) {
          failures.push(`GET ${url} ${(error as Error).message}`);
          continue;
        }
        if (res.status >= 500) {
          const body = res.body as { message?: unknown };
          failures.push(
            `${res.status} GET ${url} ${JSON.stringify(body.message ?? res.text)}`,
          );
        }
      }

      expect(failures).toEqual([]);
    });
  });

  describe('notifications', () => {
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });

    // One broadcast notification row plus a receipt per recipient (migration 007/020 model)
    async function notify(username: string, title: string): Promise<string> {
      return db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO notifications (type, title, body, entity_type)
           VALUES ('task', $1, 'Nội dung', 'task') RETURNING id`,
          [title],
        );
        await c.query(
          `INSERT INTO notification_receipts (notification_id, user_id, delivered_at)
           SELECT $1, id, now() FROM users WHERE username = $2`,
          [rows[0].id, username],
        );
        return rows[0].id;
      });
    }

    type Page = {
      data: { id: string; isRead: boolean; readAt: string | null }[];
      total: number;
    };

    it('lists, filters and marks the caller’s notifications read', async () => {
      const id = await notify('admin', 'Nhiệm vụ mới');

      // Other suites may notify admin too: assert on this notification, not the whole inbox
      const all = await api()
        .get(`/${PREFIX}/notifications`)
        .set(auth())
        .expect(200);
      expect((all.body as Page).data).toContainEqual(
        expect.objectContaining({ id, isRead: false, readAt: null }),
      );

      const unread = await api()
        .get(`/${PREFIX}/notifications?read=false`)
        .set(auth())
        .expect(200);
      expect((unread.body as Page).data.map((n) => n.id)).toContain(id);

      await api()
        .patch(`/${PREFIX}/notifications/${id}/read`)
        .set(auth())
        .expect(200);

      const read = await api()
        .get(`/${PREFIX}/notifications?read=true`)
        .set(auth())
        .expect(200);
      expect((read.body as Page).data).toContainEqual(
        expect.objectContaining({ id, isRead: true }),
      );
      const stillUnread = await api()
        .get(`/${PREFIX}/notifications?read=false`)
        .set(auth())
        .expect(200);
      expect((stillUnread.body as Page).data.map((n) => n.id)).not.toContain(
        id,
      );
    });

    it('marks all unread notifications read', async () => {
      // Start from an inbox with nothing unread, whatever ran before
      await api()
        .post(`/${PREFIX}/notifications/read-all`)
        .set(auth())
        .expect(200);
      await notify('admin', 'Thông báo 1');
      await notify('admin', 'Thông báo 2');

      const res = await api()
        .post(`/${PREFIX}/notifications/read-all`)
        .set(auth())
        .expect(200);

      expect(res.body).toEqual({ updated: 2 });
      const unread = await api()
        .get(`/${PREFIX}/notifications?read=false`)
        .set(auth())
        .expect(200);
      expect((unread.body as Page).total).toBe(0);
    });

    it('dismisses a notification for the caller only', async () => {
      const id = await notify('admin', 'Bỏ qua được');

      await api()
        .delete(`/${PREFIX}/notifications/${id}`)
        .set(auth())
        .expect(200);
      const inbox = await api()
        .get(`/${PREFIX}/notifications?limit=100`)
        .set(auth())
        .expect(200);
      expect((inbox.body as Page).data.map((n) => n.id)).not.toContain(id);
      await api()
        .delete(`/${PREFIX}/notifications/${id}`)
        .set(auth())
        .expect(404);
    });

    it('returns 404 for a notification addressed to someone else', async () => {
      const othersId = await notify('dqtv01', 'Của người khác');

      await api()
        .patch(`/${PREFIX}/notifications/${othersId}/read`)
        .set(auth())
        .expect(404);
    });
  });

  describe('work reports', () => {
    it('lets DQTV submit a report and CA review it', async () => {
      const dqtvToken = await login('dqtv01', 'Dqtv@123');

      const created = await api()
        .post(`/${PREFIX}/work-reports`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .send({
          reportType: 'daily',
          title: 'Báo cáo ngày',
          content: 'Tuần tra KP1',
          location: 'KP1',
        })
        .expect(201);
      const id = (created.body as { id: string }).id;
      expect(created.body).toEqual(
        expect.objectContaining({ reviewStatus: 'pending' }),
      );

      await api()
        .patch(`/${PREFIX}/work-reports/${id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reviewStatus: 'approved', reviewNote: 'Đạt' })
        .expect(200);

      const mine = await api()
        .get(`/${PREFIX}/work-reports`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .expect(200);
      expect((mine.body as { data: unknown[] }).data).toEqual([
        expect.objectContaining({
          id,
          content: 'Tuần tra KP1',
          location: 'KP1',
          reviewStatus: 'approved',
          reviewNote: 'Đạt',
        }),
      ]);
    });

    it('rejects an unknown report type with 400', async () => {
      const dqtvToken = await login('dqtv01', 'Dqtv@123');

      await api()
        .post(`/${PREFIX}/work-reports`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .send({ reportType: 'work', title: 'Báo cáo', content: 'Nội dung' })
        .expect(400);
    });
  });

  describe('chat', () => {
    type Conversation = {
      id: string;
      title: string | null;
      conversationType: string;
      lastMessage: string | null;
    };
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });

    it('creates a group conversation, stores a message and lists both', async () => {
      const dqtvId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM users WHERE username = 'dqtv01'`,
        );
        return rows[0].id;
      });

      const created = await api()
        .post(`/${PREFIX}/chat/conversations`)
        .set(auth())
        .send({
          title: 'Tổ tuần tra KP1',
          conversationType: 'group',
          participantIds: [dqtvId],
        })
        .expect(201);
      const conv = created.body as Conversation;
      expect(conv).toEqual(
        expect.objectContaining({
          title: 'Tổ tuần tra KP1',
          conversationType: 'group',
        }),
      );

      const adminId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM users WHERE username = 'admin'`,
        );
        return rows[0].id;
      });
      const saved = await app
        .get(ChatService)
        .saveMessage(adminId, conv.id, 'Tập trung 19h');
      expect(saved).toEqual(
        expect.objectContaining({
          senderName: 'admin',
          content: 'Tập trung 19h',
          createdAt: expect.any(Date) as unknown,
        }),
      );

      const list = await api()
        .get(`/${PREFIX}/chat/conversations`)
        .set(auth())
        .expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id: conv.id, lastMessage: 'Tập trung 19h' }),
      ]);

      const dqtvToken = await login('dqtv01', 'Dqtv@123');
      const messages = await api()
        .get(`/${PREFIX}/chat/conversations/${conv.id}/messages`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .expect(200);
      expect(messages.body).toEqual(
        expect.objectContaining({
          total: 1,
          data: [
            expect.objectContaining({
              senderId: adminId,
              senderName: 'admin',
              content: 'Tập trung 19h',
              createdAt: expect.any(String) as unknown,
            }),
          ],
        }),
      );
    });

    it('rejects an unknown conversation type and non-UUID participants with 400', async () => {
      await api()
        .post(`/${PREFIX}/chat/conversations`)
        .set(auth())
        .send({ conversationType: 'broadcast', participantIds: [] })
        .expect(400);

      await api()
        .post(`/${PREFIX}/chat/conversations`)
        .set(auth())
        .send({ participantIds: ['not-a-uuid'] })
        .expect(400);
    });

    it('rejects unknown participants and malformed conversation ids with 400', async () => {
      await api()
        .post(`/${PREFIX}/chat/conversations`)
        .set(auth())
        .send({ participantIds: ['00000000-0000-4000-8000-000000000000'] })
        .expect(400);

      await api()
        .get(`/${PREFIX}/chat/conversations/not-a-uuid/messages`)
        .set(auth())
        .expect(400);
    });

    // The HTTP twin of chat:send, for clients without a live socket
    it('stores a message sent over HTTP, for participants only', async () => {
      const dqtvId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM users WHERE username = 'dqtv01'`,
        );
        return rows[0].id;
      });
      const created = await api()
        .post(`/${PREFIX}/chat/conversations`)
        .set(auth())
        .send({
          title: 'Kênh HTTP',
          conversationType: 'group',
          participantIds: [dqtvId],
        })
        .expect(201);
      const convId = (created.body as Conversation).id;
      const dqtvToken = await login('dqtv01', 'Dqtv@123');
      const send = (token: string, content: string) =>
        api()
          .post(`/${PREFIX}/chat/conversations/${convId}/messages`)
          .set('Authorization', `Bearer ${token}`)
          .send({ content });

      const sent = await send(dqtvToken, '  Đã nhận lệnh  ').expect(201);
      expect(sent.body).toEqual(
        expect.objectContaining({ senderId: dqtvId, content: 'Đã nhận lệnh' }),
      );
      await send(dqtvToken, 'x'.repeat(4001)).expect(400);
      await send(dqtvToken, '   ').expect(400);

      const outsider = await api()
        .post(`/${PREFIX}/admin/users`)
        .set(auth())
        .send({
          username: 'chat_outsider',
          fullName: 'Người ngoài nhóm',
          role: 'office_staff',
        })
        .expect(201);
      const outsiderToken = await login(
        'chat_outsider',
        (outsider.body as { temporaryPassword: string }).temporaryPassword,
      );
      await send(outsiderToken, 'Xin chào').expect(403);
    });
  });

  describe('exemptions', () => {
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });
    let militiaId: string;

    beforeAll(async () => {
      militiaId = await db(async (c) => {
        const unit = await c.query<{ id: string }>(
          `INSERT INTO units (code, name, type)
           VALUES ('KV-E2E', 'Khu vực E2E', 'area') RETURNING id`,
        );
        const militia = await c.query<{ id: string }>(
          `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date)
           VALUES ('DQ-E2E-01', 'Trần Văn Bình', '079200000001', '2000-01-15', $1, '2024-03-01')
           RETURNING id`,
          [unit.rows[0].id],
        );
        return militia.rows[0].id;
      });
    });

    // Relative to today, so the active decision never ages into 'expired'
    const today = businessDate().isoDate;
    const effectiveDate = shiftIsoDate(today, -14);
    const expiryDate = shiftIsoDate(today, 4 * 365);

    const decision = () => ({
      militiaId,
      type: 'deferral',
      reason: 'Học đại học',
      legalBasis: 'Điều 12 Luật DQTV 2019',
      effectiveDate,
      expiryDate,
    });

    it('creates, lists and revokes a decision', async () => {
      const created = await api()
        .post(`/${PREFIX}/exemptions`)
        .set(auth())
        .send(decision())
        .expect(201);
      const { id } = created.body as { id: string };
      expect(created.body).toEqual(
        expect.objectContaining({
          militiaId,
          militiaName: 'Trần Văn Bình',
          unitCode: 'KV-E2E',
          status: 'active',
          effectiveDate,
          expiryDate,
          documents: [],
        }),
      );

      const listed = await api()
        .get(`/${PREFIX}/exemptions?militiaId=${militiaId}&status=active`)
        .set(auth())
        .expect(200);
      expect(listed.body).toEqual([expect.objectContaining({ id })]);

      const revoked = await api()
        .patch(`/${PREFIX}/exemptions/${id}/review`)
        .set(auth())
        .send({ status: 'revoked' })
        .expect(200);
      expect(revoked.body).toEqual(
        expect.objectContaining({ id, status: 'revoked' }),
      );

      await api()
        .patch(`/${PREFIX}/exemptions/${id}/review`)
        .set(auth())
        .send({ status: 'expired' })
        .expect(409);
    });

    it('reports an active decision past its expiry date as expired', async () => {
      const id = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO exemptions (militia_id, type, reason, legal_basis, effective_date, expiry_date)
           VALUES ($1, 'exemption', 'Sức khỏe', 'Điều 11', '2020-01-01', '2021-01-01')
           RETURNING id`,
          [militiaId],
        );
        return rows[0].id;
      });

      const expired = await api()
        .get(`/${PREFIX}/exemptions?status=expired`)
        .set(auth())
        .expect(200);
      expect(expired.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id, status: 'expired' }),
        ]),
      );
    });

    it.each([
      ['a derived militia name', { militiaName: 'Trần Văn Bình' }],
      ['a server-owned status', { status: 'revoked' }],
      [
        'an expiry before the effective date',
        { expiryDate: shiftIsoDate(effectiveDate, -1) },
      ],
      [
        'an unknown militia member',
        { militiaId: '00000000-0000-4000-8000-000000000000' },
      ],
    ])('rejects a decision with %s', async (_label, patch) => {
      await api()
        .post(`/${PREFIX}/exemptions`)
        .set(auth())
        .send({ ...decision(), ...patch })
        .expect(400);
    });

    it('does not let DQTV members read decisions', async () => {
      const dqtvToken = await login('dqtv01', 'Dqtv@123');

      await api()
        .get(`/${PREFIX}/exemptions`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .expect(403);
    });
  });

  describe('work report scoping', () => {
    const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });

    // An area officer scoped to KV-WR-A; dqtv01's militia profile sits in KV-WR-B
    async function areaOfficerToken(): Promise<string> {
      await db(async (c) => {
        await c.query(
          `INSERT INTO units (code, name, type)
           VALUES ('KV-WR-A', 'Khu vực A', 'area'), ('KV-WR-B', 'Khu vực B', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        );
        await c.query(
          `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
           SELECT 'DQ-WR-01', 'Nguyễn Văn A', '079200000099', '1999-05-05', u.id, '2023-01-01', usr.id
           FROM units u, users usr
           WHERE u.code = 'KV-WR-B' AND usr.username = 'dqtv01'
           ON CONFLICT DO NOTHING`,
        );
      });
      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set(adminAuth())
        .send({
          username: 'ca_wr_area',
          fullName: 'Lê Văn E',
          role: 'police_area',
          unitCode: 'KV-WR-A',
        })
        .expect(201);
      return login(
        'ca_wr_area',
        (created.body as { temporaryPassword: string }).temporaryPassword,
      );
    }

    it('hides reports from other units and answers 404 when reviewing them', async () => {
      const officerToken = await areaOfficerToken();
      const dqtvToken = await login('dqtv01', 'Dqtv@123');
      const created = await api()
        .post(`/${PREFIX}/work-reports`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .send({
          reportType: 'daily',
          title: 'Báo cáo KV B',
          content: 'Tuần tra',
        })
        .expect(201);
      const { id } = created.body as { id: string };

      const visible = await api()
        .get(`/${PREFIX}/work-reports`)
        .set('Authorization', `Bearer ${officerToken}`)
        .expect(200);
      expect(
        (visible.body as { data: { id: string }[] }).data.map((r) => r.id),
      ).not.toContain(id);

      await api()
        .patch(`/${PREFIX}/work-reports/${id}/review`)
        .set('Authorization', `Bearer ${officerToken}`)
        .send({ reviewStatus: 'approved' })
        .expect(404);
    });

    it('decides a report once and never lets reviewers approve their own', async () => {
      const dqtvToken = await login('dqtv01', 'Dqtv@123');
      const created = await api()
        .post(`/${PREFIX}/work-reports`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .send({ reportType: 'incident', title: 'Sự vụ', content: 'Chi tiết' })
        .expect(201);
      const { id } = created.body as { id: string };

      await api()
        .patch(`/${PREFIX}/work-reports/${id}/review`)
        .set(adminAuth())
        .send({ reviewStatus: 'approved' })
        .expect(200);
      await api()
        .patch(`/${PREFIX}/work-reports/${id}/review`)
        .set(adminAuth())
        .send({ reviewStatus: 'rejected' })
        .expect(409);

      const own = await api()
        .post(`/${PREFIX}/work-reports`)
        .set(adminAuth())
        .send({ reportType: 'daily', title: 'Của admin', content: 'Nội dung' })
        .expect(201);
      await api()
        .patch(
          `/${PREFIX}/work-reports/${(own.body as { id: string }).id}/review`,
        )
        .set(adminAuth())
        .send({ reviewStatus: 'approved' })
        .expect(403);
    });

    it('rejects malformed filters with 400', async () => {
      await api()
        .get(`/${PREFIX}/work-reports?userId=abc`)
        .set(adminAuth())
        .expect(400);
      await api()
        .get(`/${PREFIX}/work-reports?type=weekly`)
        .set(adminAuth())
        .expect(400);
    });
  });

  // Formerly src/auth/auth.integration.spec.ts, which needed a hand-made local database
  describe('authentication', () => {
    it('signs in with valid credentials and never returns the password hash', async () => {
      const res = await api()
        .post(`/${PREFIX}/auth/login`)
        .send({ username: 'dqtv01', password: 'Dqtv@123' })
        .expect(200);
      const body = res.body as {
        tokens: { accessToken: string; refreshToken: string };
        user: Record<string, unknown>;
      };

      expect(body.tokens.accessToken).toEqual(expect.any(String));
      expect(body.tokens.refreshToken).toEqual(expect.any(String));
      expect(body.user).toEqual(
        expect.objectContaining({ username: 'dqtv01', role: 'dqtv' }),
      );
      expect(body.user).not.toHaveProperty('passwordHash');
      expect(body.user).not.toHaveProperty('password_hash');
    });

    it.each([
      ['a wrong password', { username: 'dqtv01', password: 'WrongPassword1' }],
      [
        'an unknown user',
        { username: 'nonexistent_xyz_999', password: 'anything' },
      ],
    ])('answers 401 for %s', async (_label, credentials) => {
      await api().post(`/${PREFIX}/auth/login`).send(credentials).expect(401);
    });

    it('returns the caller profile for a valid token and 401 otherwise', async () => {
      const me = await api()
        .get(`/${PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(me.body).toEqual(expect.objectContaining({ username: 'admin' }));

      await api().get(`/${PREFIX}/auth/me`).expect(401);
      await api()
        .get(`/${PREFIX}/auth/me`)
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('logs out every session so the refresh token stops working', async () => {
      const signedIn = await api()
        .post(`/${PREFIX}/auth/login`)
        .send({ username: 'dqtv01', password: 'Dqtv@123' })
        .expect(200);
      const { tokens } = signedIn.body as {
        tokens: { accessToken: string; refreshToken: string };
      };

      await api()
        .post(`/${PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(204);
      await api()
        .post(`/${PREFIX}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      await api().post(`/${PREFIX}/auth/logout`).expect(401);
    });
  });

  describe('multi-factor authentication', () => {
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
    const claimsOf = (token: string) =>
      JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
      ) as Record<string, unknown>;

    interface SignedIn {
      status: string;
      user: Record<string, unknown>;
      tokens: { accessToken: string; refreshToken: string };
    }

    let accountCounter = 0;
    async function createAccount(): Promise<{
      id: string;
      username: string;
      password: string;
    }> {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('KV-MFA', 'Khu vực MFA', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );
      const username = `mfa_user_${accountCounter++}`;
      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set(bearer(adminToken))
        .send({
          username,
          fullName: 'Người dùng MFA',
          role: 'police_area',
          unitCode: 'KV-MFA',
        })
        .expect(201);
      const { id, temporaryPassword } = created.body as {
        id: string;
        temporaryPassword: string;
      };
      return { id, username, password: temporaryPassword };
    }

    const signIn = (username: string, password: string) =>
      api()
        .post(`/${PREFIX}/auth/login`)
        .send({ username, password })
        .expect(200);

    // A code for a time step later than the last one the account used; waits for the
    // next step when the current and the tolerated next step are both used up
    async function freshCode(userId: string, secret: string): Promise<string> {
      const { last } = await db(async (c) => {
        const { rows } = await c.query<{ last: string | null }>(
          `SELECT totp_last_used_step AS last FROM users WHERE id = $1`,
          [userId],
        );
        return rows[0];
      });
      const lastStep = last === null ? -1 : Number(last);
      let nowStep = Math.floor(Date.now() / 30_000);
      if (lastStep > nowStep) {
        await new Promise((r) =>
          setTimeout(r, lastStep * 30_000 - Date.now() + 50),
        );
        nowStep = Math.floor(Date.now() / 30_000);
      }
      const step = Math.max(nowStep, lastStep + 1);
      return generateSync({ secret, epoch: step * 30 });
    }

    async function enrolFromSession(account: {
      id: string;
      username: string;
      password: string;
    }) {
      const { tokens } = (await signIn(account.username, account.password))
        .body as SignedIn;
      const started = await api()
        .post(`/${PREFIX}/auth/mfa/setup`)
        .set(bearer(tokens.accessToken))
        .expect(200);
      const { mfaToken, secret } = started.body as {
        mfaToken: string;
        secret: string;
      };
      const confirmed = await api()
        .post(`/${PREFIX}/auth/mfa/confirm`)
        .set(bearer(tokens.accessToken))
        .send({ mfaToken, code: await freshCode(account.id, secret) })
        .expect(200);
      // Enrolment ends the password-only session and hands back an MFA session
      const enrolled = confirmed.body as {
        recoveryCodes: string[];
        tokens: SignedIn['tokens'];
      };
      return {
        secret,
        passwordTokens: tokens,
        tokens: enrolled.tokens,
        recoveryCodes: enrolled.recoveryCodes,
      };
    }

    it('enrols from a session, then asks for a code at sign-in and accepts each recovery code once', async () => {
      const account = await createAccount();

      const first = (await signIn(account.username, account.password))
        .body as SignedIn;
      expect(first.status).toBe('SUCCESS');
      expect(claimsOf(first.tokens.accessToken)).toEqual(
        expect.objectContaining({ typ: 'access', amr: ['pwd'] }),
      );

      const { secret, tokens, passwordTokens, recoveryCodes } =
        await enrolFromSession(account);
      expect(recoveryCodes).toHaveLength(10);

      // Codex round 3: the session opened with the password alone ends at enrolment;
      // the caller continues with the MFA session returned by confirm
      await api()
        .get(`/${PREFIX}/auth/me`)
        .set(bearer(passwordTokens.accessToken))
        .expect(401);
      await api()
        .post(`/${PREFIX}/auth/refresh`)
        .send({ refreshToken: passwordTokens.refreshToken })
        .expect(401);
      expect(claimsOf(tokens.accessToken)).toEqual(
        expect.objectContaining({ amr: ['pwd', 'otp', 'mfa'] }),
      );
      recoveryCodes.forEach((code) =>
        expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/),
      );

      const status = await api()
        .get(`/${PREFIX}/auth/mfa/status`)
        .set(bearer(tokens.accessToken))
        .expect(200);
      expect(status.body).toEqual(
        expect.objectContaining({
          enabled: true,
          required: false,
          recoveryCodesRemaining: 10,
        }),
      );
      const stored = await db(async (c) => {
        const { rows } = await c.query<{ totp_secret: string }>(
          `SELECT totp_secret FROM users WHERE id = $1`,
          [account.id],
        );
        return rows[0].totp_secret;
      });
      expect(stored).toMatch(/^v1:/);
      expect(stored).not.toContain(secret);

      // Enrolled: a correct password alone yields no tokens
      const challenged = await signIn(account.username, account.password);
      const challenge = challenged.body as {
        status: string;
        mfaToken: string;
        methods: string[];
        mfa_required: boolean;
        tempToken: string;
      };
      expect(challenge).toEqual(
        expect.objectContaining({
          status: 'MFA_REQUIRED',
          methods: ['totp', 'recovery_code'],
          mfa_required: true,
          tempToken: challenge.mfaToken,
        }),
      );
      expect(challenged.body).not.toHaveProperty('tokens');

      const wrong = await api()
        .post(`/${PREFIX}/auth/mfa/verify`)
        .send({ mfaToken: challenge.mfaToken, method: 'totp', code: '000000' })
        .expect(401);
      expect(wrong.body).toEqual(
        expect.objectContaining({
          code: 'E004',
          message: 'invalid_code',
          details: { attemptsRemaining: 4 },
        }),
      );

      const withRecovery = await api()
        .post(`/${PREFIX}/auth/mfa/verify`)
        .send({
          mfaToken: challenge.mfaToken,
          method: 'recovery_code',
          code: recoveryCodes[0].toLowerCase().replace('-', ' '),
        })
        .expect(200);
      const session = withRecovery.body as SignedIn & {
        recoveryCodesRemaining: number;
      };
      expect(session.status).toBe('SUCCESS');
      expect(session.recoveryCodesRemaining).toBe(9);
      expect(claimsOf(session.tokens.accessToken)).toEqual(
        expect.objectContaining({
          typ: 'access',
          amr: ['pwd', 'recovery_code', 'mfa'],
        }),
      );
      await api()
        .get(`/${PREFIX}/auth/me`)
        .set(bearer(session.tokens.accessToken))
        .expect(200);

      // The challenge is spent, and so is the recovery code
      await api()
        .post(`/${PREFIX}/auth/mfa/verify`)
        .send({ mfaToken: challenge.mfaToken, method: 'totp', code: '123456' })
        .expect(401);
      const again = (await signIn(account.username, account.password)).body as {
        mfaToken: string;
      };
      await api()
        .post(`/${PREFIX}/auth/mfa/verify`)
        .send({
          mfaToken: again.mfaToken,
          method: 'recovery_code',
          code: recoveryCodes[0],
        })
        .expect(401);

      // A fresh authenticator code still works through the deprecated alias
      const legacy = await api()
        .post(`/${PREFIX}/auth/mfa/login`)
        .send({
          tempToken: again.mfaToken,
          otp: await freshCode(account.id, secret),
        })
        .expect(200);
      expect(claimsOf((legacy.body as SignedIn).tokens.accessToken)).toEqual(
        expect.objectContaining({ amr: ['pwd', 'otp', 'mfa'] }),
      );

      const audited = await db(async (c) => {
        const { rows } = await c.query<{ action: string }>(
          `SELECT action FROM audit_logs WHERE entity_id = $1 AND action LIKE 'mfa.%' ORDER BY created_at`,
          [account.id],
        );
        return rows.map((r) => r.action);
      });
      expect(audited).toEqual(
        expect.arrayContaining([
          'mfa.enrolled',
          'mfa.verify_failed',
          'mfa.verify_succeeded',
        ]),
      );
    });

    it('never lets an access token replace the authenticator of an enrolled account', async () => {
      const account = await createAccount();
      const { tokens } = await enrolFromSession(account);

      const res = await api()
        .post(`/${PREFIX}/auth/mfa/setup`)
        .set(bearer(tokens.accessToken))
        .expect(409);
      expect((res.body as { message: string }).message).toBe(
        'mfa_already_enabled',
      );
    });

    it('makes members of an MFA-required role enrol before they receive tokens', async () => {
      const account = await createAccount();
      await db((c) =>
        c.query(
          `UPDATE roles SET mfa_required = true WHERE code = 'police_area'`,
        ),
      );
      try {
        const res = await signIn(account.username, account.password);
        const { mfaToken, status } = res.body as {
          mfaToken: string;
          status: string;
        };
        expect(status).toBe('MFA_SETUP_REQUIRED');
        expect(res.body).toEqual(
          expect.objectContaining({ requiresMfaSetup: true }),
        );
        expect(res.body).not.toHaveProperty('tokens');

        // A setup challenge cannot be used to sign in
        await api()
          .post(`/${PREFIX}/auth/mfa/verify`)
          .send({ mfaToken, method: 'totp', code: '123456' })
          .expect(401);

        const started = await api()
          .post(`/${PREFIX}/auth/mfa/enroll`)
          .send({ mfaToken })
          .expect(200);
        const { secret, otpauthUri } = started.body as {
          secret: string;
          otpauthUri: string;
        };
        expect(otpauthUri).toContain(`secret=${secret}`);

        const confirmed = await api()
          .post(`/${PREFIX}/auth/mfa/enroll/confirm`)
          .send({ mfaToken, code: await freshCode(account.id, secret) })
          .expect(200);
        const session = confirmed.body as SignedIn & {
          recoveryCodes: string[];
        };
        expect(session.status).toBe('SUCCESS');
        expect(session.recoveryCodes).toHaveLength(10);

        const disabled = await api()
          .post(`/${PREFIX}/auth/mfa/disable`)
          .set(bearer(session.tokens.accessToken))
          .send({ method: 'totp', code: await freshCode(account.id, secret) })
          .expect(403);
        expect((disabled.body as { message: string }).message).toBe(
          'mfa_required_by_role',
        );
      } finally {
        await db((c) =>
          c.query(
            `UPDATE roles SET mfa_required = false WHERE code = 'police_area'`,
          ),
        );
      }
    });

    it('ends every session of the account when MFA is disabled, answering a new one for the caller', async () => {
      const account = await createAccount();
      const { secret, tokens } = await enrolFromSession(account);
      // A second device signed in with password and code
      const challenge = (await signIn(account.username, account.password))
        .body as { mfaToken: string };
      const other = (
        await api()
          .post(`/${PREFIX}/auth/mfa/verify`)
          .send({
            mfaToken: challenge.mfaToken,
            method: 'totp',
            code: await freshCode(account.id, secret),
          })
          .expect(200)
      ).body as SignedIn;

      const disabled = await api()
        .post(`/${PREFIX}/auth/mfa/disable`)
        .set(bearer(tokens.accessToken))
        .send({ method: 'totp', code: await freshCode(account.id, secret) })
        .expect(200);
      const session = disabled.body as SignedIn;
      expect(session.user).toEqual(expect.objectContaining({ id: account.id }));

      // Neither the caller's former session nor the other device keeps working
      for (const ended of [tokens, other.tokens]) {
        await api()
          .get(`/${PREFIX}/auth/me`)
          .set(bearer(ended.accessToken))
          .expect(401);
        await api()
          .post(`/${PREFIX}/auth/refresh`)
          .send({ refreshToken: ended.refreshToken })
          .expect(401);
      }
      // The caller continues in the session answered, which refreshes normally
      await api()
        .get(`/${PREFIX}/auth/me`)
        .set(bearer(session.tokens.accessToken))
        .expect(200);
      await api()
        .post(`/${PREFIX}/auth/refresh`)
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(200);
      const status = await db(async (c) => {
        const { rows } = await c.query<{ mfa_enabled: boolean }>(
          `SELECT mfa_enabled FROM users WHERE id = $1`,
          [account.id],
        );
        return rows[0].mfa_enabled;
      });
      expect(status).toBe(false);
      // A password alone signs in again
      expect(
        (
          (await signIn(account.username, account.password)).body as {
            status: string;
          }
        ).status,
      ).toBe('SUCCESS');
    });

    it('lets an administrator reset a lost authenticator, ending the sessions of that account', async () => {
      const account = await createAccount();
      const { tokens } = await enrolFromSession(account);

      await api()
        .post(`/${PREFIX}/admin/users/${account.id}/mfa/reset`)
        .set(bearer(adminToken))
        .expect(204);

      // The issued access token stops at once, not when it expires
      await api()
        .get(`/${PREFIX}/auth/me`)
        .set(bearer(tokens.accessToken))
        .expect(401);
      await api()
        .post(`/${PREFIX}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      const signedIn = (await signIn(account.username, account.password))
        .body as SignedIn;
      expect(signedIn.status).toBe('SUCCESS');

      // Only system administrators, and never on their own account
      await api()
        .post(`/${PREFIX}/admin/users/${account.id}/mfa/reset`)
        .set(bearer(signedIn.tokens.accessToken))
        .expect(403);
      const adminId = (claimsOf(adminToken) as { sub: string }).sub;
      await api()
        .post(`/${PREFIX}/admin/users/${adminId}/mfa/reset`)
        .set(bearer(adminToken))
        .expect(403);
    });

    it('refuses bearer tokens that are not access tokens', async () => {
      const jwt = app.get(JwtService);
      const { sub, username, role } = claimsOf(adminToken) as {
        sub: string;
        username: string;
        role: string;
      };
      const untyped = jwt.sign(
        { sub, username, role, unitScope: null },
        { secret: process.env.JWT_SECRET, expiresIn: '5m' },
      );

      await api().get(`/${PREFIX}/auth/me`).set(bearer(untyped)).expect(401);
    });
  });

  // Codex round 3: issued tokens must stop speaking for an account the moment it changes
  describe('session integrity', () => {
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
    const admin = () => bearer(adminToken);
    interface Tokens {
      accessToken: string;
      refreshToken: string;
    }

    let counter = 0;
    async function account(role = 'police_area') {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('KV-SES', 'Khu vực phiên', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );
      const username = `ses_user_${counter++}`;
      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set(admin())
        .send({ username, fullName: 'Phiên', role, unitCode: 'KV-SES' })
        .expect(201);
      const { id, temporaryPassword } = created.body as {
        id: string;
        temporaryPassword: string;
      };
      return { id, username, password: temporaryPassword };
    }
    const signIn = async (username: string, password: string) =>
      (
        (
          await api()
            .post(`/${PREFIX}/auth/login`)
            .send({ username, password })
            .expect(200)
        ).body as { tokens: Tokens }
      ).tokens;
    const me = (token: string) =>
      api().get(`/${PREFIX}/auth/me`).set(bearer(token));
    const refresh = (refreshToken: string) =>
      api().post(`/${PREFIX}/auth/refresh`).send({ refreshToken });
    const messageOf = (res: { body: unknown }) =>
      (res.body as { message: string }).message;

    it('stores what each session is bound to (migration 027)', async () => {
      const columns = await db(async (c) => {
        const { rows } = await c.query<{ key: string }>(
          `SELECT table_name || '.' || column_name AS key
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name IN ('users', 'sessions')`,
        );
        return rows.map((r) => r.key);
      });
      expect(columns).toEqual(
        expect.arrayContaining([
          'users.auth_version',
          'users.mfa_failed_count',
          'users.mfa_locked_until',
          'sessions.auth_version',
          'sessions.amr',
          'sessions.replaced_by',
        ]),
      );
    });

    it('refuses the access token of an account the moment it is suspended, even after reactivation', async () => {
      const user = await account();
      const tokens = await signIn(user.username, user.password);
      await me(tokens.accessToken).expect(200);

      await api()
        .patch(`/${PREFIX}/admin/users/${user.id}/status`)
        .set(admin())
        .send({ status: 'suspended' })
        .expect(200);
      const refused = await me(tokens.accessToken).expect(401);
      expect(messageOf(refused)).toBe('session_revoked');

      await api()
        .patch(`/${PREFIX}/admin/users/${user.id}/status`)
        .set(admin())
        .send({ status: 'active' })
        .expect(200);
      await me(tokens.accessToken).expect(401);
      await refresh(tokens.refreshToken).expect(401);
    });

    it('refuses an access token carrying roles the account no longer has', async () => {
      const user = await account('dqtv');
      const tokens = await signIn(user.username, user.password);

      await api()
        .patch(`/${PREFIX}/admin/users/${user.id}/role`)
        .set(admin())
        .send({ role: 'office_staff' })
        .expect(200);

      await me(tokens.accessToken).expect(401);
      const fresh = await signIn(user.username, user.password);
      const profile = await me(fresh.accessToken).expect(200);
      expect(profile.body).toEqual(
        expect.objectContaining({ role: 'office_staff' }),
      );
    });

    it('treats a rotated refresh token presented again as theft and ends every session', async () => {
      const user = await account();
      const first = await signIn(user.username, user.password);

      const rotated = (await refresh(first.refreshToken).expect(200))
        .body as Tokens;
      await me(rotated.accessToken).expect(200);

      const reused = await refresh(first.refreshToken).expect(401);
      expect(messageOf(reused)).toBe('refresh_token_reused');
      await me(rotated.accessToken).expect(401);
      await refresh(rotated.refreshToken).expect(401);
    });

    it('ends a password-only session once a role of the account requires MFA', async () => {
      const user = await account();
      const tokens = await signIn(user.username, user.password);
      await db((c) =>
        c.query(
          `UPDATE roles SET mfa_required = true WHERE code = 'police_area'`,
        ),
      );
      try {
        const res = await refresh(tokens.refreshToken).expect(401);
        expect(messageOf(res)).toBe('mfa_reauthentication_required');
        await refresh(tokens.refreshToken).expect(401);
      } finally {
        await db((c) =>
          c.query(
            `UPDATE roles SET mfa_required = false WHERE code = 'police_area'`,
          ),
        );
      }
    });

    it('ends every session when the user changes their own password', async () => {
      const user = await account();
      const other = await signIn(user.username, user.password);
      const current = await signIn(user.username, user.password);

      await api()
        .post(`/${PREFIX}/users/me/change-password`)
        .set(bearer(current.accessToken))
        .send({
          currentPassword: user.password,
          newPassword: 'Moi@MatKhau2026',
        })
        .expect(204);

      for (const tokens of [other, current]) {
        await me(tokens.accessToken).expect(401);
        await refresh(tokens.refreshToken).expect(401);
      }
      await signIn(user.username, 'Moi@MatKhau2026');
    });

    // An MFA setup challenge opened with the old password must not survive a reset
    it('closes open MFA challenges when an administrator resets the password', async () => {
      const user = await account();
      await db((c) =>
        c.query(
          `UPDATE roles SET mfa_required = true WHERE code = 'police_area'`,
        ),
      );
      try {
        const res = await api()
          .post(`/${PREFIX}/auth/login`)
          .send({ username: user.username, password: user.password })
          .expect(200);
        const { mfaToken } = res.body as { mfaToken: string };

        await api()
          .post(`/${PREFIX}/admin/users/${user.id}/reset-password`)
          .set(admin())
          .expect(201);

        const refused = await api()
          .post(`/${PREFIX}/auth/mfa/enroll`)
          .send({ mfaToken })
          .expect(401);
        expect(messageOf(refused)).toBe('mfa_token_invalid');
      } finally {
        await db((c) =>
          c.query(
            `UPDATE roles SET mfa_required = false WHERE code = 'police_area'`,
          ),
        );
      }
    });

    // Concurrent wrong codes on separate challenges queue on the user row lock, so the
    // account limit (10) is exact
    it('never counts more wrong MFA codes than the account limit, however many arrive at once', async () => {
      const user = await account();
      const secret = 'YL3AOTAN4S72X3JSHIPP5ADNUEUCT7AJ';
      await db((c) =>
        c.query(
          `UPDATE users SET mfa_enabled = true, totp_secret = $2, mfa_setup_at = now()
           WHERE id = $1`,
          [user.id, secret],
        ),
      );
      const challenges: string[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await api()
          .post(`/${PREFIX}/auth/login`)
          .send({ username: user.username, password: user.password })
          .expect(200);
        challenges.push((res.body as { mfaToken: string }).mfaToken);
      }

      const answers = await Promise.all(
        challenges.map((mfaToken) =>
          api()
            .post(`/${PREFIX}/auth/mfa/verify`)
            .send({ mfaToken, method: 'totp', code: '000000' }),
        ),
      );

      const statuses = answers.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 401)).toHaveLength(9);
      expect(statuses.filter((s) => s === 429)).toHaveLength(3);
      const state = await db(async (c) => {
        const { rows } = await c.query<{
          mfa_failed_count: number;
          locked: boolean;
        }>(
          `SELECT mfa_failed_count, mfa_locked_until > now() AS locked
           FROM users WHERE id = $1`,
          [user.id],
        );
        return rows[0];
      });
      expect(state).toEqual({ mfa_failed_count: 10, locked: true });
    });

    it('locks unknown usernames exactly like real ones, so a lock reveals nothing', async () => {
      const ghost = `ghost_${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        await api()
          .post(`/${PREFIX}/auth/login`)
          .send({ username: ghost, password: 'Whatever1!' })
          .expect(401);
      }
      const locked = await api()
        .post(`/${PREFIX}/auth/login`)
        .send({ username: ghost.toUpperCase(), password: 'Whatever1!' })
        .expect(403);
      expect(messageOf(locked)).toBe('account_locked');
    });

    const WRONG = 'Wrong-pass1!';
    const attemptLogin = (username: string, password: string) =>
      api().post(`/${PREFIX}/auth/login`).send({ username, password });
    const nameHash = (username: string) =>
      app.get(LoginAttemptsService).nameHash(username);
    const loginCounter = (username: string) =>
      db(async (c) => {
        const { rows } = await c.query<{
          failed_count: number;
          pending_count: number;
          locked: boolean;
        }>(
          `SELECT failed_count, pending_count, COALESCE(locked_until > now(), false) AS locked
           FROM login_attempts WHERE name_hash = $1`,
          [nameHash(username)],
        );
        return rows[0];
      });

    // The count lives in Postgres and each attempt takes a slot before its password is
    // checked, so concurrent guesses cannot get past the limit on any replica
    it('checks at most five concurrent wrong passwords before the name locks', async () => {
      const { username } = await account();

      const answers = await Promise.all(
        Array.from({ length: 12 }, () => attemptLogin(username, WRONG)),
      );

      const statuses = answers.map((r) => r.status);
      expect(statuses.filter((s) => s === 401)).toHaveLength(5);
      expect(statuses.filter((s) => s === 403)).toHaveLength(7);
      expect(await loginCounter(username)).toEqual({
        failed_count: 5,
        pending_count: 0,
        locked: true,
      });
    });

    it('forgets earlier failures once a sign-in completes', async () => {
      const { username, password } = await account();
      for (let i = 0; i < 3; i++) {
        await attemptLogin(username, WRONG).expect(401);
      }
      expect(await loginCounter(username)).toEqual({
        failed_count: 3,
        pending_count: 0,
        locked: false,
      });

      await signIn(username, password);

      expect(await loginCounter(username)).toEqual({
        failed_count: 0,
        pending_count: 0,
        locked: false,
      });
    });

    it('accepts the right password again once the lock has passed, counting from zero', async () => {
      const { username, password } = await account();
      for (let i = 0; i < 5; i++) {
        await attemptLogin(username, WRONG).expect(401);
      }
      await attemptLogin(username, password).expect(403);
      await db((c) =>
        c.query(
          `UPDATE login_attempts
           SET locked_until = now() - interval '1 second',
               last_failure_at = now() - interval '31 minutes'
           WHERE name_hash = $1`,
          [nameHash(username)],
        ),
      );

      await attemptLogin(username, WRONG).expect(401);
      expect(await loginCounter(username)).toEqual({
        failed_count: 1,
        pending_count: 0,
        locked: false,
      });
      await signIn(username, password);
    });

    it('never stores the submitted name', async () => {
      const typed = `Typed-Secret-${Date.now()}`;

      await attemptLogin(typed, WRONG).expect(401);

      const stored = await db(async (c) => {
        const { rows } = await c.query<{ name_hash: string }>(
          `SELECT name_hash FROM login_attempts`,
        );
        return rows.map((r) => r.name_hash);
      });
      expect(stored).toContain(nameHash(typed));
      expect(nameHash(typed)).toMatch(/^[0-9a-f]{64}$/);
      expect(
        stored.some((h) => h.toLowerCase().includes(typed.toLowerCase())),
      ).toBe(false);
    });
  });

  describe('account administration', () => {
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });
    const userId = (username: string) =>
      db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM users WHERE username = $1`,
          [username],
        );
        return rows[0].id;
      });

    it('creates a scoped account that can sign in, and suspending it ends its sessions', async () => {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('KV-ADM', 'Khu vực quản trị', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );

      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set(auth())
        .send({
          username: 'ca_kv_adm',
          fullName: 'Trần Thị D',
          role: 'police_area',
          unitCode: 'KV-ADM',
        })
        .expect(201);
      const { id, temporaryPassword } = created.body as {
        id: string;
        temporaryPassword: string;
      };
      expect(created.body).toEqual(
        expect.objectContaining({
          role: 'police_area',
          roles: ['police_area'],
          unitScope: 'KV-ADM',
        }),
      );

      const signedIn = await api()
        .post(`/${PREFIX}/auth/login`)
        .send({ username: 'ca_kv_adm', password: temporaryPassword })
        .expect(200);
      const { tokens, user } = signedIn.body as {
        tokens: { refreshToken: string };
        user: Record<string, unknown>;
      };
      expect(user).toEqual(
        expect.objectContaining({
          role: 'police_area',
          roles: ['police_area'],
          unitScope: 'KV-ADM',
        }),
      );

      await api()
        .patch(`/${PREFIX}/admin/users/${id}/status`)
        .set(auth())
        .send({ status: 'suspended' })
        .expect(200);

      await api()
        .post(`/${PREFIX}/auth/refresh`)
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
      await api()
        .post(`/${PREFIX}/auth/login`)
        .send({ username: 'ca_kv_adm', password: temporaryPassword })
        .expect(403);
      // Without the password, a suspended account looks like any wrong login
      await api()
        .post(`/${PREFIX}/auth/login`)
        .send({ username: 'ca_kv_adm', password: 'not-the-password' })
        .expect(401);
    });

    // Codex round 2: an account with no unit scope, or of another unit, was manageable
    it('keeps office staff to accounts that belong to their unit alone', async () => {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type)
           VALUES ('KV-OSA', 'Khu vực A', 'area'), ('KV-OSB', 'Khu vực B', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );
      const create = async (body: Record<string, string>) =>
        (
          await api()
            .post(`/${PREFIX}/admin/users`)
            .set(auth())
            .send(body)
            .expect(201)
        ).body as { id: string; temporaryPassword: string };

      const staff = await create({
        username: 'os_staff_a',
        fullName: 'Nhân viên A',
        role: 'office_staff',
        unitCode: 'KV-OSA',
      });
      const inUnit = await create({
        username: 'os_member_a',
        fullName: 'Thành viên A',
        role: 'dqtv',
        unitCode: 'KV-OSA',
      });
      const otherUnit = await create({
        username: 'os_member_b',
        fullName: 'Thành viên B',
        role: 'dqtv',
        unitCode: 'KV-OSB',
      });
      const unscoped = await create({
        username: 'os_member_none',
        fullName: 'Chưa có đơn vị',
        role: 'dqtv',
      });
      const asStaff = {
        Authorization: `Bearer ${await login('os_staff_a', staff.temporaryPassword)}`,
      };

      await api()
        .get(`/${PREFIX}/admin/users/${inUnit.id}`)
        .set(asStaff)
        .expect(200);
      for (const target of [otherUnit, unscoped]) {
        const base = `/${PREFIX}/admin/users/${target.id}`;
        await api().get(base).set(asStaff).expect(404);
        await api()
          .patch(`${base}/status`)
          .set(asStaff)
          .send({ status: 'suspended' })
          .expect(404);
        await api()
          .patch(`${base}/role`)
          .set(asStaff)
          .send({ role: 'office_staff' })
          .expect(404);
        await api().post(`${base}/reset-password`).set(asStaff).expect(404);
      }

      const untouched = await db(async (c) => {
        const { rows } = await c.query<{ status: string; roles: string[] }>(
          `SELECT u.status, array_agg(r.code) AS roles
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
           WHERE u.id = ANY($1::uuid[])
           GROUP BY u.id`,
          [[otherUnit.id, unscoped.id]],
        );
        return rows;
      });
      expect(untouched).toEqual([
        { status: 'active', roles: ['dqtv'] },
        { status: 'active', roles: ['dqtv'] },
      ]);
      // Their original temporary passwords still work
      await login('os_member_b', otherUnit.temporaryPassword);
      await login('os_member_none', unscoped.temporaryPassword);

      const listed = await api()
        .get(`/${PREFIX}/admin/users?limit=100`)
        .set(asStaff)
        .expect(200);
      const ids = (listed.body as { data: { id: string }[] }).data.map(
        (u) => u.id,
      );
      expect(ids).toEqual(expect.arrayContaining([staff.id, inUnit.id]));
      expect(ids).not.toContain(otherUnit.id);
      expect(ids).not.toContain(unscoped.id);
    });

    it('rejects unknown roles, duplicate usernames and malformed ids', async () => {
      await api()
        .post(`/${PREFIX}/admin/users`)
        .set(auth())
        .send({ username: 'x_user', fullName: 'X', role: 'root' })
        .expect(400);
      await api()
        .post(`/${PREFIX}/admin/users`)
        .set(auth())
        .send({ username: 'admin', fullName: 'Trùng tên', role: 'dqtv' })
        .expect(409);
      await api()
        .get(`/${PREFIX}/admin/users/not-a-uuid`)
        .set(auth())
        .expect(400);
    });

    it('refuses to let an administrator change their own role', async () => {
      await api()
        .patch(`/${PREFIX}/admin/users/${await userId('admin')}/role`)
        .set(auth())
        .send({ role: 'dqtv' })
        .expect(403);
    });

    // Route permissions are not hierarchical: a second, higher-priority role must not
    // take away routes the first role could reach
    it('authorizes a user holding several roles by any of them', async () => {
      const dqtvId = await userId('dqtv01');
      await db((c) =>
        c.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE code = 'office_staff'
           ON CONFLICT DO NOTHING`,
          [dqtvId],
        ),
      );
      try {
        const signedIn = await api()
          .post(`/${PREFIX}/auth/login`)
          .send({ username: 'dqtv01', password: 'Dqtv@123' })
          .expect(200);
        const body = signedIn.body as {
          tokens: { accessToken: string };
          user: Record<string, unknown>;
        };
        expect(body.user).toEqual(
          expect.objectContaining({
            role: 'office_staff',
            roles: ['office_staff', 'dqtv'],
          }),
        );

        // @Roles('dqtv_member', 'dqtv', 'system_admin') — reachable through the dqtv role
        await api()
          .get(`/${PREFIX}/militia/me/data-export`)
          .set('Authorization', `Bearer ${body.tokens.accessToken}`)
          .expect(200);
      } finally {
        await db((c) =>
          c.query(
            `DELETE FROM user_roles
             WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE code = 'office_staff')`,
            [dqtvId],
          ),
        );
      }
    });
  });

  // Officers act only inside their unit scope, and CA officers only on assigned DQTV
  describe('unit scope across evaluations, reports and pickers', () => {
    const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
    const tokens: Record<string, string> = {};
    const ids: Record<string, string> = {};

    async function account(username: string, role: string, unitCode?: string) {
      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set(adminAuth())
        .send({
          username,
          fullName: `Cán bộ ${username}`,
          role,
          ...(unitCode ? { unitCode } : {}),
        })
        .expect(201);
      const body = created.body as { id: string; temporaryPassword: string };
      ids[username] = body.id;
      tokens[username] = await login(username, body.temporaryPassword);
    }

    beforeAll(async () => {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type)
           VALUES ('KV-SC-A', 'Khu vực phạm vi A', 'area'), ('KV-SC-B', 'Khu vực phạm vi B', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );
      await account('sc_dqtv_b', 'dqtv', 'KV-SC-B');
      await db((c) =>
        c.query(
          `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
           SELECT 'DQ-SC-B1', 'Phạm Văn Phạm Vi', '079200000301', '1997-03-03', u.id, '2022-02-02', $1
           FROM units u WHERE u.code = 'KV-SC-B'`,
          [ids.sc_dqtv_b],
        ),
      );
      await account('sc_ca_area_a', 'ca_area', 'KV-SC-A');
      await account('sc_ca_officer_b', 'ca_officer', 'KV-SC-B');
      await account('sc_police_area_a', 'police_area', 'KV-SC-A');
      await account('sc_police_ward', 'police_ward');
    });

    const evaluate = (token: string, targetUserId: string) =>
      api()
        .post(`/${PREFIX}/kpi/evaluate`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          targetUserId,
          criteria: [
            'Kỷ luật',
            'Chuyên cần',
            'Huấn luyện',
            'Nhiệm vụ',
            'Tinh thần',
          ],
          scores: [8, 7, 9, 8, 7],
          recommendation: 'maintain',
        });

    it('refuses KPI evaluations outside the evaluator scope', async () => {
      // Area officer of another unit, and a CA officer the member is not assigned to
      await evaluate(tokens.sc_ca_area_a, ids.sc_dqtv_b).expect(403);
      await evaluate(tokens.sc_ca_officer_b, ids.sc_dqtv_b).expect(403);
    });

    it('records one evaluation per evaluator, member and month', async () => {
      await evaluate(adminToken, ids.sc_dqtv_b).expect(201);
      await evaluate(adminToken, ids.sc_dqtv_b).expect(409);
    });

    it('only evaluates DQTV members', async () => {
      await evaluate(adminToken, ids.sc_police_ward).expect(400);
    });

    it("keeps an area officer's Mẫu 03-BC to their own unit", async () => {
      const res = await api()
        .get(`/${PREFIX}/reports/mau-03-bc`)
        .query({ year: '2026', unitCode: 'KV-SC-B' })
        .set('Authorization', `Bearer ${tokens.sc_police_area_a}`)
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({ unitCode: 'KV-SC-A' }),
      );
    });

    // The exemption form's picker for ward officers
    it('lets ward officers pick militia members of any unit', async () => {
      const res = await api()
        .get(`/${PREFIX}/militia/search`)
        .query({ q: 'Phạm Vi' })
        .set('Authorization', `Bearer ${tokens.sc_police_ward}`)
        .expect(200);

      expect(res.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fullName: 'Phạm Văn Phạm Vi',
            unitCode: 'KV-SC-B',
          }),
        ]),
      );
    });
  });

  // Profiles hold personal data; a DQTV member may read only their own
  describe('militia profile access', () => {
    let ownProfileId: string;
    let otherProfileId: string;
    let dqtvToken: string;

    beforeAll(async () => {
      ({ ownProfileId, otherProfileId } = await db(async (c) => {
        const unit = await c.query<{ id: string }>(
          `INSERT INTO units (code, name, type) VALUES ('KV-MP', 'Khu vực hồ sơ', 'area')
           ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        );
        const unitId = unit.rows[0].id;
        await c.query(
          `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
           SELECT 'DQ-MP-OWN', 'Nguyễn Văn Chủ', '079200000201', '1999-01-01', $1, '2023-01-01', id
           FROM users WHERE username = 'dqtv01'
           ON CONFLICT DO NOTHING`,
          [unitId],
        );
        const own = await c.query<{ id: string }>(
          `SELECT mp.id FROM militia_profiles mp JOIN users u ON u.id = mp.user_id
           WHERE u.username = 'dqtv01' LIMIT 1`,
        );
        const other = await c.query<{ id: string }>(
          `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date)
           VALUES ('DQ-MP-OTHER', 'Lê Thị Khác', '079200000202', '1998-02-02', $1, '2022-01-01')
           RETURNING id`,
          [unitId],
        );
        return {
          ownProfileId: own.rows[0].id,
          otherProfileId: other.rows[0].id,
        };
      }));
      dqtvToken = await login('dqtv01', 'Dqtv@123');
    });

    const asDqtv = (path: string) =>
      api()
        .get(`/${PREFIX}/militia${path}`)
        .set('Authorization', `Bearer ${dqtvToken}`);

    // Signs in a new account with the role, scoped to the unit (created when missing)
    const staffAuth = async (
      username: string,
      role: string,
      unitCode: string,
    ) => {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ($1, $1, 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
          [unitCode],
        ),
      );
      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, fullName: 'Cán bộ', role, unitCode })
        .expect(201);
      const { temporaryPassword } = created.body as {
        temporaryPassword: string;
      };
      return {
        Authorization: `Bearer ${await login(username, temporaryPassword)}`,
      };
    };
    const officeStaffAuth = (username: string, unitCode: string) =>
      staffAuth(username, 'office_staff', unitCode);

    // Codex round 2: /dashboard/stats gave every signed-in user ward-wide counters
    it('scopes dashboard counters to what the caller may see', async () => {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('KV-MP3', 'Khu vực ba', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING;
           INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, status)
           SELECT 'DQ-MP3-A', 'Hoàng Văn Ba', '079200000204', '1996-04-04', id, '2021-04-04', 'active'
           FROM units WHERE code = 'KV-MP3'
           ON CONFLICT DO NOTHING`,
        ),
      );
      const activeMembers = (
        unitCode: string | null,
        username: string | null,
      ) =>
        db(async (c) => {
          const { rows } = await c.query<{ count: number }>(
            `SELECT count(*)::int AS count
             FROM militia_profiles mp
             JOIN units u ON u.id = mp.unit_id
             LEFT JOIN users usr ON usr.id = mp.user_id
             WHERE mp.status = 'active'
               AND ($1::text IS NULL OR u.code = $1)
               AND ($2::text IS NULL OR usr.username = $2)`,
            [unitCode, username],
          );
          return rows[0].count;
        });
      const statsFor = async (auth: Record<string, string>) =>
        (await api().get(`/${PREFIX}/dashboard/stats`).set(auth).expect(200))
          .body as { totalMilitia: number };

      const ward = await activeMembers(null, null);
      const unit = await activeMembers('KV-MP', null);
      expect(unit).toBeLessThan(ward);

      expect(
        (await statsFor({ Authorization: `Bearer ${adminToken}` }))
          .totalMilitia,
      ).toBe(ward);
      expect(
        (await statsFor(await staffAuth('dash_area', 'police_area', 'KV-MP')))
          .totalMilitia,
      ).toBe(unit);
      expect(
        (await statsFor({ Authorization: `Bearer ${dqtvToken}` })).totalMilitia,
      ).toBe(await activeMembers(null, 'dqtv01'));
    });

    // Codex round 2: training records ignored the member's unit on create, update and
    // delete, and malformed ids or bodies reached PostgreSQL
    it('keeps area officers to training records of members in their unit', async () => {
      const admin = { Authorization: `Bearer ${adminToken}` };
      const otherArea = await staffAuth(
        'tr_area_other',
        'police_area',
        'KV-MP2',
      );
      const record = {
        militiaId: otherProfileId,
        trainingType: 'military',
        fromDate: '2026-02-02',
        toDate: '2026-02-03',
        totalDays: 2,
      };

      await api()
        .post(`/${PREFIX}/training`)
        .set(otherArea)
        .send(record)
        .expect(404);

      const created = await api()
        .post(`/${PREFIX}/training`)
        .set(admin)
        .send(record)
        .expect(201);
      const { id } = created.body as { id: string };
      await api()
        .patch(`/${PREFIX}/training/${id}`)
        .set(otherArea)
        .send({ notes: 'không được sửa' })
        .expect(404);
      await api()
        .delete(`/${PREFIX}/training/${id}`)
        .set(otherArea)
        .expect(404);

      // Their own record cannot be moved onto a member of another unit
      const ownMemberId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date)
           SELECT 'DQ-MP2-A', 'Phạm Văn Hai', '079200000203', '1997-03-03', id, '2022-03-03'
           FROM units WHERE code = 'KV-MP2'
           RETURNING id`,
        );
        return rows[0].id;
      });
      const own = await api()
        .post(`/${PREFIX}/training`)
        .set(otherArea)
        .send({ ...record, militiaId: ownMemberId })
        .expect(201);
      const ownId = (own.body as { id: string }).id;
      await api()
        .patch(`/${PREFIX}/training/${ownId}`)
        .set(otherArea)
        .send({ militiaId: otherProfileId })
        .expect(404);
      const stillOwn = await db(async (c) => {
        const { rows } = await c.query<{ militia_id: string }>(
          `SELECT militia_id FROM training_records WHERE id = $1`,
          [ownId],
        );
        return rows[0].militia_id;
      });
      expect(stillOwn).toBe(ownMemberId);

      await api().get(`/${PREFIX}/training/not-a-uuid`).set(admin).expect(400);
      await api()
        .patch(`/${PREFIX}/training/${id}`)
        .set(admin)
        .send({ totalDays: 'many' })
        .expect(400);
      await api()
        .patch(`/${PREFIX}/training/${id}`)
        .set(admin)
        .send({ createdBy: 'someone' })
        .expect(400);
    });

    it('keeps the roster from DQTV members', async () => {
      await asDqtv('').expect(403);
    });

    it("hides other members' profiles and records from DQTV members", async () => {
      for (const suffix of ['', '/history', '/rewards', '/documents']) {
        await asDqtv(`/${otherProfileId}${suffix}`).expect(404);
      }
    });

    it('lets DQTV members read their own profile', async () => {
      const res = await asDqtv(`/${ownProfileId}`).expect(200);

      expect((res.body as { id: string }).id).toBe(ownProfileId);
    });

    // Codex round 2: PATCH /militia/:id updated by id alone, whatever the caller's unit
    it('lets office staff edit profiles of their own unit only', async () => {
      const phoneOf = () =>
        db(async (c) => {
          const { rows } = await c.query<{ phone: string | null }>(
            `SELECT phone FROM militia_profiles WHERE id = $1`,
            [otherProfileId],
          );
          return rows[0].phone;
        });
      const before = await phoneOf();

      await api()
        .patch(`/${PREFIX}/militia/${otherProfileId}`)
        .set(await officeStaffAuth('mp_staff_other', 'KV-MP2'))
        .send({ phone: '0909000111' })
        .expect(404);
      expect(await phoneOf()).toBe(before);

      const updated = await api()
        .patch(`/${PREFIX}/militia/${otherProfileId}`)
        .set(await officeStaffAuth('mp_staff_same', 'KV-MP'))
        .send({ phone: '0909000222' })
        .expect(200);
      expect(updated.body).toEqual(
        expect.objectContaining({ id: otherProfileId, phone: '0909000222' }),
      );
    });

    // Codex round 3: a CA officer's attendance list covered the whole unit instead of the
    // DQTV members assigned to them
    it('lists for a CA officer only the attendance of DQTV members assigned to them', async () => {
      const admin = { Authorization: `Bearer ${adminToken}` };
      const workDate = '2026-03-09';
      // Two DQTV members of the officer's own unit, each with an account and a profile
      const member = async (username: string, code: string, cccd: string) => {
        const created = await api()
          .post(`/${PREFIX}/admin/users`)
          .set(admin)
          .send({
            username,
            fullName: `DQTV ${code}`,
            role: 'dqtv',
            unitCode: 'KV-MP',
          })
          .expect(201);
        const userId = (created.body as { id: string }).id;
        return db(async (c) => {
          const { rows } = await c.query<{ id: string }>(
            `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
             SELECT $1, $2, $3, '1999-05-05', id, '2023-05-05', $4
             FROM units WHERE code = 'KV-MP'
             RETURNING id`,
            [code, `DQTV ${code}`, cccd, userId],
          );
          return rows[0].id;
        });
      };
      const assignedProfileId = await member(
        'att_dq_assigned',
        'DQ-ATT-A',
        '079200000901',
      );
      const unassignedProfileId = await member(
        'att_dq_other',
        'DQ-ATT-B',
        '079200000902',
      );
      for (const militiaId of [assignedProfileId, unassignedProfileId]) {
        await api()
          .post(`/${PREFIX}/attendance`)
          .set(admin)
          .send({ militiaId, workDate, status: 'present' })
          .expect(201);
      }

      const officer = await staffAuth('att_ca_scope', 'ca_officer', 'KV-MP');
      const listIds = async () =>
        (
          (
            await api()
              .get(`/${PREFIX}/attendance`)
              .query({ date: workDate, limit: 100 })
              .set(officer)
              .expect(200)
          ).body as { data: { militiaId: string }[]; total: number }
        ).data.map((row) => row.militiaId);

      // No assignments yet: nothing, although both members are in the officer's unit
      expect(await listIds()).toEqual([]);

      await db((c) =>
        c.query(
          `INSERT INTO ca_dqtv_assignments (ca_user_id, dqtv_user_id, assigned_by)
           SELECT ca.id, dq.id, adm.id
           FROM users ca, users dq, users adm
           WHERE ca.username = 'att_ca_scope' AND dq.username = 'att_dq_assigned'
             AND adm.username = 'admin'`,
        ),
      );
      expect(await listIds()).toEqual([assignedProfileId]);
    });

    // Codex round 2: POST /attendance had no caller, so any unit's member could be recorded
    it('lets office staff record attendance for members of their own unit only, once a day', async () => {
      const body = {
        militiaId: otherProfileId,
        workDate: '2026-03-02',
        status: 'present',
      };
      const recorded = () =>
        db(async (c) => {
          const { rows } = await c.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM attendance_records
             WHERE militia_id = $1 AND work_date = '2026-03-02'`,
            [otherProfileId],
          );
          return rows[0].count;
        });

      await api()
        .post(`/${PREFIX}/attendance`)
        .set(await officeStaffAuth('att_staff_other', 'KV-MP2'))
        .send(body)
        .expect(404);
      expect(await recorded()).toBe(0);

      const sameUnit = await officeStaffAuth('att_staff_same', 'KV-MP');
      await api()
        .post(`/${PREFIX}/attendance`)
        .set(sameUnit)
        .send(body)
        .expect(201);
      await api()
        .post(`/${PREFIX}/attendance`)
        .set(sameUnit)
        .send(body)
        .expect(409);
      expect(await recorded()).toBe(1);
    });

    it('answers 400 for a malformed profile id', async () => {
      await api()
        .get(`/${PREFIX}/militia/not-a-uuid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // What the PoliceApp and MilitianApp need beyond the web app
  describe('mobile app contract', () => {
    const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
    let memberUserId: string;
    let memberProfileId: string;
    let memberToken: string;

    beforeAll(async () => {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('KV-MOB', 'Khu vực di động', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );
      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set(adminAuth())
        .send({
          username: 'mob_dqtv',
          fullName: 'Hoàng Văn Di Động',
          role: 'dqtv',
          unitCode: 'KV-MOB',
        })
        .expect(201);
      const body = created.body as { id: string; temporaryPassword: string };
      memberUserId = body.id;
      memberProfileId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
           SELECT 'DQ-MOB-01', 'Hoàng Văn Di Động', '079200000501', '1996-06-06', u.id, '2021-01-01', $1
           FROM units u WHERE u.code = 'KV-MOB'
           RETURNING id`,
          [memberUserId],
        );
        return rows[0].id;
      });
      memberToken = await login('mob_dqtv', body.temporaryPassword);
    });

    it('stores and returns where a task takes place', async () => {
      const created = await api()
        .post(`/${PREFIX}/tasks`)
        .set(adminAuth())
        .send({
          title: 'Tuần tra chợ',
          assigneeMilitiaId: memberProfileId,
          locationName: 'Chợ Phú Định',
          locationLat: 10.7501,
          locationLng: 106.6302,
        })
        .expect(201);
      const { id } = created.body as { id: string };

      const task = await api()
        .get(`/${PREFIX}/tasks/${id}`)
        .set(adminAuth())
        .expect(200);
      expect(task.body).toEqual(
        expect.objectContaining({
          locationName: 'Chợ Phú Định',
          locationLat: 10.7501,
          locationLng: 106.6302,
        }),
      );
      await api()
        .post(`/${PREFIX}/tasks`)
        .set(adminAuth())
        .send({
          title: 'Sai toạ độ',
          assigneeMilitiaId: memberProfileId,
          locationLat: 123,
        })
        .expect(400);
    });

    it('filters work reports by status and day and names their authors', async () => {
      await api()
        .post(`/${PREFIX}/work-reports`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          reportType: 'incident',
          title: 'Va chạm giao thông',
          content: 'Hai xe máy',
          location: 'Ngã tư',
        })
        .expect(201);
      const today = businessDate().isoDate;

      const listed = await api()
        .get(`/${PREFIX}/work-reports`)
        .query({
          reviewStatus: 'pending',
          from: today,
          to: today,
          userId: memberUserId,
        })
        .set(adminAuth())
        .expect(200);
      expect((listed.body as { data: unknown[] }).data).toEqual([
        expect.objectContaining({
          authorName: 'Hoàng Văn Di Động',
          reviewStatus: 'pending',
          location: 'Ngã tư',
        }),
      ]);

      const yesterday = shiftIsoDate(today, -1);
      const none = await api()
        .get(`/${PREFIX}/work-reports`)
        .query({ from: yesterday, to: yesterday, userId: memberUserId })
        .set(adminAuth())
        .expect(200);
      expect((none.body as { total: number }).total).toBe(0);

      // Validation errors list what is wrong
      const invalid = await api()
        .get(`/${PREFIX}/work-reports`)
        .query({ from: '01/10/2026', reviewStatus: 'maybe' })
        .set(adminAuth())
        .expect(400);
      expect(invalid.body).toEqual(
        expect.objectContaining({
          message: 'validation_failed',
          errors: expect.arrayContaining([
            expect.stringContaining('from'),
          ]) as unknown,
        }),
      );
    });

    it('names conversation participants, counts unread messages and marks them read', async () => {
      const created = await api()
        .post(`/${PREFIX}/chat/conversations`)
        .set(adminAuth())
        .send({ conversationType: 'direct', participantIds: [memberUserId] })
        .expect(201);
      const convId = (created.body as { id: string }).id;
      await api()
        .post(`/${PREFIX}/chat/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Báo cáo đã gửi' })
        .expect(201);

      type Conversation = {
        id: string;
        unreadCount: number;
        participants: { id: string; fullName: string }[];
      };
      const inbox = async () => {
        const res = await api()
          .get(`/${PREFIX}/chat/conversations`)
          .set(adminAuth())
          .expect(200);
        return (res.body as Conversation[]).find((c) => c.id === convId);
      };

      expect(await inbox()).toEqual(
        expect.objectContaining({
          unreadCount: 1,
          participants: [
            expect.objectContaining({
              id: memberUserId,
              fullName: 'Hoàng Văn Di Động',
            }),
          ],
        }),
      );
      await api()
        .post(`/${PREFIX}/chat/conversations/${convId}/read`)
        .set(adminAuth())
        .expect(200);
      expect(await inbox()).toEqual(
        expect.objectContaining({ unreadCount: 0 }),
      );
    });

    // Flutter agent: opening a chat with someone again created a second, empty
    // conversation, and the create answer did not say who was in it
    it('returns the existing direct conversation with its participants instead of opening another', async () => {
      const open = () =>
        api()
          .post(`/${PREFIX}/chat/conversations`)
          .set(adminAuth())
          .send({ conversationType: 'direct', participantIds: [memberUserId] });

      const first = await open();
      expect([200, 201]).toContain(first.status);
      const again = await open().expect(200);

      expect((again.body as { id: string }).id).toBe(
        (first.body as { id: string }).id,
      );
      expect(again.body).toEqual(
        expect.objectContaining({
          conversationType: 'direct',
          participants: [expect.objectContaining({ id: memberUserId })],
          unreadCount: expect.any(Number) as unknown,
        }),
      );

      const list = await api()
        .get(`/${PREFIX}/chat/conversations`)
        .set(adminAuth())
        .expect(200);
      const directWithMember = (
        list.body as {
          conversationType: string;
          participants: { id: string }[];
        }[]
      ).filter(
        (c) =>
          c.conversationType === 'direct' &&
          c.participants.some((p) => p.id === memberUserId),
      );
      expect(directWithMember).toHaveLength(1);
    });
  });

  describe('leave requests', () => {
    let leaveTypeId: string;
    let dqtvToken: string;

    const createRequest = async (
      token: string,
      fromDate: string,
      toDate: string,
    ) => {
      const res = await api()
        .post(`/${PREFIX}/leave`)
        .set('Authorization', `Bearer ${token}`)
        .send({ leaveTypeId, fromDate, toDate, reason: 'Việc gia đình' })
        .expect(201);
      return (res.body as { id: string }).id;
    };
    const balanceOf = (username: string) =>
      db(async (c) => {
        const { rows } = await c.query<{ used: string; remaining: string }>(
          `SELECT lb.used_days AS used, lb.remaining_days AS remaining
           FROM leave_balances lb JOIN users u ON u.id = lb.user_id
           WHERE u.username = $1 AND lb.leave_type_id = $2 AND lb.year = 2027`,
          [username, leaveTypeId],
        );
        return {
          used: Number(rows[0].used),
          remaining: Number(rows[0].remaining),
        };
      });

    beforeAll(async () => {
      leaveTypeId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO leave_types (code, name) VALUES ('e2e_annual', 'Nghỉ phép năm') RETURNING id`,
        );
        await c.query(
          `INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, remaining_days)
           SELECT id, $1, 2027, 12, 0, 12 FROM users WHERE username IN ('dqtv01', 'admin')`,
          [rows[0].id],
        );
        return rows[0].id;
      });
      dqtvToken = await login('dqtv01', 'Dqtv@123');
    });

    it('approves a request once, records the decision and deducts the balance', async () => {
      // Monday 1 and Tuesday 2 March 2027
      const id = await createRequest(dqtvToken, '2027-03-01', '2027-03-02');
      // Calendar dates reach clients as written, not as timestamps shifted by a timezone
      const stored = await api()
        .get(`/${PREFIX}/leave/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(stored.body).toEqual(
        expect.objectContaining({
          fromDate: '2027-03-01',
          toDate: '2027-03-02',
        }),
      );

      await api()
        .patch(`/${PREFIX}/leave/${id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve', reason: 'Đồng ý' })
        .expect(204);
      await api()
        .put(`/${PREFIX}/approvals/${id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      const decision = await db(async (c) => {
        const { rows } = await c.query<{ status: string; action: string }>(
          `SELECT lr.status, la.action
           FROM leave_requests lr JOIN leave_approvals la ON la.leave_request_id = lr.id
           WHERE lr.id = $1`,
          [id],
        );
        return rows;
      });
      expect(decision).toEqual([{ status: 'approved', action: 'approved' }]);
      expect(await balanceOf('dqtv01')).toEqual({ used: 2, remaining: 10 });
    });

    it('rejects a request without touching the balance', async () => {
      const before = await balanceOf('dqtv01');
      const id = await createRequest(dqtvToken, '2027-03-08', '2027-03-08');

      await api()
        .put(`/${PREFIX}/approvals/${id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Trùng lịch trực' })
        .expect(204);

      expect(await balanceOf('dqtv01')).toEqual(before);
    });

    it('does not let a reviewer decide their own request', async () => {
      const id = await createRequest(adminToken, '2027-03-15', '2027-03-15');

      await api()
        .patch(`/${PREFIX}/leave/${id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve' })
        .expect(403);
    });

    // A half day is half of a single working day
    it('files a half day only on one working day', async () => {
      const halfDay = (fromDate: string, toDate: string) =>
        api()
          .post(`/${PREFIX}/leave`)
          .set('Authorization', `Bearer ${dqtvToken}`)
          .send({
            leaveTypeId,
            fromDate,
            toDate,
            isHalfDay: true,
            halfDayPeriod: 'morning',
            reason: 'Khám bệnh',
          });

      // Monday 22 to Friday 26 March 2027
      const range = await halfDay('2027-03-22', '2027-03-26').expect(400);
      expect((range.body as { message: string }).message).toBe(
        'half_day_requires_single_date',
      );
      // Saturday 27 March 2027
      const weekend = await halfDay('2027-03-27', '2027-03-27').expect(400);
      expect((weekend.body as { message: string }).message).toBe(
        'invalid_date_range_no_working_days',
      );

      // Monday 22 March 2027
      const filed = await halfDay('2027-03-22', '2027-03-22').expect(201);
      expect(filed.body).toEqual(
        expect.objectContaining({ isHalfDay: true, totalDays: 0.5 }),
      );
    });

    // Reviewers request leave too: a CA officer reviews only the DQTV assigned to them,
    // yet always reads their own requests
    it('lets a CA officer read their own request', async () => {
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('KV-LEAVE', 'Khu vực nghỉ phép', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );
      const created = await api()
        .post(`/${PREFIX}/admin/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'leave_ca_officer',
          fullName: 'Cán bộ CA',
          role: 'ca_officer',
          unitCode: 'KV-LEAVE',
        })
        .expect(201);
      const { temporaryPassword } = created.body as {
        temporaryPassword: string;
      };
      const caToken = await login('leave_ca_officer', temporaryPassword);
      const id = await createRequest(caToken, '2027-03-29', '2027-03-29');

      await api()
        .get(`/${PREFIX}/leave/${id}`)
        .set('Authorization', `Bearer ${caToken}`)
        .expect(200);
      const listed = await api()
        .get(`/${PREFIX}/leave`)
        .set('Authorization', `Bearer ${caToken}`)
        .expect(200);
      expect(
        (listed.body as { data: { id: string }[] }).data.map((r) => r.id),
      ).toContain(id);
      // Nothing to review: their own request is not among their approvals
      const approvals = await api()
        .get(`/${PREFIX}/approvals`)
        .set('Authorization', `Bearer ${caToken}`)
        .expect(200);
      expect(approvals.body).toEqual([]);
    });

    it('answers 400 for malformed ids and dates', async () => {
      await api()
        .patch(`/${PREFIX}/leave/not-a-uuid/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'approve' })
        .expect(400);
      await api()
        .post(`/${PREFIX}/leave`)
        .set('Authorization', `Bearer ${dqtvToken}`)
        .send({
          leaveTypeId,
          fromDate: '2027-02-30',
          toDate: '2027-03-01',
          reason: 'x',
        })
        .expect(400);
    });
  });

  describe('audit log', () => {
    const profileA = randomUUID();
    const profileB = randomUUID();

    beforeAll(() =>
      db((c) =>
        c.query(
          `INSERT INTO audit_logs (action, entity_type, entity_id, created_at) VALUES
             ('UPDATE', 'militia_profile', $1, '2026-04-09T17:30:00Z'),
             ('UPDATE', 'militia_profile', $2, '2026-04-09T10:00:00Z')`,
          [profileA, profileB],
        ),
      ),
    );

    const list = (query: Record<string, string>) =>
      api()
        .get(`/${PREFIX}/audit`)
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`);

    it("lists one entity's history", async () => {
      const res = await list({
        entityType: 'militia_profile',
        entityId: profileA,
      }).expect(200);

      expect((res.body as { total: number }).total).toBe(1);
    });

    // 2026-04-09T17:30Z is 00:30 on 10 April in Vietnam
    it('filters by Vietnamese calendar days', async () => {
      const onTenth = await list({
        entityId: profileA,
        from: '2026-04-10',
        to: '2026-04-10',
      }).expect(200);
      const onNinth = await list({
        entityId: profileA,
        from: '2026-04-09',
        to: '2026-04-09',
      }).expect(200);

      expect((onTenth.body as { total: number }).total).toBe(1);
      expect((onNinth.body as { total: number }).total).toBe(0);
    });

    it('answers 400 for malformed ids and dates', async () => {
      await list({ entityId: 'not-a-uuid' }).expect(400);
      await list({ actorId: 'not-a-uuid' }).expect(400);
      await list({ from: 'yesterday' }).expect(400);
    });

    // Codex round 2: area roles read ward-wide entries, with IP addresses and change
    // contents, whatever unit the actor belonged to
    it('shows area officers only entries made by people of their unit', async () => {
      const admin = { Authorization: `Bearer ${adminToken}` };
      await db((c) =>
        c.query(
          `INSERT INTO units (code, name, type) VALUES ('KV-AUD', 'Khu vực kiểm toán', 'area')
           ON CONFLICT (tenant_id, code) DO NOTHING`,
        ),
      );
      const create = async (
        username: string,
        role: string,
        unitCode?: string,
      ) =>
        (
          await api()
            .post(`/${PREFIX}/admin/users`)
            .set(admin)
            .send({
              username,
              fullName: 'Người kiểm toán',
              role,
              ...(unitCode ? { unitCode } : {}),
            })
            .expect(201)
        ).body as { id: string; temporaryPassword: string };

      const officer = await create('aud_area_officer', 'police_area', 'KV-AUD');
      const colleague = await create('aud_colleague', 'office_staff', 'KV-AUD');
      const unscopedOfficer = await create('aud_area_noscope', 'police_area');
      const entity = randomUUID();
      await db((c) =>
        c.query(
          `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
           SELECT $1::uuid, 'UPDATE', 'aud_scope', $2::uuid
           UNION ALL
           SELECT id, 'UPDATE', 'aud_scope', $2::uuid FROM users WHERE username = 'admin'`,
          [colleague.id, entity],
        ),
      );

      const asOfficer = {
        Authorization: `Bearer ${await login('aud_area_officer', officer.temporaryPassword)}`,
      };
      for (const path of ['audit', 'audit-logs']) {
        const scoped = await api()
          .get(`/${PREFIX}/${path}`)
          .query({ entityId: entity })
          .set(asOfficer)
          .expect(200);
        const body = scoped.body as {
          total: number;
          data: { actorId: string }[];
        };
        expect(body.total).toBe(1);
        expect(body.data.map((row) => row.actorId)).toEqual([colleague.id]);
      }

      const wide = await list({ entityId: entity }).expect(200);
      expect((wide.body as { total: number }).total).toBe(2);

      // An area role without a unit is refused rather than shown the whole ward
      await api()
        .get(`/${PREFIX}/audit`)
        .set({
          Authorization: `Bearer ${await login('aud_area_noscope', unscopedOfficer.temporaryPassword)}`,
        })
        .expect(403);
    });
  });

  // Codex round 2: these reached date, integer or uuid SQL and answered 500, or a typo
  // such as year=2026junk silently selected 2026
  describe('query validation', () => {
    it.each([
      '/attendance?date=bad',
      '/attendance?from=2026-02-30',
      '/attendance?to=13-01-2026',
      '/attendance/summary?from=2026-02-30',
      '/attendance/summary?to=bad',
      '/attendance/export?from=x',
      '/reports/mau-03-bc?year=x',
      '/reports/mau-03-bc?year=2026junk',
      '/reports/mau-03-bc/export?year=99999',
      '/kpi/summary-report?periodId=bad',
      '/kpi/summary-report',
      '/kpi/export?periodId=bad',
      '/weapons/not-a-uuid',
      '/militia/rewards-report?from=yesterday',
      '/militia/rewards-report?to=2026-02-30',
      '/militia/rewards-report?from=2026-03-10&to=2026-03-01',
      '/militia/rewards-export?from=bad',
      '/militia/rewards-export?from=2026-03-10&to=2026-03-01',
    ])('answers 400 for GET %s', async (path) => {
      await api()
        .get(`/${PREFIX}${path}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('still answers well-formed requests', async () => {
      for (const path of [
        '/attendance?from=2026-02-01&to=2026-02-28',
        '/attendance/summary?from=2026-02-01&to=2026-02-28',
        '/reports/mau-03-bc?year=2026',
        '/militia/rewards-report?from=2026-01-01&to=2026-12-31',
      ]) {
        await api()
          .get(`/${PREFIX}${path}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      }
    });

    // T18 follow-up: weapon ids reached PostgreSQL unchecked and answered 500
    it('refuses malformed weapon ids on every method before any query', async () => {
      const admin = { Authorization: `Bearer ${adminToken}` };
      const answers = [
        await api().get(`/${PREFIX}/weapons/not-a-uuid`).set(admin),
        // Valid bodies, so only the id can be refused
        await api().patch(`/${PREFIX}/weapons/not-a-uuid`).set(admin).send({}),
        await api().delete(`/${PREFIX}/weapons/not-a-uuid`).set(admin),
        await api()
          .patch(`/${PREFIX}/weapons/allocations/not-a-uuid/return`)
          .set(admin)
          .send({ returnedAt: '2026-03-01' }),
      ];
      for (const answer of answers) {
        expect(answer.status).toBe(400);
        expect((answer.body as { message?: unknown }).message).toBe(
          'Validation failed (uuid is expected)',
        );
      }
    });
  });

  describe('payroll periods', () => {
    type Period = {
      id: string;
      status: string;
      lockedBy: string | null;
      lockedAt: string | null;
    };
    const auth = () => ({ Authorization: `Bearer ${adminToken}` });

    async function listed(id: string): Promise<Period | undefined> {
      const res = await api()
        .get(`/${PREFIX}/payroll/periods`)
        .set(auth())
        .expect(200);
      return (res.body as Period[]).find((p) => p.id === id);
    }

    it('locks a period, records who locked it, and clears that on reopen', async () => {
      const created = await api()
        .post(`/${PREFIX}/payroll/periods`)
        .set(auth())
        .send({ year: 2031, month: 1 })
        .expect(201);
      const id = (created.body as { id: string }).id;
      const adminId = await db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM users WHERE username = 'admin'`,
        );
        return rows[0].id;
      });

      const locked = await api()
        .post(`/${PREFIX}/payroll/periods/${id}/lock`)
        .set(auth())
        .expect(200);
      expect(locked.body).toEqual(
        expect.objectContaining({ id, status: 'locked', lockedBy: adminId }),
      );
      expect((locked.body as Period).lockedAt).toEqual(expect.any(String));
      expect(await listed(id)).toEqual(
        expect.objectContaining({ status: 'locked', lockedBy: adminId }),
      );

      await api()
        .post(`/${PREFIX}/payroll/periods/${id}/lock`)
        .set(auth())
        .expect(409);

      await api()
        .post(`/${PREFIX}/payroll/periods/${id}/reopen`)
        .set(auth())
        .expect(200);
      expect(await listed(id)).toEqual(
        expect.objectContaining({
          status: 'draft',
          lockedBy: null,
          lockedAt: null,
        }),
      );
    });

    it('calculates allowances for every active member, keeps manual adjustments and exports the sheet', async () => {
      const created = await api()
        .post(`/${PREFIX}/payroll/periods`)
        .set(auth())
        .send({ year: 2031, month: 2 })
        .expect(201);
      const periodId = (created.body as { id: string }).id;

      const { memberId, adjustedId, dailyRate, trainingRate } = await db(
        async (c) => {
          const unit = await c.query<{ id: string }>(
            `INSERT INTO units (code, name, type) VALUES ('KV-PR', 'Khu vực lương', 'area')
           ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          );
          const insertMember = async (
            code: string,
            name: string,
            cccd: string,
          ) => {
            const { rows } = await c.query<{ id: string }>(
              `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date)
             VALUES ($1, $2, $3, '1995-05-05', $4, '2020-01-01') RETURNING id`,
              [code, name, cccd, unit.rows[0].id],
            );
            return rows[0].id;
          };
          const member = await insertMember(
            'DQ-PR-01',
            'Võ Văn <Lương>',
            '079200000401',
          );
          const adjusted = await insertMember(
            'DQ-PR-02',
            'Đỗ Thị Điều Chỉnh',
            '079200000402',
          );
          // Three days on duty in February 2031 and one absence
          await c.query(
            `INSERT INTO attendance_records (militia_id, work_date, status, source)
           VALUES ($1, '2031-02-03', 'checked_in', 'web'), ($1, '2031-02-04', 'checked_in', 'web'),
                  ($1, '2031-02-05', 'late', 'web'), ($1, '2031-02-06', 'absent', 'web')`,
            [member],
          );
          // A six-day course with three of its days in February
          await c.query(
            `INSERT INTO training_records (militia_id, training_type, from_date, to_date, total_days, created_by)
           SELECT $1, 'military', '2031-02-26', '2031-03-03', 6, id FROM users WHERE username = 'admin'`,
            [member],
          );
          // The member whose KPI is adjusted by hand also served two days
          await c.query(
            `INSERT INTO attendance_records (militia_id, work_date, status, source)
           VALUES ($1, '2031-02-10', 'checked_in', 'web'), ($1, '2031-02-11', 'checked_in', 'web')`,
            [adjusted],
          );
          const settings = await c.query<{ key: string; value: string }>(
            `SELECT key, value FROM system_settings
           WHERE key IN ('min_wage_region_1', 'training_daily_allowance_rate')`,
          );
          const byKey = new Map(
            settings.rows.map((r) => [r.key, Number(r.value)]),
          );
          return {
            memberId: member,
            adjustedId: adjusted,
            dailyRate: (byKey.get('min_wage_region_1') ?? 4_960_000) / 26,
            trainingRate: byKey.get('training_daily_allowance_rate') ?? 0.2,
          };
        },
      );

      await api()
        .patch(`/${PREFIX}/payroll/kpi/${adjustedId}`)
        .query({ periodId })
        .set(auth())
        .send({ adjustedScore: 80, adjustmentNote: 'Điều chỉnh theo biên bản' })
        .expect(200);

      // A fresh draft period has no items yet: calculating must cover every active member
      await api()
        .post(`/${PREFIX}/payroll/periods/${periodId}/calculate`)
        .set(auth())
        .expect(200);

      const items = await db(async (c) => {
        const { rows } = await c.query<{
          militia_id: string;
          attendance_allowance: string;
          training_allowance: string;
          net_salary: string;
          is_manually_adjusted: boolean;
          adjusted_score: string | null;
        }>(
          `SELECT militia_id, attendance_allowance, training_allowance, net_salary,
                  is_manually_adjusted, adjusted_score
           FROM payroll_items WHERE payroll_period_id = $1 AND militia_id = ANY($2::uuid[])`,
          [periodId, [memberId, adjustedId]],
        );
        return new Map(rows.map((r) => [r.militia_id, r]));
      });
      const member = items.get(memberId);
      expect(member).toBeDefined();
      expect(Number(member!.attendance_allowance)).toBeCloseTo(
        3 * dailyRate * 1.5,
        0,
      );
      expect(Number(member!.training_allowance)).toBeCloseTo(
        3 * dailyRate * trainingRate,
        0,
      );
      expect(Number(member!.net_salary)).toBeCloseTo(
        Number(member!.attendance_allowance) +
          Number(member!.training_allowance),
        0,
      );
      // Codex round 2: a manual KPI adjustment kept only the KPI fields by hand; the
      // member's attendance and training allowances are still calculated
      const adjustedItem = items.get(adjustedId);
      expect(adjustedItem).toEqual(
        expect.objectContaining({ is_manually_adjusted: true }),
      );
      expect(Number(adjustedItem!.adjusted_score)).toBe(80);
      expect(Number(adjustedItem!.attendance_allowance)).toBeCloseTo(
        2 * dailyRate * 1.5,
        0,
      );
      expect(Number(adjustedItem!.training_allowance)).toBe(0);
      expect(Number(adjustedItem!.net_salary)).toBeCloseTo(
        2 * dailyRate * 1.5,
        0,
      );

      const sheet = await api()
        .get(`/${PREFIX}/payroll/periods/${periodId}/export-pdf`)
        .set(auth())
        .expect(200);
      expect(sheet.headers['content-type']).toMatch(/text\/html/);
      expect(sheet.text).toContain('Võ Văn &lt;Lương&gt;');
      expect(sheet.text).not.toContain('<Lương>');

      const workbook = await api()
        .get(`/${PREFIX}/payroll/export`)
        .query({ periodId })
        .set(auth())
        .expect(200);
      expect(workbook.headers['content-type']).toMatch(/spreadsheetml/);

      await api()
        .get(`/${PREFIX}/payroll/compliance-check`)
        .query({ periodId })
        .set(auth())
        .expect(200);
    });

    it('answers 400 for malformed period and member ids', async () => {
      await api()
        .post(`/${PREFIX}/payroll/periods/not-a-uuid/calculate`)
        .set(auth())
        .expect(400);
      await api()
        .post(`/${PREFIX}/payroll/periods/not-a-uuid/lock`)
        .set(auth())
        .expect(400);
      await api()
        .post(`/${PREFIX}/payroll/periods/not-a-uuid/reopen`)
        .set(auth())
        .expect(400);
      await api()
        .get(`/${PREFIX}/payroll/periods/not-a-uuid/export-pdf`)
        .set(auth())
        .expect(400);
      for (const path of ['export', 'compliance-check', 'kpi']) {
        await api()
          .get(`/${PREFIX}/payroll/${path}`)
          .query({ periodId: 'bad' })
          .set(auth())
          .expect(400);
      }
      await api()
        .patch(`/${PREFIX}/payroll/kpi/not-a-uuid`)
        .query({ periodId: randomUUID() })
        .set(auth())
        .send({ adjustedScore: 50, adjustmentNote: 'x' })
        .expect(400);
    });
  });
});

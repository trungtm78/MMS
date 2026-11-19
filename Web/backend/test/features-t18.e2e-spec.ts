// Features T18 on a real, freshly migrated Postgres: khen thưởng, kỷ luật and khiếu nại
// (/rewards, /discipline), training plans, sessions and attendance (/training/plans,
// /training/sessions), weapon inventory checks (/weapons/inventory) and the migration 026
// schema guards. Covers what mocked unit tests cannot: the SQL itself, unit scope through
// real tokens, route order, constraints, triggers and concurrent requests.
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5440/postgres
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import type { Server } from 'http';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { businessDate, shiftIsoDate } from '../src/common/time/business-date';
import { configureHttpApp } from '../src/app.setup';
import { withClient } from './support/db';
import {
  assertAppliedTenancyMode,
  backendTenancyEnv,
  prepareDatabaseForTenancy,
} from './support/e2e-tenancy';

jest.setTimeout(180_000);

const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
if (!adminUrl) {
  throw new Error(
    'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:mms_secret@localhost:5440/postgres)',
  );
}

const PREFIX = 'api/v1/mms_core';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

type Body = Record<string, unknown>;
const bodyOf = <T = Body>(res: request.Response) => res.body as T;
const messageOf = (res: request.Response) =>
  bodyOf<{ message?: string }>(res).message;
const statusesOf = (responses: request.Response[]) =>
  responses.map((r) => r.status).sort((a, b) => a - b);

function databaseUrl(name: string): string {
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  return url.toString();
}

describe('Features T18 (e2e)', () => {
  const dbName = `mms_t18_${Date.now()}`;
  const targetUrl = databaseUrl(dbName);
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const passwords: Record<string, string> = {};
  // Militia profile ids: a1 and a2 in unit A (a1 is t18_dqtv_a), b1 in unit B (t18_dqtv_b)
  const members: Record<string, string> = {};

  const api = () => request(app.getHttpServer() as Server);
  const db = <T>(fn: (client: Client) => Promise<T>) =>
    withClient(targetUrl, fn);
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const url = (route: string) => `/${PREFIX}${route}`;
  const today = () => businessDate().isoDate;
  const thisYear = () => Number(today().slice(0, 4));

  async function login(username: string, password: string): Promise<string> {
    const res = await api()
      .post(url('/auth/login'))
      .send({ username, password })
      .expect(200);
    return bodyOf<{ tokens: { accessToken: string } }>(res).tokens.accessToken;
  }

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
  ): Promise<string> {
    return db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
         SELECT $1, $2, $3, '1998-04-04', u.id, '2022-01-01', $5
         FROM units u WHERE u.code = $4
         RETURNING id`,
        [code, name, cccd, unitCode, userId],
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
    assertAppliedTenancyMode();
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
         VALUES ('KV-T18-A', 'Khu vực T18 A', 'area'), ('KV-T18-B', 'Khu vực T18 B', 'area')
         ON CONFLICT (tenant_id, code) DO NOTHING`,
      ),
    );
    await account('t18_ward', 'police_ward');
    await account('t18_staff_a', 'office_staff', 'KV-T18-A');
    await account('t18_area_a', 'police_area', 'KV-T18-A');
    await account('t18_area_b', 'police_area', 'KV-T18-B');
    await account('t18_leader', 'ubnd_leader');
    await account('t18_dqtv_a', 'dqtv', 'KV-T18-A');
    await account('t18_dqtv_b', 'dqtv', 'KV-T18-B');

    members.a1 = await insertMember(
      'DQ-T18-A1',
      'Nguyễn Văn An',
      '079200018001',
      'KV-T18-A',
      userIds.t18_dqtv_a,
    );
    members.a2 = await insertMember(
      'DQ-T18-A2',
      'Trần Văn Bình',
      '079200018002',
      'KV-T18-A',
      null,
    );
    members.b1 = await insertMember(
      'DQ-T18-B1',
      'Lê Văn Cường',
      '079200018003',
      'KV-T18-B',
      userIds.t18_dqtv_b,
    );
  });

  afterAll(async () => {
    await app?.close();
    await withClient(adminUrl, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`),
    );
  });

  async function auditRows(action: string, entityId: string) {
    return db(async (c) => {
      const { rows } = await c.query<{
        actor_id: string;
        entity_type: string;
        after_json: Body;
      }>(
        `SELECT actor_id, entity_type, after_json FROM audit_logs
         WHERE action = $1 AND entity_id = $2`,
        [action, entityId],
      );
      return rows;
    });
  }

  // ── Khen thưởng ───────────────────────────────────────────────────────────────

  describe('khen thưởng: /rewards', () => {
    const reward = (militiaId: string, change: Body = {}) => ({
      militiaId,
      rewardType: 'giay_khen',
      issuingAuthority: 'commune',
      criteria: 'Hoàn thành xuất sắc nhiệm vụ tuần tra',
      issuedDate: shiftIsoDate(today(), -10),
      ...change,
    });
    const ids = async (who: string, query = '') =>
      bodyOf<{ id: string }[]>(
        await api()
          .get(url(`/rewards${query}`))
          .set(auth(who))
          .expect(200),
      ).map((r) => r.id);
    let rewardA1: string;
    let rewardA2: string;
    let rewardB1: string;

    it('records a decision for a member of the caller unit and audits it', async () => {
      const res = await api()
        .post(url('/rewards'))
        .set(auth('t18_staff_a'))
        .send(
          reward(members.a1, { basis: 'ad_hoc', decisionNumber: '12/QĐ-UBND' }),
        )
        .expect(201);

      expect(bodyOf(res)).toMatchObject({
        militiaId: members.a1,
        militiaName: 'Nguyễn Văn An',
        militiaCode: 'DQ-T18-A1',
        unitCode: 'KV-T18-A',
        rewardType: 'giay_khen',
        rewardTypeLabel: 'Giấy khen',
        issuingAuthority: 'commune',
        issuingAuthorityLabel: 'Chủ tịch UBND cấp xã',
        basis: 'ad_hoc',
        criteria: 'Hoàn thành xuất sắc nhiệm vụ tuần tra',
        decisionNumber: '12/QĐ-UBND',
        issuedDate: shiftIsoDate(today(), -10),
        createdBy: userIds.t18_staff_a,
      });
      rewardA1 = bodyOf<{ id: string }>(res).id;

      const audit = await auditRows('reward.issued', rewardA1);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actor_id: userIds.t18_staff_a,
        entity_type: 'reward_decisions',
        after_json: expect.objectContaining({
          rewardType: 'giay_khen',
        }) as unknown,
      });
    });

    it('answers 404 for a member outside the caller unit, exactly as for a missing one', async () => {
      for (const militiaId of [members.b1, randomUUID()]) {
        const res = await api()
          .post(url('/rewards'))
          .set(auth('t18_staff_a'))
          .send(reward(militiaId))
          .expect(404);
        expect(messageOf(res)).toBe('militia_not_found');
      }
    });

    it('scopes reads: staff to their unit, DQTV members to their own decisions', async () => {
      rewardB1 = bodyOf<{ id: string }>(
        await api()
          .post(url('/rewards'))
          .set(auth('admin'))
          .send(reward(members.b1))
          .expect(201),
      ).id;
      rewardA2 = bodyOf<{ id: string }>(
        await api()
          .post(url('/rewards'))
          .set(auth('t18_ward'))
          .send(reward(members.a2, { rewardType: 'chien_si_tien_tien' }))
          .expect(201),
      ).id;

      expect(await ids('t18_ward')).toEqual(
        expect.arrayContaining([rewardA1, rewardA2, rewardB1]),
      );
      const staffA = await ids('t18_staff_a');
      expect(staffA).toEqual(expect.arrayContaining([rewardA1, rewardA2]));
      expect(staffA).not.toContain(rewardB1);
      // A scoped officer cannot widen the scope by naming another unit
      expect(await ids('t18_staff_a', '?unitCode=KV-T18-B')).not.toContain(
        rewardB1,
      );
      const wardOnB = await ids('t18_ward', '?unitCode=KV-T18-B');
      expect(wardOnB).toContain(rewardB1);
      expect(wardOnB).not.toContain(rewardA1);
      expect(await ids('t18_dqtv_a')).toEqual([rewardA1]);
      expect(
        await ids(
          't18_ward',
          `?rewardType=chien_si_tien_tien&militiaId=${members.a2}`,
        ),
      ).toEqual([rewardA2]);

      expect(
        messageOf(
          await api()
            .get(url(`/rewards/${rewardB1}`))
            .set(auth('t18_staff_a'))
            .expect(404),
        ),
      ).toBe('reward_not_found');
      await api()
        .get(url(`/rewards/${rewardA2}`))
        .set(auth('t18_dqtv_a'))
        .expect(404);
      await api()
        .get(url(`/rewards/${rewardA1}`))
        .set(auth('t18_dqtv_a'))
        .expect(200);
    });

    // Every role an account holds counts, whatever its priority
    it('gives a staff member who is also a militia member their unit and their own decisions', async () => {
      await account('t18_staff_member', 'office_staff', 'KV-T18-B');
      const ownProfile = await insertMember(
        'DQ-T18-SM',
        'Cán bộ kiêm dân quân',
        '079200018099',
        'KV-T18-A',
        userIds.t18_staff_member,
      );
      await db((c) =>
        c.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE code = 'dqtv'`,
          [userIds.t18_staff_member],
        ),
      );
      // Roles travel in the token: sign in again to carry both
      tokens.t18_staff_member = await login(
        't18_staff_member',
        passwords.t18_staff_member,
      );
      const own = bodyOf<{ id: string }>(
        await api()
          .post(url('/rewards'))
          .set(auth('t18_ward'))
          .send(reward(ownProfile))
          .expect(201),
      ).id;

      const listed = await ids('t18_staff_member');
      expect(listed).toEqual(expect.arrayContaining([rewardB1, own]));
      expect(listed).not.toContain(rewardA1);
      await api()
        .get(url(`/rewards/${own}`))
        .set(auth('t18_staff_member'))
        .expect(200);
      await api()
        .get(url(`/rewards/${rewardA1}`))
        .set(auth('t18_staff_member'))
        .expect(404);
    });

    // Neither role manages rewards: together they grant nothing
    it('refuses police_area held with ca_officer', async () => {
      await account('t18_area_ca', 'police_area', 'KV-T18-A');
      await db((c) =>
        c.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE code = 'ca_officer'`,
          [userIds.t18_area_ca],
        ),
      );
      tokens.t18_area_ca = await login('t18_area_ca', passwords.t18_area_ca);

      await api().get(url('/rewards')).set(auth('t18_area_ca')).expect(403);
      await api().get(url('/discipline')).set(auth('t18_area_ca')).expect(403);
    });

    it('refuses roles outside the rewards staff and readers', async () => {
      await api().get(url('/rewards')).set(auth('t18_leader')).expect(403);
      await api().get(url('/rewards')).set(auth('t18_area_a')).expect(403);
      await api()
        .post(url('/rewards'))
        .set(auth('t18_dqtv_a'))
        .send(reward(members.a1))
        .expect(403);
      await api().get(url('/rewards')).expect(401);
    });

    it('refuses malformed ids and invalid bodies', async () => {
      await api()
        .get(url('/rewards/not-a-uuid'))
        .set(auth('admin'))
        .expect(400);
      await api()
        .get(url('/rewards?from=2026-13-01'))
        .set(auth('admin'))
        .expect(400);
      expect(
        messageOf(
          await api()
            .get(url('/rewards?from=2026-05-01&to=2026-04-30'))
            .set(auth('admin'))
            .expect(400),
        ),
      ).toBe('invalid_date_range');

      for (const body of [
        { ...reward(members.a1), militiaName: 'Nguyễn Văn An' },
        reward(members.a1, { rewardType: 'Giấy khen' }),
        reward(members.a1, { issuingAuthority: 'UBND xã/phường' }),
        reward(members.a1, { issuedDate: '2026-02-30' }),
        reward('mp-1'),
      ]) {
        await api()
          .post(url('/rewards'))
          .set(auth('admin'))
          .send(body)
          .expect(400);
      }

      const refused = async (change: Body) =>
        messageOf(
          await api()
            .post(url('/rewards'))
            .set(auth('admin'))
            .send(reward(members.a1, change))
            .expect(400),
        );
      expect(await refused({ issuedDate: shiftIsoDate(today(), 1) })).toBe(
        'decision_date_in_future',
      );
      expect(await refused({ rewardType: 'bang_khen' })).toBe(
        'reward_authority_not_allowed',
      );
      expect(
        await refused({
          issuingAuthority: 'district',
          issuedDate: '2025-07-01',
        }),
      ).toBe('reward_authority_not_allowed');
      // A district-level decision from before the reform is still a valid record
      await api()
        .post(url('/rewards'))
        .set(auth('admin'))
        .send(
          reward(members.a1, {
            issuingAuthority: 'district',
            issuedDate: '2025-06-30',
          }),
        )
        .expect(201);
    });

    it('keeps decisions: the database refuses to change or delete them, or their member', async () => {
      await expect(
        db((c) =>
          c.query(`UPDATE reward_decisions SET criteria = 'x' WHERE id = $1`, [
            rewardA1,
          ]),
        ),
      ).rejects.toThrow(/cannot be changed/);
      await expect(
        db((c) =>
          c.query(`DELETE FROM reward_decisions WHERE id = $1`, [rewardA1]),
        ),
      ).rejects.toThrow(/cannot be deleted/);
      await expect(
        db((c) =>
          c.query(
            `INSERT INTO reward_decisions (militia_id, reward_form, issuing_authority, issued_date, created_by)
             VALUES ($1, 'giay_khen', 'district', '2025-07-01', $2)`,
            [members.a1, userIds.admin],
          ),
        ),
      ).rejects.toThrow(/chk_reward_decisions_district_before_2025/);
      await expect(
        db((c) =>
          c.query(`DELETE FROM militia_profiles WHERE id = $1`, [members.a2]),
        ),
      ).rejects.toThrow(/foreign key/);
    });

    it('shows the decisions in the member profile tab', async () => {
      const res = await api()
        .get(url(`/militia/${members.a1}/rewards`))
        .set(auth('t18_staff_a'))
        .expect(200);

      expect(bodyOf<Body[]>(res)).toContainEqual(
        expect.objectContaining({
          id: rewardA1,
          rewardType: 'reward',
          title: 'Giấy khen',
          description: 'Hoàn thành xuất sắc nhiệm vụ tuần tra',
          issuedDate: shiftIsoDate(today(), -10),
          issuedBy: 'Chủ tịch UBND cấp xã',
          status: null,
        }),
      );
    });
  });

  // ── Kỷ luật and khiếu nại ─────────────────────────────────────────────────────

  describe('kỷ luật and khiếu nại: /discipline', () => {
    const decision = (militiaId: string, change: Body = {}) => ({
      militiaId,
      disciplineType: 'khien_trach',
      violation: 'Vắng trực không lý do',
      decisionDate: shiftIsoDate(today(), -5),
      ...change,
    });
    const create = async (
      who = 't18_staff_a',
      militiaId = members.a1,
      change: Body = {},
    ) =>
      bodyOf<{ id: string } & Body>(
        await api()
          .post(url('/discipline'))
          .set(auth(who))
          .send(decision(militiaId, change))
          .expect(201),
      );
    const appeal = (
      who: string,
      id: string,
      body: Body = { reason: 'Quyết định chưa xét tình tiết giảm nhẹ' },
    ) =>
      api()
        .patch(url(`/discipline/${id}/appeal`))
        .set(auth(who))
        .send(body);
    const decide = (
      who: string,
      id: string,
      outcome: string,
      body: Body = {},
    ) =>
      api()
        .patch(url(`/discipline/${id}/appeal/decision`))
        .set(auth(who))
        .send({
          outcome,
          resolution: 'Kết luận giải quyết khiếu nại',
          ...body,
        });
    let decisionA1: string;
    let decisionB1: string;

    it('records a decision for a member of the caller unit and audits it', async () => {
      const created = await create('t18_staff_a', members.a1, {
        violationDate: shiftIsoDate(today(), -7),
        decisionNumber: '05/QĐ-UBND',
        issuedBy: 'Chủ tịch UBND phường',
      });

      expect(created).toMatchObject({
        militiaId: members.a1,
        militiaName: 'Nguyễn Văn An',
        unitCode: 'KV-T18-A',
        disciplineType: 'khien_trach',
        disciplineTypeLabel: 'Khiển trách',
        violation: 'Vắng trực không lý do',
        violationDate: shiftIsoDate(today(), -7),
        decisionDate: shiftIsoDate(today(), -5),
        decisionNumber: '05/QĐ-UBND',
        issuedBy: 'Chủ tịch UBND phường',
        status: 'active',
        appealedAt: null,
        appealRounds: 0,
        appeals: [],
      });
      decisionA1 = created.id;
      expect(await auditRows('discipline.issued', decisionA1)).toHaveLength(1);
    });

    it('lets the disciplined member appeal their own decision and audits the filing', async () => {
      const res = await appeal('t18_dqtv_a', decisionA1).expect(200);

      const body = bodyOf<{ appeals: Body[] } & Body>(res);
      expect(body).toMatchObject({
        status: 'appealed',
        appealedAt: today(),
        appealRounds: 1,
      });
      expect(body.appeals).toEqual([
        expect.objectContaining({
          round: 1,
          reason: 'Quyết định chưa xét tình tiết giảm nhẹ',
          filedDate: today(),
          filedBy: userIds.t18_dqtv_a,
          outcome: null,
          decidedDate: null,
        }),
      ]);
      const appealId = body.appeals[0].id as string;
      expect(await auditRows('discipline.appeal_filed', appealId)).toHaveLength(
        1,
      );
    });

    it('allows one open appeal per decision', async () => {
      expect(
        messageOf(await appeal('t18_staff_a', decisionA1).expect(409)),
      ).toBe('appeal_already_open');

      const appealed = bodyOf<{ id: string }[]>(
        await api()
          .get(url('/discipline?status=appealed'))
          .set(auth('t18_staff_a'))
          .expect(200),
      ).map((d) => d.id);
      expect(appealed).toContain(decisionA1);
    });

    it('answers 404 outside the scope and 403 to roles that may not act', async () => {
      decisionB1 = (await create('admin', members.b1)).id;

      expect(
        messageOf(await appeal('t18_dqtv_b', decisionA1).expect(404)),
      ).toBe('discipline_decision_not_found');
      await appeal('t18_staff_a', decisionB1).expect(404);
      await api()
        .get(url(`/discipline/${decisionB1}`))
        .set(auth('t18_staff_a'))
        .expect(404);
      await api()
        .get(url(`/discipline/${decisionA1}`))
        .set(auth('t18_dqtv_b'))
        .expect(404);
      await api()
        .get(url(`/discipline/${decisionB1}`))
        .set(auth('t18_dqtv_b'))
        .expect(200);

      await appeal('t18_area_a', decisionA1).expect(403);
      await api().get(url('/discipline')).set(auth('t18_leader')).expect(403);
      await api()
        .post(url('/discipline'))
        .set(auth('t18_dqtv_a'))
        .send(decision(members.a1))
        .expect(403);
      await decide('t18_dqtv_a', decisionA1, 'overturned').expect(403);
    });

    it('decides the open appeal once: upheld puts the decision back in force', async () => {
      const res = await decide('t18_staff_a', decisionA1, 'upheld').expect(200);

      const body = bodyOf<{ appeals: Body[] } & Body>(res);
      expect(body.status).toBe('active');
      expect(body.appeals[0]).toMatchObject({
        outcome: 'upheld',
        resolution: 'Kết luận giải quyết khiếu nại',
        decidedDate: today(),
        decidedBy: userIds.t18_staff_a,
      });
      expect(
        await auditRows(
          'discipline.appeal_decided',
          body.appeals[0].id as string,
        ),
      ).toHaveLength(1);

      expect(
        messageOf(await decide('admin', decisionA1, 'overturned').expect(409)),
      ).toBe('no_open_appeal');
    });

    it('allows a second round, and an overturned decision is final', async () => {
      const second = await appeal('t18_staff_a', decisionA1).expect(200);
      expect(bodyOf<{ appeals: Body[] }>(second).appeals[1]).toMatchObject({
        round: 2,
        outcome: null,
      });

      const overturned = await decide('admin', decisionA1, 'overturned').expect(
        200,
      );
      expect(bodyOf(overturned).status).toBe('overturned');

      expect(
        messageOf(await appeal('t18_dqtv_a', decisionA1).expect(409)),
      ).toBe('discipline_decision_overturned');
      expect(
        messageOf(await decide('admin', decisionA1, 'upheld').expect(409)),
      ).toBe('no_open_appeal');

      const listed = bodyOf<{ id: string }[]>(
        await api()
          .get(url('/discipline?status=overturned'))
          .set(auth('t18_dqtv_a'))
          .expect(200),
      ).map((d) => d.id);
      expect(listed).toEqual([decisionA1]);
    });

    it('stops after two rounds', async () => {
      const { id } = await create();
      for (let round = 1; round <= 2; round++) {
        await appeal('t18_staff_a', id).expect(200);
        await decide('t18_staff_a', id, 'upheld').expect(200);
      }

      expect(messageOf(await appeal('t18_staff_a', id).expect(409))).toBe(
        'appeal_rounds_exhausted',
      );
    });

    it('lets exactly one of concurrent filings open the appeal', async () => {
      const { id } = await create();

      const responses = await Promise.all(
        Array.from({ length: 6 }, () => appeal('t18_staff_a', id)),
      );

      expect(statusesOf(responses)).toEqual([200, 409, 409, 409, 409, 409]);
      const count = await db(async (c) => {
        const { rows } = await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM discipline_appeals WHERE decision_id = $1`,
          [id],
        );
        return rows[0].n;
      });
      expect(count).toBe(1);
    });

    it('refuses malformed ids, invalid bodies and impossible dates', async () => {
      const { id } = await create();

      await appeal('t18_staff_a', 'not-a-uuid').expect(400);
      await appeal('t18_staff_a', id, {}).expect(400);
      await appeal('t18_staff_a', id, { reason: '   ' }).expect(400);
      expect(
        messageOf(
          await appeal('t18_staff_a', id, {
            reason: 'x',
            filedDate: shiftIsoDate(today(), 1),
          }).expect(400),
        ),
      ).toBe('appeal_date_in_future');
      expect(
        messageOf(
          await appeal('t18_staff_a', id, {
            reason: 'x',
            filedDate: shiftIsoDate(today(), -6),
          }).expect(400),
        ),
      ).toBe('appeal_before_decision');
      await decide('t18_staff_a', id, 'partly').expect(400);
      await api()
        .get(url('/discipline/not-a-uuid'))
        .set(auth('admin'))
        .expect(400);

      for (const change of [
        { disciplineType: 'ha_cap_bac' },
        { disciplineType: 'khai_tru' },
        { violation: '  ' },
        { decisionDate: '2026-04-31' },
        { militiaName: 'Nguyễn Văn An' },
      ]) {
        await api()
          .post(url('/discipline'))
          .set(auth('admin'))
          .send(decision(members.a1, change))
          .expect(400);
      }
      const refused = async (change: Body) =>
        messageOf(
          await api()
            .post(url('/discipline'))
            .set(auth('admin'))
            .send(decision(members.a1, change))
            .expect(400),
        );
      expect(await refused({ decisionDate: shiftIsoDate(today(), 1) })).toBe(
        'decision_date_in_future',
      );
      expect(await refused({ violationDate: shiftIsoDate(today(), -4) })).toBe(
        'violation_after_decision',
      );
      expect(
        messageOf(
          await api()
            .post(url('/discipline'))
            .set(auth('t18_staff_a'))
            .send(decision(members.b1))
            .expect(404),
        ),
      ).toBe('militia_not_found');
    });

    it('keeps decisions and appeals as records the database guards', async () => {
      const { id } = await create();

      await expect(
        db((c) =>
          c.query(`DELETE FROM discipline_decisions WHERE id = $1`, [id]),
        ),
      ).rejects.toThrow(/cannot be deleted/);
      await expect(
        db((c) =>
          c.query(
            `UPDATE discipline_decisions SET violation = 'khác' WHERE id = $1`,
            [id],
          ),
        ),
      ).rejects.toThrow(/only its status may change/);
      await expect(
        db((c) =>
          c.query(
            `UPDATE discipline_decisions SET status = 'active' WHERE id = $1`,
            [decisionA1],
          ),
        ),
      ).rejects.toThrow(/cannot go from overturned to active/);
      await expect(
        db((c) =>
          c.query(
            `UPDATE discipline_appeals SET resolution = 'khác' WHERE decision_id = $1`,
            [decisionA1],
          ),
        ),
      ).rejects.toThrow(/decided and final/);

      // Marking a decision appealed without opening an appeal fails when it commits
      await expect(
        db(async (c) => {
          await c.query('BEGIN');
          try {
            await c.query(
              `UPDATE discipline_decisions SET status = 'appealed' WHERE id = $1`,
              [id],
            );
            await c.query('COMMIT');
          } catch (error) {
            await c.query('ROLLBACK');
            throw error;
          }
        }),
      ).rejects.toThrow(/disagrees with its appeals/);
    });

    it('shows decisions with their status in the profile tab and the rewards report', async () => {
      const tab = bodyOf<Body[]>(
        await api()
          .get(url(`/militia/${members.a1}/rewards`))
          .set(auth('t18_staff_a'))
          .expect(200),
      );
      expect(tab).toContainEqual(
        expect.objectContaining({
          id: decisionA1,
          rewardType: 'discipline',
          title: 'Khiển trách',
          description: 'Vắng trực không lý do',
          status: 'overturned',
        }),
      );

      const report = bodyOf<Body[]>(
        await api()
          .get(url('/militia/rewards-report?type=discipline&unitCode=KV-T18-A'))
          .set(auth('t18_ward'))
          .expect(200),
      );
      expect(report).toContainEqual(
        expect.objectContaining({
          id: decisionA1,
          rewardType: 'discipline',
          description: 'Khiển trách',
          content: 'Vắng trực không lý do',
          status: 'overturned',
        }),
      );
      expect(report.map((r) => r.id)).not.toContain(decisionB1);
    });
  });

  // ── Kế hoạch, đợt huấn luyện và điểm danh ─────────────────────────────────────

  describe('training plans, sessions and attendance', () => {
    const plansOf = async (who: string, query = '') =>
      bodyOf<{ id: string }[]>(
        await api()
          .get(url(`/training/plans${query}`))
          .set(auth(who))
          .expect(200),
      ).map((p) => p.id);
    const setStatus = (who: string, id: string, status: string) =>
      api()
        .patch(url(`/training/plans/${id}/status`))
        .set(auth(who))
        .send({ status });
    const createSession = (who: string, change: Body) =>
      api()
        .post(url('/training/sessions'))
        .set(auth(who))
        .send({
          name: 'Đợt 1',
          startDate: today(),
          endDate: today(),
          location: 'Thao trường phường',
          daysCount: 1,
          ...change,
        });
    const attend = (who: string, id: string, attendance: unknown) =>
      api()
        .post(url(`/training/sessions/${id}/attendance`))
        .set(auth(who))
        .send({ attendance });
    const sessionRecords = (sessionId: string) =>
      db(async (c) => {
        const { rows } = await c.query<{
          id: string;
          militia_id: string;
          training_type: string;
          // NUMERIC reaches JavaScript as a number (src/database/pg-types.ts)
          total_days: number;
        }>(
          `SELECT id, militia_id, training_type, total_days
           FROM training_records WHERE session_id = $1 ORDER BY militia_id`,
          [sessionId],
        );
        return rows;
      });
    let planA: string;
    let wardPlan: string;
    let sessionA: string;

    it("creates a draft plan in a scoped officer's unit", async () => {
      const res = await api()
        .post(url('/training/plans'))
        .set(auth('t18_area_a'))
        .send({
          year: thisYear(),
          type: 'military',
          requiredDays: 15,
          title: 'Chiến đấu cơ bản',
        })
        .expect(201);

      expect(bodyOf(res)).toMatchObject({
        year: thisYear(),
        type: 'military',
        typeLabel: 'Quân sự',
        title: 'Chiến đấu cơ bản',
        requiredDays: 15,
        completedDays: 0,
        scheduledDays: 0,
        sessionCount: 0,
        status: 'draft',
        unitCode: 'KV-T18-A',
      });
      planA = bodyOf<{ id: string }>(res).id;
    });

    it('answers 409 for an existing plan, and lets one of concurrent creations win', async () => {
      const duplicate = await api()
        .post(url('/training/plans'))
        .set(auth('t18_area_a'))
        .send({ year: thisYear(), type: 'military', requiredDays: 10 })
        .expect(409);
      expect(messageOf(duplicate)).toBe('training_plan_exists');

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          api()
            .post(url('/training/plans'))
            .set(auth('t18_area_a'))
            .send({ year: thisYear(), type: 'fire', requiredDays: 3 }),
        ),
      );
      expect(statusesOf(responses)).toEqual([201, 409, 409, 409, 409]);
    });

    it('creates ward-wide plans and shows officers their unit and the ward', async () => {
      const res = await api()
        .post(url('/training/plans'))
        .set(auth('admin'))
        .send({ year: thisYear(), type: 'military', requiredDays: 12 })
        .expect(201);
      expect(bodyOf(res)).toMatchObject({ unitCode: null, status: 'draft' });
      wardPlan = bodyOf<{ id: string }>(res).id;

      const areaA = await plansOf('t18_area_a');
      expect(areaA).toEqual(expect.arrayContaining([planA, wardPlan]));
      const areaB = await plansOf('t18_area_b', `?year=${thisYear()}`);
      expect(areaB).toContain(wardPlan);
      expect(areaB).not.toContain(planA);
      await api()
        .get(url(`/training/plans/${planA}`))
        .set(auth('t18_area_b'))
        .expect(404);

      expect(
        messageOf(
          await api()
            .post(url('/training/plans'))
            .set(auth('t18_area_a'))
            .send({
              year: thisYear(),
              type: 'political',
              requiredDays: 2,
              unitCode: 'KV-T18-B',
            })
            .expect(403),
        ),
      ).toBe('unit_scope_violation');
      expect(
        messageOf(
          await api()
            .post(url('/training/plans'))
            .set(auth('admin'))
            .send({
              year: thisYear(),
              type: 'political',
              requiredDays: 2,
              unitCode: 'NOPE',
            })
            .expect(400),
        ),
      ).toBe('unit_not_found');
    });

    it('serves the static routes before GET /training/:id', async () => {
      await api().get(url('/training/plans')).set(auth('admin')).expect(200);
      await api().get(url('/training/sessions')).set(auth('admin')).expect(200);
      await api()
        .get(url('/training/plans/not-a-uuid'))
        .set(auth('admin'))
        .expect(400);
      await api()
        .get(url(`/training/plans/${randomUUID()}`))
        .set(auth('admin'))
        .expect(404);
    });

    it('moves plans forward only, and only for the officers who manage them', async () => {
      expect(
        messageOf(
          await setStatus('t18_area_a', wardPlan, 'active').expect(403),
        ),
      ).toBe('training_plan_not_managed');
      expect(
        messageOf(await setStatus('t18_area_b', planA, 'active').expect(404)),
      ).toBe('training_plan_not_found');
      expect(
        messageOf(
          await setStatus('t18_area_a', planA, 'completed').expect(409),
        ),
      ).toBe('invalid_status_transition');
      await setStatus('t18_area_a', planA, 'draft').expect(400);
      await setStatus('t18_area_a', 'not-a-uuid', 'active').expect(400);
    });

    it('schedules sessions within the plan year in plans the officer manages', async () => {
      const res = await createSession('t18_area_a', { planId: planA }).expect(
        201,
      );
      expect(bodyOf(res)).toMatchObject({
        planId: planA,
        type: 'military',
        startDate: today(),
        endDate: today(),
        daysCount: 1,
        status: 'ongoing',
        recordedCount: 0,
        unitCode: 'KV-T18-A',
      });
      expect(bodyOf(res)).not.toHaveProperty('attendancePercent');
      sessionA = bodyOf<{ id: string }>(res).id;

      const refused = async (who: string, change: Body, status: number) =>
        messageOf(await createSession(who, change).expect(status));
      expect(
        await refused(
          't18_area_a',
          { planId: planA, endDate: shiftIsoDate(today(), -1) },
          400,
        ),
      ).toBe('session_end_before_start');
      expect(
        await refused('t18_area_a', { planId: planA, daysCount: 2 }, 400),
      ).toBe('session_days_exceed_span');
      const nextYear = `${thisYear() + 1}-01-05`;
      expect(
        await refused(
          't18_area_a',
          { planId: planA, startDate: nextYear, endDate: nextYear },
          400,
        ),
      ).toBe('session_outside_plan_year');
      expect(await refused('t18_area_a', { planId: wardPlan }, 403)).toBe(
        'training_plan_not_managed',
      );
      expect(await refused('t18_area_b', { planId: planA }, 404)).toBe(
        'training_plan_not_found',
      );
      await createSession('t18_area_a', { planId: 'tp-1' }).expect(400);
    });

    it("lists the plan unit's members in the caller scope for attendance", async () => {
      const roster = bodyOf<{ id: string; attended: boolean | null }[]>(
        await api()
          .get(url(`/training/sessions/${sessionA}/members`))
          .set(auth('t18_area_a'))
          .expect(200),
      );
      const ids = roster.map((m) => m.id);
      expect(ids).toEqual(expect.arrayContaining([members.a1, members.a2]));
      expect(ids).not.toContain(members.b1);
      expect(roster.every((m) => m.attended === null)).toBe(true);

      await api()
        .get(url(`/training/sessions/${sessionA}/members`))
        .set(auth('t18_area_b'))
        .expect(404);
      await api()
        .get(url('/training/sessions/not-a-uuid/members'))
        .set(auth('t18_area_a'))
        .expect(400);
    });

    it('takes attendance only while the plan is active', async () => {
      expect(
        messageOf(
          await attend('t18_area_a', sessionA, [
            { memberId: members.a1, attended: true },
          ]).expect(409),
        ),
      ).toBe('training_plan_not_active');

      const activated = await setStatus('t18_area_a', planA, 'active').expect(
        200,
      );
      expect(bodyOf(activated)).toMatchObject({ status: 'active' });
    });

    it('records attendance and keeps training records in step with it', async () => {
      const res = await attend('t18_area_a', sessionA, [
        { memberId: members.a1, attended: true },
        { memberId: members.a2, attended: false },
      ]).expect(200);
      expect(bodyOf(res)).toMatchObject({
        recordedCount: 2,
        attendedCount: 1,
        attendancePercent: 50,
      });

      let records = await sessionRecords(sessionA);
      expect(records).toEqual([
        expect.objectContaining({
          militia_id: members.a1,
          training_type: 'military',
          total_days: 1,
        }),
      ]);
      const listed = bodyOf<{ data: Body[] }>(
        await api()
          .get(url(`/training?militiaId=${members.a1}`))
          .set(auth('t18_area_a'))
          .expect(200),
      );
      expect(listed.data).toContainEqual(
        expect.objectContaining({ id: records[0].id, sessionId: sessionA }),
      );

      const roster = bodyOf<{ id: string; attended: boolean | null }[]>(
        await api()
          .get(url(`/training/sessions/${sessionA}/members`))
          .set(auth('t18_area_a'))
          .expect(200),
      );
      expect(roster).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: members.a1, attended: true }),
          expect.objectContaining({ id: members.a2, attended: false }),
        ]),
      );

      // Re-submitting replaces the earlier answers
      await attend('t18_area_a', sessionA, [
        { memberId: members.a1, attended: false },
        { memberId: members.a2, attended: true },
      ]).expect(200);
      records = await sessionRecords(sessionA);
      expect(records.map((r) => r.militia_id)).toEqual([members.a2]);
    });

    it('refuses members outside the scope, duplicates and empty lists', async () => {
      expect(
        messageOf(
          await attend('t18_area_a', sessionA, [
            { memberId: members.a1, attended: true },
            { memberId: members.b1, attended: true },
          ]).expect(404),
        ),
      ).toBe('militia_not_found');
      // Nothing of the refused submission was written
      expect((await sessionRecords(sessionA)).map((r) => r.militia_id)).toEqual(
        [members.a2],
      );

      await attend('t18_area_a', sessionA, [
        { memberId: members.a1, attended: true },
        { memberId: members.a1, attended: false },
      ]).expect(400);
      await attend('t18_area_a', sessionA, []).expect(400);
      await attend('t18_area_a', 'not-a-uuid', [
        { memberId: members.a1, attended: true },
      ]).expect(400);
      await attend('t18_area_b', sessionA, [
        { memberId: members.a1, attended: true },
      ]).expect(404);
    });

    it('lets only attendance change the training records it created', async () => {
      const [record] = await sessionRecords(sessionA);

      expect(
        messageOf(
          await api()
            .patch(url(`/training/${record.id}`))
            .set(auth('admin'))
            .send({ notes: 'sửa tay' })
            .expect(409),
        ),
      ).toBe('training_record_managed_by_session');
      await api()
        .delete(url(`/training/${record.id}`))
        .set(auth('admin'))
        .expect(409);
    });

    it('serializes concurrent submissions for a session', async () => {
      const responses = await Promise.all(
        [true, false, true, false].map((attended) =>
          attend('t18_area_a', sessionA, [
            { memberId: members.a1, attended },
            { memberId: members.a2, attended: !attended },
          ]),
        ),
      );

      expect(statusesOf(responses)).toEqual([200, 200, 200, 200]);
      const consistent = await db(async (c) => {
        const { rows } = await c.query<{ attended: number; records: number }>(
          `SELECT (SELECT count(*)::int FROM training_session_attendance
                   WHERE session_id = $1 AND attended) AS attended,
                  (SELECT count(*)::int FROM training_records WHERE session_id = $1) AS records`,
          [sessionA],
        );
        return rows[0];
      });
      expect(consistent).toEqual({ attended: 1, records: 1 });
    });

    it('refuses attendance before a session starts', async () => {
      const nextYear = thisYear() + 1;
      const plan = bodyOf<{ id: string }>(
        await api()
          .post(url('/training/plans'))
          .set(auth('admin'))
          .send({ year: nextYear, type: 'political', requiredDays: 2 })
          .expect(201),
      ).id;
      await setStatus('admin', plan, 'active').expect(200);
      const session = bodyOf<{ id: string; status: string }>(
        await createSession('admin', {
          planId: plan,
          startDate: `${nextYear}-01-05`,
          endDate: `${nextYear}-01-06`,
          daysCount: 2,
        }).expect(201),
      );
      expect(session.status).toBe('upcoming');

      expect(
        messageOf(
          await attend('admin', session.id, [
            { memberId: members.b1, attended: true },
          ]).expect(409),
        ),
      ).toBe('training_session_not_started');
    });

    it('closes completed plans', async () => {
      const completed = await setStatus(
        't18_area_a',
        planA,
        'completed',
      ).expect(200);
      expect(bodyOf(completed)).toMatchObject({
        status: 'completed',
        scheduledDays: 1,
        sessionCount: 1,
      });

      expect(
        messageOf(
          await createSession('t18_area_a', { planId: planA }).expect(409),
        ),
      ).toBe('training_plan_completed');
      expect(
        messageOf(
          await attend('t18_area_a', sessionA, [
            { memberId: members.a1, attended: true },
          ]).expect(409),
        ),
      ).toBe('training_plan_not_active');
      await setStatus('t18_area_a', planA, 'active').expect(409);
      await expect(
        db((c) =>
          c.query(`UPDATE training_plans SET title = 'khác' WHERE id = $1`, [
            planA,
          ]),
        ),
      ).rejects.toThrow(/completed and closed/);
    });

    it('refuses roles that do not manage training', async () => {
      for (const who of ['t18_dqtv_a', 't18_staff_a', 't18_leader']) {
        await api().get(url('/training/plans')).set(auth(who)).expect(403);
        await api().get(url('/training/sessions')).set(auth(who)).expect(403);
      }
      await api()
        .post(url('/training/plans'))
        .set(auth('t18_staff_a'))
        .send({ year: thisYear(), type: 'other', requiredDays: 1 })
        .expect(403);
    });

    it('refuses invalid plan and session bodies', async () => {
      for (const body of [
        { year: thisYear(), type: 'Chiến đấu cơ bản', requiredDays: 15 },
        { year: String(thisYear()), type: 'military', requiredDays: 15 },
        { year: thisYear(), type: 'other', requiredDays: 0 },
        { year: thisYear(), type: 'other', requiredDays: 1, status: 'active' },
      ]) {
        await api()
          .post(url('/training/plans'))
          .set(auth('admin'))
          .send(body)
          .expect(400);
      }
      await api()
        .get(url('/training/plans?year=2026junk'))
        .set(auth('admin'))
        .expect(400);
      await createSession('admin', { planId: wardPlan, name: ' ' }).expect(400);
    });
  });

  // ── Kiểm kê vũ khí ────────────────────────────────────────────────────────────

  describe('kiểm kê vũ khí: /weapons/inventory', () => {
    const weapons: Record<string, string> = {};
    const activeWeaponIds = () =>
      db(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM weapons WHERE status = 'active' ORDER BY id`,
        );
        return rows.map((r) => r.id);
      });
    const record = (who: string, body: object) =>
      api().post(url('/weapons/inventory')).set(auth(who)).send(body);

    beforeAll(async () => {
      await db(async (c) => {
        for (const serial of ['T18-W1', 'T18-W2', 'T18-W3']) {
          const { rows } = await c.query<{ id: string }>(
            `INSERT INTO weapons (type, serial_number, acquired_at, condition, storage_location)
             VALUES ('Súng AK', $1, '2024-01-01', 'good', 'Kho vũ khí A') RETURNING id`,
            [serial],
          );
          weapons[serial] = rows[0].id;
        }
        await c.query(
          `INSERT INTO weapon_allocations (weapon_id, recipient_id, issued_at, purpose)
           VALUES ($1, $2, now() - interval '1 day', 'Tuần tra')`,
          [weapons['T18-W1'], members.a1],
        );
      });
    });

    // The web register and allocation pages read names here instead of one request per row
    it('names the responsible member on GET /weapons and the weapon and recipient on GET /weapons/allocations', async () => {
      await db((c) =>
        c.query(`UPDATE weapons SET responsible_person_id = $1 WHERE id = $2`, [
          members.a2,
          weapons['T18-W2'],
        ]),
      );

      const register = bodyOf<Body[]>(
        await api().get(url('/weapons')).set(auth('admin')).expect(200),
      );
      expect(register).toContainEqual(
        expect.objectContaining({
          id: weapons['T18-W2'],
          type: 'Súng AK',
          serialNumber: 'T18-W2',
          acquiredAt: '2024-01-01',
          storageLocation: 'Kho vũ khí A',
          responsiblePersonId: members.a2,
          responsiblePersonName: 'Trần Văn Bình',
          status: 'active',
        }),
      );
      expect(register).toContainEqual(
        expect.objectContaining({
          id: weapons['T18-W1'],
          responsiblePersonId: null,
          responsiblePersonName: null,
        }),
      );

      const allocations = bodyOf<Body[]>(
        await api()
          .get(url('/weapons/allocations'))
          .set(auth('admin'))
          .expect(200),
      );
      expect(allocations).toContainEqual(
        expect.objectContaining({
          weaponId: weapons['T18-W1'],
          weaponSerialNumber: 'T18-W1',
          weaponType: 'Súng AK',
          recipientId: members.a1,
          recipientName: 'Nguyễn Văn An',
          recipientCode: 'DQ-T18-A1',
          purpose: 'Tuần tra',
          returnedAt: null,
        }),
      );
    });

    let firstCheck: string;

    it('records a check against the register with a snapshot of every weapon, and audits it', async () => {
      const active = await activeWeaponIds();

      const res = await record('admin', {
        confirmedCount: active.length,
        notes: ' Đủ số lượng ',
      }).expect(201);
      expect(bodyOf(res)).toMatchObject({
        checkDate: today(),
        performedBy: userIds.admin,
        expectedCount: active.length,
        confirmedCount: active.length,
        discrepancy: 0,
        notes: 'Đủ số lượng',
        itemCount: active.length,
        verifiedCount: 0,
        missingCount: 0,
      });
      firstCheck = bodyOf<{ id: string }>(res).id;

      const detail = bodyOf<{ items: Body[] }>(
        await api()
          .get(url(`/weapons/inventory/${firstCheck}`))
          .set(auth('t18_ward'))
          .expect(200),
      );
      expect(detail.items).toHaveLength(active.length);
      expect(detail.items).toContainEqual(
        expect.objectContaining({
          weaponId: weapons['T18-W1'],
          serialNumber: 'T18-W1',
          holderMilitiaId: members.a1,
          holderName: 'Nguyễn Văn An',
          found: null,
        }),
      );
      const audit = await auditRows('weapons.inventory_recorded', firstCheck);
      expect(audit).toHaveLength(1);
      expect(audit[0].after_json).toMatchObject({
        expectedCount: active.length,
        discrepancy: 0,
      });
    });

    it('records a shortfall as a negative discrepancy', async () => {
      const active = await activeWeaponIds();

      const res = await record('t18_ward', {
        confirmedCount: active.length - 1,
      }).expect(201);

      expect(bodyOf(res)).toMatchObject({ discrepancy: -1, notes: null });
    });

    it('stores item-level results when every active weapon is accounted for', async () => {
      const active = await activeWeaponIds();
      const items = active.map((weaponId) => ({
        weaponId,
        found: weaponId !== weapons['T18-W2'],
        ...(weaponId === weapons['T18-W1']
          ? { observedCondition: 'damaged' }
          : {}),
      }));

      const res = await record('admin', {
        confirmedCount: active.length - 1,
        items,
      }).expect(201);
      expect(bodyOf(res)).toMatchObject({
        verifiedCount: active.length,
        missingCount: 1,
        discrepancy: -1,
      });

      const detail = bodyOf<{ items: Body[] }>(
        await api()
          .get(url(`/weapons/inventory/${bodyOf<{ id: string }>(res).id}`))
          .set(auth('admin'))
          .expect(200),
      );
      expect(detail.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            weaponId: weapons['T18-W1'],
            found: true,
            observedCondition: 'damaged',
          }),
          expect.objectContaining({
            weaponId: weapons['T18-W2'],
            found: false,
          }),
        ]),
      );
    });

    it('answers 409 when the items no longer match the register, and 400 for a wrong count', async () => {
      const active = await activeWeaponIds();
      const all = active.map((weaponId) => ({ weaponId, found: true }));

      expect(
        messageOf(
          await record('admin', {
            confirmedCount: active.length - 1,
            items: all.slice(1),
          }).expect(409),
        ),
      ).toBe('inventory_register_changed');
      expect(
        messageOf(
          await record('admin', {
            confirmedCount: active.length + 1,
            items: [...all, { weaponId: randomUUID(), found: true }],
          }).expect(409),
        ),
      ).toBe('inventory_register_changed');
      expect(
        messageOf(
          await record('admin', {
            confirmedCount: active.length - 1,
            items: all,
          }).expect(400),
        ),
      ).toBe('inventory_count_mismatch');
      expect(
        messageOf(
          await record('admin', {
            confirmedCount: active.length - 1,
            items: all.map((item, i) =>
              i === 0
                ? { ...item, found: false, observedCondition: 'good' }
                : item,
            ),
          }).expect(400),
        ),
      ).toBe('observed_condition_without_found');
    });

    it('lists checks newest first and serves them before GET /weapons/:id', async () => {
      const checks = bodyOf<{ id: string }[]>(
        await api()
          .get(url('/weapons/inventory'))
          .set(auth('admin'))
          .expect(200),
      );
      expect(checks.length).toBeGreaterThanOrEqual(3);
      expect(checks[checks.length - 1].id).toBe(firstCheck);

      expect(
        bodyOf<unknown[]>(
          await api()
            .get(url(`/weapons/inventory?from=${shiftIsoDate(today(), 1)}`))
            .set(auth('admin'))
            .expect(200),
        ),
      ).toEqual([]);
      await api()
        .get(url('/weapons/inventory?from=14/09/2026'))
        .set(auth('admin'))
        .expect(400);
      await api()
        .get(url('/weapons/inventory/not-a-uuid'))
        .set(auth('admin'))
        .expect(400);
      expect(
        messageOf(
          await api()
            .get(url(`/weapons/inventory/${randomUUID()}`))
            .set(auth('admin'))
            .expect(404),
        ),
      ).toBe('inventory_check_not_found');
    });

    it('lets only ward-level weapons staff record a check', async () => {
      expect(
        messageOf(
          await record('t18_staff_a', { confirmedCount: 1 }).expect(403),
        ),
      ).toBe('ward_scope_required');
      await record('t18_dqtv_a', { confirmedCount: 1 }).expect(403);
      await record('t18_area_a', { confirmedCount: 1 }).expect(403);
      await api()
        .get(url('/weapons/inventory'))
        .set(auth('t18_leader'))
        .expect(403);
    });

    it('refuses invalid bodies', async () => {
      for (const body of [
        {},
        { confirmedCount: '3' },
        { confirmedCount: -1 },
        { confirmedCount: 1, notes: 'x'.repeat(2001) },
        { confirmedCount: 1, expectedCount: 1 },
        { confirmedCount: 1, items: [{ weaponId: 'w1', found: true }] },
      ]) {
        await record('admin', body).expect(400);
      }
    });

    it('keeps checks as records the database refuses to change or delete', async () => {
      await expect(
        db((c) =>
          c.query(
            `UPDATE weapon_inventory_checks SET notes = 'x' WHERE id = $1`,
            [firstCheck],
          ),
        ),
      ).rejects.toThrow(/cannot be changed/);
      await expect(
        db((c) =>
          c.query(`DELETE FROM weapon_inventory_items WHERE check_id = $1`, [
            firstCheck,
          ]),
        ),
      ).rejects.toThrow(/cannot be deleted/);
    });
  });
});

// ── Migration 026 guards ──────────────────────────────────────────────────────────

describe('migration 026 schema guards (e2e)', () => {
  const ALL_FILES = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const createdDatabases: string[] = [];
  const createdDirs: string[] = [];

  afterAll(async () => {
    for (const dir of createdDirs)
      fs.rmSync(dir, { recursive: true, force: true });
    await withClient(adminUrl, async (c) => {
      for (const name of createdDatabases) {
        await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }
    });
  });

  // A database migrated up to 025, the state 026 runs against in production
  async function databaseBefore026(): Promise<string> {
    const name = `mms_t18_guard_${Date.now()}_${createdDatabases.length}`;
    await withClient(adminUrl!, (c) => c.query(`CREATE DATABASE ${name}`));
    createdDatabases.push(name);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mms-t18-migrations-'));
    createdDirs.push(dir);
    for (const file of ALL_FILES.filter((f) => f < '026')) {
      fs.copyFileSync(path.join(MIGRATIONS_DIR, file), path.join(dir, file));
    }
    const target = databaseUrl(name);
    await migrateDatabase({ connectionString: target, directory: dir });
    return target;
  }

  const recorded = (target: string) =>
    withClient(target, async (c) => {
      const { rows } = await c.query<{ filename: string }>(
        `SELECT filename FROM schema_migrations ORDER BY filename`,
      );
      return rows.map((r) => r.filename);
    });

  const MIGRATION_FILE =
    '026_rewards_discipline_training_plans_weapon_inventory.sql';
  const MIGRATION_026 = fs
    .readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
    .replace(/\r\n/g, '\n');

  // A table exactly as migration 026 declares it, so each case changes one property only
  const declared = (table: string) => {
    const match = new RegExp(
      `CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`,
    ).exec(MIGRATION_026);
    if (!match) throw new Error(`migration 026 declares no table ${table}`);
    return match[0].replace('CREATE TABLE IF NOT EXISTS', 'CREATE TABLE');
  };
  const changed = (ddl: string, from: string, to: string) => {
    if (!ddl.includes(from)) throw new Error(`no "${from}" in:\n${ddl}`);
    return ddl.replace(from, to);
  };
  const run = (target: string) =>
    migrateDatabase({ connectionString: target, directory: MIGRATIONS_DIR });

  async function refused(ddl: string, message: RegExp) {
    const target = await databaseBefore026();
    await withClient(target, (c) => c.query(ddl));

    await expect(run(target)).rejects.toThrow(message);
    await expect(run(target)).rejects.toThrow(/reconcile|drop or rename/);
    expect(await recorded(target)).not.toContain(MIGRATION_FILE);
  }

  const checks = declared('weapon_inventory_checks');

  it('refuses a pre-existing table of another shape, naming every missing column', async () => {
    await refused(
      `CREATE TABLE reward_decisions (id UUID PRIMARY KEY, note TEXT)`,
      /existing tables differ from this migration: reward_decisions has no columns basis, created_at, created_by, criteria, decision_number, issued_date, issuing_authority, militia_id, reward_form;/,
    );
  });

  it.each([
    [
      'a column of another type',
      changed(checks, 'expected_count  INTEGER', 'expected_count  BIGINT'),
      /weapon_inventory_checks\.expected_count has type bigint, expected integer/,
    ],
    [
      'a nullable column the backend requires',
      changed(
        checks,
        'confirmed_count INTEGER      NOT NULL',
        'confirmed_count INTEGER',
      ),
      /weapon_inventory_checks\.confirmed_count must be NOT NULL/,
    ],
    [
      'a NOT NULL column that must accept NULL',
      changed(
        checks,
        'notes           TEXT,',
        'notes           TEXT NOT NULL,',
      ),
      /weapon_inventory_checks\.notes must allow NULL/,
    ],
    [
      'no default where inserts rely on one',
      changed(
        checks,
        " DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date",
        '',
      ),
      /weapon_inventory_checks\.check_date has no default/,
    ],
    [
      'a stored column instead of the generated discrepancy',
      changed(
        checks,
        ' GENERATED ALWAYS AS (confirmed_count - expected_count) STORED',
        '',
      ),
      /weapon_inventory_checks\.discrepancy must be generated as \(confirmed_count - expected_count\)/,
    ],
    [
      'an undeclared NOT NULL column inserts cannot fill',
      changed(
        checks,
        'notes           TEXT,',
        'notes           TEXT,\n    approved_by     UUID NOT NULL,',
      ),
      /weapon_inventory_checks has undeclared NOT NULL columns without a default: approved_by/,
    ],
    [
      'no primary key on id',
      changed(
        checks,
        'UUID         PRIMARY KEY DEFAULT',
        'UUID         NOT NULL DEFAULT',
      ),
      /weapon_inventory_checks must have its primary key on \(id\)/,
    ],
    [
      'a foreign key whose delete would erase the records',
      changed(
        checks,
        'REFERENCES users(id) ON DELETE RESTRICT',
        'REFERENCES users(id) ON DELETE CASCADE',
      ),
      /weapon_inventory_checks\.performed_by must reference users\(id\) ON DELETE RESTRICT \(found .*ON DELETE CASCADE\)/,
    ],
    [
      'a foreign key to another table',
      changed(
        checks,
        'REFERENCES users(id)',
        'REFERENCES militia_profiles(id)',
      ),
      /weapon_inventory_checks\.performed_by must reference users\(id\) ON DELETE RESTRICT/,
    ],
    [
      'a named check missing',
      changed(
        checks,
        ',\n    CONSTRAINT chk_weapon_inventory_checks_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)',
        '',
      ),
      /weapon_inventory_checks has no CHECK constraint chk_weapon_inventory_checks_notes_length/,
    ],
    [
      'a named check defined differently',
      changed(checks, 'length(notes) <= 2000', 'length(notes) <= 4000'),
      /weapon_inventory_checks\.chk_weapon_inventory_checks_notes_length is CHECK \(\(\(notes IS NULL\) OR \(length\(notes\) <= 4000\)\)\), expected CHECK \(\(\(notes IS NULL\) OR \(length\(notes\) <= 2000\)\)\)/,
    ],
    [
      'a CHECK constraint the migration does not declare',
      changed(
        checks,
        'notes           TEXT,',
        "notes           TEXT CHECK (notes <> ''),",
      ),
      /weapon_inventory_checks has an unexpected CHECK constraint weapon_inventory_checks_notes_check/,
    ],
    [
      'a coded column allowing other values',
      `${checks};\n${changed(
        declared('weapon_inventory_items'),
        "chk_weapon_inventory_items_condition CHECK (condition IN ('good', 'damaged', 'maintenance'))",
        "chk_weapon_inventory_items_condition CHECK (condition IN ('good', 'damaged'))",
      )}`,
      /weapon_inventory_items\.condition allows \('damaged', 'good'\), expected \('damaged', 'good', 'maintenance'\)/,
    ],
    [
      'a unique constraint ON CONFLICT relies on, defined differently',
      changed(
        declared('training_plans'),
        'UNIQUE NULLS NOT DISTINCT (unit_id, year, training_type)',
        'UNIQUE (unit_id, year, training_type)',
      ),
      /training_plans\.uq_training_plans_unit_year_type is UNIQUE \(unit_id, year, training_type\), expected UNIQUE NULLS NOT DISTINCT \(unit_id, year, training_type\)/,
    ],
  ])('refuses a pre-existing table with %s', async (_label, ddl, message) => {
    await refused(ddl, message);
  });

  it('reports every mismatch of a table in one message', async () => {
    let ddl = changed(
      checks,
      'confirmed_count INTEGER      NOT NULL',
      'confirmed_count INTEGER',
    );
    ddl = changed(
      ddl,
      'REFERENCES users(id) ON DELETE RESTRICT',
      'REFERENCES users(id) ON DELETE CASCADE',
    );
    ddl = changed(
      ddl,
      ',\n    CONSTRAINT chk_weapon_inventory_checks_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)',
      '',
    );

    await refused(
      ddl,
      /confirmed_count must be NOT NULL[\s\S]*performed_by must reference users\(id\)[\s\S]*has no CHECK constraint chk_weapon_inventory_checks_notes_length/,
    );
  });

  it('refuses an index of a declared name with another definition', async () => {
    await refused(
      `${checks};
       CREATE INDEX idx_weapon_inventory_checks_date ON weapon_inventory_checks (check_date);`,
      /idx_weapon_inventory_checks_date is CREATE INDEX idx_weapon_inventory_checks_date ON public\.weapon_inventory_checks USING btree \(check_date\), expected CREATE INDEX idx_weapon_inventory_checks_date ON public\.weapon_inventory_checks USING btree \(check_date DESC, created_at DESC\)/,
    );
  });

  it('refuses a constraint named like the training record foreign key that is not it', async () => {
    await refused(
      `ALTER TABLE training_records ADD COLUMN session_id UUID;
       ALTER TABLE training_records ADD CONSTRAINT fk_training_records_session_attendance
         CHECK (session_id IS NULL OR session_id IS NOT NULL);`,
      /training_records\.fk_training_records_session_attendance is CHECK .*, expected FOREIGN KEY \(session_id, militia_id\) REFERENCES training_session_attendance\(session_id, militia_id\) ON DELETE RESTRICT/,
    );
  });

  it('refuses a constraint trigger named like the appeal state check that is not it', async () => {
    await refused(
      `${declared('discipline_decisions')};
       CREATE FUNCTION t18_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
       CREATE CONSTRAINT TRIGGER trg_discipline_decisions_appeal_state
         AFTER INSERT ON discipline_decisions DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION t18_noop();`,
      /discipline_decisions\.trg_discipline_decisions_appeal_state is CREATE CONSTRAINT TRIGGER trg_discipline_decisions_appeal_state AFTER INSERT ON public\.discipline_decisions .*t18_noop\(\), expected/,
    );
  });

  it('adopts pre-existing tables that match exactly, and guards them like new ones', async () => {
    const target = await databaseBefore026();
    await withClient(target, (c) =>
      c.query(
        [
          'reward_decisions',
          'discipline_decisions',
          'discipline_appeals',
          'training_plans',
          'training_sessions',
          'training_session_attendance',
          'weapon_inventory_checks',
          'weapon_inventory_items',
        ]
          .map(declared)
          .join(';\n'),
      ),
    );

    await expect(run(target)).resolves.toBeDefined();
    expect(await recorded(target)).toEqual(ALL_FILES);

    const triggers = await withClient(target, async (c) => {
      const { rows } = await c.query<{ tgname: string }>(
        `SELECT tgname FROM pg_trigger
         WHERE tgname IN ('trg_reward_decisions_no_delete', 'trg_discipline_decisions_appeal_state',
                          'trg_discipline_appeals_state', 'trg_weapon_inventory_items_no_delete')
         ORDER BY tgname`,
      );
      return rows.map((r) => r.tgname);
    });
    expect(triggers).toEqual([
      'trg_discipline_appeals_state',
      'trg_discipline_decisions_appeal_state',
      'trg_reward_decisions_no_delete',
      'trg_weapon_inventory_items_no_delete',
    ]);
  });
});

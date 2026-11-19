// Live GPS on the running backend and a freshly migrated Postgres (T31):
// - GET /gps/live and /gps/team list only the members of the caller's scope, with numeric
//   coordinates and a status derived from the age of the last position
// - GET /gps/history/:id refuses a malformed id and conceals members outside the scope
// - POST /gps/record pushes gps:update to the staff who may see the member and to the CA
//   officers the member is assigned to, never to the member's teammates
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5440/postgres
// The environment module comes first: AppModule reads its configuration when it is loaded.
import {
  E2E_ADMIN_URL,
  E2E_API_PREFIX,
  E2E_DB_NAME,
  E2E_DB_URL,
} from './support/app-env';
import { randomUUID } from 'crypto';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  io as connectClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { configureHttpApp } from '../src/app.setup';
import { GPS_OFFLINE_AFTER_MINUTES } from '../src/gps/gps-rooms';
import { withClient } from './support/db';
import { prepareDatabaseForTenancy } from './support/e2e-tenancy';

jest.setTimeout(180_000);

const UNIT_A = 'KV-GPS-A';
const UNIT_B = 'KV-GPS-B';

type Body = Record<string, unknown>;

describe('Live GPS (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clients: ClientSocket[] = [];
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const passwords: Record<string, string> = {};
  const members: Record<string, string> = {};

  const api = () => request(app.getHttpServer() as Server);
  const url = (route: string) => `/${E2E_API_PREFIX}${route}`;
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const db = <T>(fn: Parameters<typeof withClient<T>>[1]) =>
    withClient(E2E_DB_URL, fn);

  const login = async (username: string, password: string) =>
    (
      (
        await api()
          .post(url('/auth/login'))
          .send({ username, password })
          .expect(200)
      ).body as { tokens: { accessToken: string } }
    ).tokens.accessToken;

  const account = async (username: string, role: string, unitCode: string) => {
    const created = await api()
      .post(url('/admin/users'))
      .set(auth('admin'))
      .send({ username, fullName: username, role, unitCode })
      .expect(201);
    const body = created.body as { id: string; temporaryPassword: string };
    ids[username] = body.id;
    passwords[username] = body.temporaryPassword;
    tokens[username] = await login(username, body.temporaryPassword);
  };

  const member = (
    code: string,
    cccd: string,
    unitCode: string,
    userId: string,
  ) =>
    db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO militia_profiles (militia_code, full_name, cccd, dob, unit_id, join_date, user_id)
         SELECT $1, $1, $2, '1998-04-04', u.id, '2022-01-01', $4
         FROM units u WHERE u.code = $3
         RETURNING id`,
        [code, cccd, unitCode, userId],
      );
      return rows[0].id;
    });

  const open = async (who: string) => {
    const client = connectClient(baseUrl, {
      path: '/socket.io/',
      auth: { token: tokens[who] },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', reject);
    });
    return client;
  };

  // Every gps:update a socket receives, in order
  const updatesOf = (client: ClientSocket) => {
    const updates: Body[] = [];
    client.on('gps:update', (payload: Body) => updates.push(payload));
    return updates;
  };

  // The server writes gps:update before POST /gps/record answers; an acknowledged request
  // sent afterwards on the same socket is answered after anything already written to it
  const drained = (client: ClientSocket) =>
    client.timeout(10_000).emitWithAck('chat:join', randomUUID());

  const record = (who: string, lat: number, lng: number) =>
    api()
      .post(url('/gps/record'))
      .set(auth(who))
      .send({ lat, lng, accuracy: 4.5 })
      .expect(200);

  beforeAll(async () => {
    await withClient(E2E_ADMIN_URL, (c) =>
      c.query(`CREATE DATABASE ${E2E_DB_NAME}`),
    );
    await migrateDatabase({
      connectionString: E2E_DB_URL,
      directory: path.join(__dirname, '..', 'migrations'),
    });
    await prepareDatabaseForTenancy(E2E_DB_NAME);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    // SeederService creates admin / Admin@123
    tokens.admin = await login('admin', 'Admin@123');
    ids.admin = await db(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM users WHERE username = 'admin'`,
      );
      return rows[0].id;
    });
    await db((c) =>
      c.query(
        `INSERT INTO units (code, name, type)
         VALUES ($1, 'Khu vực GPS A', 'area'), ($2, 'Khu vực GPS B', 'area')`,
        [UNIT_A, UNIT_B],
      ),
    );
    await account('gps_area_a', 'police_area', UNIT_A);
    await account('gps_area_b', 'police_area', UNIT_B);
    await account('gps_ca', 'ca_officer', UNIT_B);
    await account('gps_dqtv_a', 'dqtv', UNIT_A);
    await account('gps_dqtv_a2', 'dqtv', UNIT_A);
    members.a = await member(
      'DQ-GPS-A1',
      '079200031001',
      UNIT_A,
      ids.gps_dqtv_a,
    );
    members.a2 = await member(
      'DQ-GPS-A2',
      '079200031002',
      UNIT_A,
      ids.gps_dqtv_a2,
    );
    // The CA officer of unit B supervises gps_dqtv_a only
    await db((c) =>
      c.query(
        `INSERT INTO ca_dqtv_assignments (ca_user_id, dqtv_user_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [ids.gps_ca, ids.gps_dqtv_a, ids.admin],
      ),
    );
  });

  afterAll(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    await app?.close();
    await withClient(E2E_ADMIN_URL, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`),
    );
  });

  it('pushes a new position to the staff of the unit and the assigned CA officer, never to teammates', async () => {
    const [areaA, areaB, ca, teammate, ward] = await Promise.all([
      open('gps_area_a'),
      open('gps_area_b'),
      open('gps_ca'),
      open('gps_dqtv_a2'),
      open('admin'),
    ]);
    const received = {
      areaA: updatesOf(areaA),
      areaB: updatesOf(areaB),
      ca: updatesOf(ca),
      teammate: updatesOf(teammate),
      ward: updatesOf(ward),
    };

    await record('gps_dqtv_a', 10.76212345, 106.66012345);
    await Promise.all(
      [areaA, areaB, ca, teammate, ward].map((client) => drained(client)),
    );

    const expected = expect.objectContaining({
      militiaId: members.a,
      userId: ids.gps_dqtv_a,
      unitCode: UNIT_A,
      lat: 10.76212345,
      lng: 106.66012345,
      accuracy: 4.5,
      status: 'online',
    }) as unknown;
    expect(received.areaA).toEqual([expected]);
    expect(received.ca).toEqual([expected]);
    expect(received.ward).toEqual([expected]);
    expect(received.areaB).toEqual([]);
    expect(received.teammate).toEqual([]);
  });

  it('lists the positions of the caller scope only, with numbers and a derived status', async () => {
    await record('gps_dqtv_a', 10.1, 106.1);
    await record('gps_dqtv_a2', 10.2, 106.2);
    // The teammate's last position is older than the offline threshold
    await db((c) =>
      c.query(
        `UPDATE gps_latest SET last_seen_at = now() - make_interval(mins => $1)
         WHERE militia_id = $2`,
        [GPS_OFFLINE_AFTER_MINUTES + 1, members.a2],
      ),
    );
    const live = async (who: string, route = '/gps/live') =>
      (await api().get(url(route)).set(auth(who)).expect(200)).body as Body[];
    const statusById = (rows: Body[]): Record<string, string> =>
      Object.fromEntries(
        rows.map((row) => [String(row.militiaId), String(row.status)]),
      );

    const unitA = await live('gps_area_a');
    expect(statusById(unitA)).toEqual({
      [members.a]: 'online',
      [members.a2]: 'offline',
    });
    expect(unitA.find((row) => row.militiaId === members.a)).toMatchObject({
      lat: 10.1,
      lng: 106.1,
    });
    expect(await live('gps_area_b')).toEqual([]);
    expect(statusById(await live('gps_ca', '/gps/team'))).toEqual({
      [members.a]: 'online',
    });
    await api().get(url('/gps/live')).set(auth('gps_dqtv_a')).expect(403);
  });

  it('reads the history of a member in scope, and conceals the others', async () => {
    await api()
      .get(url('/gps/history/not-a-uuid'))
      .set(auth('gps_area_a'))
      .expect(400);
    const hidden = await api()
      .get(url(`/gps/history/${members.a}`))
      .set(auth('gps_area_b'))
      .expect(404);
    expect((hidden.body as { message?: string }).message).toBe(
      'militia_not_found',
    );

    const history = (
      await api()
        .get(url(`/gps/history/${members.a}`))
        .set(auth('gps_area_a'))
        .expect(200)
    ).body as { data: Body[]; total: number };
    expect(history.total).toBeGreaterThanOrEqual(1);
    expect(typeof history.data[0].lat).toBe('number');
  });

  // Every role an account holds counts, whatever its priority: police_area of unit B with
  // ca_officer reaches the members of unit B and the DQTV assigned to them in unit A
  describe('police_area held with ca_officer', () => {
    beforeAll(async () => {
      await account('gps_dqtv_b', 'dqtv', UNIT_B);
      members.b = await member(
        'DQ-GPS-B1',
        '079200031003',
        UNIT_B,
        ids.gps_dqtv_b,
      );
      await account('gps_dual', 'police_area', UNIT_B);
      await db(async (c) => {
        await c.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE code = 'ca_officer'`,
          [ids.gps_dual],
        );
        await c.query(
          `INSERT INTO ca_dqtv_assignments (ca_user_id, dqtv_user_id, assigned_by)
           VALUES ($1, $2, $3)`,
          [ids.gps_dual, ids.gps_dqtv_a, ids.admin],
        );
      });
      // Roles travel in the token: sign in again to carry both
      tokens.gps_dual = await login('gps_dual', passwords.gps_dual);
    });

    it('lists and reads the positions of the unit and of the DQTV assigned, and no others', async () => {
      await record('gps_dqtv_a', 10.3, 106.3);
      await record('gps_dqtv_b', 10.4, 106.4);

      const rows = (
        await api().get(url('/gps/live')).set(auth('gps_dual')).expect(200)
      ).body as Body[];
      expect(rows.map((row) => row.militiaId).sort()).toEqual(
        [members.a, members.b].sort(),
      );
      await api()
        .get(url(`/gps/history/${members.a}`))
        .set(auth('gps_dual'))
        .expect(200);
      await api()
        .get(url(`/gps/history/${members.a2}`))
        .set(auth('gps_dual'))
        .expect(404);
    });

    it('pushes the positions of both, once each, and not those of anyone else', async () => {
      const socket = await open('gps_dual');
      const received = updatesOf(socket);

      await record('gps_dqtv_a', 10.5, 106.5);
      await record('gps_dqtv_b', 10.6, 106.6);
      await record('gps_dqtv_a2', 10.7, 106.7);
      await drained(socket);

      expect(received.map((row) => row.militiaId)).toEqual([
        members.a,
        members.b,
      ]);
    });
  });
});

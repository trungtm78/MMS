// The Socket.IO gateway of the running backend, on a freshly migrated Postgres: a refused
// handshake says why, and an open socket whose session ends is told so before it is
// disconnected, so clients can tell a dead session from a network fault.
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
import { JwtService } from '@nestjs/jwt';
import {
  io as connectClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { configureHttpApp } from '../src/app.setup';
import { withClient } from './support/db';
import { prepareDatabaseForTenancy } from './support/e2e-tenancy';

jest.setTimeout(180_000);

describe('Realtime sessions (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

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
  });

  afterAll(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    await app?.close();
    await withClient(E2E_ADMIN_URL, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`),
    );
  });

  // SeederService creates admin / Admin@123
  const signIn = async (username = 'admin', password = 'Admin@123') => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/${E2E_API_PREFIX}/auth/login`)
      .send({ username, password })
      .expect(200);
    return (res.body as { tokens: { accessToken: string } }).tokens.accessToken;
  };

  const endSessionsOf = (username: string) =>
    withClient(E2E_DB_URL, (c) =>
      c.query(
        `UPDATE sessions SET revoked_at = now()
         WHERE revoked_at IS NULL
           AND user_id = (SELECT id FROM users WHERE username = $1)`,
        [username],
      ),
    );

  const open = (auth: Record<string, unknown>) => {
    const client = connectClient(baseUrl, {
      path: '/socket.io/',
      auth,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    return client;
  };

  const refusal = (client: ClientSocket) =>
    new Promise<Error>((resolve, reject) => {
      client.once('connect', () =>
        reject(new Error('the handshake was accepted')),
      );
      client.once('connect_error', resolve);
    });

  const connection = (client: ClientSocket) =>
    new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', reject);
    });

  it('refuses a handshake without a token, saying why', async () => {
    await expect(refusal(open({}))).resolves.toEqual(
      expect.objectContaining({ message: 'missing_token' }),
    );
  });

  it('refuses a token that is not a valid access token', async () => {
    await expect(refusal(open({ token: 'not-a-jwt' }))).resolves.toEqual(
      expect.objectContaining({ message: 'invalid_token' }),
    );
  });

  it('refuses the token of a session that has ended', async () => {
    const token = await signIn();
    await endSessionsOf('admin');

    await expect(refusal(open({ token }))).resolves.toEqual(
      expect.objectContaining({ message: 'session_revoked' }),
    );
  });

  // The server also closes the socket by itself as soon as the session ends (below): the
  // listeners are in place before the session ends, whichever of the two closes it first
  it('tells an open socket its session ended before disconnecting it', async () => {
    const client = open({ token: await signIn() });
    await connection(client);

    const events: string[] = [];
    const told = new Promise<unknown>((resolve) =>
      client.once('session_expired', (payload: unknown) => {
        events.push('session_expired');
        resolve(payload);
      }),
    );
    const disconnected = new Promise<string>((resolve) =>
      client.once('disconnect', (reason: string) => {
        events.push('disconnect');
        resolve(reason);
      }),
    );
    await endSessionsOf('admin');
    if (client.connected) client.emit('chat:join', randomUUID());

    await expect(told).resolves.toEqual({ reason: 'session_revoked' });
    await expect(disconnected).resolves.toBe('io server disconnect');
    expect(events).toEqual(['session_expired', 'disconnect']);
  });

  // A socket sits in rooms that receive server pushes without emitting anything: it is told
  // and closed from the server side, without having to emit an event first
  const closedBy = (client: ClientSocket) => {
    const events: string[] = [];
    const told = new Promise<unknown>((resolve) =>
      client.once('session_expired', (payload: unknown) => {
        events.push('session_expired');
        resolve(payload);
      }),
    );
    const disconnected = new Promise<string>((resolve) =>
      client.once('disconnect', (reason: string) => {
        events.push('disconnect');
        resolve(reason);
      }),
    );
    return { told, disconnected, events };
  };

  it('closes a silent socket as soon as its session ends', async () => {
    const client = open({ token: await signIn() });
    await connection(client);
    const closed = closedBy(client);

    await endSessionsOf('admin');

    await expect(closed.told).resolves.toEqual({ reason: 'session_revoked' });
    await expect(closed.disconnected).resolves.toBe('io server disconnect');
    expect(closed.events).toEqual(['session_expired', 'disconnect']);
  });

  it('closes the sockets of an account an administrator suspends, and only those', async () => {
    const adminToken = await signIn();
    const created = await request(app.getHttpServer() as Server)
      .post(`/${E2E_API_PREFIX}/admin/users`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'realtime_suspended',
        fullName: 'Người bị đình chỉ',
        role: 'office_staff',
      })
      .expect(201);
    const { id, temporaryPassword } = created.body as {
      id: string;
      temporaryPassword: string;
    };
    const suspended = open({
      token: await signIn('realtime_suspended', temporaryPassword),
    });
    const bystander = open({ token: adminToken });
    await Promise.all([connection(suspended), connection(bystander)]);
    const closed = closedBy(suspended);
    let bystanderClosed = false;
    bystander.once('session_expired', () => {
      bystanderClosed = true;
    });

    await request(app.getHttpServer() as Server)
      .patch(`/${E2E_API_PREFIX}/admin/users/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect((res) => expect(res.status).toBeLessThan(300));

    await expect(closed.told).resolves.toEqual({ reason: 'session_revoked' });
    await expect(closed.disconnected).resolves.toBe('io server disconnect');
    // The administrator's own socket answers after the suspension was handled
    await expect(
      bystander.timeout(5_000).emitWithAck('chat:join', 'not-a-uuid'),
    ).resolves.toEqual({ error: 'invalid_conversation_id' });
    expect(bystanderClosed).toBe(false);
    expect(bystander.connected).toBe(true);
  });

  it('closes a silent socket when its access token expires', async () => {
    const issued = await signIn();
    const jwt = app.get(JwtService);
    const claims = jwt.decode<Record<string, unknown>>(issued);
    // The same session and account version, expiring in two seconds
    const rest = Object.fromEntries(
      Object.entries(claims).filter(([key]) => key !== 'iat' && key !== 'exp'),
    );
    const shortLived = jwt.sign(rest, {
      secret: process.env.JWT_SECRET,
      expiresIn: 2,
    });
    const client = open({ token: shortLived });
    await connection(client);
    const closed = closedBy(client);

    await expect(closed.told).resolves.toEqual({ reason: 'token_expired' });
    await expect(closed.disconnected).resolves.toBe('io server disconnect');
    expect(closed.events).toEqual(['session_expired', 'disconnect']);
  });
});

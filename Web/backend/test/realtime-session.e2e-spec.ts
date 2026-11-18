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
import {
  io as connectClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { configureHttpApp } from '../src/app.setup';
import { withClient } from './support/db';

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
  const signIn = async () => {
    const res = await request(app.getHttpServer() as Server)
      .post(`/${E2E_API_PREFIX}/auth/login`)
      .send({ username: 'admin', password: 'Admin@123' })
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

  it('tells an open socket its session ended before disconnecting it', async () => {
    const client = open({ token: await signIn() });
    await connection(client);
    await endSessionsOf('admin');

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
    client.emit('chat:join', randomUUID());

    await expect(told).resolves.toEqual({ reason: 'session_revoked' });
    await expect(disconnected).resolves.toBe('io server disconnect');
    expect(events).toEqual(['session_expired', 'disconnect']);
  });
});

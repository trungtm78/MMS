// Phase 3: Integration tests for Auth endpoints
// US-W001: login, logout, /me — real HTTP → NestJS → DB flow
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

// Ensure env vars are set before NestJS boots (Jest rootDir='src' may miss .env)
process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5433';
process.env.DB_USER = process.env.DB_USER ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'MMS';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-prod';
process.env.JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES ?? '15m';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-in-prod';
process.env.JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? '7d';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../app.module';
import * as bcrypt from 'bcrypt';
import { Client } from 'pg';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

let app: INestApplication;
let pgClient: Client;
let testUserId: string;
let accessToken: string;

const TEST_UNAME = 'it_user_' + Date.now();
const TEST_PASS = 'IntTest@999';

// Setup once for all tests
beforeAll(async () => {
  // Use direct pg client for test user CRUD — avoids NestJS DI resolution issues
  pgClient = new Client({
    host: 'localhost',
    port: 5433,
    user: 'postgres',
    password: 'postgres',
    database: 'MMS',
  });
  await pgClient.connect();

  // Create test user
  const passwordHash = await bcrypt.hash(TEST_PASS, 10);
  const result = await pgClient.query<{ id: string }>(
    `INSERT INTO users (username, password_hash, full_name, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [TEST_UNAME, passwordHash, 'Integration Test User'],
  );
  testUserId = result.rows[0].id;

  // Assign a role (militia or whatever exists)
  const roleRes = await pgClient.query<{ id: string }>(
    `SELECT id FROM roles WHERE code IN ('militia','dqtv','system_admin') ORDER BY code LIMIT 1`,
  );
  if (roleRes.rows[0]) {
    await pgClient.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [testUserId, roleRes.rows[0].id],
    );
  }

  // Boot NestJS app
  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1/mms_core');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  // Pre-login to get token for auth tests
  const loginRes = await supertest(app.getHttpServer())
    .post('/api/v1/mms_core/auth/login')
    .send({ username: TEST_UNAME, password: TEST_PASS });
  accessToken = loginRes.body?.tokens?.accessToken;
}, 60_000);

afterAll(async () => {
  if (testUserId && pgClient) {
    await pgClient.query(`DELETE FROM user_roles WHERE user_id=$1`, [
      testUserId,
    ]);
    await pgClient.query(`DELETE FROM sessions WHERE user_id=$1`, [testUserId]);
    await pgClient.query(`DELETE FROM users WHERE id=$1`, [testUserId]);
    await pgClient.end();
  }
  if (app) await app.close();
}, 30_000);

describe('Auth Integration — POST /auth/login', () => {
  // US-W001 AC-1: Happy path
  test('IT-W001-HP-01: valid credentials → 200 + tokens + safe user', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/mms_core/auth/login')
      .send({ username: TEST_UNAME, password: TEST_PASS });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.tokens.refreshToken).toBeTruthy();
    expect(res.body.tokens.expiresIn).toBe(900);
    expect(res.body.user.username).toBe(TEST_UNAME);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  // US-W001 NP-01: Wrong password → 401 vague error
  test('IT-W001-NP-01: wrong password → 401', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/mms_core/auth/login')
      .send({ username: TEST_UNAME, password: 'WrongPassword' });
    expect(res.status).toBe(401);
  });

  // US-W001 NP-03: Non-existent username → 401 (not 404)
  test('IT-W001-NP-03: non-existent user → 401 (not 404)', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/mms_core/auth/login')
      .send({ username: 'nonexistent_xyz_999', password: 'anything' });
    expect(res.status).toBe(401);
  });
});

describe('Auth Integration — GET /auth/me', () => {
  test('IT-W001-HP-02: valid token → 200 + user profile', async () => {
    expect(accessToken).toBeTruthy();
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/mms_core/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(TEST_UNAME);
  });

  test('IT-W001-NP-05a: no token → 401', async () => {
    const res = await supertest(app.getHttpServer()).get(
      '/api/v1/mms_core/auth/me',
    );
    expect(res.status).toBe(401);
  });

  test('IT-W001-NP-05b: invalid token → 401', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/mms_core/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
  });
});

describe('Auth Integration — POST /auth/logout', () => {
  test('IT-W001-HP-03: valid token logout → 204', async () => {
    // Get a fresh token for logout
    const loginRes = await supertest(app.getHttpServer())
      .post('/api/v1/mms_core/auth/login')
      .send({ username: TEST_UNAME, password: TEST_PASS });
    const token = loginRes.body?.tokens?.accessToken;
    expect(token).toBeTruthy();

    const res = await supertest(app.getHttpServer())
      .post('/api/v1/mms_core/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  test('IT-W001-NP-07: logout without token → 401', async () => {
    const res = await supertest(app.getHttpServer()).post(
      '/api/v1/mms_core/auth/logout',
    );
    expect(res.status).toBe(401);
  });
});

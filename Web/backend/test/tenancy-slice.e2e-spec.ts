// Two tenants on the running backend as the runtime role mms_app (TENANCY_MODE=enforced).
// Requires MIGRATION_TEST_ADMIN_URL, TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import { E2E_UPLOAD_DIR } from './support/enforced-env';
import * as fs from 'fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import {
  ADMIN_PASSWORD,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(240_000);

interface SignedIn {
  tokens: { accessToken: string; refreshToken: string };
}

const claimsOf = (token: string) =>
  JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString(),
  ) as Record<string, unknown>;

describe('tenant slice (e2e)', () => {
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

  const signIn = async (tenantCode: string, username: string) =>
    (await login(tenantCode, username).expect(200)).body as SignedIn;

  beforeAll(async () => {
    // The database the backend will connect to (as mms_app) is the one app-env.ts names
    db = await createTenantDatabase({ name: E2E_DB_NAME });
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');

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
    await app?.close();
    await db?.drop();
    fs.rmSync(E2E_UPLOAD_DIR, { recursive: true, force: true });
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
      const untenanted = app
        .get(JwtService)
        .sign(
          Object.fromEntries(
            Object.entries(claimsOf(tokens.a)).filter(
              ([claim]) => !['tid', 'iat', 'exp'].includes(claim),
            ),
          ),
          { secret: process.env.JWT_SECRET, expiresIn: '5m' },
        );

      await api()
        .get(url('/auth/me'))
        .set({ Authorization: `Bearer ${untenanted}` })
        .expect(401);
    });
  });
});

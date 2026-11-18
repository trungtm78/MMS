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
import { LOGIN_FAILURE_LIMIT } from '../src/auth/login-attempts.service';
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

const withoutClaim = (claims: Record<string, unknown>, claim: string) =>
  Object.fromEntries(Object.entries(claims).filter(([name]) => name !== claim));

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
        fs.rmSync(E2E_UPLOAD_DIR, { recursive: true, force: true });
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
});

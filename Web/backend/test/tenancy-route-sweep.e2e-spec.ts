// Isolation sweep over EVERY HTTP route (spec C12, the M1 gate). The map from every route
// parameter and id field to a tenant table, the other tenant's canary rows the sweep points
// them at, and the cross-tenant calls: tenant A's administrator calls every route with tenant
// B's ids in every path parameter, body and query id field. Nothing of B may come back (JSON,
// text, workbook cells), no route may fail, a by-id route answers 403/404, B's rows stay
// byte-for-byte unchanged, and no socket event crosses.
//
// Scope: the HTTP controller routes. The 7 @SubscribeMessage handlers of the gateways are no
// routes: their isolation is observed over real sockets (the listeners of the sweep, the
// socket checks below) and by the room-name work of Task 17.
// The rules of the sweep itself (what fails when a parameter is unmapped, untyped or stale)
// are proven in tenancy-route-sweep-rules.e2e-spec.ts.
//
// Runs the backend as mms_app with TENANCY_MODE=enforced. Requires MIGRATION_TEST_ADMIN_URL
// and TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import './support/enforced-env';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import {
  io as connectClient,
  type Socket as ClientSocket,
} from 'socket.io-client';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { seedCanaryRows, type SeededRows } from './support/canary-seeder';
import {
  ACCEPTED_400,
  buildCall,
  discover,
  mappedTables,
  responseText,
  routerRoutes,
  send,
  staleParameterEntries,
  tenantDigest,
  unmappedParameters,
  type Discovery,
} from './support/route-sweep';
import { isListed, tenantTables } from './support/tenancy-catalog';
import {
  ADMIN_PASSWORD,
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(900_000);

interface Listener {
  socket: ClientSocket;
  events: string[];
}

// app.module.ts registers a middleware for { path: '{*splat}', method: ALL }; Nest mounts it
// on these two Express routes. They serve no controller.
const NEST_MIDDLEWARE_ROUTES = ['ALL $', 'ALL /{*splat}'];

// The route table of migrations 001-037's application: a shrinking table is a lost route
const MIN_ROUTES = 194;

describe('isolation sweep of every route (e2e)', () => {
  let db: TenantDatabase;
  let app: INestApplication;
  let a: SeededTenant;
  let b: SeededTenant;
  let discovery: Discovery;
  let tables: string[];
  let baseUrl: string;
  let rowsB: SeededRows;

  const url = (path: string) => `/${E2E_API_PREFIX}${path}`;
  const signIn = async (tenant: SeededTenant): Promise<string> =>
    (
      (
        await request(baseUrl)
          .post(url('/auth/login'))
          .send({
            tenantCode: tenant.code,
            username: tenant.adminUsername,
            password: ADMIN_PASSWORD,
          })
          .expect(200)
      ).body as { tokens: { accessToken: string } }
    ).tokens.accessToken;
  const listen = (token: string) =>
    new Promise<Listener>((resolve, reject) => {
      const socket = connectClient(baseUrl, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });
      const events: string[] = [];
      socket.onAny((event: string, ...args: unknown[]) =>
        events.push(`${event} ${JSON.stringify(args)}`),
      );
      socket.once('connect', () => resolve({ socket, events }));
      socket.once('connect_error', reject);
    });

  beforeAll(async () => {
    db = await createTenantDatabase({ name: E2E_DB_NAME });
    a = await seedTenant(db, 'phu-dinh', 'CANARY-A');
    b = await seedTenant(db, 'tenant-b', 'CANARY-B');
    tables = await db.admin((c) => tenantTables(c));
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app, { apiPrefix: E2E_API_PREFIX });
    await app.listen(0);
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    discovery = discover(app);
    rowsB = await db.admin((c) =>
      seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 1 }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  describe('route map', () => {
    it('reads every controller of the application', () => {
      expect(discovery.problems).toEqual([]);
    });

    it('lists exactly the routes the HTTP router serves', () => {
      const discovered = discovery.routes.map((route) => route.key);
      const served = routerRoutes(app, E2E_API_PREFIX).filter(
        (key) => !NEST_MIDDLEWARE_ROUTES.includes(key),
      );
      expect({
        discoveredOnly: discovered.filter((key) => !served.includes(key)),
        routerOnly: served.filter((key) => !discovered.includes(key)),
      }).toEqual({ discoveredOnly: [], routerOnly: [] });
      expect(discovered.length).toBe(served.length);
      expect(discovered.length).toBeGreaterThanOrEqual(MIN_ROUTES);
    });

    it('maps every path parameter and every id or code field of every route to a tenant table', () => {
      expect(unmappedParameters(discovery.routes, new Set(tables))).toEqual([]);
    });

    it('keeps no map entry that no route uses any more', () => {
      expect(staleParameterEntries(discovery.routes)).toEqual([]);
    });
  });

  describe('the other tenant', () => {
    it('has a canary row in every table a parameter names', () => {
      expect(mappedTables().filter((table) => !rowsB.has(table))).toEqual([]);
    });

    it('owns every canary row the sweep will send, and none of them belongs to tenant A', () => {
      const misplaced = [...rowsB]
        .filter(([, row]) => row.tenant_id !== b.id || row.tenant_id === a.id)
        .map(([table]) => table);
      expect(misplaced).toEqual([]);
    });
  });

  describe('tenant A calling every route with the ids of tenant B', () => {
    it('never answers with B data, never fails, refuses B ids, leaves B unchanged and crosses no socket', async () => {
      // B signs in and listens BEFORE the digest: its sign-in is not A's doing
      const listenerB = await listen(await signIn(b));
      const listenerA = await listen(await signIn(a));
      const before = await tenantDigest(db, b.id, tables);
      const findings: string[] = [];
      let swept = 0;

      for (const route of discovery.routes) {
        const call = buildCall(route, rowsB);
        findings.push(...call.problems.map((p) => `${route.key}: ${p}`));
        // A fresh session per call: a route may end the caller's session (logout, MFA)
        const token = await signIn(a);
        const res = await send(
          request(baseUrl),
          route.method,
          url(call.path),
          token,
          call,
        );
        // A value the call itself sent may come back as an echo (a filter, an error path)
        const sent = new Set(
          JSON.stringify([call.query, call.body]).match(/CANARY-B-[0-9a-f-]+/g),
        );
        const text = [...sent].reduce(
          (answer, value) => answer.split(value).join(''),
          await responseText(res),
        );
        swept++;
        require('fs').appendFileSync('C:/Users/ADMIN/AppData/Local/Temp/claude/8daa945d41ae76f1/73c67afa-3a98-4379-9995-0c019e7e303e/scratchpad/status.txt', res.status + ' ' + route.key + ' ' + text.slice(0, 120).split(String.fromCharCode(10)).join(' ') + String.fromCharCode(10)); // TEMP
        if (res.status >= 500) {
          findings.push(`${route.key}: ${res.status} ${text.slice(0, 300)}`);
        }
        if (text.includes('CANARY-B')) {
          findings.push(`${route.key}: answered with data of tenant B`);
        }
        if (
          route.pathParams.length > 0 &&
          ![403, 404].includes(res.status) &&
          !(res.status === 400 && isListed(ACCEPTED_400, route.key))
        ) {
          findings.push(
            `${route.key}: ${res.status} for an id of tenant B (expected 403 or 404) ${text.slice(0, 200)}`,
          );
        }
      }

      expect(findings).toEqual([]);
      expect(swept).toBe(discovery.routes.length);
      expect(await tenantDigest(db, b.id, tables)).toEqual(before);
      expect(listenerB.events).toEqual([]);
      expect(listenerA.events.filter((e) => e.includes('CANARY-B'))).toEqual(
        [],
      );
      listenerA.socket.disconnect();
      listenerB.socket.disconnect();
    });
  });
});

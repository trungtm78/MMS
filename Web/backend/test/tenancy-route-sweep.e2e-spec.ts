// Isolation sweep over EVERY HTTP route (spec C12, the M1 gate). Task 4: the map from every
// route parameter and id field to a tenant table, and the other tenant's canary rows the
// sweep points them at. Task 21 adds the cross-tenant calls.
//
// Scope: the HTTP controller routes only. The 7 @SubscribeMessage handlers of the gateways
// are not enumerated here: they are no routes, and their tenant isolation is observed over
// real sockets by Task 21's socket checks and the room-name work of Task 17.
// The rules of the sweep itself (what fails when a parameter is unmapped, untyped or stale)
// are proven in tenancy-route-sweep-rules.e2e-spec.ts.
//
// Runs the backend as mms_app with TENANCY_MODE=enforced. Requires MIGRATION_TEST_ADMIN_URL
// and TEST_REDIS_URL; run with --runInBand.
import { E2E_API_PREFIX, E2E_DB_NAME } from './support/app-env';
import './support/enforced-env';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { seedCanaryRows, type SeededRows } from './support/canary-seeder';
import {
  discover,
  mappedTables,
  routerRoutes,
  staleParameterEntries,
  unmappedParameters,
  type Discovery,
} from './support/route-sweep';
import { tenantTables } from './support/tenancy-catalog';
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(300_000);

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
    await app.init();
    discovery = discover(app);
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
    let rowsB: SeededRows;

    beforeAll(async () => {
      rowsB = await db.admin((c) =>
        seedCanaryRows(c, { tenantId: b.id, label: 'B', batch: 1 }),
      );
    });

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
});

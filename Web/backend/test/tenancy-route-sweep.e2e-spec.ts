// Isolation sweep over EVERY route (spec C12, the M1 gate). Task 4: the map from every
// route parameter and id field to a tenant table, and the other tenant's canary rows the
// sweep points them at. Task 21 adds the cross-tenant calls.
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
  discoverRoutes,
  mappedTables,
  staleParameterEntries,
  unmappedParameters,
  type SweptRoute,
} from './support/route-sweep';
import { tenantTables } from './support/tenancy-catalog';
import {
  createTenantDatabase,
  seedTenant,
  type SeededTenant,
  type TenantDatabase,
} from './support/tenancy';

jest.setTimeout(300_000);

describe('isolation sweep of every route (e2e)', () => {
  let db: TenantDatabase;
  let app: INestApplication;
  let a: SeededTenant;
  let b: SeededTenant;
  let routes: SweptRoute[];
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
    routes = discoverRoutes(app);
  });

  afterAll(async () => {
    await app?.close();
    await db?.drop();
  });

  describe('route map', () => {
    it('discovers every route of the application', () => {
      expect(routes.length).toBeGreaterThan(150);
      expect(a.id).not.toBe(b.id);
    });

    it('maps every path parameter and every id field of every route to a tenant table', () => {
      expect(unmappedParameters(routes, new Set(tables))).toEqual([]);
    });

    it('keeps no parameter entry for a route that no longer exists', () => {
      expect(staleParameterEntries(routes)).toEqual([]);
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
  });
});

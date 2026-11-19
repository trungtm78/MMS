// The application as deployed: AppModule boots on a freshly migrated Postgres, and the health
// endpoint that container healthchecks and deploy smoke tests poll answers without a token,
// reporting the database and the heap. HealthController's unit test replaces Terminus with
// mocks, so this is the one place the real indicators run.
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5440/postgres
// The environment module comes first: AppModule reads its configuration when it is loaded.
import {
  E2E_ADMIN_URL,
  E2E_API_PREFIX,
  E2E_DB_NAME,
  E2E_DB_URL,
} from './support/app-env';
import type { Server } from 'http';
import * as path from 'path';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/app.setup';
import { migrateDatabase } from '../src/database/migrations/migrate';
import { withClient } from './support/db';
import { prepareDatabaseForTenancy } from './support/e2e-tenancy';

jest.setTimeout(180_000);

describe('Application (e2e)', () => {
  let app: INestApplication;

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
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await withClient(E2E_ADMIN_URL, (c) =>
      c.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`),
    );
  });

  it('reports itself healthy, with the database reachable and the heap within bounds', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/${E2E_API_PREFIX}/health`)
      .expect(200);

    expect(res.body).toEqual({
      status: 'ok',
      info: { database: { status: 'up' }, memory_heap: { status: 'up' } },
      error: {},
      details: { database: { status: 'up' }, memory_heap: { status: 'up' } },
    });
  });

  it('serves the API under its prefix only', async () => {
    await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(404);
  });
});

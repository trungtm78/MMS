// The tenancy mode the e2e suites run the backend in: E2E_TENANCY=legacy (the default) or
// enforced. Enforced runs it as mms_app with TENANCY_MODE=enforced on a database without the
// legacy default, signs the suites' tenant-less sign-ins in through LEGACY_DEFAULT_TENANT_CODE,
// and gives fixture connections (support/db.ts) the first tenant as their default, so the
// fixtures, written for one tenant, keep their meaning. The suites' assertions are the same
// in both modes: these helpers are the only place the modes differ.
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import {
  FIRST_TENANT_CODE,
  FIRST_TENANT_ID,
} from '../../src/database/tenancy/first-tenant';
import { TenantContext } from '../../src/database/tenancy/tenant-context';
import { APP_PASSWORD, alterRole } from './tenancy';

export type E2eTenancy = 'legacy' | 'enforced';

export function e2eTenancy(env: NodeJS.ProcessEnv = process.env): E2eTenancy {
  const raw = (env.E2E_TENANCY ?? 'legacy').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'enforced') return raw;
  throw new Error(
    `Invalid E2E_TENANCY ${JSON.stringify(env.E2E_TENANCY)}: use 'legacy' or 'enforced'`,
  );
}

export const isEnforcedRun = (): boolean => e2eTenancy() === 'enforced';

/** The backend settings of the run's mode, merged last over a suite's own DB_* settings. */
export function backendTenancyEnv(): Record<string, string> {
  if (!isEnforcedRun()) return {};
  return {
    TENANCY_MODE: 'enforced',
    DB_USER: 'mms_app',
    DB_PASSWORD: APP_PASSWORD,
    LEGACY_DEFAULT_TENANT_CODE: FIRST_TENANT_CODE,
  };
}

/** The `options` startup parameter of fixture connections: the first tenant when enforced. */
export const fixtureConnectionOptions = (): string | undefined =>
  isEnforcedRun() ? `-c app.tenant_id=${FIRST_TENANT_ID}` : undefined;

/** After a suite migrated its database: in an enforced run, make it an enforced database. */
export async function prepareDatabaseForTenancy(
  databaseName: string,
): Promise<void> {
  if (!isEnforcedRun()) return;
  const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!adminUrl) throw new Error('MIGRATION_TEST_ADMIN_URL is not set');
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `ALTER DATABASE "${databaseName.replace(/"/g, '""')}" RESET app.tenant_id`,
    );
    await alterRole(client, 'mms_app', APP_PASSWORD);
  } finally {
    await client.end();
  }
}

/** A service a suite calls directly has no request, so no scope: run it as the first tenant. */
export const asFixtureTenant = <T>(fn: () => T): T =>
  TenantContext.runAs({ tenantId: FIRST_TENANT_ID }, fn);

/** The directory holding the uploads of the fixture tenant (FilesService.tenantUploadDir). */
export const storedContentDir = (uploadDir: string): string =>
  isEnforcedRun() ? path.join(uploadDir, FIRST_TENANT_ID) : uploadDir;

/** Where an upload's content lives (FilesService.contentPath). */
export const storedContentPath = (
  uploadDir: string,
  storageKey: string,
): string => path.join(storedContentDir(uploadDir), storageKey);

/** How many uploads the fixture tenant has on disk. */
export const storedFileCount = (uploadDir: string): number => {
  const dir = storedContentDir(uploadDir);
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};

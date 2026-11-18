// The tenant e2e database helper must not leave a half-built database behind when its
// setup fails. Requires MIGRATION_TEST_ADMIN_URL.
import * as migrate from '../src/database/migrations/migrate';
import { createTenantDatabase, withClient } from './support/tenancy';

jest.setTimeout(60_000);

describe('tenant database helper (e2e)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('drops the database it created when a later setup step fails', async () => {
    const name = `mms_tn_helper_${process.pid}_${Date.now()}`;
    jest
      .spyOn(migrate, 'migrateDatabase')
      .mockRejectedValue(new Error('migration failed'));

    await expect(createTenantDatabase({ name })).rejects.toThrow(
      'migration failed',
    );

    const remaining = await withClient(
      process.env.MIGRATION_TEST_ADMIN_URL ?? '',
      async (c) =>
        (
          await c.query<{ datname: string }>(
            `SELECT datname FROM pg_database WHERE datname = $1`,
            [name],
          )
        ).rows,
    );
    expect(remaining).toEqual([]);
  });
});

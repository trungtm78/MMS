// After every e2e run the application roles go back to NOLOGIN with no password, so a
// cluster never keeps a login a test set (docs/tenancy.md, "Running the e2e suites").
import { Client } from 'pg';

export default async function lockApplicationRoles(): Promise<void> {
  const url = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!url) return;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const role of ['mms_app', 'mms_platform']) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [role],
      );
      if (rowCount)
        await client.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);
    }
  } finally {
    await client.end();
  }
}

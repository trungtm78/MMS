// After every Jest process the application roles go back to NOLOGIN with no password, so a
// cluster does not keep a login a test set (docs/tenancy.md, "Running the e2e suites"). Jest
// runs this only when it exits normally: scripts/run-e2e.mjs locks the roles itself too,
// after every process and when it is interrupted. Both use the same helper.
import { lockApplicationRoles as lockRoles } from './e2e-roles.cjs';

export default async function lockApplicationRoles(): Promise<void> {
  const url = process.env.MIGRATION_TEST_ADMIN_URL;
  if (!url) return;
  await lockRoles(url);
}

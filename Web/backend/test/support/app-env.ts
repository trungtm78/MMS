// Environment of an e2e suite that boots AppModule on its own, freshly created database.
// Import this module before AppModule: the backend reads its configuration while AppModule
// is loaded. Jest gives every test file its own module registry, so each suite gets its own
// database name.
//
// Requires MIGRATION_TEST_ADMIN_URL, e.g. postgres://mms:mms_secret@localhost:5440/postgres
const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
if (!adminUrl) {
  throw new Error(
    'MIGRATION_TEST_ADMIN_URL is not set (e.g. postgres://mms:mms_secret@localhost:5440/postgres)',
  );
}

export const E2E_ADMIN_URL: string = adminUrl;
export const E2E_API_PREFIX = 'api/v1/mms_core';
export const E2E_DB_NAME = `mms_e2e_${process.pid}_${Date.now()}`;
export const E2E_DB_URL = (() => {
  const url = new URL(E2E_ADMIN_URL);
  url.pathname = `/${E2E_DB_NAME}`;
  return url.toString();
})();

const target = new URL(E2E_DB_URL);
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: target.hostname,
  DB_PORT: target.port || '5432',
  DB_USER: decodeURIComponent(target.username),
  DB_PASSWORD: decodeURIComponent(target.password),
  DB_NAME: E2E_DB_NAME,
  API_PREFIX: E2E_API_PREFIX,
  JWT_SECRET: 'e2e-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
  AES_CCCD_KEY: 'a'.repeat(64),
  // Suites sign in far more often than a person could from one address
  THROTTLE_LOGIN_LIMIT: '100000',
  THROTTLE_MFA_LIMIT: '100000',
});

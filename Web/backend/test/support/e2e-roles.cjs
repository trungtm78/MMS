'use strict';
// The cluster-wide application roles of the e2e suites, in one place for the Jest harness
// (test/support/tenancy.ts, the global teardown) and the runner (scripts/run-e2e.mjs), which
// cannot rely on Jest to clean up after a killed process. CommonJS on purpose: TypeScript
// specs and an ES module script both import it.
const { Client } = require('pg');

const APPLICATION_ROLES = ['mms_app', 'mms_platform'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// "tuple concurrently updated" (XX000): two sessions altering the same cluster-wide role
const isConcurrentRoleUpdate = (error) =>
  Boolean(error) &&
  error.code === 'XX000' &&
  /concurrently updated/i.test(String(error.message));

/**
 * Retries only the concurrent-update error, with exponential backoff and jitter; any other
 * failure is real and surfaces at once.
 */
async function retryConcurrentRoleUpdate(operation, options = {}) {
  const {
    attempts = 8,
    baseDelayMs = 50,
    maxDelayMs = 2000,
    random = Math.random,
  } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isConcurrentRoleUpdate(error) || attempt >= attempts) throw error;
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(Math.round(ceiling * (0.5 + random() / 2)));
    }
  }
}

async function alterRole(client, role, password, options) {
  await retryConcurrentRoleUpdate(
    () =>
      client.query(
        `ALTER ROLE ${client.escapeIdentifier(role)} LOGIN PASSWORD ${client.escapeLiteral(password)}`,
      ),
    options,
  );
}

/** Puts the application roles back to NOLOGIN with no password (those that exist). */
async function lockApplicationRoles(adminUrl, options) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    for (const role of APPLICATION_ROLES) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname = $1`,
        [role],
      );
      if (!rowCount) continue;
      await retryConcurrentRoleUpdate(
        () =>
          client.query(
            `ALTER ROLE ${client.escapeIdentifier(role)} NOLOGIN PASSWORD NULL`,
          ),
        options,
      );
    }
  } finally {
    await client.end();
  }
}

module.exports = {
  APPLICATION_ROLES,
  alterRole,
  lockApplicationRoles,
  retryConcurrentRoleUpdate,
};

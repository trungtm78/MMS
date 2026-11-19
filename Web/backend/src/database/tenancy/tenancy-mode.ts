export type TenancyMode = 'legacy' | 'enforced';

/**
 * A tenancy setting or database that cannot work as configured. Retrying never fixes it, so
 * the TypeORM module (which retries its data source factory) gives up on this error at once.
 */
export class TenancyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenancyConfigError';
  }
}

export interface TenancySettings {
  readonly mode: TenancyMode;
  /**
   * Transitional (spec D17): under enforced mode, a sign-in that sends no tenant code signs
   * in to this tenant, for clients released before the tenant-code screen. Null: a 400.
   */
  readonly legacyDefaultTenantCode: string | null;
}

// The format of tenants.code (migration 036, chk_tenants_code)
const TENANT_CODE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/**
 * TENANCY_MODE: `legacy` keeps the single-tenant behaviour (no tenant scope is written to
 * the connection); `enforced` binds every connection to the tenant of the request. A typo
 * (or an empty value) must not silently pick a mode, so anything else fails.
 */
export function tenancyMode(env: NodeJS.ProcessEnv = process.env): TenancyMode {
  const raw = (env.TENANCY_MODE ?? 'legacy').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'enforced') return raw;
  throw new TenancyConfigError(
    `Invalid TENANCY_MODE ${JSON.stringify(env.TENANCY_MODE)}: use 'legacy' or 'enforced'`,
  );
}

export function readTenancySettings(
  env: NodeJS.ProcessEnv = process.env,
): TenancySettings {
  const mode = tenancyMode(env);
  const code = (env.LEGACY_DEFAULT_TENANT_CODE ?? '').trim().toLowerCase();
  if (code && !TENANT_CODE.test(code)) {
    throw new TenancyConfigError(
      `Invalid LEGACY_DEFAULT_TENANT_CODE ${JSON.stringify(env.LEGACY_DEFAULT_TENANT_CODE)}: use a tenant code such as 'phu-dinh'`,
    );
  }
  return { mode, legacyDefaultTenantCode: code || null };
}

let frozen: TenancySettings | undefined;

/**
 * Reads the settings once, at startup (tenantAwareDataSource): the hook, the guards and every
 * mode check of a running application then agree, whatever the environment does later.
 */
export function freezeTenancySettings(
  env: NodeJS.ProcessEnv = process.env,
): TenancySettings {
  frozen = readTenancySettings(env);
  return frozen;
}

/** The settings frozen at startup; before startup (scripts, unit tests), the environment's. */
export function tenancySettings(): TenancySettings {
  return frozen ?? readTenancySettings();
}

export const isTenancyEnforced = (env?: NodeJS.ProcessEnv): boolean =>
  (env ? tenancyMode(env) : tenancySettings().mode) === 'enforced';

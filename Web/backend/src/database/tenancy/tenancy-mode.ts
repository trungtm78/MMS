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

/**
 * TENANCY_MODE: `legacy` keeps the single-tenant behaviour (no tenant scope is written to
 * the connection); `enforced` binds every connection to the tenant of the request. A typo
 * must not silently turn isolation off, so anything else fails.
 */
export function tenancyMode(env: NodeJS.ProcessEnv = process.env): TenancyMode {
  const raw = (env.TENANCY_MODE ?? 'legacy').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'enforced') return raw;
  throw new TenancyConfigError(
    `Invalid TENANCY_MODE ${JSON.stringify(env.TENANCY_MODE)}: use 'legacy' or 'enforced'`,
  );
}

export const isTenancyEnforced = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => tenancyMode(env) === 'enforced';

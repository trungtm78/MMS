import type { Client } from 'pg';

export interface RoleRetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** In [0, 1): the jitter source. */
  random?: () => number;
}

export const APPLICATION_ROLES: readonly string[];

export function retryConcurrentRoleUpdate<T>(
  operation: () => Promise<T>,
  options?: RoleRetryOptions,
): Promise<T>;

export function alterRole(
  client: Client,
  role: string,
  password: string,
  options?: RoleRetryOptions,
): Promise<void>;

export function lockApplicationRoles(
  adminUrl: string,
  options?: RoleRetryOptions,
): Promise<void>;

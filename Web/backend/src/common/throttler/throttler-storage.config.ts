// Environment contract for the rate-limit counter store. Pure functions, so the startup
// rules are unit-tested without a server.
//
//   THROTTLE_STORAGE     redis | memory. Unset: redis when NODE_ENV=production, else memory
//   THROTTLE_KEY_PREFIX  prefix of every Redis key (default mms:throttle:)
//   REDIS_HOST / REDIS_PORT / REDIS_PASSWORD  the same settings Socket.IO uses
import {
  type EnvVars,
  type RedisConnection,
  redisConnectionConfig,
  redisOrMemory,
} from '../redis/redis-client';

export type { EnvVars };

export type ThrottleStorageKind = 'redis' | 'memory';

export const DEFAULT_THROTTLE_KEY_PREFIX = 'mms:throttle:';

export interface RedisThrottleConfig extends RedisConnection {
  keyPrefix: string;
}

function setting(env: EnvVars, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Production defaults to Redis because backend replicas must enforce one limit together;
 * anywhere else counters stay in process memory so tests and local runs need no Redis.
 */
export function throttleStorageKind(env: EnvVars): ThrottleStorageKind {
  return redisOrMemory(env, 'THROTTLE_STORAGE');
}

export function redisThrottleConfig(env: EnvVars): RedisThrottleConfig {
  return {
    ...redisConnectionConfig(env),
    keyPrefix:
      setting(env, 'THROTTLE_KEY_PREFIX') ?? DEFAULT_THROTTLE_KEY_PREFIX,
  };
}

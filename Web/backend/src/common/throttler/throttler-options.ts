// ThrottlerModule options for AppModule: the global limit plus the counter store selected
// by THROTTLE_STORAGE (see throttler-storage.config.ts).
import { Logger, type LoggerService } from '@nestjs/common';
import {
  ThrottlerStorageService,
  type ThrottlerOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import {
  type EnvVars,
  redisThrottleConfig,
  throttleStorageKind,
} from './throttler-storage.config';

/** Every route; the sign-in and MFA routes tighten it with @Throttle (auth-throttle.ts). */
export const GLOBAL_THROTTLERS: readonly Readonly<ThrottlerOptions>[] = [
  { ttl: 60_000, limit: 100 },
];

export interface ThrottlerStorageDeps {
  createRedisClient?: (options: RedisOptions) => Redis;
  logger?: Pick<LoggerService, 'log' | 'warn'>;
}

export interface AppThrottlerOptions {
  throttlers: ThrottlerOptions[];
  storage: ThrottlerStorage;
}

/** Rejects when the configuration is invalid or the selected store cannot be used. */
export async function createThrottlerStorage(
  env: EnvVars = process.env,
  deps: ThrottlerStorageDeps = {},
): Promise<ThrottlerStorage> {
  const logger = deps.logger ?? new Logger('ThrottlerStorage');

  if (throttleStorageKind(env) === 'memory') {
    if (env.NODE_ENV?.trim() === 'production') {
      logger.warn(
        'THROTTLE_STORAGE=memory: rate-limit counters are kept per replica, so with more than one backend replica every limit is multiplied',
      );
    }
    return new ThrottlerStorageService();
  }

  const config = redisThrottleConfig(env);
  const storage = await RedisThrottlerStorage.connect(config, {
    createClient: deps.createRedisClient,
    logger,
  });
  logger.log(
    `Rate-limit counters shared through Redis at ${config.host}:${config.port} (keys ${config.keyPrefix}*)`,
  );
  return storage;
}

export async function throttlerModuleOptions(
  env: EnvVars = process.env,
  deps: ThrottlerStorageDeps = {},
): Promise<AppThrottlerOptions> {
  return {
    // Copies: ThrottlerGuard sorts and extends the array it receives
    throttlers: GLOBAL_THROTTLERS.map((throttler) => ({ ...throttler })),
    storage: await createThrottlerStorage(env, deps),
  };
}

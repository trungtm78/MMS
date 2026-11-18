// ThrottlerStorage for @nestjs/throttler v6 that keeps counters in Redis, so every backend
// replica enforces the same limit per client.
//
// Semantics follow the library's in-memory ThrottlerStorageService:
// - a request counts unless the key is blocked; once hits exceed the limit the key is
//   blocked for blockDuration and further requests are rejected without being counted
// - when a block ends the counter starts again from this request (totalHits 1)
// - a blockDuration of 0 or less never blocks; the counter restarts instead
// - timeToExpire and timeToBlockExpire are whole seconds, rounded up (ThrottlerGuard
//   writes them into X-RateLimit-Reset and Retry-After)
// - counters are separate per throttler name and per key
// One difference: the window is fixed (it starts at the first hit and expires ttl later)
// instead of each hit expiring on its own timer. While blocked, timeToExpire reports when
// the counter restarts, i.e. the end of the block; when not blocked timeToBlockExpire is 0.
//
// Counting, expiry and blocking happen in one Lua script, so concurrent requests on
// different replicas cannot interleave between reading and updating the counter.
import { createHash } from 'crypto';
import { Logger, type LoggerService } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { connectRedis, unusableRedisError } from '../redis/redis-client';
import { DEFAULT_THROTTLE_KEY_PREFIX } from './throttler-storage.config';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/**
 * KEYS[1] hit counter, KEYS[2] block marker (holds the hit count that caused the block)
 * ARGV[1] ttl ms, ARGV[2] limit, ARGV[3] block duration ms
 * Returns { totalHits, timeToExpire ms, blocked 0|1, timeToBlockExpire ms }
 */
export const THROTTLE_INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  return { tonumber(redis.call('GET', blockKey)) or 0, blockTtl, 1, blockTtl }
end

local hits = redis.call('INCR', hitsKey)
local hitsTtl = redis.call('PTTL', hitsKey)
if hitsTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttl)
  hitsTtl = ttl
end

if hits <= limit then
  return { hits, hitsTtl, 0, 0 }
end

if blockDuration <= 0 then
  redis.call('SET', hitsKey, 1, 'PX', ttl)
  return { 1, ttl, 0, 0 }
end

redis.call('SET', blockKey, hits, 'PX', blockDuration)
redis.call('DEL', hitsKey)
return { hits, blockDuration, 1, blockDuration }
`;

const SCRIPT_SHA = createHash('sha1')
  .update(THROTTLE_INCREMENT_SCRIPT)
  .digest('hex');

export interface RedisThrottlerStorageOptions {
  /** Prepended to every key (default mms:throttle:). */
  keyPrefix?: string;
  /** Close the client on application shutdown; set when the storage created it. */
  ownsClient?: boolean;
}

export interface RedisThrottleConnection {
  host: string;
  port: number;
  password?: string;
  keyPrefix?: string;
}

export interface RedisThrottleConnectDeps {
  createClient?: (options: RedisOptions) => Redis;
  logger?: Pick<LoggerService, 'log' | 'warn'>;
}

const RATE_LIMIT_REDIS = {
  purpose: 'Rate-limit storage',
  connectionName: 'mms:rate-limit',
  outageImpact: 'throttled requests fail until it recovers',
  remedy:
    'THROTTLE_STORAGE=redis (the production default) needs it: start Redis or fix ' +
    'REDIS_HOST, REDIS_PORT and REDIS_PASSWORD. THROTTLE_STORAGE=memory counts per ' +
    'instance and is only correct for a single instance.',
};

const toSeconds = (milliseconds: number) =>
  milliseconds > 0 ? Math.ceil(milliseconds / 1000) : 0;

function wholeMilliseconds(value: number, name: string, minimum: number) {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(
      `Throttler ${name} must be a finite number of milliseconds >= ${minimum}, got ${value}`,
    );
  }
  return Math.ceil(value);
}

export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly keyPrefix: string;
  private readonly ownsClient: boolean;

  constructor(
    private readonly redis: Redis,
    options: RedisThrottlerStorageOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? DEFAULT_THROTTLE_KEY_PREFIX;
    this.ownsClient = options.ownsClient ?? false;
  }

  /**
   * Connects and loads the script, failing when Redis cannot be used, so a replica never
   * starts with a limiter that cannot count.
   */
  static async connect(
    connection: RedisThrottleConnection,
    deps: RedisThrottleConnectDeps = {},
  ): Promise<RedisThrottlerStorage> {
    const client = await connectRedis(connection, {
      ...RATE_LIMIT_REDIS,
      // While Redis is down a throttle check fails after one reconnect attempt instead of
      // queueing; the request is rejected rather than let through unthrottled
      maxRetriesPerRequest: 1,
      createClient: deps.createClient,
      logger: deps.logger ?? new Logger(RedisThrottlerStorage.name),
    });

    // Loaded up front, so a server that refuses scripting fails startup
    try {
      await client.script('LOAD', THROTTLE_INCREMENT_SCRIPT);
    } catch (error) {
      client.disconnect();
      throw unusableRedisError(
        RATE_LIMIT_REDIS,
        connection,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return new RedisThrottlerStorage(client, {
      keyPrefix: connection.keyPrefix,
      ownsClient: true,
    });
  }

  /** Both keys share a hash tag, so the script also runs on Redis Cluster. */
  keysFor(key: string, throttlerName: string): { hits: string; block: string } {
    const base = `${this.keyPrefix}${throttlerName}:{${key}}`;
    return { hits: `${base}:hits`, block: `${base}:block` };
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const ttlMs = wholeMilliseconds(ttl, 'ttl', Number.MIN_VALUE);
    const blockMs = Math.max(
      0,
      wholeMilliseconds(blockDuration, 'blockDuration', -Infinity),
    );
    if (!Number.isFinite(limit)) {
      throw new RangeError(
        `Throttler limit must be a finite number, got ${limit}`,
      );
    }
    const { hits, block } = this.keysFor(key, throttlerName);

    const reply = (await this.run([hits, block], [ttlMs, limit, blockMs])) as [
      number,
      number,
      number,
      number,
    ];
    const [totalHits, timeToExpireMs, blocked, timeToBlockExpireMs] = reply;

    return {
      totalHits,
      timeToExpire: toSeconds(timeToExpireMs),
      isBlocked: blocked === 1,
      timeToBlockExpire: toSeconds(timeToBlockExpireMs),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.ownsClient && this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }

  // EVALSHA avoids resending the script; Redis drops cached scripts on restart or
  // SCRIPT FLUSH, and EVAL caches it again
  private async run(keys: string[], args: number[]): Promise<unknown> {
    try {
      return await this.redis.evalsha(
        SCRIPT_SHA,
        keys.length,
        ...keys,
        ...args,
      );
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('NOSCRIPT')) {
        throw error;
      }
      return this.redis.eval(
        THROTTLE_INCREMENT_SCRIPT,
        keys.length,
        ...keys,
        ...args,
      );
    }
  }
}

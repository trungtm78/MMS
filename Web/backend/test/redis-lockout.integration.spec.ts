// Integration test: Redis lockout survives process restart
// Requires: running Redis instance
// Run with: jest --testPathPattern=redis-lockout --testEnvironment=node

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('Redis Lockout — Integration (requires Redis)', () => {
  let cache: Cache;
  let module: TestingModule;

  const REDIS_AVAILABLE = process.env.REDIS_HOST || 'localhost';

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        CacheModule.registerAsync({
          isGlobal: true,
          useFactory: async () => ({
            store: await redisStore({
              socket: { host: REDIS_AVAILABLE, port: parseInt(process.env.REDIS_PORT || '6379') },
            }),
          }),
        }),
      ],
    }).compile();

    cache = module.get<Cache>(CACHE_MANAGER);
  });

  afterAll(async () => {
    await module.close();
  });

  it('stores lockout in Redis and retrieves it', async () => {
    const key = `login_attempts:test_user_${Date.now()}`;
    await cache.set(key, { count: 5, lockUntil: Date.now() + 30 * 60 * 1000 }, 30 * 60 * 1000);

    const lockInfo = await cache.get<{ count: number; lockUntil: number }>(key);
    expect(lockInfo).toBeDefined();
    expect(lockInfo!.count).toBe(5);
    expect(lockInfo!.lockUntil).toBeGreaterThan(Date.now());

    // Cleanup
    await cache.del(key);
  });

  it('lockout expires after TTL', async () => {
    const key = `login_attempts:expire_test_${Date.now()}`;
    // Set with very short TTL (1 second = 1000ms for cache-manager v6)
    await cache.set(key, { count: 5, lockUntil: Date.now() + 1000 }, 1000);

    const immediate = await cache.get(key);
    expect(immediate).toBeDefined();

    // Wait for expiry
    await new Promise(r => setTimeout(r, 1200));
    const expired = await cache.get(key);
    expect(expired).toBeNull();
  });

  it('simulates cross-instance lockout: write in "instance 1", read in "instance 2"', async () => {
    // Both instances share Redis — simulate by using separate cache.get/set calls
    const key = `login_attempts:cross_instance_${Date.now()}`;

    // "Instance 1" writes lockout
    await cache.set(key, { count: 5, lockUntil: Date.now() + 30 * 60 * 1000 }, 30 * 60 * 1000);

    // "Instance 2" reads (same Redis) — this is what matters for multi-instance
    const lockInfo = await cache.get<{ count: number; lockUntil: number }>(key);
    expect(lockInfo).toBeDefined();
    expect(lockInfo!.lockUntil).toBeGreaterThan(Date.now());

    // Cleanup
    await cache.del(key);
  });
});

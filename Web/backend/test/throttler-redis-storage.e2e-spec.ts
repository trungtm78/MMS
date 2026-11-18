// RedisThrottlerStorage against a real Redis: counting, expiry, blocking, key isolation,
// agreement with @nestjs/throttler's in-memory storage, and atomicity under concurrency
// from several connections (standing in for backend replicas).
//
// Requires TEST_REDIS_URL, e.g. redis://localhost:6379 (or
// redis://:password@host:6379). Only host, port and password are used; every key lives
// under a per-run prefix that is deleted afterwards.
import { createServer, type AddressInfo } from 'net';
import { ThrottlerStorageService } from '@nestjs/throttler';
import Redis, { type RedisOptions } from 'ioredis';
import {
  RedisThrottlerStorage,
  THROTTLE_INCREMENT_SCRIPT,
} from '../src/common/throttler/redis-throttler.storage';

jest.setTimeout(30_000);

const redisUrl = process.env.TEST_REDIS_URL;
if (!redisUrl) {
  throw new Error(
    'TEST_REDIS_URL is not set (e.g. redis://localhost:6379); this suite needs a real Redis',
  );
}

const parsed = new URL(redisUrl);
const connection: RedisOptions & { host: string; port: number } = {
  host: parsed.hostname,
  port: Number(parsed.port || 6379),
  password: decodeURIComponent(parsed.password) || undefined,
};

const RUN_PREFIX = `mms:throttle-test:${process.pid}-${Date.now()}:`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let keyCounter = 0;
const uniqueKey = () => `key-${keyCounter++}`;

describe('RedisThrottlerStorage (real Redis)', () => {
  const clients: Redis[] = [];
  let raw: Redis;
  let storage: RedisThrottlerStorage;

  const newClient = () => {
    const client = new Redis(connection);
    clients.push(client);
    return client;
  };

  beforeAll(async () => {
    raw = newClient();
    await raw.ping();
    storage = new RedisThrottlerStorage(newClient(), { keyPrefix: RUN_PREFIX });
  });

  afterAll(async () => {
    let cursor = '0';
    do {
      const [next, keys] = await raw.scan(
        cursor,
        'MATCH',
        `${RUN_PREFIX}*`,
        'COUNT',
        500,
      );
      if (keys.length) await raw.del(...keys);
      cursor = next;
    } while (cursor !== '0');
    await Promise.all(clients.map((client) => client.quit()));
  });

  describe('counting', () => {
    it('counts hits within the ttl', async () => {
      const key = uniqueKey();

      const results = [
        await storage.increment(key, 10_000, 5, 10_000, 'default'),
        await storage.increment(key, 10_000, 5, 10_000, 'default'),
        await storage.increment(key, 10_000, 5, 10_000, 'default'),
      ];

      expect(results).toEqual([
        {
          totalHits: 1,
          timeToExpire: 10,
          isBlocked: false,
          timeToBlockExpire: 0,
        },
        {
          totalHits: 2,
          timeToExpire: 10,
          isBlocked: false,
          timeToBlockExpire: 0,
        },
        {
          totalHits: 3,
          timeToExpire: 10,
          isBlocked: false,
          timeToBlockExpire: 0,
        },
      ]);
    });

    it('starts the window at the first hit and does not extend it', async () => {
      const key = uniqueKey();
      const hitsKey = `${RUN_PREFIX}default:{${key}}:hits`;

      await storage.increment(key, 10_000, 5, 10_000, 'default');
      const first = await raw.pttl(hitsKey);
      await sleep(80);
      await storage.increment(key, 10_000, 5, 10_000, 'default');
      const second = await raw.pttl(hitsKey);

      expect(first).toBeGreaterThan(9_000);
      expect(first).toBeLessThanOrEqual(10_000);
      expect(second).toBeLessThan(first);
      expect(await raw.get(hitsKey)).toBe('2');
    });

    it('starts over once the ttl has passed', async () => {
      const key = uniqueKey();

      await storage.increment(key, 300, 2, 300, 'default');
      await storage.increment(key, 300, 2, 300, 'default');
      await sleep(450);
      const afterExpiry = await storage.increment(key, 300, 2, 300, 'default');

      expect(afterExpiry).toMatchObject({ totalHits: 1, isBlocked: false });
    });
  });

  describe('blocking', () => {
    it('blocks past the limit for blockDuration without counting blocked requests', async () => {
      const key = uniqueKey();
      const hit = () => storage.increment(key, 10_000, 2, 600, 'default');

      await hit();
      await hit();
      const third = await hit();
      const fourth = await hit();

      expect(third).toMatchObject({
        totalHits: 3,
        isBlocked: true,
        timeToBlockExpire: 1,
      });
      expect(fourth).toMatchObject({ totalHits: 3, isBlocked: true });

      await sleep(700);
      // Like the in-memory storage, the counter restarts when a block ends
      expect(await hit()).toMatchObject({
        totalHits: 1,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    it('keeps blocking after the ttl while blockDuration lasts', async () => {
      const key = uniqueKey();
      const hit = () => storage.increment(key, 200, 1, 900, 'default');

      await hit();
      expect(await hit()).toMatchObject({ isBlocked: true });
      await sleep(400);
      expect(await hit()).toMatchObject({ isBlocked: true });
      await sleep(650);
      expect(await hit()).toMatchObject({ totalHits: 1, isBlocked: false });
    });

    it('reports Retry-After in whole seconds, rounded up', async () => {
      const key = uniqueKey();

      await storage.increment(key, 10_000, 1, 2_500, 'default');
      const blocked = await storage.increment(key, 10_000, 1, 2_500, 'default');

      expect(blocked.timeToBlockExpire).toBe(3);
    });

    it('does not block when blockDuration is zero, like the in-memory storage', async () => {
      const key = uniqueKey();

      await storage.increment(key, 10_000, 1, 0, 'default');
      const second = await storage.increment(key, 10_000, 1, 0, 'default');

      expect(second).toMatchObject({ totalHits: 1, isBlocked: false });
    });
  });

  describe('isolation', () => {
    it('keeps separate counters per throttler name', async () => {
      const key = uniqueKey();

      await storage.increment(key, 10_000, 1, 10_000, 'short');
      const shortBlocked = await storage.increment(
        key,
        10_000,
        1,
        10_000,
        'short',
      );
      const long = await storage.increment(key, 60_000, 100, 60_000, 'long');

      expect(shortBlocked.isBlocked).toBe(true);
      expect(long).toMatchObject({ totalHits: 1, isBlocked: false });
      expect(await raw.exists(`${RUN_PREFIX}short:{${key}}:block`)).toBe(1);
      expect(await raw.exists(`${RUN_PREFIX}long:{${key}}:hits`)).toBe(1);
    });

    it('keeps separate counters per key', async () => {
      const blockedKey = uniqueKey();
      const otherKey = uniqueKey();

      await storage.increment(blockedKey, 10_000, 1, 10_000, 'default');
      await storage.increment(blockedKey, 10_000, 1, 10_000, 'default');

      expect(
        await storage.increment(otherKey, 10_000, 1, 10_000, 'default'),
      ).toMatchObject({ totalHits: 1, isBlocked: false });
    });

    it('keeps separate counters per key prefix', async () => {
      const key = uniqueKey();
      const other = new RedisThrottlerStorage(raw, {
        keyPrefix: `${RUN_PREFIX}other:`,
      });

      await storage.increment(key, 10_000, 5, 10_000, 'default');
      await storage.increment(key, 10_000, 5, 10_000, 'default');

      expect(
        await other.increment(key, 10_000, 5, 10_000, 'default'),
      ).toMatchObject({ totalHits: 1 });
    });
  });

  // Same request sequence through both storages: identical allow/deny decisions
  it('decides like the in-memory storage of @nestjs/throttler', async () => {
    const memory = new ThrottlerStorageService();
    const key = uniqueKey();
    const decisions = async (s: {
      increment: RedisThrottlerStorage['increment'];
    }) => {
      const hit = async () => {
        const r = await s.increment(key, 10_000, 2, 800, 'default');
        return {
          totalHits: r.totalHits,
          isBlocked: r.isBlocked,
          ...(r.isBlocked ? { timeToBlockExpire: r.timeToBlockExpire } : {}),
        };
      };
      const seen = [await hit(), await hit(), await hit(), await hit()];
      await sleep(900);
      seen.push(await hit(), await hit(), await hit());
      return seen;
    };

    try {
      const [fromMemory, fromRedis] = await Promise.all([
        decisions(memory),
        decisions(storage),
      ]);

      expect(fromRedis).toEqual(fromMemory);
    } finally {
      memory.onApplicationShutdown();
    }
  });

  describe('concurrency', () => {
    const allowed = (results: { isBlocked: boolean }[]) =>
      results.filter((r) => !r.isBlocked).length;

    it('allows exactly the limit out of 50 parallel requests on one connection', async () => {
      const key = uniqueKey();

      const results = await Promise.all(
        Array.from({ length: 50 }, () =>
          storage.increment(key, 10_000, 10, 10_000, 'default'),
        ),
      );

      expect(allowed(results)).toBe(10);
      expect(
        results
          .filter((r) => !r.isBlocked)
          .map((r) => r.totalHits)
          .sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('allows exactly the limit out of 50 parallel requests from two replicas', async () => {
      const key = uniqueKey();
      const replicaA = new RedisThrottlerStorage(newClient(), {
        keyPrefix: RUN_PREFIX,
      });
      const replicaB = new RedisThrottlerStorage(newClient(), {
        keyPrefix: RUN_PREFIX,
      });

      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          (i % 2 ? replicaA : replicaB).increment(
            key,
            10_000,
            10,
            10_000,
            'default',
          ),
        ),
      );

      expect(allowed(results)).toBe(10);
    });
  });

  describe('connect', () => {
    it('connects, loads the script and closes its own client on shutdown', async () => {
      const connected = await RedisThrottlerStorage.connect({
        ...connection,
        keyPrefix: RUN_PREFIX,
      });
      try {
        const sha = (await raw.script(
          'LOAD',
          THROTTLE_INCREMENT_SCRIPT,
        )) as string;
        expect(await raw.script('EXISTS', sha)).toEqual([1]);
        expect(
          await connected.increment(uniqueKey(), 10_000, 5, 10_000, 'default'),
        ).toMatchObject({ totalHits: 1 });
      } finally {
        await connected.onApplicationShutdown();
      }
    });

    it('fails with a clear error when Redis is unreachable', async () => {
      const server = createServer();
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const { port } = server.address() as AddressInfo;
      await new Promise((resolve) => server.close(resolve));

      const startedAt = Date.now();
      await expect(
        RedisThrottlerStorage.connect({
          host: '127.0.0.1',
          port,
          keyPrefix: RUN_PREFIX,
        }),
      ).rejects.toThrow(
        new RegExp(`127\\.0\\.0\\.1:${port}.*unreachable.*THROTTLE_STORAGE`),
      );
      expect(Date.now() - startedAt).toBeLessThan(15_000);
    });
  });
});

// Unit behaviour of the Redis storage that does not need a server: key layout, unit
// conversion, script caching and error handling. Counting semantics against a real Redis
// live in test/throttler-redis-storage.e2e-spec.ts.
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import {
  RedisThrottlerStorage,
  THROTTLE_INCREMENT_SCRIPT,
} from './redis-throttler.storage';

const SHA = createHash('sha1').update(THROTTLE_INCREMENT_SCRIPT).digest('hex');

type Command = (...args: unknown[]) => Promise<unknown>;

function fakeClient(reply: unknown[] = [1, 60_000, 0, 0]) {
  return {
    evalsha: jest.fn((() => Promise.resolve(reply)) as Command),
    eval: jest.fn((() => Promise.resolve(reply)) as Command),
    quit: jest.fn(() => Promise.resolve('OK')),
  };
}

const storageFor = (
  client: ReturnType<typeof fakeClient>,
  options?: ConstructorParameters<typeof RedisThrottlerStorage>[1],
) => new RedisThrottlerStorage(client as unknown as Redis, options);

describe('RedisThrottlerStorage', () => {
  it('runs one script over the hit counter and block marker of the throttler', async () => {
    const client = fakeClient();
    const storage = storageFor(client);

    await storage.increment('abc123', 300_000, 5, 600_000, 'login');

    expect(client.evalsha).toHaveBeenCalledWith(
      SHA,
      2,
      'mms:throttle:login:{abc123}:hits',
      'mms:throttle:login:{abc123}:block',
      300_000,
      5,
      600_000,
    );
  });

  it('uses a configured key prefix', async () => {
    const client = fakeClient();
    const storage = storageFor(client, { keyPrefix: 'staging:rl:' });

    await storage.increment('k', 1000, 1, 1000, 'default');

    expect(client.evalsha.mock.calls[0]?.slice(2, 4)).toEqual([
      'staging:rl:default:{k}:hits',
      'staging:rl:default:{k}:block',
    ]);
  });

  // ThrottlerGuard writes these into X-RateLimit-Reset and Retry-After, which are seconds
  it('reports times in whole seconds, rounded up like the in-memory storage', async () => {
    const storage = storageFor(fakeClient([2, 1_500, 0, 0]));

    await expect(
      storage.increment('k', 60_000, 5, 60_000, 'default'),
    ).resolves.toEqual({
      totalHits: 2,
      timeToExpire: 2,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('reports a block with its remaining duration', async () => {
    const storage = storageFor(fakeClient([6, 250, 1, 250]));

    await expect(
      storage.increment('k', 60_000, 5, 60_000, 'default'),
    ).resolves.toEqual({
      totalHits: 6,
      timeToExpire: 1,
      isBlocked: true,
      timeToBlockExpire: 1,
    });
  });

  it('sends the script itself when Redis no longer caches it', async () => {
    const client = fakeClient();
    client.evalsha.mockRejectedValueOnce(
      new Error('NOSCRIPT No matching script. Please use EVAL.'),
    );
    const storage = storageFor(client);

    await storage.increment('k', 1000, 3, 1000, 'default');

    expect(client.eval).toHaveBeenCalledWith(
      THROTTLE_INCREMENT_SCRIPT,
      2,
      'mms:throttle:default:{k}:hits',
      'mms:throttle:default:{k}:block',
      1000,
      3,
      1000,
    );
  });

  // Failing open would disable brute-force protection whenever Redis is down
  it('propagates Redis errors instead of letting the request through', async () => {
    const client = fakeClient();
    client.evalsha.mockRejectedValueOnce(new Error('READONLY replica'));
    const storage = storageFor(client);

    await expect(
      storage.increment('k', 1000, 3, 1000, 'default'),
    ).rejects.toThrow('READONLY');
    expect(client.eval).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a ttl of %p ms',
    async (ttl) => {
      const storage = storageFor(fakeClient());

      await expect(
        storage.increment('k', ttl, 3, 1000, 'default'),
      ).rejects.toThrow(RangeError);
    },
  );

  it('rounds fractional milliseconds up, since Redis expiries are integers', async () => {
    const client = fakeClient();
    const storage = storageFor(client);

    await storage.increment('k', 1000.2, 3, 499.5, 'default');

    expect(client.evalsha.mock.calls[0]?.slice(4)).toEqual([1001, 3, 500]);
  });

  it('closes the client on shutdown only when it owns it', async () => {
    const shared = fakeClient();
    const owned = fakeClient();

    await storageFor(shared).onApplicationShutdown();
    await storageFor(owned, { ownsClient: true }).onApplicationShutdown();

    expect(shared.quit).not.toHaveBeenCalled();
    expect(owned.quit).toHaveBeenCalled();
  });
});

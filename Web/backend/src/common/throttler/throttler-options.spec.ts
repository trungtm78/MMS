// Which store holds the rate-limit counters, and how startup reacts when it is missing
import { ThrottlerStorageService } from '@nestjs/throttler';
import type { RedisOptions } from 'ioredis';
import {
  DEFAULT_THROTTLE_KEY_PREFIX,
  redisThrottleConfig,
  throttleStorageKind,
} from './throttler-storage.config';
import {
  createThrottlerStorage,
  GLOBAL_THROTTLERS,
  throttlerModuleOptions,
} from './throttler-options';
import { RedisThrottlerStorage } from './redis-throttler.storage';

type Listener = (...args: unknown[]) => void;

interface FakeRedis {
  status: string;
  options: RedisOptions;
  on: jest.Mock;
  connect: jest.Mock;
  script: jest.Mock;
  disconnect: jest.Mock;
  quit: jest.Mock;
}

type Emit = (event: string, arg: unknown) => void;

/** Just enough of an ioredis client for startup: connect, load the script, close. */
function fakeRedis(
  behaviour: {
    connect?: (emit: Emit, client: FakeRedis) => Promise<void>;
    script?: () => Promise<unknown>;
  } = {},
): FakeRedis {
  const listeners = new Map<string, Listener[]>();
  const emit = (event: string, arg: unknown) =>
    (listeners.get(event) ?? []).forEach((fn) => fn(arg));
  const client: FakeRedis = {
    on: jest.fn((event: string, fn: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      return client;
    }),
    status: 'wait',
    options: {},
    connect: jest.fn(() => {
      if (behaviour.connect) return behaviour.connect(emit, client);
      client.status = 'ready';
      return Promise.resolve();
    }),
    script: jest.fn(() =>
      behaviour.script ? behaviour.script() : Promise.resolve('sha'),
    ),
    disconnect: jest.fn(),
    quit: jest.fn(() => Promise.resolve('OK')),
  };
  return client;
}

const silentLogger = () => ({ log: jest.fn(), warn: jest.fn() });

// ioredis reports the socket error as an event and, with reconnection off, ends the
// client before rejecting connect() generically
const refusedConnection = (emit: Emit, client: FakeRedis) => {
  emit('error', new Error('connect ECONNREFUSED 10.9.8.7:6390'));
  client.status = 'end';
  return Promise.reject(new Error('Connection is closed.'));
};

describe('throttleStorageKind', () => {
  it.each([
    [{ NODE_ENV: 'production' }, 'redis'],
    [{ NODE_ENV: 'production', THROTTLE_STORAGE: '' }, 'redis'],
    [{ NODE_ENV: 'development' }, 'memory'],
    [{ NODE_ENV: 'test' }, 'memory'],
    [{}, 'memory'],
    // An explicit choice wins over the NODE_ENV default
    [{ NODE_ENV: 'production', THROTTLE_STORAGE: 'memory' }, 'memory'],
    [{ NODE_ENV: 'development', THROTTLE_STORAGE: 'redis' }, 'redis'],
    [{ NODE_ENV: 'test', THROTTLE_STORAGE: ' Redis ' }, 'redis'],
  ])('reads %p as %p', (env, expected) => {
    expect(throttleStorageKind(env)).toBe(expected);
  });

  it.each(['redis-cluster', 'mem', 'true', 'none'])(
    'rejects THROTTLE_STORAGE=%p',
    (value) => {
      expect(() => throttleStorageKind({ THROTTLE_STORAGE: value })).toThrow(
        /THROTTLE_STORAGE.*redis.*memory/,
      );
    },
  );
});

describe('redisThrottleConfig', () => {
  it('connects to localhost:6379 without a password by default', () => {
    expect(redisThrottleConfig({})).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
      keyPrefix: DEFAULT_THROTTLE_KEY_PREFIX,
    });
    expect(DEFAULT_THROTTLE_KEY_PREFIX).toBe('mms:throttle:');
  });

  it('reads the same REDIS_* settings as the rest of the backend', () => {
    expect(
      redisThrottleConfig({
        REDIS_HOST: 'redis',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 's3cret',
        THROTTLE_KEY_PREFIX: 'staging:throttle:',
      }),
    ).toEqual({
      host: 'redis',
      port: 6380,
      password: 's3cret',
      keyPrefix: 'staging:throttle:',
    });
  });

  it('treats empty values as unset', () => {
    expect(
      redisThrottleConfig({
        REDIS_HOST: ' ',
        REDIS_PORT: '',
        REDIS_PASSWORD: '',
        THROTTLE_KEY_PREFIX: '',
      }),
    ).toEqual(redisThrottleConfig({}));
  });

  it.each(['abc', '0', '65536', '63 79', '6379.5', '-1'])(
    'rejects REDIS_PORT=%p',
    (value) => {
      expect(() => redisThrottleConfig({ REDIS_PORT: value })).toThrow(
        /REDIS_PORT/,
      );
    },
  );
});

describe('createThrottlerStorage', () => {
  it('keeps counters in process memory outside production', async () => {
    const createRedisClient = jest.fn();

    const storage = await createThrottlerStorage(
      { NODE_ENV: 'test' },
      { createRedisClient, logger: silentLogger() },
    );

    expect(storage).toBeInstanceOf(ThrottlerStorageService);
    expect(createRedisClient).not.toHaveBeenCalled();
  });

  it('shares counters through Redis in production by default', async () => {
    const client = fakeRedis();
    const createRedisClient = jest.fn(
      (() => client) as (options: RedisOptions) => FakeRedis,
    );

    const storage = await createThrottlerStorage(
      {
        NODE_ENV: 'production',
        REDIS_HOST: 'redis',
        REDIS_PORT: '6390',
        REDIS_PASSWORD: 'pw',
      },
      { createRedisClient: createRedisClient as never, logger: silentLogger() },
    );

    expect(storage).toBeInstanceOf(RedisThrottlerStorage);
    expect(createRedisClient).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'redis',
        port: 6390,
        password: 'pw',
        lazyConnect: true,
      }),
    );
    expect(client.connect).toHaveBeenCalled();
    // The script is loaded up front, so a server that refuses scripting fails at startup
    expect(client.script).toHaveBeenCalledWith('LOAD', expect.any(String));
    // Startup does not reconnect (a refused connection ends at once); a running replica
    // reconnects with a bounded backoff
    const [startupOptions] = createRedisClient.mock.calls[0];
    expect(startupOptions.retryStrategy?.(1)).toBeNull();
    expect(client.options.retryStrategy?.(1)).toBe(200);
    expect(client.options.retryStrategy?.(50)).toBe(2_000);
  });

  it('fails startup in production when Redis is unreachable instead of counting per replica', async () => {
    const client = fakeRedis({ connect: refusedConnection });

    const startup = createThrottlerStorage(
      { NODE_ENV: 'production', REDIS_HOST: '10.9.8.7', REDIS_PORT: '6390' },
      {
        createRedisClient: (() => client) as never,
        logger: silentLogger(),
      },
    );

    await expect(startup).rejects.toThrow(/10\.9\.8\.7:6390/);
    await expect(startup).rejects.toThrow(/ECONNREFUSED/);
    await expect(startup).rejects.toThrow(/THROTTLE_STORAGE/);
    // Nothing is left running behind the failed startup: the client has already ended, and
    // disconnect() on an ended client would only arm ioredis's 2 s stream-destroy timer
    expect(client.status).toBe('end');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('fails when Redis was chosen explicitly outside production too', async () => {
    const client = fakeRedis({ connect: refusedConnection });

    await expect(
      createThrottlerStorage(
        { NODE_ENV: 'development', THROTTLE_STORAGE: 'redis' },
        {
          createRedisClient: (() => client) as never,
          logger: silentLogger(),
        },
      ),
    ).rejects.toThrow(/unreachable/);
  });

  it('fails when Redis accepts the connection but rejects commands', async () => {
    const client = fakeRedis({
      script: () =>
        Promise.reject(new Error('NOAUTH Authentication required.')),
    });

    await expect(
      createThrottlerStorage(
        { NODE_ENV: 'production' },
        {
          createRedisClient: (() => client) as never,
          logger: silentLogger(),
        },
      ),
    ).rejects.toThrow(/NOAUTH/);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('warns when production deliberately keeps per-replica memory counters', async () => {
    const logger = silentLogger();

    await createThrottlerStorage(
      { NODE_ENV: 'production', THROTTLE_STORAGE: 'memory' },
      { logger },
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/THROTTLE_STORAGE=memory.*replica/),
    );
  });

  it('rejects an unknown storage before connecting to anything', async () => {
    const createRedisClient = jest.fn();

    await expect(
      createThrottlerStorage(
        { NODE_ENV: 'production', THROTTLE_STORAGE: 'memcached' },
        { createRedisClient, logger: silentLogger() },
      ),
    ).rejects.toThrow(/THROTTLE_STORAGE/);
    expect(createRedisClient).not.toHaveBeenCalled();
  });
});

describe('throttlerModuleOptions', () => {
  it('applies the global limit with the selected storage', async () => {
    const options = await throttlerModuleOptions(
      { NODE_ENV: 'test' },
      { logger: silentLogger() },
    );

    expect(options.throttlers).toEqual(GLOBAL_THROTTLERS);
    expect(GLOBAL_THROTTLERS).toEqual([{ ttl: 60_000, limit: 100 }]);
    expect(options.storage).toBeInstanceOf(ThrottlerStorageService);
  });
});

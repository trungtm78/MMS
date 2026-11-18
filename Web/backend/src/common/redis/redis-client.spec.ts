// Connection rules shared by every Redis user (rate-limit counters, Socket.IO adapter):
// strict at startup, reconnecting with a bounded backoff once running, outages logged once
import type { RedisOptions } from 'ioredis';
import {
  connectRedis,
  reconnectDelay,
  redisConnectionConfig,
  redisOrMemory,
  unusableRedisError,
} from './redis-client';

type Listener = (...args: unknown[]) => void;

interface FakeRedis {
  status: string;
  options: RedisOptions;
  on: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  emit: (event: string, arg?: unknown) => void;
}

/** Just enough of an ioredis client to connect, report events and close. */
function fakeRedis(connect?: (client: FakeRedis) => Promise<void>): FakeRedis {
  const listeners = new Map<string, Listener[]>();
  const client: FakeRedis = {
    status: 'wait',
    options: {},
    on: jest.fn((event: string, fn: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
      return client;
    }),
    connect: jest.fn(() => {
      if (connect) return connect(client);
      client.status = 'ready';
      return Promise.resolve();
    }),
    disconnect: jest.fn(),
    emit: (event, arg) => (listeners.get(event) ?? []).forEach((fn) => fn(arg)),
  };
  return client;
}

// ioredis reports the socket error as an event and, with reconnection off, ends the
// client before rejecting connect() generically
const refused = (client: FakeRedis) => {
  client.emit('error', new Error('connect ECONNREFUSED 10.9.8.7:6390'));
  client.status = 'end';
  return Promise.reject(new Error('Connection is closed.'));
};

const silentLogger = () => ({ log: jest.fn(), warn: jest.fn() });

const PURPOSE = {
  purpose: 'Socket.IO adapter',
  connectionName: 'mms:socket-io',
  outageImpact:
    'events stay on the instance that emitted them until it recovers',
  remedy: 'SOCKET_ADAPTER=redis needs it.',
};

describe('redisConnectionConfig', () => {
  it('connects to localhost:6379 without a password by default', () => {
    expect(redisConnectionConfig({})).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
  });

  it('reads REDIS_HOST, REDIS_PORT and REDIS_PASSWORD', () => {
    expect(
      redisConnectionConfig({
        REDIS_HOST: 'redis',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: ' s3cret ',
      }),
    ).toEqual({ host: 'redis', port: 6380, password: ' s3cret ' });
  });

  it('treats empty values as unset', () => {
    expect(
      redisConnectionConfig({
        REDIS_HOST: ' ',
        REDIS_PORT: '',
        REDIS_PASSWORD: '',
      }),
    ).toEqual(redisConnectionConfig({}));
  });

  it.each(['abc', '0', '65536', '63 79', '6379.5', '-1'])(
    'rejects REDIS_PORT=%p',
    (value) => {
      expect(() => redisConnectionConfig({ REDIS_PORT: value })).toThrow(
        `REDIS_PORT must be a port number between 1 and 65535, got "${value}"`,
      );
    },
  );
});

describe('redisOrMemory', () => {
  it.each([
    [{ NODE_ENV: 'production' }, 'redis'],
    [{ NODE_ENV: ' production ', SOME_STORE: ' ' }, 'redis'],
    [{ NODE_ENV: 'development' }, 'memory'],
    [{}, 'memory'],
    // An explicit choice wins over the NODE_ENV default
    [{ NODE_ENV: 'production', SOME_STORE: 'MEMORY' }, 'memory'],
    [{ NODE_ENV: 'test', SOME_STORE: 'redis' }, 'redis'],
  ])('reads %p as %p', (env, expected) => {
    expect(redisOrMemory(env, 'SOME_STORE')).toBe(expected);
  });

  it('names the variable when its value is unknown', () => {
    expect(() => redisOrMemory({ SOME_STORE: 'disk' }, 'SOME_STORE')).toThrow(
      'SOME_STORE must be "redis" or "memory" (or unset), got "disk"',
    );
  });
});

describe('reconnectDelay', () => {
  it('backs off 200 ms per attempt, at most 2 s', () => {
    expect(reconnectDelay(1)).toBe(200);
    expect(reconnectDelay(4)).toBe(800);
    expect(reconnectDelay(50)).toBe(2_000);
  });
});

describe('unusableRedisError', () => {
  it('names the purpose, the address, the reason and the remedy', () => {
    const cause = new Error('NOSCRIPT');
    const error = unusableRedisError(
      PURPOSE,
      { host: 'redis', port: 6379 },
      cause,
    );

    expect(error.message).toBe(
      'Socket.IO adapter: Redis at redis:6379 is unreachable or unusable (NOSCRIPT). SOCKET_ADAPTER=redis needs it.',
    );
    expect(error.cause).toBe(cause);
  });
});

describe('connectRedis', () => {
  it('does not reconnect while starting, then reconnects with the backoff', async () => {
    const client = fakeRedis();
    const createClient = jest.fn(
      (() => client) as (o: RedisOptions) => FakeRedis,
    );

    await expect(
      connectRedis(
        { host: 'redis', port: 6390, password: 'pw' },
        {
          ...PURPOSE,
          createClient: createClient as never,
          logger: silentLogger(),
        },
      ),
    ).resolves.toBe(client);

    const [startup] = createClient.mock.calls[0];
    expect(startup).toEqual(
      expect.objectContaining({
        host: 'redis',
        port: 6390,
        password: 'pw',
        lazyConnect: true,
        // Named, so CLIENT LIST shows which backend connection is which
        connectionName: 'mms:socket-io',
      }),
    );
    expect(startup.retryStrategy?.(1)).toBeNull();
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.options.retryStrategy).toBe(reconnectDelay);
  });

  it("applies its user's per-command retry budget", async () => {
    const client = fakeRedis();
    const createClient = jest.fn(
      (() => client) as (o: RedisOptions) => FakeRedis,
    );

    await connectRedis(
      { host: 'redis', port: 6379 },
      {
        ...PURPOSE,
        maxRetriesPerRequest: 1,
        createClient: createClient as never,
        logger: silentLogger(),
      },
    );

    expect(createClient.mock.calls[0][0].maxRetriesPerRequest).toBe(1);
  });

  it('fails naming the socket error, without closing a client that already ended', async () => {
    const client = fakeRedis(refused);
    const logger = silentLogger();

    await expect(
      connectRedis(
        { host: '10.9.8.7', port: 6390 },
        { ...PURPOSE, createClient: (() => client) as never, logger },
      ),
    ).rejects.toThrow(
      'Socket.IO adapter: Redis at 10.9.8.7:6390 is unreachable or unusable (connect ECONNREFUSED 10.9.8.7:6390). SOCKET_ADAPTER=redis needs it.',
    );
    // disconnect() on an ended client would only arm ioredis's stream-destroy timer
    expect(client.disconnect).not.toHaveBeenCalled();
    // Startup errors are reported by the rejection, not as an outage
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('closes a client that failed without ending by itself', async () => {
    const client = fakeRedis(() =>
      Promise.reject(new Error('WRONGPASS invalid username-password pair')),
    );

    await expect(
      connectRedis(
        { host: 'redis', port: 6379 },
        {
          ...PURPOSE,
          createClient: (() => client) as never,
          logger: silentLogger(),
        },
      ),
    ).rejects.toThrow('(WRONGPASS invalid username-password pair)');
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports each outage of a running client once, and its recovery', async () => {
    const client = fakeRedis();
    const logger = silentLogger();
    await connectRedis(
      { host: 'redis', port: 6379 },
      { ...PURPOSE, createClient: (() => client) as never, logger },
    );

    client.emit('error', new Error('read ECONNRESET'));
    client.emit('error', new Error('connect ECONNREFUSED'));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Socket.IO adapter: Redis at redis:6379 failed (read ECONNRESET); events stay on the instance that emitted them until it recovers',
    );

    client.emit('ready');
    expect(logger.log).toHaveBeenCalledWith(
      'Socket.IO adapter: Redis at redis:6379 recovered',
    );

    client.emit('error', new Error('read ECONNRESET'));
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

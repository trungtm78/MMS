// Which Socket.IO adapter the backend uses, and how startup and shutdown treat Redis.
// With several backend replicas an event emitted on one replica reaches clients connected
// to another only through the Redis adapter.
import { createServer } from 'http';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { RedisOptions } from 'ioredis';
import type { Server } from 'socket.io';
import {
  RedisIoAdapter,
  createSocketIoAdapter,
  socketAdapterKind,
} from './socket-io-adapter';

type Listener = (...args: unknown[]) => void;

interface FakeRedis {
  status: string;
  options: RedisOptions;
  on: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  quit: jest.Mock;
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
    quit: jest.fn(() => {
      client.status = 'end';
      return Promise.resolve('OK');
    }),
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

/** Stands in for the Redis adapter; socket.io creates one per namespace. */
class FakeAdapter {
  constructor(readonly nsp: unknown) {}
  init(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

const REDIS_ENV = {
  NODE_ENV: 'production',
  REDIS_HOST: 'redis',
  REDIS_PORT: '6390',
  REDIS_PASSWORD: 'pw',
};

function adapterDeps(...clients: FakeRedis[]) {
  const createRedisClient = jest.fn<FakeRedis, [RedisOptions]>();
  clients.forEach((client) => createRedisClient.mockReturnValueOnce(client));
  const createAdapter = jest.fn(() => FakeAdapter);
  const logger = { log: jest.fn(), warn: jest.fn() };
  return {
    createRedisClient,
    createAdapter,
    logger,
    deps: {
      createRedisClient: createRedisClient as never,
      createAdapter: createAdapter as never,
      logger,
    },
  };
}

describe('socketAdapterKind', () => {
  it.each([
    [{ NODE_ENV: 'production' }, 'redis'],
    [{ NODE_ENV: 'production', SOCKET_ADAPTER: '' }, 'redis'],
    [{ NODE_ENV: 'development' }, 'memory'],
    [{ NODE_ENV: 'test' }, 'memory'],
    [{}, 'memory'],
    // An explicit choice wins over the NODE_ENV default
    [{ NODE_ENV: 'production', SOCKET_ADAPTER: 'memory' }, 'memory'],
    [{ NODE_ENV: 'development', SOCKET_ADAPTER: ' Redis ' }, 'redis'],
  ])('reads %p as %p', (env, expected) => {
    expect(socketAdapterKind(env)).toBe(expected);
  });

  it.each(['redis-cluster', 'mem', 'true'])(
    'rejects SOCKET_ADAPTER=%p',
    (value) => {
      expect(() => socketAdapterKind({ SOCKET_ADAPTER: value })).toThrow(
        `SOCKET_ADAPTER must be "redis" or "memory" (or unset), got "${value}"`,
      );
    },
  );
});

describe('createSocketIoAdapter', () => {
  it('keeps events in process memory outside production, without Redis', async () => {
    const { createRedisClient, logger, deps } = adapterDeps();

    const adapter = await createSocketIoAdapter(
      createServer(),
      { NODE_ENV: 'test' },
      deps,
    );

    expect(adapter).toBeInstanceOf(IoAdapter);
    expect(adapter).not.toBeInstanceOf(RedisIoAdapter);
    expect(createRedisClient).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns when production deliberately keeps events on one replica', async () => {
    const { logger, deps } = adapterDeps();

    await createSocketIoAdapter(
      createServer(),
      { NODE_ENV: 'production', SOCKET_ADAPTER: 'memory' },
      deps,
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SOCKET_ADAPTER=memory'),
    );
  });

  it('fans events out through Redis in production by default, with a publisher and a subscriber', async () => {
    const publisher = fakeRedis();
    const subscriber = fakeRedis();
    const { createRedisClient, createAdapter, deps } = adapterDeps(
      publisher,
      subscriber,
    );

    const adapter = await createSocketIoAdapter(
      createServer(),
      REDIS_ENV,
      deps,
    );

    expect(adapter).toBeInstanceOf(RedisIoAdapter);
    expect(createRedisClient).toHaveBeenCalledTimes(2);
    for (const [options] of createRedisClient.mock.calls) {
      expect(options).toEqual(
        expect.objectContaining({
          host: 'redis',
          port: 6390,
          password: 'pw',
          lazyConnect: true,
        }),
      );
    }
    expect(publisher.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.connect).toHaveBeenCalledTimes(1);
    // Running clients reconnect instead of silently dropping cross-replica events
    expect(publisher.options.retryStrategy?.(1)).toBe(200);
    expect(subscriber.options.retryStrategy?.(1)).toBe(200);
    expect(createAdapter).toHaveBeenCalledWith(publisher, subscriber);

    const server = adapter.createIOServer(0) as Server;
    expect(server.of('/').adapter).toBeInstanceOf(FakeAdapter);
    await server.close();
  });

  it('fails startup naming SOCKET_ADAPTER when Redis is unreachable', async () => {
    const { deps } = adapterDeps(fakeRedis(refused));

    await expect(
      createSocketIoAdapter(
        createServer(),
        { NODE_ENV: 'production', REDIS_HOST: '10.9.8.7', REDIS_PORT: '6390' },
        deps,
      ),
    ).rejects.toThrow(
      'Socket.IO adapter: Redis at 10.9.8.7:6390 is unreachable or unusable (connect ECONNREFUSED 10.9.8.7:6390). ' +
        'SOCKET_ADAPTER=redis (the production default) needs it: start Redis or fix REDIS_HOST, REDIS_PORT and REDIS_PASSWORD. ' +
        'SOCKET_ADAPTER=memory delivers events only to clients of the instance that emits them and is only correct for a single instance.',
    );
  });

  it('closes the publisher when the subscriber cannot connect', async () => {
    const publisher = fakeRedis();
    const { deps } = adapterDeps(publisher, fakeRedis(refused));

    await expect(
      createSocketIoAdapter(createServer(), REDIS_ENV, deps),
    ).rejects.toThrow(/Socket\.IO adapter: Redis at redis:6390 is unreachable/);
    expect(publisher.quit).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown SOCKET_ADAPTER before connecting to anything', async () => {
    const { createRedisClient, deps } = adapterDeps();

    await expect(
      createSocketIoAdapter(
        createServer(),
        { SOCKET_ADAPTER: 'cluster' },
        deps,
      ),
    ).rejects.toThrow(/SOCKET_ADAPTER/);
    expect(createRedisClient).not.toHaveBeenCalled();
  });

  it('closes both Redis clients when the application shuts down', async () => {
    const publisher = fakeRedis();
    const subscriber = fakeRedis();
    const { deps } = adapterDeps(publisher, subscriber);
    const adapter = await createSocketIoAdapter(
      createServer(),
      REDIS_ENV,
      deps,
    );

    await adapter.dispose();

    expect(publisher.quit).toHaveBeenCalledTimes(1);
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });

  it('logs a client that fails to close instead of failing the shutdown', async () => {
    const publisher = fakeRedis();
    const subscriber = fakeRedis();
    publisher.quit.mockRejectedValueOnce(new Error('Connection is closed.'));
    const { logger, deps } = adapterDeps(publisher, subscriber);
    const adapter = await createSocketIoAdapter(
      createServer(),
      REDIS_ENV,
      deps,
    );

    await expect(adapter.dispose()).resolves.toBeUndefined();

    expect(subscriber.quit).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Socket.IO adapter: closing a Redis client failed (Connection is closed.)',
    );
  });
});

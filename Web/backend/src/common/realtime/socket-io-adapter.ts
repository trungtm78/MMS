// Socket.IO adapter selection. With several backend replicas an event emitted on one
// replica reaches clients connected to another only through Redis pub/sub.
//
//   SOCKET_ADAPTER  redis | memory. Unset: redis when NODE_ENV=production, else memory
//   REDIS_HOST / REDIS_PORT / REDIS_PASSWORD  the same settings the rate-limit storage uses
//
// Startup fails when Redis is selected but unusable, instead of silently keeping events on
// one replica; once running, the clients reconnect after an outage.
import { Logger, type LoggerService } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import {
  connectRedis,
  type EnvVars,
  redisConnectionConfig,
  redisOrMemory,
} from '../redis/redis-client';

export type SocketAdapterKind = 'redis' | 'memory';

type AppOrHttpServer = ConstructorParameters<typeof IoAdapter>[0];
type AdapterFactory = ReturnType<typeof createAdapter>;
type AdapterLogger = Pick<LoggerService, 'log' | 'warn'>;

export interface SocketAdapterDeps {
  createRedisClient?: (options: RedisOptions) => Redis;
  createAdapter?: (publisher: Redis, subscriber: Redis) => AdapterFactory;
  logger?: AdapterLogger;
}

const SOCKET_REDIS = {
  purpose: 'Socket.IO adapter',
  connectionName: 'mms:socket-io',
  outageImpact: 'events stay on the instance that emits them until it recovers',
  remedy:
    'SOCKET_ADAPTER=redis (the production default) needs it: start Redis or fix ' +
    'REDIS_HOST, REDIS_PORT and REDIS_PASSWORD. SOCKET_ADAPTER=memory delivers events ' +
    'only to clients of the instance that emits them and is only correct for a single instance.',
};

export function socketAdapterKind(env: EnvVars): SocketAdapterKind {
  return redisOrMemory(env, 'SOCKET_ADAPTER');
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function closeClients(
  clients: readonly Redis[],
  logger: AdapterLogger,
): Promise<void> {
  const results = await Promise.allSettled(
    clients
      .filter((client) => client.status !== 'end')
      .map((client) => client.quit()),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn(
        `${SOCKET_REDIS.purpose}: closing a Redis client failed (${errorMessage(result.reason)})`,
      );
    }
  }
}

/** IoAdapter whose servers publish and receive events through Redis. */
export class RedisIoAdapter extends IoAdapter {
  constructor(
    appOrHttpServer: AppOrHttpServer,
    private readonly clients: readonly Redis[],
    private readonly adapterFactory: AdapterFactory,
    private readonly logger: AdapterLogger,
  ) {
    super(appOrHttpServer);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterFactory);
    return server;
  }

  async dispose(): Promise<void> {
    await super.dispose();
    await closeClients(this.clients, this.logger);
  }
}

/** Rejects when the configuration is invalid or the selected adapter cannot be used. */
export async function createSocketIoAdapter(
  appOrHttpServer: AppOrHttpServer,
  env: EnvVars = process.env,
  deps: SocketAdapterDeps = {},
): Promise<IoAdapter> {
  const logger = deps.logger ?? new Logger('SocketIoAdapter');

  if (socketAdapterKind(env) === 'memory') {
    if (env.NODE_ENV?.trim() === 'production') {
      logger.warn(
        'SOCKET_ADAPTER=memory: Socket.IO events reach only clients connected to the replica that emits them, so with more than one backend replica clients miss events',
      );
    }
    return new IoAdapter(appOrHttpServer);
  }

  const connection = redisConnectionConfig(env);
  const connect = () =>
    connectRedis(connection, {
      ...SOCKET_REDIS,
      createClient: deps.createRedisClient,
      logger,
    });

  // Subscribed connections cannot publish, so the adapter needs two
  const publisher = await connect();
  let subscriber: Redis;
  try {
    subscriber = await connect();
  } catch (error) {
    await closeClients([publisher], logger);
    throw error;
  }

  const adapterFactory = (deps.createAdapter ?? createAdapter)(
    publisher,
    subscriber,
  );
  logger.log(
    `Socket.IO events shared through Redis at ${connection.host}:${connection.port}`,
  );
  return new RedisIoAdapter(
    appOrHttpServer,
    [publisher, subscriber],
    adapterFactory,
    logger,
  );
}

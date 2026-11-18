// Connecting to Redis, shared by every user of it (rate-limit counters, Socket.IO adapter).
//
// Startup is strict: the client does not reconnect while starting, so an unreachable or
// unusable Redis fails startup at once with a message naming the user, the address and
// the remedy. Once running, the client reconnects with a bounded backoff; each outage is
// logged once, and so is the recovery.
import { Logger, type LoggerService } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';

export type EnvVars = Record<string, string | undefined>;

export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
}

export interface RedisPurpose {
  /** Who uses the connection; prefixes every message, e.g. "Rate-limit storage". */
  purpose: string;
  /** What stops working while Redis is down, for the outage warning. */
  outageImpact: string;
  /** What to do when startup cannot use Redis. */
  remedy: string;
}

export interface ConnectRedisOptions extends RedisPurpose {
  /** Shown by CLIENT LIST, so operators can tell the backend's connections apart. */
  connectionName: string;
  /** Retries of one command while reconnecting; ioredis's default when omitted. */
  maxRetriesPerRequest?: number;
  createClient?: (options: RedisOptions) => Redis;
  logger?: Pick<LoggerService, 'log' | 'warn'>;
}

/** Reconnect backoff of a running client: 200 ms per attempt, at most 2 s. */
export const reconnectDelay = (attempt: number) =>
  Math.min(attempt * 200, 2_000);

const STARTUP_CONNECT_TIMEOUT_MS = 5_000;

function setting(env: EnvVars, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * A choice between a Redis-backed and an in-process implementation. Production defaults to
 * Redis because replicas must share the state; elsewhere memory keeps tests and local runs
 * free of Redis. An explicit value wins.
 */
export function redisOrMemory(
  env: EnvVars,
  variable: string,
): 'redis' | 'memory' {
  const raw = setting(env, variable);
  if (raw === undefined) {
    return env.NODE_ENV?.trim() === 'production' ? 'redis' : 'memory';
  }
  const value = raw.toLowerCase();
  if (value === 'redis' || value === 'memory') return value;
  throw new Error(
    `${variable} must be "redis" or "memory" (or unset), got "${raw}"`,
  );
}

/** REDIS_HOST / REDIS_PORT / REDIS_PASSWORD; empty values count as unset. */
export function redisConnectionConfig(env: EnvVars): RedisConnection {
  const rawPort = setting(env, 'REDIS_PORT');
  let port = 6379;
  if (rawPort !== undefined) {
    port = /^\d+$/.test(rawPort) ? Number(rawPort) : Number.NaN;
    if (!(port >= 1 && port <= 65_535)) {
      throw new Error(
        `REDIS_PORT must be a port number between 1 and 65535, got "${rawPort}"`,
      );
    }
  }

  return {
    host: setting(env, 'REDIS_HOST') ?? 'localhost',
    port,
    // Not trimmed: spaces may belong to the password
    password: env.REDIS_PASSWORD || undefined,
  };
}

export function unusableRedisError(
  purpose: Pick<RedisPurpose, 'purpose' | 'remedy'>,
  connection: Pick<RedisConnection, 'host' | 'port'>,
  cause: Error,
): Error {
  return new Error(
    `${purpose.purpose}: Redis at ${connection.host}:${connection.port} is unreachable or unusable (${cause.message}). ${purpose.remedy}`,
    { cause },
  );
}

const asError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value));

/** Connects a client for one purpose; rejects when Redis cannot be used. */
export async function connectRedis(
  connection: RedisConnection,
  options: ConnectRedisOptions,
): Promise<Redis> {
  const createClient =
    options.createClient ?? ((clientOptions) => new Redis(clientOptions));
  const logger = options.logger ?? new Logger(options.purpose);
  const address = `${connection.host}:${connection.port}`;

  const client = createClient({
    host: connection.host,
    port: connection.port,
    password: connection.password,
    connectionName: options.connectionName,
    lazyConnect: true,
    connectTimeout: STARTUP_CONNECT_TIMEOUT_MS,
    ...(options.maxRetriesPerRequest === undefined
      ? {}
      : { maxRetriesPerRequest: options.maxRetriesPerRequest }),
    // No reconnection while starting: a refused connection ends the client at once and
    // startup fails. Enabled below once the client is usable.
    retryStrategy: () => null,
  });

  let started = false;
  let lastError: Error | undefined;
  let outageReported = false;
  client.on('error', (error: Error) => {
    lastError = error;
    if (started && !outageReported) {
      outageReported = true;
      logger.warn(
        `${options.purpose}: Redis at ${address} failed (${error.message}); ${options.outageImpact}`,
      );
    }
  });
  client.on('ready', () => {
    if (outageReported) {
      logger.log(`${options.purpose}: Redis at ${address} recovered`);
    }
    outageReported = false;
  });

  try {
    await client.connect();
  } catch (error) {
    // A refused connection has already ended the client; disconnect() on an ended client
    // would only arm ioredis's 2 s stream-destroy timer
    if (client.status !== 'end') client.disconnect();
    const failure = asError(error);
    // connect() rejects with a generic "Connection is closed."; the socket error came
    // through the error event
    const reason =
      lastError && failure.message === 'Connection is closed.'
        ? lastError
        : failure;
    throw unusableRedisError(options, connection, reason);
  }

  // ioredis reads the strategy on every close, so a running client now reconnects
  client.options.retryStrategy = reconnectDelay;
  started = true;
  return client;
}
